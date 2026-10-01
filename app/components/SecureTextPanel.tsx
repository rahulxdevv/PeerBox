"use client";

import { useState } from "react";
import { Send, Copy, Check } from "lucide-react";
import { SecureTextMessage } from "@/lib/transfer";

type SecureTextPanelProps = {
  isSecure: boolean;
  messages: SecureTextMessage[];
  onSendMessage: (text: string) => Promise<void>;
};

export default function SecureTextPanel({
  isSecure,
  messages,
  onSendMessage,
}: SecureTextPanelProps) {
  const [inputText, setInputText] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !isSecure || sending) return;

    try {
      setSending(true);
      await onSendMessage(inputText.trim());
      setInputText("");
    } finally {
      setSending(false);
    }
  };

  const copyText = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {}
  };

  return (
    <div className="space-y-3">
      {/* Messages list */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3.5 min-h-[140px] max-h-[260px] overflow-y-auto space-y-2">
        {messages.length === 0 ? (
          <div className="flex h-28 items-center justify-center text-xs text-zinc-500 font-mono">
            {isSecure
              ? "Encrypted channel ready. Type text below to sync."
              : "Connect to a room to send encrypted text."}
          </div>
        ) : (
          messages.map((msg) => {
            const isCopied = copiedId === msg.id;
            return (
              <div
                key={msg.id}
                className="flex items-start justify-between gap-3 rounded border border-zinc-900 bg-zinc-900/40 p-2.5"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-xs text-zinc-200 whitespace-pre-wrap break-all leading-relaxed">
                    {msg.text}
                  </p>
                  <span className="text-[10px] text-zinc-600 font-mono mt-1 block">
                    {new Date(msg.timestamp).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => copyText(msg.id, msg.text)}
                  className="flex items-center gap-1 rounded border border-zinc-800 bg-zinc-800 px-2 py-1 text-[11px] text-zinc-300 hover:text-zinc-100 hover:bg-zinc-700 transition shrink-0"
                >
                  {isCopied ? (
                    <>
                      <Check className="h-3 w-3 text-emerald-400" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <textarea
          rows={2}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder={isSecure ? "Type text to send..." : "Connect room first to send text..."}
          disabled={!isSecure || sending}
          className="flex-1 resize-none rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none disabled:opacity-40"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void handleSubmit(e);
            }
          }}
        />
        <button
          type="submit"
          disabled={!isSecure || !inputText.trim() || sending}
          className="rounded bg-zinc-100 px-4 py-2 text-xs font-semibold text-zinc-900 hover:bg-white disabled:opacity-40 transition flex items-center justify-center self-end h-9"
        >
          Send
        </button>
      </form>
    </div>
  );
}
