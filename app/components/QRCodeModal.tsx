"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Copy, Check, X } from "lucide-react";

type QRCodeModalProps = {
  isOpen: boolean;
  onClose: () => void;
  roomCode: string;
  shareUrl: string;
};

export default function QRCodeModal({
  isOpen,
  onClose,
  roomCode,
  shareUrl,
}: QRCodeModalProps) {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  if (!isOpen) return null;

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {}
  };

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch {}
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/80" onClick={onClose} />

      <div className="relative w-full max-w-xs rounded-lg border border-zinc-800 bg-[#0c0c0e] p-5 shadow-2xl">
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
          <span className="text-xs font-semibold text-zinc-100">
            Room QR & Link
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="my-4 flex flex-col items-center">
          <div className="rounded border border-zinc-800 bg-white p-3">
            <QRCodeSVG
              value={shareUrl}
              size={160}
              bgColor="#ffffff"
              fgColor="#09090b"
              level="M"
            />
          </div>
          <span className="mt-2 text-[11px] text-zinc-500 font-mono">
            Scan to join from mobile
          </span>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between rounded border border-zinc-800 bg-zinc-900/60 p-2 text-xs">
            <span className="font-mono font-bold tracking-widest text-zinc-100 text-sm">
              {roomCode}
            </span>
            <button
              type="button"
              onClick={copyCode}
              className="flex items-center gap-1 rounded bg-zinc-800 px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-700 transition"
            >
              {copiedCode ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
              <span>{copiedCode ? "Copied" : "Copy"}</span>
            </button>
          </div>

          <button
            type="button"
            onClick={copyUrl}
            className="w-full rounded border border-zinc-800 bg-zinc-900 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 transition"
          >
            {copiedUrl ? "Link copied" : "Copy direct URL"}
          </button>
        </div>
      </div>
    </div>
  );
}
