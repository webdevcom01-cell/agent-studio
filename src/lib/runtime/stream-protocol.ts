import type { StreamChunk, StreamWriter } from "./types";

const encoder = new TextEncoder();

export function encodeChunk(chunk: StreamChunk): string {
  return JSON.stringify(chunk) + "\n";
}

export function parseChunk(line: string): StreamChunk | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as StreamChunk;
  } catch {
    return null;
  }
}

export function createStreamWriter(
  controller: ReadableStreamDefaultController<Uint8Array>
): StreamWriter {
  return {
    write(chunk: StreamChunk): void {
      controller.enqueue(encoder.encode(encodeChunk(chunk)));
    },
    close(): void {
      controller.close();
    },
  };
}
