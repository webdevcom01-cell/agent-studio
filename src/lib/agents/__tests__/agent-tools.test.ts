import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  agent: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
  },
  agentCallLog: {
    create: vi.fn(),
    update: vi.fn(),
  },
  conversation: {
    create: vi.fn(),
  },
}));

const mockExecuteFlow = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock("@/lib/runtime/engine", () => ({
  executeFlow: mockExecuteFlow,
}));

vi.mock("@/lib/a2a/circuit-breaker", () => ({
  checkCircuit: vi.fn(),
  recordSuccess: vi.fn(),
  recordFailure: vi.fn(),
}));

vi.mock("@/lib/a2a/rate-limiter", () => ({
  checkRateLimit: vi.fn(),
}));

vi.mock("@/lib/validators/flow-content", () => ({
  parseFlowContent: vi.fn((content: unknown) => content),
}));

import { getAgentToolsForAgent, type AgentToolContext } from "../agent-tools";
import { checkCircuit } from "@/lib/a2a/circuit-breaker";
import { checkRateLimit } from "@/lib/a2a/rate-limiter";

function makeCtx(overrides: Partial<AgentToolContext> = {}): AgentToolContext {
  return {
    callerAgentId: "agent-orchestrator",
    userId: "user-1",
    depth: 0,
    callStack: ["agent-orchestrator"],
    traceId: "trace-1",
    conversationId: "conv-1",
    ...overrides,
  };
}

const mockAgents = [
  { id: "agent-research", name: "Research Assistant", description: "Searches the web for information" },
  { id: "agent-writer", name: "Content Writer", description: "Writes articles and reports" },
];

beforeEach(() => {
  vi.restoreAllMocks();
  mockPrisma.agentCallLog.create.mockResolvedValue({ id: "log-1" });
  mockPrisma.agentCallLog.update.mockResolvedValue({});
  mockPrisma.conversation.create.mockResolvedValue({ id: "conv-sub" });
});

describe("getAgentToolsForAgent", () => {
  it("returns empty object when no sibling agents exist", async () => {
    mockPrisma.agent.findMany.mockResolvedValue([]);

    const tools = await getAgentToolsForAgent("agent-1", makeCtx());

    expect(tools).toEqual({});
  });

  it("returns tools for available sibling agents", async () => {
    mockPrisma.agent.findMany.mockResolvedValue(mockAgents);

    const tools = await getAgentToolsForAgent("agent-1", makeCtx());

    expect(Object.keys(tools)).toHaveLength(2);
    expect(Object.keys(tools)).toContain("agent_research_assistant");
    expect(Object.keys(tools)).toContain("agent_content_writer");
  });

  it("returns empty when depth is at max (5)", async () => {
    const tools = await getAgentToolsForAgent("agent-1", makeCtx({ depth: 5 }));

    expect(tools).toEqual({});
    expect(mockPrisma.agent.findMany).not.toHaveBeenCalled();
  });

  it("sanitizes agent names into valid tool names", async () => {
    mockPrisma.agent.findMany.mockResolvedValue([
      { id: "a1", name: "My Agent! @#$%", description: "Test" },
      { id: "a2", name: "Simple", description: null },
    ]);

    const tools = await getAgentToolsForAgent("agent-1", makeCtx());

    const names = Object.keys(tools);
    expect(names[0]).toBe("agent_my_agent");
    expect(names[1]).toBe("agent_simple");
  });

  it("handles prisma error gracefully", async () => {
    mockPrisma.agent.findMany.mockRejectedValue(new Error("DB connection lost"));

    const tools = await getAgentToolsForAgent("agent-1", makeCtx());

    expect(tools).toEqual({});
  });

  it("generates tool descriptions from agent metadata", async () => {
    mockPrisma.agent.findMany.mockResolvedValue([
      { id: "a1", name: "Researcher", description: "Finds information online and summarizes it" },
    ]);

    const tools = await getAgentToolsForAgent("agent-1", makeCtx());

    const toolDef = Object.values(tools)[0];
    expect(toolDef).toBeDefined();
    // The tool has description property in its internal config
    expect(Object.keys(tools)).toContain("agent_researcher");
  });

  it("uses fallback tool name when agent name produces empty string", async () => {
    mockPrisma.agent.findMany.mockResolvedValue([
      { id: "abc123xyz789", name: "!!!@@@", description: "Test" },
    ]);

    const tools = await getAgentToolsForAgent("agent-1", makeCtx());

    const names = Object.keys(tools);
    expect(names[0]).toBe("agent_abc123xyz789");
  });
});

describe("agent tool execution", () => {
  it("executes sub-agent and returns result", async () => {
    mockPrisma.agent.findMany.mockResolvedValue([mockAgents[0]]);
    mockPrisma.agent.findFirst.mockResolvedValue({
      id: "agent-research",
      name: "Research Assistant",
      flow: {
        content: { nodes: [], edges: [], variables: [] },
      },
    });
    mockExecuteFlow.mockResolvedValue({
      messages: [{ role: "assistant", content: "Found 5 results about AI trends" }],
      waitingForInput: false,
    });

    const tools = await getAgentToolsForAgent("agent-1", makeCtx());
    const researchTool = tools["agent_research_assistant"];

    // Execute the tool
    const result = await researchTool.execute(
      { input: "Find information about AI trends in 2026" },
      { toolCallId: "test-call", messages: [] }
    );

    expect(result).toBe("Found 5 results about AI trends");
    expect(mockPrisma.conversation.create).toHaveBeenCalled();
    expect(mockExecuteFlow).toHaveBeenCalled();
  });

  it("returns error message on circular call detection", async () => {
    mockPrisma.agent.findMany.mockResolvedValue([mockAgents[0]]);

    // Agent-research is already in the call stack
    const tools = await getAgentToolsForAgent("agent-1", makeCtx({
      callStack: ["agent-1", "agent-research"],
    }));
    const researchTool = tools["agent_research_assistant"];

    const result = await researchTool.execute(
      { input: "Test" },
      { toolCallId: "test-call", messages: [] }
    );

    expect(result).toContain("circular call detected");
    expect(mockExecuteFlow).not.toHaveBeenCalled();
  });

  it("returns error message on rate limit exceeded", async () => {
    mockPrisma.agent.findMany.mockResolvedValue([mockAgents[0]]);
    vi.mocked(checkRateLimit).mockImplementation(() => {
      throw new Error("Rate limit exceeded: max 60 calls/min");
    });

    const tools = await getAgentToolsForAgent("agent-1", makeCtx());
    const researchTool = tools["agent_research_assistant"];

    const result = await researchTool.execute(
      { input: "Test" },
      { toolCallId: "test-call", messages: [] }
    );

    expect(result).toContain("Rate limit exceeded");
    expect(mockExecuteFlow).not.toHaveBeenCalled();
  });

  it("returns error message on circuit breaker open", async () => {
    mockPrisma.agent.findMany.mockResolvedValue([mockAgents[0]]);
    vi.mocked(checkCircuit).mockImplementation(() => {
      throw new Error("Circuit open — too many recent failures");
    });

    const tools = await getAgentToolsForAgent("agent-1", makeCtx());
    const researchTool = tools["agent_research_assistant"];

    const result = await researchTool.execute(
      { input: "Test" },
      { toolCallId: "test-call", messages: [] }
    );

    expect(result).toContain("Circuit open");
    expect(mockExecuteFlow).not.toHaveBeenCalled();
  });

  it("handles sub-agent execution failure gracefully", async () => {
    mockPrisma.agent.findMany.mockResolvedValue([mockAgents[0]]);
    mockPrisma.agent.findFirst.mockResolvedValue({
      id: "agent-research",
      name: "Research Assistant",
      flow: {
        content: { nodes: [], edges: [], variables: [] },
      },
    });
    mockExecuteFlow.mockRejectedValue(new Error("Model API unavailable"));

    const tools = await getAgentToolsForAgent("agent-1", makeCtx());
    const researchTool = tools["agent_research_assistant"];

    const result = await researchTool.execute(
      { input: "Test" },
      { toolCallId: "test-call", messages: [] }
    );

    expect(result).toContain("failed");
    expect(result).toContain("Model API unavailable");
  });

  it("creates audit log for agent tool calls", async () => {
    mockPrisma.agent.findMany.mockResolvedValue([mockAgents[0]]);
    mockPrisma.agent.findFirst.mockResolvedValue({
      id: "agent-research",
      name: "Research Assistant",
      flow: {
        content: { nodes: [], edges: [], variables: [] },
      },
    });
    mockExecuteFlow.mockResolvedValue({
      messages: [{ role: "assistant", content: "Done" }],
      waitingForInput: false,
    });

    const tools = await getAgentToolsForAgent("agent-1", makeCtx());
    await tools["agent_research_assistant"].execute(
      { input: "Test query" },
      { toolCallId: "test-call", messages: [] }
    );

    // Should create a SUBMITTED log and then update to COMPLETED
    expect(mockPrisma.agentCallLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          callerAgentId: "agent-orchestrator",
          calleeAgentId: "agent-research",
          status: "SUBMITTED",
        }),
      })
    );

    expect(mockPrisma.agentCallLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "COMPLETED",
        }),
      })
    );
  });

  it("passes userId to null when context has no user", async () => {
    mockPrisma.agent.findMany.mockResolvedValue([mockAgents[0]]);

    const tools = await getAgentToolsForAgent("agent-1", makeCtx({ userId: null }));

    expect(Object.keys(tools)).toHaveLength(1);
    // Rate limiter should not be called when userId is null
  });
});
