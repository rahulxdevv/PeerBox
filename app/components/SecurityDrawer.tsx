"use client";

import { X } from "lucide-react";
import { SecurityFingerprint } from "@/lib/crypto";

type SecurityDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  fingerprint: SecurityFingerprint | null;
  encrypted: boolean;
};

export default function SecurityDrawer({
  isOpen,
  onClose,
  fingerprint,
  encrypted,
}: SecurityDrawerProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/80" onClick={onClose} />

      <div className="relative w-full max-w-md rounded-lg border border-zinc-800 bg-[#0c0c0e] p-5 shadow-2xl">
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">
              Security inspection
            </h3>
            <p className="text-[11px] text-zinc-500">
              Client-side cryptographic specifications
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Short authentication string */}
        <div className="my-4 rounded border border-zinc-800 bg-zinc-950 p-3.5 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-400 font-mono text-[11px]">Safety code (SAS)</span>
            <span className={`font-mono text-[11px] ${encrypted ? "text-emerald-400" : "text-zinc-600"}`}>
              {encrypted ? "Channel encrypted" : "Awaiting connection"}
            </span>
          </div>

          {fingerprint ? (
            <div className="space-y-3 pt-1">
              <div className="flex items-center justify-center gap-3 py-2 rounded bg-zinc-900 border border-zinc-800/80">
                {fingerprint.emojis.map((emoji, idx) => (
                  <span key={idx} className="text-xl">
                    {emoji}
                  </span>
                ))}
              </div>
              <div className="flex items-center justify-between font-mono text-xs px-1">
                <div>
                  <span className="text-[10px] text-zinc-500 block">Verification code</span>
                  <span className="text-zinc-200 font-semibold">{fingerprint.code}</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-zinc-500 block">Session digest</span>
                  <span className="text-zinc-400 text-[11px]">{fingerprint.hex}</span>
                </div>
              </div>
              <p className="text-[11px] text-zinc-500 leading-normal">
                Compare these 4 emojis or verification code with your peer to confirm no intermediary modified the public keys during signaling.
              </p>
            </div>
          ) : (
            <p className="text-xs text-zinc-600 py-3 text-center font-mono">
              Connect to a room to calculate session safety fingerprint.
            </p>
          )}
        </div>

        {/* Technical specs table */}
        <div className="space-y-2 text-xs">
          <div className="rounded border border-zinc-900 bg-zinc-950/60 p-2.5 space-y-1">
            <span className="font-mono text-[11px] text-zinc-300 block">Asymmetric Key Agreement</span>
            <p className="text-[11px] text-zinc-500">
              Web Crypto ECDH on curve P-256. Ephemeral key pairs generated in browser memory per session.
            </p>
          </div>

          <div className="rounded border border-zinc-900 bg-zinc-950/60 p-2.5 space-y-1">
            <span className="font-mono text-[11px] text-zinc-300 block">Authenticated Cipher</span>
            <p className="text-[11px] text-zinc-500">
              AES-256-GCM with fresh 96-bit cryptographically secure random IV generated per frame.
            </p>
          </div>

          <div className="rounded border border-zinc-900 bg-zinc-950/60 p-2.5 space-y-1">
            <span className="font-mono text-[11px] text-zinc-300 block">Key Derivation</span>
            <p className="text-[11px] text-zinc-500">
              HKDF SHA-256 with deterministic salt derived from sorted public key coordinates, plus optional room PIN.
            </p>
          </div>

          <div className="rounded border border-zinc-900 bg-zinc-950/60 p-2.5 space-y-1">
            <span className="font-mono text-[11px] text-zinc-300 block">Integrity Verification</span>
            <p className="text-[11px] text-zinc-500">
              SHA-256 digest computed across streamed chunks and verified on receipt before saving.
            </p>
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-zinc-800 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
