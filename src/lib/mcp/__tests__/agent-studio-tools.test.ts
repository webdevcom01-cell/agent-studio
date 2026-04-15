/**
 * Unit tests for agent-studio MCP tool implementations.
 * Tests callAgentStudioTool and each individual tool function via the dispatcher.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { callAgentStudioTool, AGENT_STUDIO_TOOLS } from "../agent-studio-tools";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/prisma", () => ({
  prisma: {
    agent: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    conversation: {
      create: vi.fn(),
      update: vi.fn(),
    },
    knowledgeBase: {
      findFirst: vi.fn(),
    },
    managedAgentTask: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/lib/knowledge/search", () => ({
  hybridSearch: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock("@/lib/managed-tasks/manager", () => ({
  createTask: vi.fn(),
  markFailed: vi.fn(),
}));

vi.mock("@/lib/queue", () => ({
  addMcpFlowJob: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { hybridSearch } from "@/lib/knowledge/search";
import { createTask, markFailed } from "@/lib/managed-tasks/manager";
import { addMcpFlowJob } from "@/lib/queue";

const mockPrisma = vi.mocked(prisma);
const mockHybridSearch = vi.mocked(hybridSearch);
const mockCreateTask = vi.mocked(createTask);
const mockMarkFailed = vi.mocked(markFailed);
const mockAddMcpFlowJob = vi.mocked(addMcpFlowJob);

const USER_ID = "user-test-1";

// ---------------------------------------------------------------------------
// AGENT_STUDIO_TOOLS schema tests
// ---------------------------------------------------------------------------

describe("AGENT_STUDIO_TOOLS", () => {
  it("exports 5 tools", () => {
    expect(AGENT_STUDIO_TOOLS).toHaveLength(5);
  });

  it("all tools have required MCP fields", () => {
    for (const tool of AGENT_STUDIO_TOOLS) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema.type).toBe("object");
    }
  });

  it("list_agents schema has correct limit bounds (1-50 default 20)", () => {
    const tool = AGENT_STUDIO_TOOLS.find((t) => t.name === "list_agents")!;
    const limit = tool.inputSchema.properties.limit;
    expect(limit.minimum).toBe(1);
    expect(limit.maximum).toBe(50);
    expect(limit.default).toBe(20);
  });

  it("search_knowledge_base schema has correct topK bounds (1-20 default 5)", () => {
    const tool = AGENT_STUDIO_TOOLS.find((t) => t.name === "search_knowledge_base")!;
    const topK = tool.inputSchema.properties.topK;
    expect(topK.minimum).toBe(1);
    expect(topK.maximum).toBe(20);
    expect(topK.default).toBe(5);
  });

  it("read-only tools are annotated correctly", () => {
    const readOnly = ["list_agents", "get_agent", "search_knowledge_base", "get_task_status"];
    for (const name of readOnly) {
      const tool = AGENT_STUDIO_TOOLS.find((t) => t.name === name)!;
      expect(tool.annotations?.readOnlyHint).toBe(true);
    }
  });

  it("trigger_agent is not annotated as readOnly", () => {
    const tool = AGENT_STUDIO_TOOLS.find((t) => t.name === "trigger_agent")!;
    expect(tool.annotations?.readOnlyHint).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// callAgentStudioTool — unknown tool
// ---------------------------------------------------------------------------

describe("callAgentStudioTool", () => {
  it("returns isError for unknown tool name", async () => {
    const result = await callAgentStudioTool("nonexistent", {}, USER_ID);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Unknown tool");
  });

  it("returns isError when tool implementation throws", async () => {
    // Force findMany to throw to trigger the outer catch
    mockPrisma.agent.findMany.mockRejectedValueOnce(new Error("DB down"));
    const result = await callAgentStudioTool("list_agents", {}, USER_ID);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("failed unexpectedly");
  });
});

// ---------------------------------------------------------------------------
// list_agents
// ---------------------------------------------------------------------------

describe("list_agents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns agents for the authenticated user", async () => {
    mockPrisma.agent.findMany.mockResolvedValueOnce([
      {
        id: "agent-1",
        name: "Test Agent",
        description: "A test agent",
        model: "deepseek-chat",
        createdAt: new Date("2025-01-01"),
        updatedAt: new Date("2025-01-02"),
        _count: { conversations: 3 },
      },
    ] as never);

    const result = await callAgentStudioTool("list_agents", {}, USER_ID);
    const data = JSON.parse(result.content[0].text);

    expect(result.isError).toBeUndefined();
    expect(data.agents).toHaveLength(1);
    expect(data.agents[0].id).toBe("agent-1");
    expect(data.agents[0].totalConversations).toBe(3);
    // `returned` reflects the page size, not total DB count
    expect(data.returned).toBe(1);
    expect(data.total).toBeUndefined();
  });

  it("applies default limit of 20", async () => {
    mockPrisma.agent.findMany.mockResolvedValueOnce([] as never);
    await callAgentStudioTool("list_agents", {}, USER_ID);

    expect(mockPrisma.agent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 20 }),
    );
  });

  it("caps limit at 50 even if higher value is passed", async () => {
    mockPrisma.agent.findMany.mockResolvedValueOnce([] as never);
    await callAgentStudioTool("list_agents", { limit: 999 }, USER_ID);

    expect(mockPrisma.agent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50 }),
    );
  });

  it("falls back to default limit when a non-numeric string is passed (NaN guard)", async () => {
    mockPrisma.agent.findMany.mockResolvedValueOnce([] as never);
    await callAgentStudioTool("list_agents", { limit: "abc" }, USER_ID);

    expect(mockPrisma.agent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 20 }),
    );
  });

  it("passes search filter when provided", async () => {
    mockPrisma.agent.findMany.mockResolvedValueOnce([] as never);
    await callAgentStudioTool("list_agents", { search: "summariser" }, USER_ID);

    expect(mockPrisma.agent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({ name: expect.objectContaining({ contains: "summariser" }) }),
          ]),
        }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// get_agent
// ---------------------------------------------------------------------------

describe("get_agent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns agent details for valid agentId", async () => {
    mockPrisma.agent.findFirst.mockResolvedValueOnce({
      id: "agent-1",
      name: "My Agent",
      description: "Desc",
      model: "deepseek-chat",
      createdAt: new Date("2025-01-01"),
      updatedAt: new Date("2025-01-02"),
      flow: { id: "flow-1" },
      knowledgeBase: { id: "kb-1" },
      _count: { conversations: 5 },
    } as never);

    const result = await callAgentStudioTool("get_agent", { agentId: "agent-1" }, USER_ID);
    const data = JSON.parse(result.content[0].text);

    expect(result.isError).toBeUndefined();
    expect(data.id).toBe("agent-1");
    expect(data.hasFlow).toBe(true);
    expect(data.hasKnowledgeBase).toBe(true);
    expect(data.totalConversations).toBe(5);
  });

  it("returns isError when agentId is missing", async () => {
    const result = await callAgentStudioTool("get_agent", {}, USER_ID);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("agentId is required");
  });

  it("returns isError when agent is not found", async () => {
    mockPrisma.agent.findFirst.mockResolvedValueOnce(null);
    const result = await callAgentStudioTool("get_agent", { agentId: "missing" }, USER_ID);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not found");
  });

  it("returns hasFlow=false and hasKnowledgeBase=false when absent", async () => {
    mockPrisma.agent.findFirst.mockResolvedValueOnce({
      id: "agent-2",
      name: "Bare Agent",
      description: null,
      model: "gpt-4o",
      createdAt: new Date(),
      updatedAt: new Date(),
      flow: null,
      knowledgeBase: null,
      _count: { conversations: 0 },
    } as never);

    const result = await callAgentStudioTool("get_agent", { agentId: "agent-2" }, USER_ID);
    const data = JSON.parse(result.content[0].text);
    expect(data.hasFlow).toBe(false);
    expect(data.hasKnowledgeBase).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// trigger_agent (async — enqueues BullMQ job, returns taskId immediately)
// ---------------------------------------------------------------------------

describe("trigger_agent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateTask.mockResolvedValue({ id: "task-1" } as never);
    mockAddMcpFlowJob.mockResolvedValue("mcp-flow-task-1");
    mockMarkFailed.mockResolvedValue({ id: "task-1", status: "FAILED" } as never);
  });

  const agentWithFlow = {
    id: "agent-1",
    name: "Test Agent",
    flow: { id: "flow-1" },
  };

  it("returns taskId and PENDING status for valid agent and message", async () => {
    mockPrisma.agent.findFirst.mockResolvedValueOnce(agentWithFlow as never);

    const result = await callAgentStudioTool(
      "trigger_agent",
      { agentId: "agent-1", message: "hello" },
      USER_ID,
    );
    const data = JSON.parse(result.content[0].text);

    expect(result.isError).toBeUndefined();
    expect(data.taskId).toBe("task-1");
    expect(data.status).toBe("PENDING");
    expect(data.message).toContain("Poll get_task_status");
  });

  it("creates a ManagedAgentTask with correct fields", async () => {
    mockPrisma.agent.findFirst.mockResolvedValueOnce(agentWithFlow as never);

    await callAgentStudioTool(
      "trigger_agent",
      { agentId: "agent-1", message: "run this task" },
      USER_ID,
    );

    expect(mockCreateTask).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "agent-1",
        userId: USER_ID,
        input: { task: "run this task" },
      }),
    );
  });

  it("enqueues MCP flow job with correct data", async () => {
    mockPrisma.agent.findFirst.mockResolvedValueOnce(agentWithFlow as never);

    await callAgentStudioTool(
      "trigger_agent",
      { agentId: "agent-1", message: "hello", variables: '{"topic":"AI"}' },
      USER_ID,
    );

    expect(mockAddMcpFlowJob).toHaveBeenCalledWith({
      taskId: "task-1",
      agentId: "agent-1",
      userId: USER_ID,
      message: "hello",
      variables: { topic: "AI" },
    });
  });

  it("returns isError when agentId is missing", async () => {
    const result = await callAgentStudioTool("trigger_agent", { message: "hello" }, USER_ID);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("agentId is required");
  });

  it("returns isError when message is missing", async () => {
    const result = await callAgentStudioTool("trigger_agent", { agentId: "agent-1" }, USER_ID);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("message is required");
  });

  it("returns isError when agent is not found", async () => {
    mockPrisma.agent.findFirst.mockResolvedValueOnce(null);
    const result = await callAgentStudioTool(
      "trigger_agent",
      { agentId: "missing", message: "hi" },
      USER_ID,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not found");
  });

  it("returns isError when agent has no flow", async () => {
    mockPrisma.agent.findFirst.mockResolvedValueOnce({ id: "agent-1", name: "A", flow: null } as never);
    const result = await callAgentStudioTool(
      "trigger_agent",
      { agentId: "agent-1", message: "hello" },
      USER_ID,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("no flow configured");
  });

  it("returns isError when variables is invalid JSON", async () => {
    const result = await callAgentStudioTool(
      "trigger_agent",
      { agentId: "agent-1", message: "hi", variables: "{bad json}" },
      USER_ID,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("valid JSON");
  });

  it("returns isError when variables is a JSON array not an object", async () => {
    const result = await callAgentStudioTool(
      "trigger_agent",
      { agentId: "agent-1", message: "hi", variables: "[1,2,3]" },
      USER_ID,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("JSON object");
  });

  it("returns isError when variables is a JSON primitive (not an object)", async () => {
    const result = await callAgentStudioTool(
      "trigger_agent",
      { agentId: "agent-1", message: "hi", variables: '"true"' },
      USER_ID,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("JSON object");
  });

  it("returns isError when message is whitespace-only", async () => {
    const result = await callAgentStudioTool(
      "trigger_agent",
      { agentId: "agent-1", message: "   " },
      USER_ID,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("message is required");
  });

  it("marks task as FAILED and returns isError when queue throws", async () => {
    mockPrisma.agent.findFirst.mockResolvedValueOnce(agentWithFlow as never);
    mockAddMcpFlowJob.mockRejectedValueOnce(new Error("Redis connection refused"));

    const result = await callAgentStudioTool(
      "trigger_agent",
      { agentId: "agent-1", message: "hello" },
      USER_ID,
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Failed to queue");
    expect(mockMarkFailed).toHaveBeenCalledWith("task-1", "Failed to enqueue job");
  });

  it("still returns isError when both queue and markFailed throw", async () => {
    mockPrisma.agent.findFirst.mockResolvedValueOnce(agentWithFlow as never);
    mockAddMcpFlowJob.mockRejectedValueOnce(new Error("Redis down"));
    mockMarkFailed.mockRejectedValueOnce(new Error("DB also down"));

    const result = await callAgentStudioTool(
      "trigger_agent",
      { agentId: "agent-1", message: "hello" },
      USER_ID,
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Failed to queue");
  });
});

// ---------------------------------------------------------------------------
// search_knowledge_base
// ---------------------------------------------------------------------------

describe("search_knowledge_base", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns search results", async () => {
    mockPrisma.knowledgeBase.findFirst.mockResolvedValueOnce({
      id: "kb-1",
      name: "My KB",
    } as never);
    mockHybridSearch.mockResolvedValueOnce([
      { content: "Chunk text", relevanceScore: 0.92, metadata: { source: "doc.pdf" } },
    ] as never);

    const result = await callAgentStudioTool(
      "search_knowledge_base",
      { knowledgeBaseId: "kb-1", query: "what is AI" },
      USER_ID,
    );
    const data = JSON.parse(result.content[0].text);

    expect(result.isError).toBeUndefined();
    expect(data.results).toHaveLength(1);
    expect(data.results[0].score).toBe(0.92);
    expect(data.results[0].content).toBe("Chunk text");
    expect(data.query).toBe("what is AI");
    expect(data.knowledgeBase).toBe("My KB");
  });

  it("returns isError when knowledgeBaseId is missing", async () => {
    const result = await callAgentStudioTool(
      "search_knowledge_base",
      { query: "hello" },
      USER_ID,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("knowledgeBaseId is required");
  });

  it("returns isError when query is missing", async () => {
    const result = await callAgentStudioTool(
      "search_knowledge_base",
      { knowledgeBaseId: "kb-1" },
      USER_ID,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("query is required");
  });

  it("returns isError when KB is not found or not owned by user", async () => {
    mockPrisma.knowledgeBase.findFirst.mockResolvedValueOnce(null);
    const result = await callAgentStudioTool(
      "search_knowledge_base",
      { knowledgeBaseId: "kb-999", query: "something" },
      USER_ID,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not found");
  });

  it("applies default topK of 5", async () => {
    mockPrisma.knowledgeBase.findFirst.mockResolvedValueOnce({ id: "kb-1", name: "KB" } as never);
    mockHybridSearch.mockResolvedValueOnce([] as never);

    await callAgentStudioTool(
      "search_knowledge_base",
      { knowledgeBaseId: "kb-1", query: "test" },
      USER_ID,
    );

    expect(mockHybridSearch).toHaveBeenCalledWith("test", "kb-1", { topK: 5 });
  });

  it("caps topK at 20 even if higher is passed", async () => {
    mockPrisma.knowledgeBase.findFirst.mockResolvedValueOnce({ id: "kb-1", name: "KB" } as never);
    mockHybridSearch.mockResolvedValueOnce([] as never);

    await callAgentStudioTool(
      "search_knowledge_base",
      { knowledgeBaseId: "kb-1", query: "test", topK: 999 },
      USER_ID,
    );

    expect(mockHybridSearch).toHaveBeenCalledWith("test", "kb-1", { topK: 20 });
  });

  it("falls back to default topK when a non-numeric string is passed (NaN guard)", async () => {
    mockPrisma.knowledgeBase.findFirst.mockResolvedValueOnce({ id: "kb-1", name: "KB" } as never);
    mockHybridSearch.mockResolvedValueOnce([] as never);

    await callAgentStudioTool(
      "search_knowledge_base",
      { knowledgeBaseId: "kb-1", query: "test", topK: "abc" },
      USER_ID,
    );

    expect(mockHybridSearch).toHaveBeenCalledWith("test", "kb-1", { topK: 5 });
  });
});

// ---------------------------------------------------------------------------
// get_task_status
// ---------------------------------------------------------------------------

describe("get_task_status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns task details for valid taskId", async () => {
    mockPrisma.managedAgentTask.findFirst.mockResolvedValueOnce({
      id: "task-1",
      status: "COMPLETED",
      progress: 100,
      output: { result: "done" },
      error: null,
      startedAt: new Date("2025-01-01T10:00:00Z"),
      completedAt: new Date("2025-01-01T10:01:00Z"),
      createdAt: new Date("2025-01-01T09:59:00Z"),
    } as never);

    const result = await callAgentStudioTool("get_task_status", { taskId: "task-1" }, USER_ID);
    const data = JSON.parse(result.content[0].text);

    expect(result.isError).toBeUndefined();
    expect(data.id).toBe("task-1");
    expect(data.status).toBe("COMPLETED");
    expect(data.progress).toBe(100);
    expect(data.completedAt).toBe("2025-01-01T10:01:00.000Z");
  });

  it("returns isError when taskId is missing", async () => {
    const result = await callAgentStudioTool("get_task_status", {}, USER_ID);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("taskId is required");
  });

  it("returns isError when task is not found", async () => {
    mockPrisma.managedAgentTask.findFirst.mockResolvedValueOnce(null);
    const result = await callAgentStudioTool("get_task_status", { taskId: "missing" }, USER_ID);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not found");
  });

  it("returns null for optional fields when absent", async () => {
    mockPrisma.managedAgentTask.findFirst.mockResolvedValueOnce({
      id: "task-2",
      status: "PENDING",
      progress: null,
      output: null,
      error: null,
      startedAt: null,
      completedAt: null,
      createdAt: new Date("2025-01-01T09:59:00Z"),
    } as never);

    const result = await callAgentStudioTool("get_task_status", { taskId: "task-2" }, USER_ID);
    const data = JSON.parse(result.content[0].text);

    expect(data.progress).toBeNull();
    expect(data.output).toBeNull();
    expect(data.startedAt).toBeNull();
    expect(data.completedAt).toBeNull();
  });

  it("returns ABANDONED status when flow produced no assistant output", async () => {
    mockPrisma.managedAgentTask.findFirst.mockResolvedValueOnce({
      id: "task-3",
      status: "ABANDONED",
      progress: 100,
      output: null,
      error: "Flow completed but produced no assistant output.",
      startedAt: new Date("2025-01-01T10:00:00Z"),
      completedAt: new Date("2025-01-01T10:01:00Z"),
      createdAt: new Date("2025-01-01T09:59:00Z"),
    } as never);

    const result = await callAgentStudioTool("get_task_status", { taskId: "task-3" }, USER_ID);
    const data = JSON.parse(result.content[0].text);

    expect(result.isError).toBeUndefined();
    expect(data.status).toBe("ABANDONED");
    expect(data.output).toBeNull();
    expect(data.error).toContain("no assistant output");
  });
});
