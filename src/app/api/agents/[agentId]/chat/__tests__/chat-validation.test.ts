import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/runtime/engine", () => ({
  executeFlow: vi.fn().mockResolvedValue({ messages: [], waitingForInput: false }),
}));
vi.mock("@/lib/runtime/engine-streaming", () => ({
  executeFlowStreaming: vi.fn(),
}));
vi.mock("@/lib/runtime/context", () => ({
  loadContext: vi.fn().mockResolvedValue({
    conversationId: "conv-1",
    isNewConversation: false,
  }),
}));
vi.mock("@/lib/analytics", () => ({
  trackChatResponse: vi.fn().mockResolvedValue(undefined),
  trackError: vi.fn().mockResolvedValue(undefined),
  trackToolCall: vi.fn().mockResolvedValue(undefined),
  trackAgentCall: vi.fn().mockResolvedValue(undefined),
  trackFlowExecution: vi.fn().mockResolvedValue(undefined),
  trackKBSearch: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, remaining: 19, retryAfterMs: 0 }),
  checkRateLimitAsync: vi.fn().mockResolvedValue({ allowed: true, remaining: 19, retryAfterMs: 0 }),
}));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    agent: {
      findUnique: vi.fn().mockResolvedValue({ model: "deepseek-chat" }),
    },
  },
}));
// auth-guard is used in chat/route.ts for debug mode — mock to avoid pulling
// in next-auth which fails to resolve next/server in the vitest browser env
vi.mock("@/lib/api/auth-guard", () => ({
  requireAgentOwner: vi.fn().mockResolvedValue({ userId: "test-user", agentId: "test-agent-1" }),
  isAuthError: vi.fn().mockReturnValue(false),
  requireAuth: vi.fn().mockResolvedValue({ userId: "test-user" }),
}));
// auth() is called non-blocking in the chat route to inject userId for human_approval nodes
vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue(null),
}));

import { POST } from "../route";

const AGENT_ID = "test-agent-1";
const PARAMS = { params: Promise.resolve({ agentId: AGENT_ID }) };

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/agents/${AGENT_ID}/chat`,
    {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/agents/[agentId]/chat message validation", () => {
  it("accepts a normal message under the limit", async () => {
    const res = await POST(makeRequest({ message: "Hello" }), PARAMS);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("accepts a message at exactly 10,000 characters", async () => {
    const message = "a".repeat(10_000);
    const res = await POST(makeRequest({ message }), PARAMS);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("rejects a message over 10,000 characters with 400", async () => {
    const message = "a".repeat(10_001);
    const res = await POST(makeRequest({ message }), PARAMS);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("exceeds maximum length");
  });

  it("rejects an empty message with 400", async () => {
    const res = await POST(makeRequest({ message: "" }), PARAMS);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Message is required");
  });

  it("rejects a whitespace-only message with 400", async () => {
    const res = await POST(makeRequest({ message: "   \n\t  " }), PARAMS);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Message is required");
  });
});
