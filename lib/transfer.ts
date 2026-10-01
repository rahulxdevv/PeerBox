import { computeSha256 } from "@/lib/crypto";

export const CHUNK_SIZE = 64 * 1024; // 64 KB per chunk

export type FileMetadata = {
  id: string;
  name: string;
  size: number;
  mime: string;
  totalChunks: number;
  checksum?: string;
  lastModified?: number;
};

export type FileStartMessage = {
  type: "file-start";
  file: FileMetadata;
};

export type FileEndMessage = {
  type: "file-end";
  id: string;
  name: string;
  size: number;
  checksum: string;
};

export type FileCancelMessage = {
  type: "file-cancel";
  id: string;
  reason?: string;
};

export type SecureTextMessage = {
  type: "secure-text";
  id: string;
  text: string;
  timestamp: number;
};

export type PingMessage = {
  type: "ping";
  timestamp: number;
};

export type PongMessage = {
  type: "pong";
  timestamp: number;
};

export type ControlMessage =
  | FileStartMessage
  | FileEndMessage
  | FileCancelMessage
  | SecureTextMessage
  | PingMessage
  | PongMessage;

export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec <= 0 || !Number.isFinite(bytesPerSec)) return "0 KB/s";
  const mbps = bytesPerSec / (1024 * 1024);
  if (mbps >= 1) {
    return `${mbps.toFixed(1)} MB/s`;
  }
  const kbps = bytesPerSec / 1024;
  return `${kbps.toFixed(0)} KB/s`;
}

export function formatEta(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return "—";
  if (seconds < 1) return "< 1s";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (mins < 60) return `${mins}m ${secs}s`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ${mins % 60}m`;
}

export async function prepareFileMetadata(file: File): Promise<FileMetadata> {
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  const id = `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 7)}`;
  
  // Compute file SHA-256 checksum for integrity check
  let checksum = "";
  try {
    checksum = await computeSha256(file);
  } catch (err) {
    console.warn("Could not precompute hash", err);
  }

  return {
    id,
    name: file.name,
    size: file.size,
    mime: file.type || "application/octet-stream",
    totalChunks,
    checksum,
    lastModified: file.lastModified,
  };
}

export function assembleFile(chunks: ArrayBuffer[], mime: string): Blob {
  return new Blob(chunks, { type: mime || "application/octet-stream" });
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function* streamFileChunks(file: File): AsyncGenerator<{
  chunkIndex: number;
  totalChunks: number;
  buffer: ArrayBuffer;
}> {
  let offset = 0;
  let chunkIndex = 0;
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

  while (offset < file.size) {
    const slice = file.slice(offset, offset + CHUNK_SIZE);
    const buffer = await slice.arrayBuffer();
    yield {
      chunkIndex,
      totalChunks,
      buffer,
    };
    offset += CHUNK_SIZE;
    chunkIndex++;
  }
}
