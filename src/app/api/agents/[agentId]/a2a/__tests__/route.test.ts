import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAuth = vi.hoisted(() => vi.fn());
const mockPrisma = vi.hoisted(() => ({
  agent: {
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

vi.mock("@/lib/auth", () => ({
  auth: mockAuth,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock("@/lib/runtime/engine", () => ({
  executeFlow: mockExecuteFlow,
}));

import { POST } from "../route";
import { NextRequest } from "next/server";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/agents/agent-1/a2a", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const AGENT_ID = "agent-1";

function makeParams(): { params: Promise<{ agentId: string }> } {
  return { params: Promise.resolve({ agentId: AGENT_ID }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.agentCallLog.create.mockResolvedValue({ id: "log-1" });
  mockPrisma.agentCallLog.update.mockResolvedValue({});
  mockPrisma.conversation.create.mockResolvedValue({ id: "conv-1" });
});

describe("POST /api/agents/[agentId]/a2a", () => {
  it("returns 401 if not authenticated", async () => {
    mockAuth.mockResolvedValue(null);

    const res = await POST(makeRequest({ method: "tasks/send" }), makeParams());
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data.error.message).toBe("Unauthorized");
  });

  it("returns JSON-RPC error for unknown method", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });

    const res = await POST(
      makeRequest({
        jsonrpc: "2.0",
        method: "tasks/unknown",
        id: "req-1",
      }),
      makeParams(),
    );
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.error.code).toBe(-32601);
    expect(data.error.message).toBe("Method not found");
  });

  it("executes agent flow and returns A2A formatted result", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
    mockPrisma.agent.findFirst.mockResolvedValue({
      id: AGENT_ID,
      flow: {
        content: { nodes: [], edges: [], variables: [] },
      },
    });
    mockExecuteFlow.mockResolvedValue({
      messages: [
        { role: "assistant", content: "Hello from agent" },
      ],
      waitingForInput: false,
    });

    const res = await POST(
      makeRequest({
        jsonrpc: "2.0",
        method: "tasks/send",
        id: "req-1",
        params: {
          message: {
            parts: [{ type: "text", text: "Hi there" }],
          },
        },
      }),
      makeParams(),
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.jsonrpc).toBe("2.0");
    expect(data.result.status.state).toBe("completed");
    expect(data.result.artifacts[0].parts[0].text).toBe("Hello from agent");
  });

  it("creates AgentCallLog entry", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
    mockPrisma.agent.findFirst.mockResolvedValue({
      id: AGENT_ID,
      flow: {
        content: { nodes: [], edges: [], variables: [] },
      },
    });
    mockExecuteFlow.mockResolvedValue({
      messages: [{ role: "assistant", content: "ok" }],
      waitingForInput: false,
    });

    await POST(
      makeRequest({
        jsonrpc: "2.0",
        method: "tasks/send",
        id: "req-1",
        params: {
          message: {
            parts: [{ type: "text", text: "test" }],
          },
        },
      }),
      makeParams(),
    );

    expect(mockPrisma.agentCallLog.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.agentCallLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          callerAgentId: AGENT_ID,
          calleeAgentId: AGENT_ID,
          status: "SUBMITTED",
        }),
      }),
    );
  });

  it("returns error when agent not found", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
    mockPrisma.agent.findFirst.mockResolvedValue(null);

    const res = await POST(
      makeRequest({
        jsonrpc: "2.0",
        method: "tasks/send",
        id: "req-1",
        params: {},
      }),
      makeParams(),
    );
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.error.message).toBe("Agent not found");
  });
});
