"use client";

import { useSearchParams } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { ArrowUpRight, Shield } from "lucide-react";

import Navbar from "@/app/components/Navbar";
import SendPanel from "@/app/components/SendPanel";
import ReceivePanel from "@/app/components/ReceivePanel";
import SecureTextPanel from "@/app/components/SecureTextPanel";
import SecurityDrawer from "@/app/components/SecurityDrawer";
import { ConnectionState, PeerSession } from "@/lib/peer";
import { SecurityFingerprint } from "@/lib/crypto";
import { SecureTextMessage } from "@/lib/transfer";

type ViewMode = "send" | "receive" | "text";

export default function HomeClient() {
  const searchParams = useSearchParams();
  const roomFromUrl = searchParams.get("room");
  const roomCode = useMemo(() => roomFromUrl?.toUpperCase() ?? null, [roomFromUrl]);

  const [mode, setMode] = useState<ViewMode>(roomCode ? "receive" : "send");
  const [securityDrawerOpen, setSecurityDrawerOpen] = useState(false);

  // Global Session State
  const sessionRef = useRef<PeerSession | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    roomCode ? "connecting" : "idle",
  );
  const [statusMessage, setStatusMessage] = useState<string>(
    roomCode ? `Ready to connect to room ${roomCode}` : "Select a mode to start.",
  );
  const [isEncrypted, setIsEncrypted] = useState(false);
  const [fingerprint, setFingerprint] = useState<SecurityFingerprint | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [secretMessages, setSecretMessages] = useState<SecureTextMessage[]>([]);

  const handleStateUpdate = (state: {
    connectionState: ConnectionState;
    statusMessage: string;
    encrypted: boolean;
    fingerprint: SecurityFingerprint | null;
    latencyMs: number | null;
  }) => {
    setConnectionState(state.connectionState);
    setStatusMessage(state.statusMessage);
    setIsEncrypted(state.encrypted);
    if (state.fingerprint) {
      setFingerprint(state.fingerprint);
    }
    if (state.latencyMs !== null) {
      setLatencyMs(state.latencyMs);
    }
  };

  const handleSendTextMessage = async (text: string) => {
    if (!sessionRef.current || !sessionRef.current.isSecure()) return;

    const newMsg: SecureTextMessage = {
      type: "secure-text",
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      text,
      timestamp: Date.now(),
    };

    await sessionRef.current.sendControl(newMsg);
    setSecretMessages((prev) => [...prev, newMsg]);
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 flex flex-col font-sans">
      <Navbar
        connectionState={connectionState}
        encrypted={isEncrypted}
        latencyMs={latencyMs}
        onOpenSecurity={() => setSecurityDrawerOpen(true)}
      />

      <main className="flex-1 mx-auto w-full max-w-xl px-4 py-8 sm:py-12">
        <section className="mb-6 space-y-1.5">
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-white">
            Peer-to-peer file transfer
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 leading-normal">
            Stream files directly between two devices over an encrypted WebRTC data channel. Nothing is saved on a server.
          </p>
        </section>

        {/* Minimal segmented control */}
        <div className="mb-5 flex border-b border-zinc-800">
          <button
            type="button"
            onClick={() => setMode("send")}
            className={`pb-2.5 px-3 text-xs font-medium border-b-2 transition -mb-px ${
              mode === "send"
                ? "border-zinc-100 text-white font-semibold"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Send files
          </button>

          <button
            type="button"
            onClick={() => setMode("receive")}
            className={`pb-2.5 px-3 text-xs font-medium border-b-2 transition -mb-px ${
              mode === "receive"
                ? "border-zinc-100 text-white font-semibold"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Receive files
          </button>

          <button
            type="button"
            onClick={() => setMode("text")}
            className={`pb-2.5 px-3 text-xs font-medium border-b-2 transition -mb-px ${
              mode === "text"
                ? "border-zinc-100 text-white font-semibold"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Encrypted text
          </button>
        </div>

        {/* Panel Container */}
        <div>
          {mode === "send" && (
            <SendPanel
              sessionRef={sessionRef}
              onStateUpdate={handleStateUpdate}
              onOpenSecurity={() => setSecurityDrawerOpen(true)}
              onTextMessage={(msg) => setSecretMessages((prev) => [...prev, msg])}
            />
          )}

          {mode === "receive" && (
            <ReceivePanel
              initialRoomCode={roomCode}
              sessionRef={sessionRef}
              onStateUpdate={handleStateUpdate}
              onOpenSecurity={() => setSecurityDrawerOpen(true)}
              onTextMessage={(msg) => setSecretMessages((prev) => [...prev, msg])}
            />
          )}

          {mode === "text" && (
            <SecureTextPanel
              isSecure={isEncrypted}
              messages={secretMessages}
              onSendMessage={handleSendTextMessage}
            />
          )}
        </div>

        {/* Technical specs summary - honest and direct without AI slop marketing */}
        <section className="mt-12 pt-6 border-t border-zinc-800/80 text-xs text-zinc-500 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] text-zinc-400">Technical specification</span>
            <button
              type="button"
              onClick={() => setSecurityDrawerOpen(true)}
              className="text-zinc-400 hover:text-zinc-200 transition underline underline-offset-4"
            >
              Verify session keys
            </button>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[11px] pt-1">
            <div className="flex justify-between border-b border-zinc-900 py-1">
              <span className="text-zinc-500">Key exchange</span>
              <span className="text-zinc-300">ECDH (P-256)</span>
            </div>
            <div className="flex justify-between border-b border-zinc-900 py-1">
              <span className="text-zinc-500">Cipher</span>
              <span className="text-zinc-300">AES-256-GCM</span>
            </div>
            <div className="flex justify-between border-b border-zinc-900 py-1">
              <span className="text-zinc-500">Transport</span>
              <span className="text-zinc-300">WebRTC DataChannel</span>
            </div>
            <div className="flex justify-between border-b border-zinc-900 py-1">
              <span className="text-zinc-500">Integrity</span>
              <span className="text-zinc-300">SHA-256 checksum</span>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-zinc-900 py-5 text-xs text-zinc-500">
        <div className="mx-auto max-w-xl px-4 flex flex-col sm:flex-row items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 font-mono text-[11px]">
            <a
              href="https://github.com/rahulxdevv/PeerBox"
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-400 hover:text-zinc-100 transition underline underline-offset-4"
            >
              PeerBox source
            </a>
            <span className="text-zinc-700">·</span>
            <span className="text-zinc-500">by</span>
            <a
              href="https://github.com/rahulxdevv"
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-300 hover:text-white transition font-medium"
            >
              rahulxdevv
            </a>
          </div>

          <div className="flex items-center gap-3 text-[11px] text-zinc-500">
            <button
              type="button"
              onClick={() => setSecurityDrawerOpen(true)}
              className="hover:text-zinc-300 transition"
            >
              Security specs
            </button>
            <span className="text-zinc-700">·</span>
            <span>Zero server storage</span>
          </div>
        </div>
      </footer>

      <SecurityDrawer
        isOpen={securityDrawerOpen}
        onClose={() => setSecurityDrawerOpen(false)}
        fingerprint={fingerprint}
        encrypted={isEncrypted}
      />
    </div>
  );
}
