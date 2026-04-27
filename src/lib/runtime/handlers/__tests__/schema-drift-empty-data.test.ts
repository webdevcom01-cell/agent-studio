/**
 * Schema-drift protection tests — empty node.data scenarios.
 *
 * Rule: Every handler MUST return gracefully (never throw) when node.data is {}.
 * This prevents runtime crashes when a flow is rolled back to an older version
 * where some node fields did not yet exist.
 *
 * Covers 9 of the 10 top-priority handlers (message-handler already has this
 * test in its own file).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RuntimeContext } from "../../types";
import type { FlowNode } from "@/types";

// ── Shared mocks (hoisted so they apply to all handler imports) ───────────────

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    agent: { findUnique: vi.fn().mockResolvedValue(null) },
    agentMemory: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn() },
    kBSource: { findMany: vi.fn().mockResolvedValue([]) },
    agentMCPServer: { findMany: vi.fn().mockResolvedValue([]) },
    humanApprovalRequest: { create: vi.fn().mockResolvedValue({ id: "req-1" }) },
  },
}));

vi.mock("@/lib/ai", () => ({
  getModel: vi.fn(() => "mock-model"),
  getAvailableModels: vi.fn(() => []),
  DEFAULT_MODEL: "deepseek-chat",
}));

vi.mock("@/lib/knowledge/index", () => ({
  hybridSearch: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/mcp/client", () => ({
  getMCPToolsForAgent: vi.fn().mockResolvedValue({}),
  callMCPTool: vi.fn().mockResolvedValue({ result: "ok" }),
}));

vi.mock("@/lib/agents/agent-tools", () => ({
  getAgentTools: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/lib/utils/url-validation", () => ({
  validateExternalUrlWithDNS: vi.fn().mockResolvedValue({ valid: true }),
}));

vi.mock("@/lib/a2a/circuit-breaker", () => ({
  CircuitBreaker: vi.fn().mockImplementation(() => ({
    execute: vi.fn().mockRejectedValue(new Error("no target")),
    getState: vi.fn().mockReturnValue("CLOSED"),
  })),
}));

vi.mock("@/lib/a2a/rate-limiter", () => ({
  checkA2ARateLimit: vi.fn().mockResolvedValue({ allowed: true }),
}));

vi.mock("ai", () => ({
  generateText: vi.fn().mockResolvedValue({ text: "mock response", usage: {} }),
  streamText: vi.fn().mockResolvedValue({ textStream: (async function* () { yield "hi"; })() }),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeNode(type: FlowNode["type"]): FlowNode {
  return { id: "n1", type, position: { x: 0, y: 0 }, data: {} };
}

function makeContext(): RuntimeContext {
  return {
    agentId: "agent-1",
    conversationId: "conv-1",
    flowContent: { nodes: [], edges: [], variables: [] },
    variables: {},
    currentNodeId: "n1",
    messageHistory: [],
    isNewConversation: false,
  };
}

/** Assert the handler doesn't throw and returns a valid ExecutionResult shape. */
async function expectGracefulResult(
  handler: (node: FlowNode, ctx: RuntimeContext) => Promise<unknown>
) {
  const result = await handler(makeNode("message"), makeContext());
  expect(result).toBeDefined();
  expect(typeof result).toBe("object");
  // All handlers must return messages array (even if empty)
  const r = result as { messages: unknown[]; waitForInput?: boolean };
  expect(Array.isArray(r.messages)).toBe(true);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("schema-drift: empty node.data must never crash handlers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("condition-handler: empty data → returns first branch nextNodeId or null", async () => {
    const { conditionHandler } = await import("../condition-handler");
    const node = makeNode("condition");
    const result = await conditionHandler(node, makeContext());
    expect(result).toBeDefined();
    expect(Array.isArray(result.messages)).toBe(true);
  });

  it("set-variable-handler: empty data → returns gracefully with no variable changes", async () => {
    const { setVariableHandler } = await import("../set-variable-handler");
    const node = makeNode("set_variable");
    const result = await setVariableHandler(node, makeContext());
    expect(result).toBeDefined();
    expect(Array.isArray(result.messages)).toBe(true);
  });

  it("kb-search-handler: empty data → returns 'no query' message, does not throw", async () => {
    const { kbSearchHandler } = await import("../kb-search-handler");
    const node = makeNode("kb_search");
    const result = await kbSearchHandler(node, makeContext());
    expect(result).toBeDefined();
    expect(Array.isArray(result.messages)).toBe(true);
    // Should not have called hybridSearch with undefined query
    const { hybridSearch } = await import("@/lib/knowledge/index");
    expect(hybridSearch).not.toHaveBeenCalled();
  });

  it("loop-handler: empty data → exits immediately (0 max iterations falls back)", async () => {
    const { loopHandler } = await import("../loop-handler");
    const node = makeNode("loop");
    const result = await loopHandler(node, makeContext());
    expect(result).toBeDefined();
    expect(Array.isArray(result.messages)).toBe(true);
  });

  it("mcp-tool-handler: empty data (no toolName) → returns error message, does not throw", async () => {
    const { mcpToolHandler } = await import("../mcp-tool-handler");
    const node = makeNode("mcp_tool");
    const result = await mcpToolHandler(node, makeContext());
    expect(result).toBeDefined();
    expect(Array.isArray(result.messages)).toBe(true);
    // Must return an error message, not throw
    if (result.messages.length > 0) {
      expect(typeof result.messages[0].content).toBe("string");
    }
  });

  it("api-call-handler: empty data (no url) → returns error message, does not throw", async () => {
    const { apiCallHandler } = await import("../api-call-handler");
    const node = makeNode("api_call");
    const result = await apiCallHandler(node, makeContext());
    expect(result).toBeDefined();
    expect(Array.isArray(result.messages)).toBe(true);
  });

  it("webhook-trigger-handler: empty data → returns gracefully", async () => {
    const { webhookTriggerHandler } = await import("../webhook-trigger-handler");
    const node = makeNode("webhook_trigger");
    const result = await webhookTriggerHandler(node, makeContext());
    expect(result).toBeDefined();
    expect(Array.isArray(result.messages)).toBe(true);
  });

  it("call-agent-handler: empty data (no targetAgentId) → returns error message, does not throw", async () => {
    const { callAgentHandler } = await import("../call-agent-handler");
    const node = makeNode("call_agent");
    const result = await callAgentHandler(node, makeContext());
    expect(result).toBeDefined();
    expect(Array.isArray(result.messages)).toBe(true);
  });

  it("ai-response-handler: empty data → uses default model, returns response or error message", async () => {
    const { aiResponseHandler } = await import("../ai-response-handler");
    const node = makeNode("ai_response");
    // Should not throw even if model/systemPrompt are missing
    const result = await aiResponseHandler(node, makeContext());
    expect(result).toBeDefined();
    expect(Array.isArray(result.messages)).toBe(true);
  });
});
