/**
 * F2-1: Faithful execution status propagation.
 *
 * BUG: ai-response-handler (and call-agent-handler) swallow node errors and
 * return them as normal assistant messages ("AI call failed: …"). The engine
 * then writes execution.status = SUCCESS, error = null (engine.ts final
 * agentExecution.update). A run whose AI node died ("Request too large for
 * gpt-4.1") therefore looks green.
 *
 * KEY TEST: a flow whose AI node returns a failure sentinel must persist
 * status = FAILED with a populated error. Must FAIL on the buggy code.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeFlow } from "../engine";
import type { RuntimeContext, ExecutionResult } from "../types";
import type { FlowNode, FlowEdge } from "@/types";

// ─── Mocks ────────────────────────────────────────────────────────────────

const mockExecutionCreate = vi.hoisted(() => vi.fn());
const mockExecutionUpdate = vi.hoisted(() => vi.fn());
const mockMessageCreate = vi.hoisted(() => vi.fn());
const mockTx = vi.hoisted(() => ({}) as Record<string, unknown>);

vi.mock("@/lib/api/tenant-context", () => ({
  withTenant: vi.fn(async (fn: (tx: unknown) => unknown) => fn(mockTx)),
  withAdminBypass: vi.fn(async (fn: (tx: unknown) => unknown) => fn(mockTx)),
}));
vi.mock("../handlers", () => ({ getHandler: vi.fn() }));
vi.mock("../context", () => ({ saveContext: vi.fn(), saveMessages: vi.fn() }));
vi.mock("../execution-prelude", () => ({ prepareContextForExecution: vi.fn() }));
vi.mock("../hooks", () => ({ emitHook: vi.fn() }));
vi.mock("../session-events", () => ({ emitSessionEvent: vi.fn() }));
vi.mock("../context-compaction", () => ({
  maybeCompactAndTruncate: vi.fn(),
  MAX_HISTORY: 1000,
}));
vi.mock("@/lib/safety/audit-logger", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/safety/pii-detector", () => ({
  detectPII: vi.fn().mockReturnValue([]),
  redactPII: vi.fn((s: string) => s),
}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { getHandler } from "../handlers";
const mockedGetHandler = vi.mocked(getHandler);

// ─── Helpers ──────────────────────────────────────────────────────────────

function makeNode(id: string, type: string): FlowNode {
  return { id, type: type as FlowNode["type"], position: { x: 0, y: 0 }, data: {} };
}

function makeContext(nodes: FlowNode[], edges: FlowEdge[]): RuntimeContext {
  return {
    agentId: "agent-f21",
    conversationId: "conv-f21",
    orgId: "org-f21",
    flowContent: { nodes, edges, variables: [] },
    variables: {},
    currentNodeId: null,
    messageHistory: [],
    isNewConversation: true,
  } as RuntimeContext;
}

function setupHandlers(
  map: Record<string, (node: FlowNode, ctx: RuntimeContext) => Promise<ExecutionResult>>,
) {
  mockedGetHandler.mockReturnValue(async (node: FlowNode, ctx: RuntimeContext) => {
    const h = map[node.id];
    if (h) return h(node, ctx);
    return {
      messages: [{ role: "assistant" as const, content: `Executed ${node.id}` }],
      nextNodeId: null,
      waitForInput: false,
    };
  });
}

// Exactly what ai-response-handler's catch path returns today (engine sees
// a NORMAL result — the thrown provider error was converted to a message).
const SENTINEL = "AI call failed: Request too large for gpt-4.1 (max 30k tokens)";

function lastExecutionUpdateData(): Record<string, unknown> {
  expect(mockExecutionUpdate).toHaveBeenCalled();
  const call = mockExecutionUpdate.mock.calls.at(-1)![0] as { data: Record<string, unknown> };
  return call.data;
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe("F2-1: execution status propagation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTx.agentExecution = { create: mockExecutionCreate, update: mockExecutionUpdate };
    mockTx.message = { create: mockMessageCreate };
    mockExecutionCreate.mockResolvedValue({ id: "exec-f21" });
    mockExecutionUpdate.mockResolvedValue({ id: "exec-f21" });
    mockMessageCreate.mockResolvedValue({ id: "msg-1" });
  });

  it("KEY: AI node failure sentinel → status FAILED + populated error", async () => {
    const nodes = [makeNode("ai1", "ai_response")];
    setupHandlers({
      ai1: async () => ({
        messages: [{ role: "assistant" as const, content: SENTINEL }],
        nextNodeId: null,
        waitForInput: false,
        updatedVariables: { ai_out: `[AI_ERROR] ${SENTINEL}` },
      }),
    });

    await executeFlow(makeContext(nodes, []), "hi");

    const data = lastExecutionUpdateData();
    expect(data.status).toBe("FAILED");
    expect(data.error).toBeTruthy();
    expect(String(data.error)).toContain("AI call failed");
  });

  it("sub-agent failure sentinel → status FAILED + populated error", async () => {
    const nodes = [makeNode("call1", "call_agent")];
    setupHandlers({
      call1: async () => ({
        messages: [
          { role: "assistant" as const, content: "Sub-agent call failed after all retries." },
        ],
        nextNodeId: null,
        waitForInput: false,
      }),
    });

    await executeFlow(makeContext(nodes, []), "hi");

    const data = lastExecutionUpdateData();
    expect(data.status).toBe("FAILED");
    expect(data.error).toBeTruthy();
  });

  it("success path untouched: normal AI output → status SUCCESS, no error", async () => {
    const nodes = [makeNode("ai1", "ai_response")];
    setupHandlers({
      ai1: async () => ({
        messages: [{ role: "assistant" as const, content: "Here is your answer." }],
        nextNodeId: null,
        waitForInput: false,
      }),
    });

    await executeFlow(makeContext(nodes, []), "hi");

    const data = lastExecutionUpdateData();
    expect(data.status).toBe("SUCCESS");
    expect(data.error).toBeUndefined();
  });

  it("genuine content mentioning failures mid-text is NOT flagged", async () => {
    const nodes = [makeNode("ai1", "ai_response")];
    setupHandlers({
      ai1: async () => ({
        messages: [
          {
            role: "assistant" as const,
            content: "Debugging tip: when an AI call failed in your app, check the API key.",
          },
        ],
        nextNodeId: null,
        waitForInput: false,
      }),
    });

    await executeFlow(makeContext(nodes, []), "hi");

    const data = lastExecutionUpdateData();
    expect(data.status).toBe("SUCCESS");
  });
});
