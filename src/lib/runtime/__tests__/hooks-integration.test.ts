/**
 * A1.9 — Integration test: flow with hooks → webhook receives events
 *
 * Runs a real HTTP server on a random port, executes a flow configured
 * with hookWebhookUrls pointing to that server, and asserts that the
 * expected hook events are received with correct payloads.
 *
 * No mocking of fetch — this exercises the full pipeline:
 *   engine.ts → emitHook → FlowHookRegistry → WebhookHookSink → HTTP POST → server
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import * as http from "node:http";
import * as net from "node:net";
import type { RuntimeContext } from "../types";
import type { FlowContent } from "@/types";

// ── Minimal mocks for heavy server-side deps ────────────────────────────

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    message: { create: vi.fn().mockResolvedValue({}) },
  },
}));

vi.mock("@/lib/safety/audit-logger", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/runtime/context", () => ({
  saveContext: vi.fn().mockResolvedValue(undefined),
  saveMessages: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/runtime/context-compaction", () => ({
  shouldCompact: vi.fn().mockReturnValue(false),
  compactContext: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/memory/hot-cold-tier", () => ({
  injectHotMemoryIntoContext: vi.fn().mockResolvedValue(undefined),
}));

// ── Lazy import after mocks ─────────────────────────────────────────────

import { vi } from "vitest";

// ── HTTP server helpers ─────────────────────────────────────────────────

/** Allocate a random free TCP port */
async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address() as net.AddressInfo;
      srv.close(() => resolve(addr.port));
    });
    srv.on("error", reject);
  });
}

interface ReceivedHook {
  event: string;
  agentId: string;
  conversationId: string;
  timestamp: number;
  meta?: Record<string, unknown>;
}

/** Minimal HTTP server that collects hook POSTs */
function createHookServer(port: number) {
  const received: ReceivedHook[] = [];
  let resolve: (() => void) | null = null;
  let expectedCount = 0;

  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      try {
        const payload = JSON.parse(body) as ReceivedHook;
        received.push(payload);
        if (resolve && received.length >= expectedCount) {
          resolve();
          resolve = null;
        }
      } catch { /* ignore parse errors */ }
      res.writeHead(200);
      res.end("ok");
    });
  });

  server.listen(port, "127.0.0.1");

  return {
    server,
    received,
    /** Wait until at least N hooks are received (with timeout) */
    waitFor(n: number, timeoutMs = 2000): Promise<void> {
      if (received.length >= n) return Promise.resolve();
      expectedCount = n;
      return new Promise<void>((res, rej) => {
        resolve = res;
        setTimeout(() => rej(new Error(`Timeout: only ${received.length}/${n} hooks received`)), timeoutMs);
      });
    },
    close(): Promise<void> {
      return new Promise((res) => server.close(() => res()));
    },
  };
}

// ── Minimal flow: message → end ─────────────────────────────────────────

function makeFlow(hookUrl: string, hookEvents?: string[]): FlowContent {
  return {
    nodes: [
      {
        id: "n1",
        type: "message",
        position: { x: 0, y: 0 },
        data: { message: "Hello from integration test", label: "Start" },
      },
      {
        id: "n2",
        type: "end",
        position: { x: 200, y: 0 },
        data: { label: "End" },
      },
    ],
    edges: [{ id: "e1", source: "n1", target: "n2" }],
    variables: [],
    hookWebhookUrls: [hookUrl],
    hookEvents: hookEvents as FlowContent["hookEvents"],
  };
}

function makeContext(flowContent: FlowContent): RuntimeContext {
  return {
    agentId: "test-agent-1",
    conversationId: "test-conv-1",
    flowContent,
    currentNodeId: null,
    variables: {},
    messageHistory: [],
    isNewConversation: true,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────

describe("A1.9 — Hooks integration: flow → webhook", () => {
  let port: number;
  let hookServer: ReturnType<typeof createHookServer>;

  beforeAll(async () => {
    port = await getFreePort();
    hookServer = createHookServer(port);
    // Give server a moment to start listening
    await new Promise((r) => setTimeout(r, 50));
  });

  afterAll(async () => {
    await hookServer.close();
  });

  beforeEach(() => {
    hookServer.received.length = 0; // reset between tests
  });

  it("delivers onFlowStart and onFlowComplete to webhook", async () => {
    const { executeFlow } = await import("../engine");

    const hookUrl = `http://127.0.0.1:${port}/hook`;
    const ctx = makeContext(makeFlow(hookUrl));

    await executeFlow(ctx);

    // 2-node flow (message + end) emits:
    //   onFlowStart, beforeNodeExecute×2, afterNodeExecute×2, onFlowComplete = 6 total
    // Wait for ALL to avoid bleed-over into subsequent tests.
    await hookServer.waitFor(6, 3000);

    const events = hookServer.received.map((h) => h.event);
    expect(events).toContain("onFlowStart");
    expect(events).toContain("onFlowComplete");
  });

  it("hook payloads contain agentId and conversationId", async () => {
    const { executeFlow } = await import("../engine");

    const hookUrl = `http://127.0.0.1:${port}/hook`;
    const ctx = makeContext(makeFlow(hookUrl));

    await executeFlow(ctx);
    // Wait for all 6 events before assertions to avoid partial-receive
    await hookServer.waitFor(6, 3000);

    for (const hook of hookServer.received) {
      expect(hook.agentId).toBe("test-agent-1");
      expect(hook.conversationId).toBe("test-conv-1");
      expect(typeof hook.timestamp).toBe("number");
    }
  });

  it("event filtering: only onFlowStart received when hookEvents = [onFlowStart]", async () => {
    const { executeFlow } = await import("../engine");

    const hookUrl = `http://127.0.0.1:${port}/hook`;
    const ctx = makeContext(makeFlow(hookUrl, ["onFlowStart"]));

    await executeFlow(ctx);
    // Wait just for the one event we expect
    await hookServer.waitFor(1, 2000);

    // Give a brief window for any extra events to arrive
    await new Promise((r) => setTimeout(r, 200));

    const events = hookServer.received.map((h) => h.event);
    expect(events).toContain("onFlowStart");
    // onFlowComplete should be filtered out
    expect(events).not.toContain("onFlowComplete");
  });

  it("X-Hook-Event header is set to the event name", async () => {
    // Verify header by inspecting WebhookHookSink directly (unit-level complement)
    const { WebhookHookSink } = await import("../hooks");

    const calls: Array<[string, RequestInit]> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      calls.push([url, init]);
      return new Response("ok", { status: 200 });
    }) as typeof fetch;

    const sink = new WebhookHookSink(["https://example.com/hook"]);
    sink.send({
      event: "onFlowStart",
      agentId: "a1",
      conversationId: "c1",
      timestamp: Date.now(),
    });

    // Allow fire-and-forget to settle
    await new Promise((r) => setTimeout(r, 50));

    globalThis.fetch = originalFetch;

    expect(calls).toHaveLength(1);
    const [, init] = calls[0];
    expect((init.headers as Record<string, string>)["X-Hook-Event"]).toBe("onFlowStart");
  });

  it("webhook delivery failure does not crash the flow", async () => {
    const { executeFlow } = await import("../engine");

    // Point to a port that is definitely not listening
    const badPort = await getFreePort(); // allocate then immediately close
    const ctx = makeContext(makeFlow(`http://127.0.0.1:${badPort}/hook`));

    // Should complete without throwing even though webhook delivery fails
    await expect(executeFlow(ctx)).resolves.not.toThrow();
  });
});
