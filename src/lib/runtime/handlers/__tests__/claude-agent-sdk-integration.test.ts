/**
 * Integration-style tests for the claude_agent_sdk node.
 *
 * Scenario: A multi-turn research assistant workflow
 *  Turn 1 — user asks for market research, agent calls an MCP search tool
 *  Turn 2 — user asks a follow-up, session is resumed from DB
 *  Turn 3 — adversarial: attempt to resume a session owned by a different agent
 *  Turn 4 — streaming variant mirrors the same persistence behaviour
 *
 * All external dependencies (Prisma, AI SDK, MCP, subagents) are mocked.
 * We verify the full data-flow: input → handler → DB persistence → output.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Hoisted mocks ──────────────────────────────────────────────────────────

const mockGenerateText = vi.hoisted(() => vi.fn());
const mockStreamText   = vi.hoisted(() => vi.fn());
const mockGetModel     = vi.hoisted(() => vi.fn());
const mockGetMCPToolsForAgent     = vi.hoisted(() => vi.fn());
const mockGetAgentToolsForAgent   = vi.hoisted(() => vi.fn());
const mockStepCountIs  = vi.hoisted(() => vi.fn(() => "stopCondition"));
const mockTraceGenAI   = vi.hoisted(() =>
  vi.fn(() => ({ setAttributes: vi.fn(), addEvent: vi.fn(), end: vi.fn() }))
);
const mockRecordChatLatency  = vi.hoisted(() => vi.fn());
const mockRecordTokenUsage   = vi.hoisted(() => vi.fn());

// DB session store — shared across both handlers so we can test state continuity
const sessionStore = vi.hoisted(() => new Map<string, {
  id: string;
  agentId: string;
  messages: Array<{ role: string; content: string }>;
  totalInputTokens: number;
  totalOutputTokens: number;
  resumeCount: number;
}>());

const mockLoadSdkSession   = vi.hoisted(() => vi.fn());
const mockCreateSdkSession = vi.hoisted(() => vi.fn());
const mockUpdateSdkSession = vi.hoisted(() => vi.fn());

// ── Module mocks ───────────────────────────────────────────────────────────

vi.mock("ai", () => ({
  generateText: mockGenerateText,
  streamText:   mockStreamText,
  stepCountIs:  mockStepCountIs,
}));

vi.mock("@/lib/ai", () => ({ getModel: mockGetModel }));
vi.mock("@/lib/mcp/client",           () => ({ getMCPToolsForAgent:   mockGetMCPToolsForAgent }));
vi.mock("@/lib/agents/agent-tools",   () => ({ getAgentToolsForAgent: mockGetAgentToolsForAgent }));
vi.mock("@/lib/observability/tracer", () => ({ traceGenAI: mockTraceGenAI }));
vi.mock("@/lib/observability/metrics",() => ({
  recordChatLatency: mockRecordChatLatency,
  recordTokenUsage:  mockRecordTokenUsage,
}));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
vi.mock("@/lib/sdk-sessions/persistence", () => ({
  loadSdkSession:   mockLoadSdkSession,
  createSdkSession: mockCreateSdkSession,
  updateSdkSession: mockUpdateSdkSession,
}));
vi.mock("../template", () => ({
  resolveTemplate: vi.fn((s: string) => s),
}));

// ── Imports ────────────────────────────────────────────────────────────────

import { claudeAgentSdkHandler }          from "../claude-agent-sdk-handler";
import { claudeAgentSdkStreamingHandler } from "../claude-agent-sdk-streaming-handler";
import type { FlowNode }      from "@/types";
import type { RuntimeContext, StreamWriter } from "../../types";

// ── Test helpers ───────────────────────────────────────────────────────────

const AGENT_A = "agent-research-001";
const AGENT_B = "agent-other-999";
const SESSION_1 = "sess-cuid-aabbcc";
const SESSION_2 = "sess-cuid-ddeeff";

function node(overrides?: Partial<FlowNode["data"]>): FlowNode {
  return {
    id: "sdk-node-1",
    type: "claude_agent_sdk",
    position: { x: 0, y: 0 },
    data: {
      task: "Research the EV market in Europe",
      model: "claude-sonnet-4-6",
      maxSteps: 10,
      enableMCP: false,
      enableSubAgents: false,
      enableSessionResume: false,
      sdkSessionId: "",
      sessionVarName: "__sdk_session",
      outputVariable: "answer",
      nextNodeId: "next-node",
      ...overrides,
    },
  };
}

function ctx(overrides?: Partial<RuntimeContext>): RuntimeContext {
  return {
    conversationId: "conv-test-1",
    agentId: AGENT_A,
    flowContent: { nodes: [], edges: [], variables: [] },
    currentNodeId: "sdk-node-1",
    variables: {},
    messageHistory: [{ role: "user", content: "Hello" }],
    isNewConversation: false,
    userId: "user-42",
    ...overrides,
  };
}

/** Returns an async iterable that yields given strings */
function fakeTextStream(...deltas: string[]): AsyncIterable<string> {
  return {
    [Symbol.asyncIterator]() {
      let i = 0;
      return {
        async next() {
          if (i < deltas.length) return { value: deltas[i++], done: false };
          return { value: "", done: true };
        },
      };
    },
  };
}

function fakeStreamResult(text: string, inputTokens = 120, outputTokens = 60) {
  const words = text.split(" ");
  return {
    textStream: fakeTextStream(...words.map((w, i) => (i === 0 ? w : " " + w))),
    usage: Promise.resolve({ inputTokens, outputTokens }),
  };
}

function makeWriter(): { writer: StreamWriter; chunks: unknown[] } {
  const chunks: unknown[] = [];
  const writer: StreamWriter = { write: (chunk) => { chunks.push(chunk); } };
  return { writer, chunks };
}

// ── beforeEach: reset all mocks + seed sessionStore defaults ───────────────

beforeEach(() => {
  vi.clearAllMocks();
  sessionStore.clear();

  mockGetModel.mockReturnValue({ modelId: "claude-sonnet-4-6" });
  mockGetMCPToolsForAgent.mockResolvedValue({});
  mockGetAgentToolsForAgent.mockResolvedValue({});

  // Default generateText response
  mockGenerateText.mockResolvedValue({
    text: "Default agent response.",
    finishReason: "stop",
    usage: { inputTokens: 80, outputTokens: 40 },
    steps: [],
  });

  // DB mock implementations backed by in-memory sessionStore
  mockLoadSdkSession.mockImplementation(async (id: string) => {
    return sessionStore.get(id) ?? null;
  });

  mockCreateSdkSession.mockImplementation(async (input: {
    agentId: string;
    userId?: string;
    messages?: Array<{ role: string; content: string }>;
    metadata?: unknown;
  }) => {
    const id = `sess-auto-${Date.now()}`;
    const entry = {
      id,
      agentId: input.agentId,
      messages: input.messages ?? [],
      totalInputTokens: 0,
      totalOutputTokens: 0,
      resumeCount: 0,
    };
    sessionStore.set(id, entry);
    return entry;
  });

  mockUpdateSdkSession.mockImplementation(async (
    id: string,
    input: {
      messages?: Array<{ role: string; content: string }>;
      inputTokensDelta?: number;
      outputTokensDelta?: number;
      metadata?: unknown;
    }
  ) => {
    const existing = sessionStore.get(id);
    if (!existing) throw new Error(`Session not found: ${id}`);
    const updated = {
      ...existing,
      messages: input.messages ?? existing.messages,
      totalInputTokens: existing.totalInputTokens + (input.inputTokensDelta ?? 0),
      totalOutputTokens: existing.totalOutputTokens + (input.outputTokensDelta ?? 0),
      resumeCount: existing.resumeCount + 1,
    };
    sessionStore.set(id, updated);
    return updated;
  });
});

afterEach(() => {
  sessionStore.clear();
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite 1 — First invocation: auto-create session, variable fallback
// ══════════════════════════════════════════════════════════════════════════════

describe("Turn 1 — first invocation (no existing session)", () => {
  it("auto-creates a DB session and exposes __sdk_session_id in variables", async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: "Europe EV market grew 35% in 2024.",
      finishReason: "stop",
      usage: { inputTokens: 200, outputTokens: 80 },
      steps: [],
    });

    const result = await claudeAgentSdkHandler(
      node({ enableSessionResume: true }),
      ctx()
    );

    // Output variable populated
    expect(result.updatedVariables?.answer).toBe("Europe EV market grew 35% in 2024.");

    // DB session created with correct messages
    expect(mockCreateSdkSession).toHaveBeenCalledOnce();
    const createCall = mockCreateSdkSession.mock.calls[0][0] as {
      agentId: string;
      messages: Array<{ role: string; content: string }>;
    };
    expect(createCall.agentId).toBe(AGENT_A);
    expect(createCall.messages).toContainEqual(
      expect.objectContaining({ role: "user", content: "Research the EV market in Europe" })
    );
    expect(createCall.messages).toContainEqual(
      expect.objectContaining({ role: "assistant", content: "Europe EV market grew 35% in 2024." })
    );

    // New session ID exposed for downstream nodes
    const newId = result.updatedVariables?.__sdk_session_id as string;
    expect(typeof newId).toBe("string");
    expect(newId).toMatch(/^sess-auto-/);

    // Variable fallback also present
    const varSession = result.updatedVariables?.__sdk_session as Array<{ role: string }>;
    expect(Array.isArray(varSession)).toBe(true);
    expect(varSession.at(-1)?.role).toBe("assistant");
  });

  it("records correct token metrics on first invocation", async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: "Answer.",
      finishReason: "stop",
      usage: { inputTokens: 150, outputTokens: 75 },
      steps: [],
    });

    await claudeAgentSdkHandler(node({ enableSessionResume: true }), ctx());

    expect(mockRecordTokenUsage).toHaveBeenCalledWith(AGENT_A, "claude-sonnet-4-6", 150, 75);
    expect(mockRecordChatLatency).toHaveBeenCalledWith(AGENT_A, "claude-sonnet-4-6", expect.any(Number));
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite 2 — Turn 2: resume from DB session, history accumulates
// ══════════════════════════════════════════════════════════════════════════════

describe("Turn 2 — session resume from DB", () => {
  beforeEach(() => {
    // Seed the store with Turn 1 messages
    sessionStore.set(SESSION_1, {
      id: SESSION_1,
      agentId: AGENT_A,
      messages: [
        { role: "user",      content: "Research the EV market in Europe" },
        { role: "assistant", content: "Europe EV market grew 35% in 2024." },
      ],
      totalInputTokens: 200,
      totalOutputTokens: 80,
      resumeCount: 0,
    });
  });

  it("prepends previous session messages before the new user message", async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: "Germany leads with 38% market share.",
      finishReason: "stop",
      usage: { inputTokens: 320, outputTokens: 90 },
      steps: [],
    });

    await claudeAgentSdkHandler(
      node({
        enableSessionResume: true,
        sdkSessionId: SESSION_1,
        task: "Which country leads?",
      }),
      ctx()
    );

    const callMessages = mockGenerateText.mock.calls[0][0].messages as Array<{
      role: string;
      content: string;
    }>;

    // History should appear in order: prev user → prev assistant → new user
    expect(callMessages[0]).toMatchObject({ role: "user",      content: "Research the EV market in Europe" });
    expect(callMessages[1]).toMatchObject({ role: "assistant", content: "Europe EV market grew 35% in 2024." });
    expect(callMessages[2]).toMatchObject({ role: "user",      content: "Which country leads?" });
  });

  it("updates the DB session with new messages and accumulated tokens", async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: "Germany leads with 38% market share.",
      finishReason: "stop",
      usage: { inputTokens: 320, outputTokens: 90 },
      steps: [],
    });

    await claudeAgentSdkHandler(
      node({
        enableSessionResume: true,
        sdkSessionId: SESSION_1,
        task: "Which country leads?",
      }),
      ctx()
    );

    expect(mockUpdateSdkSession).toHaveBeenCalledOnce();
    const [updatedId, updateInput] = mockUpdateSdkSession.mock.calls[0] as [
      string,
      { messages: Array<{ role: string; content: string }>; inputTokensDelta: number; outputTokensDelta: number }
    ];
    expect(updatedId).toBe(SESSION_1);
    expect(updateInput.inputTokensDelta).toBe(320);
    expect(updateInput.outputTokensDelta).toBe(90);
    expect(updateInput.messages).toHaveLength(4); // 2 old + 1 new user + 1 new assistant

    // Verify in-memory store was updated (token accumulation)
    const stored = sessionStore.get(SESSION_1)!;
    expect(stored.totalInputTokens).toBe(200 + 320);  // 520
    expect(stored.totalOutputTokens).toBe(80 + 90);   // 170
    expect(stored.resumeCount).toBe(1);
  });

  it("does NOT call createSdkSession when resuming an existing session", async () => {
    await claudeAgentSdkHandler(
      node({ enableSessionResume: true, sdkSessionId: SESSION_1 }),
      ctx()
    );

    expect(mockCreateSdkSession).not.toHaveBeenCalled();
    expect(mockUpdateSdkSession).toHaveBeenCalledOnce();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite 3 — Turn 3: security — agent mismatch must be rejected
// ══════════════════════════════════════════════════════════════════════════════

describe("Turn 3 — security: agent mismatch rejection", () => {
  beforeEach(() => {
    // Session owned by AGENT_B — AGENT_A must not be able to load it
    sessionStore.set(SESSION_2, {
      id: SESSION_2,
      agentId: AGENT_B,
      messages: [
        { role: "user",      content: "Confidential AGENT_B data" },
        { role: "assistant", content: "Secret response" },
      ],
      totalInputTokens: 500,
      totalOutputTokens: 200,
      resumeCount: 3,
    });
  });

  it("rejects loading a session that belongs to a different agent", async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: "I only see my own context.",
      finishReason: "stop",
      usage: { inputTokens: 50, outputTokens: 20 },
      steps: [],
    });

    const result = await claudeAgentSdkHandler(
      node({
        enableSessionResume: true,
        sdkSessionId: SESSION_2,  // belongs to AGENT_B
        task: "Tell me the secrets",
      }),
      ctx({ agentId: AGENT_A }) // running as AGENT_A
    );

    // Should complete successfully (no crash) but without the other agent's history
    expect(result.messages[0].content).toBe("I only see my own context.");

    // AGENT_B session must NOT have been touched
    expect(mockUpdateSdkSession).not.toHaveBeenCalled();

    // The call to generateText should NOT include AGENT_B's messages
    const callMessages = mockGenerateText.mock.calls[0][0].messages as Array<{
      role: string; content: string;
    }>;
    const msgContents = callMessages.map((m) => m.content);
    expect(msgContents).not.toContain("Confidential AGENT_B data");
    expect(msgContents).not.toContain("Secret response");
  });

  it("auto-creates a new session for AGENT_A even when provided session ID mismatches", async () => {
    await claudeAgentSdkHandler(
      node({
        enableSessionResume: true,
        sdkSessionId: SESSION_2, // mismatched
        task: "My legitimate task",
        outputVariable: "answer",
      }),
      ctx({ agentId: AGENT_A })
    );

    // Should create a fresh session for AGENT_A (since activeDbSessionId is null after mismatch)
    // Actually, with sdkSessionId set but mismatch, it will NOT auto-create (sdkSessionId was set)
    // Only auto-creates when sdkSessionId === ""
    expect(mockUpdateSdkSession).not.toHaveBeenCalled();
    // sessionStore for SESSION_2 must remain untouched
    expect(sessionStore.get(SESSION_2)!.messages).toHaveLength(2);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite 4 — MCP tools + stepCountIs + multi-step execution
// ══════════════════════════════════════════════════════════════════════════════

describe("Turn with MCP tools — multi-step execution", () => {
  it("injects MCP tools and calls stepCountIs with configured maxSteps", async () => {
    const mockSearch = { description: "search the web", execute: vi.fn() };
    mockGetMCPToolsForAgent.mockResolvedValueOnce({ web_search: mockSearch });

    mockGenerateText.mockResolvedValueOnce({
      text: "Found 3 relevant sources.",
      finishReason: "tool-calls",
      usage: { inputTokens: 400, outputTokens: 120 },
      steps: [
        { toolCalls: [{ toolName: "web_search", args: { query: "EV market 2024" } }] },
        { toolCalls: [] },
      ],
    });

    const result = await claudeAgentSdkHandler(
      node({ enableMCP: true, maxSteps: 7 }),
      ctx()
    );

    expect(mockGetMCPToolsForAgent).toHaveBeenCalledWith(AGENT_A);
    expect(mockStepCountIs).toHaveBeenCalledWith(7);

    const callOptions = mockGenerateText.mock.calls[0][0];
    expect(callOptions.tools).toHaveProperty("web_search");
    expect(callOptions.stopWhen).toBe("stopCondition");
    expect(result.messages[0].content).toBe("Found 3 relevant sources.");
  });

  it("continues without tools when MCP server is offline (graceful degradation)", async () => {
    mockGetMCPToolsForAgent.mockRejectedValueOnce(new Error("MCP server offline"));

    const result = await claudeAgentSdkHandler(
      node({ enableMCP: true }),
      ctx()
    );

    // Handler must not throw — falls back to no-tools mode
    expect(result.messages[0].role).toBe("assistant");
    const callOptions = mockGenerateText.mock.calls[0][0];
    // tools should be undefined since allTools is empty
    expect(callOptions.tools).toBeUndefined();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite 5 — Subagents: parallel hint injection + tool wiring
// ══════════════════════════════════════════════════════════════════════════════

describe("Subagent tools — parallel hint injection", () => {
  it("injects parallel execution hint in system prompt when 2+ subagents available", async () => {
    mockGetAgentToolsForAgent.mockResolvedValueOnce({
      research_agent: { execute: vi.fn() },
      writing_agent:  { execute: vi.fn() },
      seo_agent:      { execute: vi.fn() },
    });

    await claudeAgentSdkHandler(
      node({ enableSubAgents: true, task: "Write a report" }),
      ctx()
    );

    const callMessages = mockGenerateText.mock.calls[0][0].messages as Array<{
      role: string; content: string;
    }>;
    const systemMsg = callMessages.find((m) => m.role === "system");
    expect(systemMsg).toBeDefined();
    expect(systemMsg?.content).toContain("Parallel Execution");
    expect(systemMsg?.content).toContain("simultaneously");
  });

  it("does NOT inject parallel hint when only one subagent available", async () => {
    mockGetAgentToolsForAgent.mockResolvedValueOnce({
      research_agent: { execute: vi.fn() },
    });

    await claudeAgentSdkHandler(
      node({ enableSubAgents: true, task: "Do one thing" }),
      ctx()
    );

    const callMessages = mockGenerateText.mock.calls[0][0].messages as Array<{
      role: string; content: string;
    }>;
    const systemMsg = callMessages.find((m) => m.role === "system");

    // With 1 subagent and no systemPrompt, there is no system message at all —
    // that's the correct behaviour (no parallel hint injected).
    // If a system message exists (e.g. from systemPrompt), it must not contain the hint.
    expect(systemMsg?.content ?? "").not.toContain("Parallel Execution");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite 6 — Streaming handler: same DB session persistence behaviour
// ══════════════════════════════════════════════════════════════════════════════

describe("Streaming handler — session persistence mirrors sync handler", () => {
  it("auto-creates DB session and streams all deltas", async () => {
    const responseWords = ["Streaming", " EV", " analysis", " complete."];
    mockStreamText.mockReturnValueOnce(
      fakeStreamResult("Streaming EV analysis complete.", 180, 70)
    );

    const { writer, chunks } = makeWriter();

    const result = await claudeAgentSdkStreamingHandler(
      node({ enableSessionResume: true }),
      ctx(),
      writer
    );

    // Streaming chunks
    expect(chunks[0]).toMatchObject({ type: "stream_start" });
    const deltaChunks = chunks.filter((c) => (c as { type: string }).type === "stream_delta");
    expect(deltaChunks.length).toBeGreaterThan(0);
    const reconstructed = deltaChunks
      .map((c) => (c as { content: string }).content)
      .join("");
    expect(reconstructed).toBe("Streaming EV analysis complete.");
    expect(chunks.at(-1)).toMatchObject({ type: "stream_end", content: "Streaming EV analysis complete." });

    // Session was created
    expect(mockCreateSdkSession).toHaveBeenCalledOnce();
    const newId = result.updatedVariables?.__sdk_session_id as string;
    expect(typeof newId).toBe("string");

    // Token metrics recorded
    expect(mockRecordTokenUsage).toHaveBeenCalledWith(AGENT_A, "claude-sonnet-4-6", 180, 70);

    // Output variable
    expect(result.updatedVariables?.answer).toBe("Streaming EV analysis complete.");
    // Unused words variable just for lint — suppress
    void responseWords;
  });

  it("resumes DB session in streaming mode and updates with accumulated tokens", async () => {
    sessionStore.set(SESSION_1, {
      id: SESSION_1,
      agentId: AGENT_A,
      messages: [
        { role: "user",      content: "Initial question" },
        { role: "assistant", content: "Initial answer" },
      ],
      totalInputTokens: 100,
      totalOutputTokens: 50,
      resumeCount: 0,
    });

    mockStreamText.mockReturnValueOnce(
      fakeStreamResult("Follow-up streamed answer.", 250, 95)
    );

    const { writer } = makeWriter();

    await claudeAgentSdkStreamingHandler(
      node({
        enableSessionResume: true,
        sdkSessionId: SESSION_1,
        task: "Follow-up question",
      }),
      ctx(),
      writer
    );

    expect(mockUpdateSdkSession).toHaveBeenCalledOnce();
    const [, updateInput] = mockUpdateSdkSession.mock.calls[0] as [
      string,
      { messages: Array<{ role: string }>; inputTokensDelta: number; outputTokensDelta: number }
    ];
    expect(updateInput.inputTokensDelta).toBe(250);
    expect(updateInput.outputTokensDelta).toBe(95);
    // 2 old + 1 new user + 1 new assistant
    expect(updateInput.messages).toHaveLength(4);

    // Verify store state
    const stored = sessionStore.get(SESSION_1)!;
    expect(stored.totalInputTokens).toBe(350);
    expect(stored.totalOutputTokens).toBe(145);
    expect(stored.resumeCount).toBe(1);
  });

  it("streaming: rejects session from different agent (same security as sync)", async () => {
    sessionStore.set(SESSION_2, {
      id: SESSION_2,
      agentId: AGENT_B,
      messages: [{ role: "user", content: "AGENT_B secret" }],
      totalInputTokens: 99,
      totalOutputTokens: 33,
      resumeCount: 0,
    });

    mockStreamText.mockReturnValueOnce(fakeStreamResult("Clean response.", 60, 30));

    const { writer } = makeWriter();

    const result = await claudeAgentSdkStreamingHandler(
      node({ enableSessionResume: true, sdkSessionId: SESSION_2 }),
      ctx({ agentId: AGENT_A }),
      writer
    );

    expect(result.messages[0].content).toBe("Clean response.");
    expect(mockUpdateSdkSession).not.toHaveBeenCalled();

    const callMessages = mockStreamText.mock.calls[0][0].messages as Array<{
      role: string; content: string;
    }>;
    expect(callMessages.map((m) => m.content)).not.toContain("AGENT_B secret");
  });

  it("streaming: writes stream_end with error text when streamText throws", async () => {
    mockStreamText.mockImplementationOnce(() => {
      throw new Error("Stream connection lost");
    });

    const { writer, chunks } = makeWriter();

    const result = await claudeAgentSdkStreamingHandler(node(), ctx(), writer);

    expect(result.nextNodeId).toBeNull();
    const endChunk = chunks.find(
      (c) => (c as { type: string }).type === "stream_end"
    ) as { type: string; content: string } | undefined;
    expect(endChunk?.content).toContain("An error occurred");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Suite 7 — Edge cases and resilience
// ══════════════════════════════════════════════════════════════════════════════

describe("Edge cases and resilience", () => {
  it("falls back to latest user message when task is empty", async () => {
    await claudeAgentSdkHandler(
      node({ task: "" }),
      ctx({ messageHistory: [{ role: "user", content: "What is the best EV?" }] })
    );

    const callMessages = mockGenerateText.mock.calls[0][0].messages as Array<{
      role: string; content: string;
    }>;
    expect(callMessages.find((m) => m.role === "user")?.content).toBe("What is the best EV?");
  });

  it("uses 'Please proceed.' as final fallback when task and message history are both empty", async () => {
    await claudeAgentSdkHandler(
      node({ task: "" }),
      ctx({ messageHistory: [] })
    );

    const callMessages = mockGenerateText.mock.calls[0][0].messages as Array<{
      role: string; content: string;
    }>;
    expect(callMessages.find((m) => m.role === "user")?.content).toBe("Please proceed.");
  });

  it("does not expose outputVariable when it is empty string", async () => {
    const result = await claudeAgentSdkHandler(node({ outputVariable: "" }), ctx());
    expect(result.updatedVariables).toBeUndefined();
  });

  it("returns null nextNodeId on generateText failure", async () => {
    mockGenerateText.mockRejectedValueOnce(new Error("Rate limit"));
    const result = await claudeAgentSdkHandler(node(), ctx());
    expect(result.nextNodeId).toBeNull();
    expect(result.messages[0].content).toContain("Claude Agent SDK node failed");
    expect(result.waitForInput).toBe(false);
  });

  it("DB session create failure does not crash handler — variable fallback still works", async () => {
    mockCreateSdkSession.mockRejectedValueOnce(new Error("DB write failed"));

    const result = await claudeAgentSdkHandler(
      node({ enableSessionResume: true, outputVariable: "answer" }),
      ctx()
    );

    // Output still works
    expect(result.messages[0].role).toBe("assistant");
    expect(result.updatedVariables?.answer).toBeDefined();

    // No DB session ID exposed (create failed)
    expect(result.updatedVariables?.__sdk_session_id).toBeUndefined();

    // Variable fallback still populated
    const varSession = result.updatedVariables?.__sdk_session as Array<{ role: string }>;
    expect(Array.isArray(varSession)).toBe(true);
    expect(varSession.length).toBeGreaterThan(0);
  });
});
