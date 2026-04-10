import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ──────────────────────────────────────────────────────────

const mockGenerateText = vi.hoisted(() => vi.fn());
const mockGetModel = vi.hoisted(() => vi.fn());
const mockGetMCPToolsForAgent = vi.hoisted(() => vi.fn());
const mockGetAgentToolsForAgent = vi.hoisted(() => vi.fn());
const mockTraceGenAI = vi.hoisted(() =>
  vi.fn(() => ({
    setAttributes: vi.fn(),
    addEvent: vi.fn(),
    end: vi.fn(),
  }))
);
const mockRecordChatLatency = vi.hoisted(() => vi.fn());
const mockRecordTokenUsage = vi.hoisted(() => vi.fn());
const mockStepCountIs = vi.hoisted(() => vi.fn(() => "stopCondition"));

vi.mock("ai", () => ({
  generateText: mockGenerateText,
  stepCountIs: mockStepCountIs,
}));

vi.mock("@/lib/ai", () => ({
  getModel: mockGetModel,
}));

vi.mock("@/lib/mcp/client", () => ({
  getMCPToolsForAgent: mockGetMCPToolsForAgent,
}));

vi.mock("@/lib/agents/agent-tools", () => ({
  getAgentToolsForAgent: mockGetAgentToolsForAgent,
}));

vi.mock("@/lib/observability/tracer", () => ({
  traceGenAI: mockTraceGenAI,
}));

vi.mock("@/lib/observability/metrics", () => ({
  recordChatLatency: mockRecordChatLatency,
  recordTokenUsage: mockRecordTokenUsage,
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock("../template", () => ({
  resolveTemplate: vi.fn((s: string) => s),
}));

// ── Imports (after mocks) ──────────────────────────────────────────────────

import { claudeAgentSdkHandler } from "../claude-agent-sdk-handler";
import type { FlowNode } from "@/types";
import type { RuntimeContext } from "../../types";

// ── Helpers ────────────────────────────────────────────────────────────────

function makeNode(overrides?: Partial<FlowNode["data"]>): FlowNode {
  return {
    id: "node-sdk-1",
    type: "claude_agent_sdk",
    position: { x: 0, y: 0 },
    data: {
      task: "Summarise the latest news",
      model: "claude-sonnet-4-6",
      maxSteps: 10,
      enableMCP: false,
      enableSubAgents: false,
      enableSessionResume: false,
      sessionVarName: "__sdk_session",
      outputVariable: "result",
      nextNodeId: "node-2",
      ...overrides,
    },
  };
}

function makeContext(overrides?: Partial<RuntimeContext>): RuntimeContext {
  return {
    conversationId: "conv-1",
    agentId: "agent-1",
    flowContent: { nodes: [], edges: [], variables: [] },
    currentNodeId: "node-sdk-1",
    variables: {},
    messageHistory: [{ role: "user", content: "Hello" }],
    isNewConversation: false,
    ...overrides,
  };
}

const fakeModel = { modelId: "claude-sonnet-4-6" };

// ── Tests ──────────────────────────────────────────────────────────────────

describe("claudeAgentSdkHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetModel.mockReturnValue(fakeModel);
    mockGetMCPToolsForAgent.mockResolvedValue({});
    mockGetAgentToolsForAgent.mockResolvedValue({});
    mockGenerateText.mockResolvedValue({
      text: "Agent result text",
      finishReason: "stop",
      usage: { inputTokens: 100, outputTokens: 50 },
      steps: [],
    });
  });

  // 1. Happy path ────────────────────────────────────────────────────────────
  it("returns assistant message and stores outputVariable on success", async () => {
    const node = makeNode();
    const ctx = makeContext();

    const result = await claudeAgentSdkHandler(node, ctx);

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].role).toBe("assistant");
    expect(result.messages[0].content).toBe("Agent result text");
    expect(result.nextNodeId).toBe("node-2");
    expect(result.waitForInput).toBe(false);
    expect(result.updatedVariables?.result).toBe("Agent result text");
  });

  it("calls generateText with correct model", async () => {
    const node = makeNode({ model: "claude-opus-4-6" });
    const ctx = makeContext();

    await claudeAgentSdkHandler(node, ctx);

    expect(mockGetModel).toHaveBeenCalledWith("claude-opus-4-6");
    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({ model: fakeModel })
    );
  });

  it("defaults to claude-sonnet-4-6 when model is not set", async () => {
    const node = makeNode({ model: undefined });
    const ctx = makeContext();

    await claudeAgentSdkHandler(node, ctx);

    expect(mockGetModel).toHaveBeenCalledWith("claude-sonnet-4-6");
  });

  it("uses latest user message when task is empty", async () => {
    const node = makeNode({ task: "" });
    const ctx = makeContext({
      messageHistory: [
        { role: "user", content: "Analyze this dataset" },
      ],
    });

    await claudeAgentSdkHandler(node, ctx);

    const callMessages = mockGenerateText.mock.calls[0][0].messages as Array<{
      role: string;
      content: string;
    }>;
    const userMsg = callMessages.find((m) => m.role === "user");
    expect(userMsg?.content).toBe("Analyze this dataset");
  });

  // 2. Empty / missing node data ─────────────────────────────────────────────
  it("returns graceful result when task is empty and no message history", async () => {
    const node = makeNode({ task: "", outputVariable: "" });
    const ctx = makeContext({ messageHistory: [] });

    const result = await claudeAgentSdkHandler(node, ctx);

    expect(result.messages[0].role).toBe("assistant");
    expect(result.waitForInput).toBe(false);
  });

  it("does not add outputVariable to updatedVariables when outputVariable is empty", async () => {
    const node = makeNode({ outputVariable: "" });
    const ctx = makeContext();

    const result = await claudeAgentSdkHandler(node, ctx);

    expect(result.updatedVariables).toBeUndefined();
  });

  // 3. MCP tools ─────────────────────────────────────────────────────────────
  it("loads MCP tools when enableMCP is true", async () => {
    mockGetMCPToolsForAgent.mockResolvedValue({ search: { execute: vi.fn() } });
    const node = makeNode({ enableMCP: true });
    const ctx = makeContext();

    await claudeAgentSdkHandler(node, ctx);

    expect(mockGetMCPToolsForAgent).toHaveBeenCalledWith("agent-1");
    const options = mockGenerateText.mock.calls[0][0];
    expect(options.tools).toBeDefined();
  });

  it("skips MCP tools when enableMCP is false", async () => {
    const node = makeNode({ enableMCP: false });
    const ctx = makeContext();

    await claudeAgentSdkHandler(node, ctx);

    expect(mockGetMCPToolsForAgent).not.toHaveBeenCalled();
    const options = mockGenerateText.mock.calls[0][0];
    expect(options.tools).toBeUndefined();
  });

  it("continues without tools when getMCPToolsForAgent throws", async () => {
    mockGetMCPToolsForAgent.mockRejectedValue(new Error("MCP server offline"));
    const node = makeNode({ enableMCP: true });
    const ctx = makeContext();

    const result = await claudeAgentSdkHandler(node, ctx);

    // Should still complete — graceful degradation
    expect(result.messages[0].content).toBe("Agent result text");
  });

  // 4. Subagent tools ────────────────────────────────────────────────────────
  it("loads subagent tools when enableSubAgents is true", async () => {
    mockGetAgentToolsForAgent.mockResolvedValue({ analyzeData: { execute: vi.fn() } });
    const node = makeNode({ enableSubAgents: true });
    const ctx = makeContext();

    await claudeAgentSdkHandler(node, ctx);

    expect(mockGetAgentToolsForAgent).toHaveBeenCalled();
    const options = mockGenerateText.mock.calls[0][0];
    expect(options.tools).toBeDefined();
  });

  it("skips subagent tools when enableSubAgents is false", async () => {
    const node = makeNode({ enableSubAgents: false });
    const ctx = makeContext();

    await claudeAgentSdkHandler(node, ctx);

    expect(mockGetAgentToolsForAgent).not.toHaveBeenCalled();
  });

  // 5. Session resume ────────────────────────────────────────────────────────
  it("loads session history and prepends to messages when enableSessionResume is true", async () => {
    const storedSession = [
      { role: "user", content: "previous question" },
      { role: "assistant", content: "previous answer" },
    ];
    const node = makeNode({
      enableSessionResume: true,
      sessionVarName: "__sdk_session",
      task: "follow-up task",
    });
    const ctx = makeContext({
      variables: { __sdk_session: storedSession },
    });

    await claudeAgentSdkHandler(node, ctx);

    const callMessages = mockGenerateText.mock.calls[0][0].messages as Array<{
      role: string;
      content: string;
    }>;
    // Previous session messages should appear before the new user message
    expect(callMessages[0].content).toBe("previous question");
    expect(callMessages[1].content).toBe("previous answer");
    expect(callMessages[2].content).toBe("follow-up task");
  });

  it("saves updated session to variable after execution", async () => {
    const node = makeNode({
      enableSessionResume: true,
      sessionVarName: "__sdk_session",
      task: "my task",
      outputVariable: "result",
    });
    const ctx = makeContext({ variables: {} });

    const result = await claudeAgentSdkHandler(node, ctx);

    const session = result.updatedVariables?.__sdk_session as Array<{
      role: string;
      content: string;
    }>;
    expect(Array.isArray(session)).toBe(true);
    expect(session.at(-2)?.role).toBe("user");
    expect(session.at(-1)?.role).toBe("assistant");
    expect(session.at(-1)?.content).toBe("Agent result text");
  });

  it("does not load session when stored value is not a valid array", async () => {
    const node = makeNode({ enableSessionResume: true, sessionVarName: "__sdk_session" });
    const ctx = makeContext({ variables: { __sdk_session: "not-an-array" } });

    // Should not throw
    const result = await claudeAgentSdkHandler(node, ctx);
    expect(result.messages[0].content).toBe("Agent result text");
  });

  // 6. stepCountIs called with maxSteps when tools present ──────────────────
  it("calls stepCountIs with configured maxSteps when tools exist", async () => {
    mockGetMCPToolsForAgent.mockResolvedValue({ search: { execute: vi.fn() } });
    const node = makeNode({ enableMCP: true, maxSteps: 15 });
    const ctx = makeContext();

    await claudeAgentSdkHandler(node, ctx);

    expect(mockStepCountIs).toHaveBeenCalledWith(15);
  });

  // 7. Error handling ────────────────────────────────────────────────────────
  it("returns error message without throwing when generateText throws", async () => {
    mockGenerateText.mockRejectedValue(new Error("API rate limit"));
    const node = makeNode();
    const ctx = makeContext();

    const result = await claudeAgentSdkHandler(node, ctx);

    expect(result.messages[0].content).toContain(
      "An error occurred in the Claude Agent SDK node."
    );
    expect(result.nextNodeId).toBeNull();
    expect(result.waitForInput).toBe(false);
  });

  it("returns error message without throwing when getModel throws", async () => {
    mockGetModel.mockImplementation(() => {
      throw new Error("Unknown model");
    });
    const node = makeNode();
    const ctx = makeContext();

    const result = await claudeAgentSdkHandler(node, ctx);

    expect(result.messages[0].content).toContain("An error occurred");
    expect(result.nextNodeId).toBeNull();
  });

  // 8. Observability ─────────────────────────────────────────────────────────
  it("records metrics after successful generation", async () => {
    const node = makeNode();
    const ctx = makeContext();

    await claudeAgentSdkHandler(node, ctx);

    expect(mockRecordChatLatency).toHaveBeenCalledWith("agent-1", "claude-sonnet-4-6", expect.any(Number));
    expect(mockRecordTokenUsage).toHaveBeenCalledWith("agent-1", "claude-sonnet-4-6", 100, 50);
  });
});
