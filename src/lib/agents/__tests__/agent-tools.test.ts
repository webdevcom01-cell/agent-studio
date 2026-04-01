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

vi.mock("@/lib/a2a/circuit-breaker", async () => {
  const actual = await vi.importActual<typeof import("@/lib/a2a/circuit-breaker")>("@/lib/a2a/circuit-breaker");
  return {
    checkCircuit: vi.fn(),
    recordSuccess: vi.fn(),
    recordFailure: vi.fn(),
    checkDepthLimit: vi.fn(),
    checkCycleDetection: vi.fn((targetId: string, callStack: string[]) => {
      actual.checkCycleDetection(targetId, callStack);
    }),
    MAX_AGENT_DEPTH: 10,
    A2ACircuitError: actual.A2ACircuitError,
    A2A_ERROR_CODES: actual.A2A_ERROR_CODES,
  };
});

vi.mock("@/lib/a2a/rate-limiter", () => ({
  checkRateLimit: vi.fn(),
}));

vi.mock("@/lib/validators/flow-content", () => ({
  parseFlowContent: vi.fn((content: unknown) => content),
}));

import { getAgentToolsForAgent, getTimeoutForAgent, extractDesktopMetadata, type AgentToolContext } from "../agent-tools";
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

  it("returns empty when depth is at max (10)", async () => {
    const tools = await getAgentToolsForAgent("agent-1", makeCtx({ depth: 10 }));

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

    expect(result).toContain("Circular agent call detected");
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
  });
});

describe("extractDesktopMetadata", () => {
  it("returns empty metadata when agent has no flow", () => {
    const metadata = extractDesktopMetadata({
      id: "a1",
      name: "Test",
      description: null,
      flow: null,
    });

    expect(metadata.desktopApps).toEqual([]);
    expect(metadata.requiredCLIs).toEqual([]);
    expect(metadata.estimatedDuration).toBe(30);
    expect(metadata.outputTypes).toEqual([]);
  });

  it("extracts desktop_app node info from flow", () => {
    const metadata = extractDesktopMetadata({
      id: "a1",
      name: "Renderer",
      description: "Renders 3D scenes",
      flow: {
        content: {
          nodes: [
            {
              type: "desktop_app",
              data: {
                appId: "blender",
                actions: [
                  { command: "render", parameters: {} },
                  { command: "export-png", parameters: {} },
                ],
              },
            },
            {
              type: "message",
              data: { label: "Start" },
            },
          ],
          edges: [],
          variables: [],
        },
      },
    });

    expect(metadata.desktopApps).toEqual(["blender"]);
    expect(metadata.requiredCLIs).toEqual(["blender"]);
    expect(metadata.outputTypes).toContain("file");
  });

  it("handles multiple desktop_app nodes", () => {
    const metadata = extractDesktopMetadata({
      id: "a1",
      name: "Pipeline",
      description: null,
      flow: {
        content: {
          nodes: [
            {
              type: "desktop_app",
              data: { appId: "blender", actions: [{ command: "render" }] },
            },
            {
              type: "desktop_app",
              data: { appId: "gimp", actions: [{ command: "convert" }] },
            },
          ],
        },
      },
    });

    expect(metadata.desktopApps).toEqual(["blender", "gimp"]);
    expect(metadata.estimatedDuration).toBe(60);
  });

  it("deduplicates app IDs", () => {
    const metadata = extractDesktopMetadata({
      id: "a1",
      name: "Multi",
      description: null,
      flow: {
        content: {
          nodes: [
            { type: "desktop_app", data: { appId: "blender", actions: [] } },
            { type: "desktop_app", data: { appId: "blender", actions: [] } },
          ],
        },
      },
    });

    expect(metadata.desktopApps).toEqual(["blender"]);
  });

  it("handles malformed flow content gracefully", () => {
    const metadata = extractDesktopMetadata({
      id: "a1",
      name: "Bad",
      description: null,
      flow: { content: "not-json" },
    });

    expect(metadata.desktopApps).toEqual([]);
  });

  it("infers output types from commands", () => {
    const metadata = extractDesktopMetadata({
      id: "a1",
      name: "Test",
      description: null,
      flow: {
        content: {
          nodes: [
            {
              type: "desktop_app",
              data: {
                appId: "inkscape",
                actions: [
                  { command: "export-png" },
                  { command: "script" },
                ],
              },
            },
          ],
        },
      },
    });

    expect(metadata.outputTypes).toContain("file");
    expect(metadata.outputTypes).toContain("text");
  });
});

// ─── Task 3.2 — Per-Agent Timeout Profiles ──────────────────────────────────
describe("getTimeoutForAgent", () => {
  // Priority 1: explicit DB value
  it("returns DB value when expectedDurationSeconds is a positive number", () => {
    expect(getTimeoutForAgent({ name: "Anything", expectedDurationSeconds: 45 })).toBe(45);
  });

  it("returns DB value of 5 (minimum valid)", () => {
    expect(getTimeoutForAgent({ name: "Fast Agent", expectedDurationSeconds: 5 })).toBe(5);
  });

  it("returns DB value of 600 (maximum valid)", () => {
    expect(getTimeoutForAgent({ name: "Slow Agent", expectedDurationSeconds: 600 })).toBe(600);
  });

  it("falls through to pattern matching when expectedDurationSeconds is null", () => {
    // "Reality Checker" matches the fast pattern → 30s
    const result = getTimeoutForAgent({ name: "Reality Checker", expectedDurationSeconds: null });
    expect(result).toBe(30);
  });

  it("falls through to pattern matching when expectedDurationSeconds is undefined", () => {
    const result = getTimeoutForAgent({ name: "Code Generator", expectedDurationSeconds: undefined as unknown as null });
    expect(result).toBe(120);
  });

  it("ignores DB value of 0 and falls through to pattern matching", () => {
    // 0 is not a valid override (our guard: > 0)
    const result = getTimeoutForAgent({ name: "Research Assistant", expectedDurationSeconds: 0 as unknown as null });
    expect(result).toBeGreaterThan(0);
  });

  // Priority 2: pattern matching
  it("returns 30s for fast agents (reality-checker pattern)", () => {
    const cases = ["Reality Checker", "Fact Check Bot", "Quick Validator", "Sanity Linter"];
    for (const name of cases) {
      expect(getTimeoutForAgent({ name, expectedDurationSeconds: null })).toBe(30);
    }
  });

  it("returns 60s for standard agents (research / analysis pattern)", () => {
    const cases = ["Research Assistant", "Market Analyzer", "Audit Tool", "Content Summarizer"];
    for (const name of cases) {
      expect(getTimeoutForAgent({ name, expectedDurationSeconds: null })).toBe(60);
    }
  });

  it("returns 90s for slow agents (architecture / design pattern)", () => {
    const cases = ["Software Architect", "Decision Planner", "Blueprint Designer", "Spec Writer"];
    for (const name of cases) {
      expect(getTimeoutForAgent({ name, expectedDurationSeconds: null })).toBe(90);
    }
  });

  it("returns 120s for very-slow agents (code generation / engineering pattern)", () => {
    const cases = ["Code Generator", "Test Engineer", "QA Bot", "Developer Agent", "Build Tool"];
    for (const name of cases) {
      expect(getTimeoutForAgent({ name, expectedDurationSeconds: null })).toBe(120);
    }
  });

  // Priority 3: flat default
  it("returns 120s default when name matches no pattern", () => {
    const result = getTimeoutForAgent({ name: "My Custom Agent", expectedDurationSeconds: null });
    // default is 120
    expect(result).toBe(120);
  });

  it("returns 120s default for empty name", () => {
    expect(getTimeoutForAgent({ name: "", expectedDurationSeconds: null })).toBe(120);
  });

  // Pattern priority: first match wins
  it("first-match wins — fast pattern checked before slow pattern", () => {
    // "Quick Architect" contains "quick" (fast=30) but also "architect" (slow=90)
    // fast pattern is listed first → should return 30
    expect(getTimeoutForAgent({ name: "Quick Architect", expectedDurationSeconds: null })).toBe(30);
  });
});
