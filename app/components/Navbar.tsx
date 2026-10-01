"use client";

import { ShieldCheck } from "lucide-react";
import { ConnectionState } from "@/lib/peer";

type NavbarProps = {
  connectionState: ConnectionState;
  encrypted: boolean;
  latencyMs: number | null;
  onOpenSecurity: () => void;
};

export default function Navbar({
  connectionState,
  encrypted,
  latencyMs,
  onOpenSecurity,
}: NavbarProps) {
  const getStatusText = () => {
    if (connectionState === "encrypted" || connectionState === "transferring") {
      return (
        <span className="flex items-center gap-1.5 text-zinc-300">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          <span>Encrypted {latencyMs !== null ? `(${latencyMs}ms)` : ""}</span>
        </span>
      );
    }
    if (connectionState === "waiting") {
      return (
        <span className="flex items-center gap-1.5 text-zinc-400">
          <span className="h-2 w-2 rounded-full bg-amber-500" />
          <span>Waiting for peer</span>
        </span>
      );
    }
    if (connectionState === "connecting" || connectionState === "handshaking") {
      return (
        <span className="flex items-center gap-1.5 text-zinc-400">
          <span className="h-2 w-2 rounded-full bg-zinc-500 animate-pulse" />
          <span>Connecting…</span>
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1.5 text-zinc-500">
        <span className="h-2 w-2 rounded-full bg-zinc-600" />
        <span>P2P Ready</span>
      </span>
    );
  };

  return (
    <header className="w-full border-b border-zinc-800/80 bg-[#09090b]">
      <div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <a href="/" className="font-semibold text-zinc-100 text-sm tracking-tight hover:text-white transition">
            peerbox
          </a>
          <span className="text-zinc-600 text-xs">/</span>
          <span className="text-xs text-zinc-400 font-mono">browser-to-browser</span>
        </div>

        <div className="flex items-center gap-3 text-xs">
          {getStatusText()}

          <button
            type="button"
            onClick={onOpenSecurity}
            className="flex items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-zinc-300 hover:text-zinc-100 hover:border-zinc-700 transition"
          >
            <ShieldCheck className="h-3.5 w-3.5 text-zinc-400" />
            <span>Audit</span>
          </button>

          <a
            href="https://github.com/rahulxdevv/PeerBox"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-zinc-400 hover:text-zinc-100 hover:border-zinc-700 transition"
            title="View on GitHub"
          >
            <svg className="h-3.5 w-3.5 fill-currentColor" viewBox="0 0 24 24">
              <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
            </svg>
            <span className="hidden sm:inline">GitHub</span>
          </a>
        </div>
      </div>
    </header>
  );
}
