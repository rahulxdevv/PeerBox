"use client";

import { useEffect, useRef, useState } from "react";
import {
  Download,
  CheckCircle2,
  File as FileIcon,
  RefreshCw,
} from "lucide-react";

import ProgressBar from "@/app/components/ProgressBar";
import { ConnectionState, PeerSession } from "@/lib/peer";
import {
  assembleFile,
  downloadBlob,
  formatBytes,
  formatEta,
  formatSpeed,
  ControlMessage,
  FileStartMessage,
  FileEndMessage,
} from "@/lib/transfer";
import { SecurityFingerprint, computeSha256 } from "@/lib/crypto";

type FileDownloadProgress = {
  name: string;
  size: number;
  mime: string;
  receivedBytes: number;
  speed: number;
  eta: number | null;
  completed: boolean;
  checksumMatched: boolean | null;
  blob?: Blob;
};

type ReceivePanelProps = {
  initialRoomCode?: string | null;
  sessionRef: React.MutableRefObject<PeerSession | null>;
  onStateUpdate: (state: {
    connectionState: ConnectionState;
    statusMessage: string;
    encrypted: boolean;
    fingerprint: SecurityFingerprint | null;
    latencyMs: number | null;
  }) => void;
  onOpenSecurity: () => void;
  onTextMessage?: (msg: import("@/lib/transfer").SecureTextMessage) => void;
};

export default function ReceivePanel({
  initialRoomCode,
  sessionRef,
  onStateUpdate,
  onOpenSecurity,
  onTextMessage,
}: ReceivePanelProps) {
  const [inputCode, setInputCode] = useState(initialRoomCode ?? "");
  const [passphrase, setPassphrase] = useState("");
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [activeRoom, setActiveRoom] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [filesMap, setFilesMap] = useState<Record<string, FileDownloadProgress>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const activeFileRef = useRef<{
    meta: FileStartMessage["file"];
    chunks: ArrayBuffer[];
    receivedBytes: number;
    startedAt: number;
  } | null>(null);

  useEffect(() => {
    if (initialRoomCode) {
      setInputCode(initialRoomCode.toUpperCase());
      void joinRoom(initialRoomCode.toUpperCase());
    } else {
      onStateUpdate({
        connectionState: "idle",
        statusMessage: "Enter room code.",
        encrypted: false,
        fingerprint: null,
        latencyMs: null,
      });
    }
  }, [initialRoomCode]);

  const handleControlMessage = async (msg: ControlMessage) => {
    if (msg.type === "secure-text") {
      onTextMessage?.(msg);
      return;
    }

    if (msg.type === "file-start") {
      activeFileRef.current = {
        meta: msg.file,
        chunks: [],
        receivedBytes: 0,
        startedAt: performance.now(),
      };

      setFilesMap((prev) => ({
        ...prev,
        [msg.file.id]: {
          name: msg.file.name,
          size: msg.file.size,
          mime: msg.file.mime,
          receivedBytes: 0,
          speed: 0,
          eta: null,
          completed: false,
          checksumMatched: null,
        },
      }));

      onStateUpdate({
        connectionState: "transferring",
        statusMessage: `Receiving ${msg.file.name}…`,
        encrypted: true,
        fingerprint: sessionRef.current?.getFingerprint() ?? null,
        latencyMs: null,
      });
      return;
    }

    if (msg.type === "file-end") {
      const active = activeFileRef.current;
      if (!active || active.meta.id !== msg.id) return;

      const blob = assembleFile(active.chunks, active.meta.mime);

      let checksumMatched: boolean | null = null;
      if (msg.checksum) {
        try {
          const computedHash = await computeSha256(blob);
          checksumMatched = computedHash === msg.checksum;
        } catch {
          checksumMatched = null;
        }
      }

      downloadBlob(blob, active.meta.name);

      setFilesMap((prev) => ({
        ...prev,
        [active.meta.id]: {
          ...prev[active.meta.id],
          completed: true,
          receivedBytes: active.meta.size,
          speed: 0,
          eta: 0,
          checksumMatched,
          blob,
        },
      }));

      onStateUpdate({
        connectionState: "completed",
        statusMessage: `${active.meta.name} received.`,
        encrypted: true,
        fingerprint: sessionRef.current?.getFingerprint() ?? null,
        latencyMs: null,
      });

      activeFileRef.current = null;
    }

    if (msg.type === "file-cancel") {
      setErrorMessage(`Transfer cancelled: ${msg.reason || "sender disconnected"}`);
      activeFileRef.current = null;
    }
  };

  const handleBinaryChunk = (buffer: ArrayBuffer) => {
    const active = activeFileRef.current;
    if (!active) return;

    active.chunks.push(buffer);
    active.receivedBytes += buffer.byteLength;

    const elapsedSec = Math.max((performance.now() - active.startedAt) / 1000, 0.001);
    const speed = active.receivedBytes / elapsedSec;
    const remaining = active.meta.size - active.receivedBytes;
    const eta = speed > 0 ? remaining / speed : null;

    setFilesMap((prev) => ({
      ...prev,
      [active.meta.id]: {
        ...prev[active.meta.id],
        receivedBytes: active.receivedBytes,
        speed,
        eta,
      },
    }));
  };

  const joinRoom = async (codeToJoin?: string) => {
    const code = (codeToJoin || inputCode).trim().toUpperCase();
    if (code.length < 5) return;

    setIsJoining(true);
    setErrorMessage(null);
    setActiveRoom(code);

    sessionRef.current?.destroy();

    const session = new PeerSession(
      "receiver",
      {
        onStateChange: (state) => {
          onStateUpdate({
            connectionState: state,
            statusMessage: state,
            encrypted: session.isSecure(),
            fingerprint: session.getFingerprint(),
            latencyMs: null,
          });
        },
        onStatus: (msg) => {
          onStateUpdate({
            connectionState: session.isSecure() ? "encrypted" : "connecting",
            statusMessage: msg,
            encrypted: session.isSecure(),
            fingerprint: session.getFingerprint(),
            latencyMs: null,
          });
        },
        onEncryptedChange: (isEncrypted) => {
          setIsJoining(false);
          onStateUpdate({
            connectionState: isEncrypted ? "encrypted" : "connecting",
            statusMessage: isEncrypted ? "Connected to room." : "Securing…",
            encrypted: isEncrypted,
            fingerprint: session.getFingerprint(),
            latencyMs: null,
          });
        },
        onSecurityVerified: (fp) => {
          onStateUpdate({
            connectionState: "encrypted",
            statusMessage: "Connected.",
            encrypted: true,
            fingerprint: fp,
            latencyMs: null,
          });
        },
        onLatency: (lat) => {
          onStateUpdate({
            connectionState: "encrypted",
            statusMessage: "Connected",
            encrypted: true,
            fingerprint: session.getFingerprint(),
            latencyMs: lat,
          });
        },
        onControlMessage: (msg) => {
          void handleControlMessage(msg);
        },
        onBinaryChunk: (buf) => {
          handleBinaryChunk(buf);
        },
        onError: (err) => {
          setIsJoining(false);
          setErrorMessage(err);
        },
        onClose: () => {
          setIsJoining(false);
        },
      },
      showPassphrase && passphrase.trim().length > 0 ? passphrase.trim() : undefined,
    );

    sessionRef.current = session;
    await session.createReceiver(code);
  };

  return (
    <div className="space-y-4">
      {/* Join form */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 space-y-3">
        <label className="text-xs text-zinc-400 block">
          Enter 6-character room code:
        </label>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void joinRoom();
          }}
          className="space-y-2"
        >
          <div className="flex gap-2">
            <input
              type="text"
              value={inputCode}
              maxLength={6}
              onChange={(e) =>
                setInputCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))
              }
              placeholder="CODE"
              className="flex-1 rounded border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-base font-bold tracking-widest text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
            />
            <button
              type="submit"
              disabled={inputCode.length < 5 || isJoining}
              className="rounded bg-zinc-100 px-4 py-2 text-xs font-semibold text-zinc-900 hover:bg-white disabled:opacity-40 transition"
            >
              {isJoining ? "Joining…" : "Connect"}
            </button>
          </div>

          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowPassphrase(!showPassphrase)}
              className="text-[11px] text-zinc-500 hover:text-zinc-400 transition"
            >
              {showPassphrase ? "Hide password field" : "Has optional password?"}
            </button>

            {showPassphrase && (
              <input
                type="password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder="Room password..."
                className="mt-1 w-full rounded border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
              />
            )}
          </div>
        </form>
      </div>

      {errorMessage && (
        <div className="rounded border border-red-900/40 bg-red-950/20 p-2.5 text-xs text-red-400 font-mono">
          {errorMessage}
        </div>
      )}

      {/* Files list */}
      {Object.keys(filesMap).length > 0 ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3.5 space-y-2">
          <div className="text-xs text-zinc-400 pb-2 border-b border-zinc-900">
            Received files
          </div>

          <div className="space-y-1.5">
            {Object.entries(filesMap).map(([id, file]) => {
              const pct = Math.min(
                100,
                (file.receivedBytes / Math.max(file.size, 1)) * 100,
              );

              return (
                <div
                  key={id}
                  className="rounded border border-zinc-900 bg-zinc-900/40 p-2 text-xs space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileIcon className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                      <span className="truncate text-zinc-200">{file.name}</span>
                      <span className="text-zinc-500 font-mono text-[11px]">
                        {formatBytes(file.size)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {file.completed ? (
                        <div className="flex items-center gap-2">
                          <span className="text-emerald-500 text-[11px] font-mono flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" /> verified
                          </span>
                          {file.blob && (
                            <button
                              type="button"
                              onClick={() => downloadBlob(file.blob!, file.name)}
                              className="text-zinc-400 hover:text-zinc-200 text-[11px] underline"
                            >
                              save
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="font-mono text-[11px] text-zinc-400">
                          {pct.toFixed(0)}%
                        </span>
                      )}
                    </div>
                  </div>

                  {!file.completed && (
                    <ProgressBar
                      value={pct}
                      speed={file.speed > 0 ? formatSpeed(file.speed) : undefined}
                      eta={file.eta !== null ? formatEta(file.eta) : undefined}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : activeRoom ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 text-xs text-zinc-500 font-mono text-center">
          Connected to room {activeRoom}. Waiting for sender to transmit files…
        </div>
      ) : null}
    </div>
  );
}
