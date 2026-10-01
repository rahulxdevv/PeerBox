"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Upload,
  X,
  QrCode,
  Copy,
  Check,
  KeyRound,
  File as FileIcon,
  CheckCircle2,
} from "lucide-react";

import ProgressBar from "@/app/components/ProgressBar";
import QRCodeModal from "@/app/components/QRCodeModal";
import { ConnectionState, PeerSession, generateRoomCode } from "@/lib/peer";
import {
  formatBytes,
  formatEta,
  formatSpeed,
  prepareFileMetadata,
  streamFileChunks,
  FileMetadata,
} from "@/lib/transfer";
import { SecurityFingerprint } from "@/lib/crypto";

type FileProgress = {
  sentBytes: number;
  totalBytes: number;
  speed: number;
  eta: number | null;
  completed: boolean;
  checksum?: string;
};

type SendPanelProps = {
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

export default function SendPanel({
  sessionRef,
  onStateUpdate,
  onOpenSecurity,
  onTextMessage,
}: SendPanelProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [roomCode, setRoomCode] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [enablePin, setEnablePin] = useState(false);
  const [isQrOpen, setIsQrOpen] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferComplete, setTransferComplete] = useState(false);
  const [progressMap, setProgressMap] = useState<Record<string, FileProgress>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isTransferringRef = useRef(false);

  const shareUrl = useMemo(() => {
    if (!roomCode || typeof window === "undefined") return "";
    const url = new URL(window.location.href);
    url.searchParams.set("room", roomCode);
    return url.toString();
  }, [roomCode]);

  useEffect(() => {
    onStateUpdate({
      connectionState: "idle",
      statusMessage: "Select files to begin.",
      encrypted: false,
      fingerprint: null,
      latencyMs: null,
    });
  }, [onStateUpdate]);

  const copyRoomCode = async () => {
    if (!roomCode) return;
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {}
  };

  const removeFile = (index: number) => {
    if (isTransferring) return;
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (isTransferring) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const dropped = Array.from(e.dataTransfer.files);
      setFiles((prev) => [...prev, ...dropped]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selected = Array.from(e.target.files);
      setFiles((prev) => [...prev, ...selected]);
    }
  };

  const startSendingFiles = async (session: PeerSession) => {
    if (files.length === 0 || isTransferringRef.current) return;
    isTransferringRef.current = true;
    setIsTransferring(true);
    setTransferComplete(false);
    setErrorMessage(null);

    try {
      for (const file of files) {
        onStateUpdate({
          connectionState: "transferring",
          statusMessage: `Sending ${file.name}…`,
          encrypted: true,
          fingerprint: session.getFingerprint(),
          latencyMs: null,
        });

        const meta: FileMetadata = await prepareFileMetadata(file);

        await session.sendControl({
          type: "file-start",
          file: meta,
        });

        let sentBytes = 0;
        const startTime = performance.now();

        for await (const chunk of streamFileChunks(file)) {
          if (!isTransferringRef.current) {
            await session.sendControl({
              type: "file-cancel",
              id: meta.id,
              reason: "Cancelled by user",
            });
            break;
          }

          await session.sendChunk(chunk.buffer);
          sentBytes += chunk.buffer.byteLength;

          const elapsedSec = Math.max((performance.now() - startTime) / 1000, 0.001);
          const currentSpeed = sentBytes / elapsedSec;
          const remainingBytes = file.size - sentBytes;
          const eta = currentSpeed > 0 ? remainingBytes / currentSpeed : null;

          setProgressMap((prev) => ({
            ...prev,
            [file.name]: {
              sentBytes,
              totalBytes: file.size,
              speed: currentSpeed,
              eta,
              completed: sentBytes >= file.size,
              checksum: meta.checksum,
            },
          }));
        }

        await session.sendControl({
          type: "file-end",
          id: meta.id,
          name: file.name,
          size: file.size,
          checksum: meta.checksum || "",
        });
      }

      setTransferComplete(true);
      onStateUpdate({
        connectionState: "completed",
        statusMessage: "Transfer complete.",
        encrypted: true,
        fingerprint: session.getFingerprint(),
        latencyMs: null,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Transfer failed.";
      setErrorMessage(msg);
      onStateUpdate({
        connectionState: "error",
        statusMessage: msg,
        encrypted: session.isSecure(),
        fingerprint: session.getFingerprint(),
        latencyMs: null,
      });
    } finally {
      isTransferringRef.current = false;
      setIsTransferring(false);
    }
  };

  const createRoom = async () => {
    if (files.length === 0) return;
    setErrorMessage(null);
    setTransferComplete(false);

    const initialMap: Record<string, FileProgress> = {};
    files.forEach((f) => {
      initialMap[f.name] = {
        sentBytes: 0,
        totalBytes: f.size,
        speed: 0,
        eta: null,
        completed: false,
      };
    });
    setProgressMap(initialMap);

    const nextCode = generateRoomCode();
    setRoomCode(nextCode);

    sessionRef.current?.destroy();

    const session = new PeerSession(
      "sender",
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
            connectionState: session.isSecure() ? "encrypted" : "waiting",
            statusMessage: msg,
            encrypted: session.isSecure(),
            fingerprint: session.getFingerprint(),
            latencyMs: null,
          });
        },
        onEncryptedChange: (isEncrypted) => {
          if (isEncrypted) {
            void startSendingFiles(session);
          }
        },
        onSecurityVerified: (fp) => {
          onStateUpdate({
            connectionState: "encrypted",
            statusMessage: "Connected with peer.",
            encrypted: true,
            fingerprint: fp,
            latencyMs: null,
          });
        },
        onLatency: (lat) => {
          onStateUpdate({
            connectionState: isTransferringRef.current ? "transferring" : "encrypted",
            statusMessage: isTransferringRef.current ? "Transferring…" : "Connected",
            encrypted: true,
            fingerprint: session.getFingerprint(),
            latencyMs: lat,
          });
        },
        onControlMessage: (msg) => {
          if (msg.type === "secure-text") {
            onTextMessage?.(msg);
          }
        },
        onError: (err) => {
          isTransferringRef.current = false;
          setIsTransferring(false);
          setErrorMessage(err);
        },
        onClose: () => {
          isTransferringRef.current = false;
          setIsTransferring(false);
        },
      },
      enablePin && passphrase.trim().length > 0 ? passphrase.trim() : undefined,
    );

    sessionRef.current = session;
    await session.createSender(nextCode);
  };

  const cancelTransfer = () => {
    isTransferringRef.current = false;
    setIsTransferring(false);
    sessionRef.current?.destroy();
    setRoomCode("");
    setErrorMessage("Transfer cancelled.");
  };

  const totalSize = files.reduce((acc, f) => acc + f.size, 0);

  return (
    <div className="space-y-4">
      {/* Drop area */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleFileDrop}
        onClick={() => {
          if (!isTransferring) fileInputRef.current?.click();
        }}
        className={`flex min-h-[140px] cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed p-6 text-center transition ${
          isDragging
            ? "border-zinc-400 bg-zinc-900"
            : "border-zinc-800 bg-zinc-950/40 hover:border-zinc-700 hover:bg-zinc-900/30"
        }`}
      >
        <Upload className="h-5 w-5 text-zinc-500 mb-2" />
        <p className="text-xs font-medium text-zinc-200">
          Drop files to share, or <span className="underline text-zinc-400">browse</span>
        </p>
        <p className="mt-1 text-[11px] text-zinc-500 font-mono">
          Direct browser streaming
        </p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />
      </div>

      {/* Selected file list */}
      {files.length > 0 && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3.5 space-y-2.5">
          <div className="flex items-center justify-between text-xs pb-2 border-b border-zinc-900">
            <span className="text-zinc-400">
              {files.length} {files.length === 1 ? "file" : "files"} ({formatBytes(totalSize)})
            </span>
            {!isTransferring && !roomCode && (
              <button
                type="button"
                onClick={() => setFiles([])}
                className="text-zinc-500 hover:text-zinc-300 transition text-[11px]"
              >
                Clear
              </button>
            )}
          </div>

          <div className="max-h-[200px] overflow-y-auto space-y-1.5 pr-0.5">
            {files.map((file, idx) => {
              const prog = progressMap[file.name];
              const pct = prog
                ? Math.min(100, (prog.sentBytes / Math.max(prog.totalBytes, 1)) * 100)
                : 0;

              return (
                <div
                  key={`${file.name}-${idx}`}
                  className="rounded border border-zinc-900 bg-zinc-900/40 p-2 text-xs"
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
                      {prog?.completed ? (
                        <span className="text-emerald-500 text-[11px] flex items-center gap-1 font-mono">
                          <CheckCircle2 className="h-3 w-3" /> sent
                        </span>
                      ) : isTransferring ? (
                        <span className="font-mono text-[11px] text-zinc-400">
                          {pct.toFixed(0)}%
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => removeFile(idx)}
                          className="text-zinc-500 hover:text-zinc-300 transition"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {prog && (
                    <ProgressBar
                      value={pct}
                      speed={prog.speed > 0 ? formatSpeed(prog.speed) : undefined}
                      eta={prog.eta !== null ? formatEta(prog.eta) : undefined}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Optional PIN */}
      {!roomCode && files.length > 0 && (
        <div className="flex items-center justify-between text-xs py-1">
          <label className="flex items-center gap-2 cursor-pointer text-zinc-400 hover:text-zinc-300">
            <input
              type="checkbox"
              checked={enablePin}
              onChange={(e) => setEnablePin(e.target.checked)}
              className="rounded border-zinc-800 bg-zinc-900 text-zinc-200"
            />
            <span>Set optional transfer PIN / password</span>
          </label>

          {enablePin && (
            <input
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="Room password..."
              className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none w-40"
            />
          )}
        </div>
      )}

      {/* Create room button */}
      {files.length > 0 && !roomCode && (
        <button
          type="button"
          onClick={() => void createRoom()}
          className="w-full rounded-md bg-zinc-100 py-2.5 text-xs font-semibold text-zinc-900 hover:bg-white transition"
        >
          Create Room & Send
        </button>
      )}

      {/* Active room card */}
      {roomCode && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-400">Share this code with receiver:</span>
            {isTransferring ? (
              <button
                type="button"
                onClick={cancelTransfer}
                className="text-red-400 hover:text-red-300 transition text-[11px]"
              >
                Cancel transfer
              </button>
            ) : null}
          </div>

          <div className="flex items-center justify-between gap-3 rounded border border-zinc-800 bg-zinc-900/60 p-3">
            <span className="font-mono text-2xl font-bold tracking-widest text-zinc-100">
              {roomCode}
            </span>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={copyRoomCode}
                className="flex items-center gap-1 rounded border border-zinc-800 bg-zinc-800 px-2.5 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-700 transition"
              >
                {copiedCode ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setIsQrOpen(true)}
                className="flex items-center gap-1 rounded border border-zinc-800 bg-zinc-800 px-2.5 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-700 transition"
              >
                <QrCode className="h-3.5 w-3.5" />
                <span>QR</span>
              </button>
            </div>
          </div>

          {transferComplete ? (
            <p className="text-xs text-emerald-400 font-mono">
              ✓ All files delivered and verified with receiver.
            </p>
          ) : !isTransferring ? (
            <p className="text-xs text-zinc-500 font-mono">
              Waiting for receiver to join room {roomCode}...
            </p>
          ) : null}
        </div>
      )}

      {errorMessage && (
        <div className="rounded border border-red-900/40 bg-red-950/20 p-2.5 text-xs text-red-400 font-mono">
          {errorMessage}
        </div>
      )}

      <QRCodeModal
        isOpen={isQrOpen}
        onClose={() => setIsQrOpen(false)}
        roomCode={roomCode}
        shareUrl={shareUrl}
      />
    </div>
  );
}
