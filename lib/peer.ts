import Peer, { DataConnection } from "peerjs";

import {
  SecurityFingerprint,
  decryptMessage,
  deriveSharedKey,
  encryptMessage,
  exportPublicKey,
  generateFingerprint,
  generateKeyPair,
} from "@/lib/crypto";
import { ControlMessage } from "@/lib/transfer";

export type PeerRole = "sender" | "receiver";

export type ConnectionState =
  | "idle"
  | "connecting"
  | "waiting"
  | "connected"
  | "handshaking"
  | "encrypted"
  | "transferring"
  | "completed"
  | "error";

// Envelope header types for uniform binary data exchange
const MSG_HANDSHAKE = 0x01;
const MSG_ENCRYPTED_CONTROL = 0x02;
const MSG_ENCRYPTED_CHUNK = 0x03;
const MSG_ENCRYPTED_PING = 0x04;
const MSG_ENCRYPTED_PONG = 0x05;

type PeerSessionEvents = {
  onStateChange?: (state: ConnectionState) => void;
  onStatus?: (message: string) => void;
  onEncryptedChange?: (encrypted: boolean) => void;
  onSecurityVerified?: (fingerprint: SecurityFingerprint) => void;
  onLatency?: (latencyMs: number) => void;
  onControlMessage?: (message: ControlMessage) => void;
  onBinaryChunk?: (buffer: ArrayBuffer) => void;
  onError?: (message: string) => void;
  onOpen?: () => void;
  onClose?: () => void;
};

function buildIceServers() {
  const servers: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
  ];

  if (process.env.NEXT_PUBLIC_TURN_URL) {
    servers.push({
      urls: process.env.NEXT_PUBLIC_TURN_URL,
      username: process.env.NEXT_PUBLIC_TURN_USERNAME,
      credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL,
    });
  }

  return servers;
}

export function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Removed ambiguous 0, O, 1, I
  let code = "";
  const randomBytes = crypto.getRandomValues(new Uint8Array(6));
  for (let i = 0; i < 6; i++) {
    code += chars[randomBytes[i] % chars.length];
  }
  return code;
}

function toArrayBuffer(value: unknown): ArrayBuffer | null {
  if (value instanceof ArrayBuffer) return value;
  if (ArrayBuffer.isView(value)) {
    return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
  }
  return null;
}

export class PeerSession {
  public readonly role: PeerRole;
  private readonly events: PeerSessionEvents;
  private readonly passphrase?: string;

  private peer: Peer | null = null;
  private connection: DataConnection | null = null;
  private keyPair: CryptoKeyPair | null = null;
  private localPublicKeyJwk: JsonWebKey | null = null;
  private sharedKey: CryptoKey | null = null;
  private fingerprint: SecurityFingerprint | null = null;

  private handshakeSent = false;
  private destroyed = false;
  private pingInterval: ReturnType<typeof setInterval> | null = null;

  constructor(role: PeerRole, events: PeerSessionEvents = {}, passphrase?: string) {
    this.role = role;
    this.events = events;
    this.passphrase = passphrase;
  }

  private updateState(state: ConnectionState) {
    if (this.destroyed) return;
    this.events.onStateChange?.(state);
  }

  private updateStatus(message: string) {
    if (this.destroyed) return;
    this.events.onStatus?.(message);
  }

  private fail(message: string) {
    if (this.destroyed) return;
    this.updateState("error");
    this.updateStatus(message);
    this.events.onError?.(message);
  }

  /**
   * Pre-generates the local ECDH keypair before connection opens
   * so there are zero race conditions upon DataChannel open.
   */
  private async initKeyPair(): Promise<void> {
    if (!this.keyPair) {
      this.keyPair = await generateKeyPair();
      this.localPublicKeyJwk = await exportPublicKey(this.keyPair.publicKey);
    }
  }

  private setupConnection(conn: DataConnection) {
    this.connection = conn;

    // Set buffer low threshold for backpressure (512 KB)
    try {
      const dc = conn.dataChannel;
      if (dc) {
        dc.bufferedAmountLowThreshold = 512 * 1024;
      }
    } catch {
      // safe fallback
    }

    const onOpened = async () => {
      this.updateState("handshaking");
      this.updateStatus("Direct P2P connected. Securing end-to-end channel…");
      this.events.onOpen?.();
      await this.sendHandshake();
    };

    if (conn.open) {
      void onOpened();
    } else {
      conn.on("open", () => {
        void onOpened();
      });
    }

    conn.on("data", (data) => {
      void this.handleIncomingData(data);
    });

    conn.on("close", () => {
      this.stopPing();
      if (!this.destroyed) {
        this.events.onEncryptedChange?.(false);
        this.updateState("idle");
        this.updateStatus("Peer disconnected.");
      }
      this.events.onClose?.();
    });

    conn.on("error", (error) => {
      this.stopPing();
      this.fail(error?.message || "Peer channel error.");
    });
  }

  private async sendHandshake() {
    if (!this.connection || this.handshakeSent) return;
    this.handshakeSent = true;

    try {
      await this.initKeyPair();
      if (!this.localPublicKeyJwk) return;

      const jsonStr = JSON.stringify(this.localPublicKeyJwk);
      const jsonBytes = new TextEncoder().encode(jsonStr);

      // Frame: [0x01 | JSON bytes]
      const frame = new Uint8Array(1 + jsonBytes.byteLength);
      frame[0] = MSG_HANDSHAKE;
      frame.set(jsonBytes, 1);

      this.connection.send(frame.buffer);
    } catch (err) {
      this.fail("Failed to initiate cryptographic handshake: " + (err instanceof Error ? err.message : String(err)));
    }
  }

  private async handleHandshake(remoteJwkBytes: Uint8Array) {
    try {
      await this.initKeyPair();
      if (!this.keyPair || !this.localPublicKeyJwk) return;

      const remoteJwkStr = new TextDecoder().decode(remoteJwkBytes);
      const remoteJwk = JSON.parse(remoteJwkStr) as JsonWebKey;

      const { key, rawSharedBits } = await deriveSharedKey(
        this.keyPair.privateKey,
        this.localPublicKeyJwk,
        remoteJwk,
        this.passphrase,
      );

      this.sharedKey = key;
      this.fingerprint = await generateFingerprint(rawSharedBits, this.localPublicKeyJwk, remoteJwk);

      this.events.onEncryptedChange?.(true);
      this.events.onSecurityVerified?.(this.fingerprint);
      this.updateState("encrypted");
      this.updateStatus("End-to-end encrypted with ECDH P-256 & AES-256-GCM.");

      // Start keep-alive ping for latency calculation
      this.startPing();
    } catch (err) {
      this.fail("Security handshake failed: " + (err instanceof Error ? err.message : String(err)));
    }
  }

  private async handleIncomingData(raw: unknown) {
    const buffer = toArrayBuffer(raw);
    if (!buffer || buffer.byteLength < 1) return;

    const view = new Uint8Array(buffer);
    const msgType = view[0];
    const payload = buffer.slice(1);

    // 0x01 is plain handshake message
    if (msgType === MSG_HANDSHAKE) {
      await this.handleHandshake(new Uint8Array(payload));
      return;
    }

    if (!this.sharedKey) {
      this.fail("Received data before cryptographic handshake was completed.");
      return;
    }

    try {
      const decrypted = await decryptMessage(this.sharedKey, payload);

      if (msgType === MSG_ENCRYPTED_CONTROL) {
        const text = new TextDecoder().decode(decrypted);
        const parsed = JSON.parse(text) as ControlMessage;
        this.events.onControlMessage?.(parsed);
      } else if (msgType === MSG_ENCRYPTED_CHUNK) {
        this.events.onBinaryChunk?.(decrypted);
      } else if (msgType === MSG_ENCRYPTED_PING) {
        // Reply with pong
        const viewPing = new Float64Array(decrypted);
        const sentAt = viewPing[0];
        void this.sendRawEncrypted(MSG_ENCRYPTED_PONG, new Float64Array([sentAt]).buffer);
      } else if (msgType === MSG_ENCRYPTED_PONG) {
        const viewPong = new Float64Array(decrypted);
        const originalSent = viewPong[0];
        const rtt = Math.max(0, performance.now() - originalSent);
        this.events.onLatency?.(Math.round(rtt));
      }
    } catch (err) {
      this.fail("Decryption failed. Ensure room passcode/PIN matches if one was configured.");
    }
  }

  private startPing() {
    this.stopPing();
    this.pingInterval = setInterval(() => {
      if (this.isSecure() && this.isOpen()) {
        const pingPayload = new Float64Array([performance.now()]).buffer;
        void this.sendRawEncrypted(MSG_ENCRYPTED_PING, pingPayload);
      }
    }, 3000);
  }

  private stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private async sendRawEncrypted(msgType: number, plainBuffer: ArrayBuffer) {
    if (!this.sharedKey || !this.connection?.open) {
      throw new Error("Secure channel is not active.");
    }

    const encrypted = await encryptMessage(this.sharedKey, plainBuffer);
    const frame = new Uint8Array(1 + encrypted.byteLength);
    frame[0] = msgType;
    frame.set(new Uint8Array(encrypted), 1);

    this.connection.send(frame.buffer);
  }

  /**
   * Sends an encrypted control message (JSON).
   */
  async sendControl(msg: ControlMessage): Promise<void> {
    const jsonStr = JSON.stringify(msg);
    const jsonBytes = new TextEncoder().encode(jsonStr);
    await this.sendRawEncrypted(MSG_ENCRYPTED_CONTROL, jsonBytes.buffer);
  }

  /**
   * Sends an encrypted binary chunk with backpressure handling
   * so WebRTC data buffers never overflow on large files.
   */
  async sendChunk(chunkBuffer: ArrayBuffer): Promise<void> {
    if (!this.connection || !this.sharedKey) {
      throw new Error("Secure connection not established.");
    }

    // Backpressure check: wait if buffer exceeds threshold (1 MB)
    const dc = this.connection.dataChannel;
    if (dc && dc.bufferedAmount > 1024 * 1024) {
      await new Promise<void>((resolve) => {
        const onLow = () => {
          dc.removeEventListener("bufferedamountlow", onLow);
          resolve();
        };
        dc.addEventListener("bufferedamountlow", onLow);
        setTimeout(() => {
          dc.removeEventListener("bufferedamountlow", onLow);
          resolve();
        }, 1500);
      });
    }

    await this.sendRawEncrypted(MSG_ENCRYPTED_CHUNK, chunkBuffer);
  }

  async createSender(roomCode: string) {
    this.updateState("connecting");
    this.updateStatus("Registering room code on P2P signaling server…");

    await this.initKeyPair();

    const peer = new Peer(roomCode, {
      host: "0.peerjs.com",
      port: 443,
      path: "/",
      secure: true,
      config: {
        iceServers: buildIceServers(),
      },
    });

    this.peer = peer;

    peer.on("open", () => {
      this.updateState("waiting");
      this.updateStatus("Room active. Waiting for receiver to connect…");
    });

    peer.on("connection", (conn) => {
      this.updateStatus("Receiver joining… securing P2P channel.");
      this.setupConnection(conn);
    });

    peer.on("error", (err) => {
      if (err.type === "unavailable-id") {
        this.fail("Room code already in use. Please generate a new code.");
      } else {
        this.fail(err.message || "Failed to initialize room.");
      }
    });
  }

  async createReceiver(roomCode: string) {
    this.updateState("connecting");
    this.updateStatus("Finding sender room…");

    await this.initKeyPair();

    const peer = new Peer({
      host: "0.peerjs.com",
      port: 443,
      path: "/",
      secure: true,
      config: {
        iceServers: buildIceServers(),
      },
    });

    this.peer = peer;

    peer.on("open", () => {
      this.updateStatus("Connecting to room " + roomCode + "…");
      const conn = peer.connect(roomCode, {
        reliable: true,
        serialization: "binary",
      });
      this.setupConnection(conn);
    });

    peer.on("error", (err) => {
      if (err.type === "peer-unavailable") {
        this.fail("Room " + roomCode + " was not found. Please check code or ask sender to stay active.");
      } else {
        this.fail(err.message || "Failed to join room.");
      }
    });
  }

  isSecure(): boolean {
    return Boolean(this.sharedKey);
  }

  isOpen(): boolean {
    return Boolean(this.connection?.open);
  }

  getFingerprint(): SecurityFingerprint | null {
    return this.fingerprint;
  }

  destroy() {
    this.destroyed = true;
    this.stopPing();
    this.events.onEncryptedChange?.(false);
    try {
      this.connection?.close();
    } catch {}
    try {
      this.peer?.destroy();
    } catch {}
    this.connection = null;
    this.peer = null;
    this.sharedKey = null;
    this.keyPair = null;
    this.localPublicKeyJwk = null;
    this.fingerprint = null;
    this.handshakeSent = false;
  }
}
