/**
 * Unit tests for LspClient (Phase F1)
 * 8 tests covering: JSON-RPC framing, request/response correlation,
 * timeout handling, process lifecycle.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import type { LspServerConfig } from "../types";

// ─── Mock child_process.spawn ───────────────────────────────────────────────

interface MockProcess extends EventEmitter {
  stdin: { write: ReturnType<typeof vi.fn> };
  stdout: EventEmitter & { setEncoding: ReturnType<typeof vi.fn> };
  stderr: EventEmitter & { setEncoding?: ReturnType<typeof vi.fn> };
  kill: ReturnType<typeof vi.fn>;
}

let mockProcess: MockProcess;

vi.mock("node:child_process", () => ({
  spawn: vi.fn(() => {
    const proc = new EventEmitter() as MockProcess;
    proc.stdin = { write: vi.fn() };
    proc.stdout = Object.assign(new EventEmitter(), { setEncoding: vi.fn() });
    proc.stderr = Object.assign(new EventEmitter(), { setEncoding: vi.fn() });
    proc.kill = vi.fn();
    mockProcess = proc;
    return proc;
  }),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { LspClient, INITIALIZE_TIMEOUT_MS, OPERATION_TIMEOUT_MS } from "../lsp-client";

// ─── Helpers ────────────────────────────────────────────────────────────────

const TEST_CONFIG: LspServerConfig = {
  language: "typescript",
  command: "mock-lsp-server",
  args: ["--stdio"],
};

function sendResponse(id: number, result: unknown): void {
  const body = JSON.stringify({ jsonrpc: "2.0", id, result });
  const frame = `Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`;
  mockProcess.stdout.emit("data", frame);
}

function sendErrorResponse(id: number, code: number, message: string): void {
  const body = JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } });
  const frame = `Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`;
  mockProcess.stdout.emit("data", frame);
}

function sendNotification(method: string, params: unknown): void {
  const body = JSON.stringify({ jsonrpc: "2.0", method, params });
  const frame = `Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`;
  mockProcess.stdout.emit("data", frame);
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("LspClient", () => {
  let client: LspClient;

  beforeEach(() => {
    vi.useFakeTimers();
    client = new LspClient(TEST_CONFIG);
  });

  afterEach(async () => {
    vi.useRealTimers();
  });

  it("T1: sends JSON-RPC frames with Content-Length header", () => {
    // Trigger initialize request
    const initPromise = client.initialize("file:///tmp");

    // Verify frame was written to stdin
    expect(mockProcess.stdin.write).toHaveBeenCalled();
    const frame = mockProcess.stdin.write.mock.calls[0][0] as string;
    expect(frame).toContain("Content-Length:");
    expect(frame).toContain('"method":"initialize"');

    // Respond to complete the promise
    sendResponse(1, { capabilities: {} });
    return initPromise;
  });

  it("T2: correlates request IDs with responses", async () => {
    const initPromise = client.initialize("file:///tmp");
    sendResponse(1, { capabilities: {} });
    await initPromise;

    expect(client.initialized).toBe(true);
  });

  it("T3: rejects on JSON-RPC error response", async () => {
    const initPromise = client.initialize("file:///tmp");
    sendErrorResponse(1, -32600, "Invalid Request");

    await expect(initPromise).rejects.toThrow("Invalid Request");
  });

  it("T4: times out if no response received", async () => {
    const initPromise = client.initialize("file:///tmp");

    // Advance past the timeout
    vi.advanceTimersByTime(INITIALIZE_TIMEOUT_MS + 100);

    await expect(initPromise).rejects.toThrow("timed out");
  });

  it("T5: rejects pending requests when process exits", async () => {
    const initPromise = client.initialize("file:///tmp");

    // Simulate process exit
    mockProcess.emit("exit", 1);

    await expect(initPromise).rejects.toThrow("exited");
    expect(client.closed).toBe(true);
  });

  it("T6: hover returns parsed result", async () => {
    // First initialize
    const initPromise = client.initialize("file:///tmp");
    sendResponse(1, { capabilities: {} });
    await initPromise;

    // Then hover
    const hoverPromise = client.hover("file:///test.ts", { line: 0, character: 5 });

    // Respond (request id 2 since initialize was 1)
    sendResponse(2, { contents: { value: "const x: number" } });

    const result = await hoverPromise;
    expect(result).not.toBeNull();
    expect(result?.contents).toBe("const x: number");
  });

  it("T7: diagnostics resolves from publishDiagnostics notification", async () => {
    const initPromise = client.initialize("file:///tmp");
    sendResponse(1, { capabilities: {} });
    await initPromise;

    const uri = "file:///test.ts";
    const diagPromise = client.diagnostics(uri, 5000);

    // Server pushes diagnostics as notification
    sendNotification("textDocument/publishDiagnostics", {
      uri,
      diagnostics: [
        { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } }, severity: 1, message: "Type error" },
      ],
    });

    const result = await diagPromise;
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].message).toBe("Type error");
  });

  it("T8: shutdown kills the process", async () => {
    const initPromise = client.initialize("file:///tmp");
    sendResponse(1, { capabilities: {} });
    await initPromise;

    // Mock the shutdown response
    const shutdownPromise = client.shutdown();
    sendResponse(2, null);
    await shutdownPromise;

    expect(mockProcess.kill).toHaveBeenCalled();
    expect(client.closed).toBe(true);
  });
});
