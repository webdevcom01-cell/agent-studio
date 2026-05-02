/**
 * Tests for pipeline POST rate limiting.
 * Verifies that the sliding window rate limiter (5 req/min per agentId)
 * is applied before any DB or queue operations.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const mockRequireAgentOwner = vi.hoisted(() => vi.fn());
const mockIsAuthError = vi.hoisted(() => vi.fn());
const mockCheckRateLimitAsync = vi.hoisted(() => vi.fn());
const mockGetEndpointLimit = vi.hoisted(() => vi.fn());
const mockAnalyzeTask = vi.hoisted(() => vi.fn());
const mockBuildPipelineConfig = vi.hoisted(() => vi.fn());
const mockCreatePipelineRun = vi.hoisted(() => vi.fn());
const mockAddPipelineRunJob = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/auth-guard", () => ({
  requireAgentOwner: mockRequireAgentOwner,
  isAuthError: mockIsAuthError,
}));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimitAsync: mockCheckRateLimitAsync }));
vi.mock("@/lib/rate-limit-config", () => ({ getEndpointLimit: mockGetEndpointLimit }));
vi.mock("@/lib/ecc/meta-orchestrator", () => ({
  analyzeTask: mockAnalyzeTask,
  buildPipelineConfig: mockBuildPipelineConfig,
}));
vi.mock("@/lib/sdlc/pipeline-manager", () => ({ createPipelineRun: mockCreatePipelineRun, listPipelineRuns: vi.fn() }));
vi.mock("@/lib/queue", () => ({ addPipelineRunJob: mockAddPipelineRunJob }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { POST } from "../route";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRequest(agentId: string, body: Record<string, unknown> = {}): NextRequest {
  return new NextRequest(`http://localhost/api/agents/${agentId}/pipelines`, {
    method: "POST",
    body: JSON.stringify({ taskDescription: "add login page", ...body }),
    headers: { "Content-Type": "application/json" },
  });
}

const AGENT_ID = "agent-test-123";

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/agents/[agentId]/pipelines — rate limiting", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockIsAuthError.mockReturnValue(false);
    mockRequireAgentOwner.mockResolvedValue({ userId: "user-1" });
    mockGetEndpointLimit.mockReturnValue({ maxRequests: 5, windowMs: 60_000 });
    mockAnalyzeTask.mockResolvedValue({
      taskType: "new-feature",
      complexity: "simple",
      pipeline: ["discovery"],
    });
    mockBuildPipelineConfig.mockReturnValue([{ id: "discovery" }]);
    mockCreatePipelineRun.mockResolvedValue({ id: "run-1" });
    mockAddPipelineRunJob.mockResolvedValue("job-1");
  });

  it("allows request when under limit", async () => {
    mockCheckRateLimitAsync.mockResolvedValue({ allowed: true, remaining: 4, retryAfterMs: 0 });

    const res = await POST(makeRequest(AGENT_ID), { params: Promise.resolve({ agentId: AGENT_ID }) });
    expect(res.status).toBe(201);
    expect(mockCreatePipelineRun).toHaveBeenCalledOnce();
  });

  it("returns 429 when rate limit is exceeded", async () => {
    mockCheckRateLimitAsync.mockResolvedValue({ allowed: false, remaining: 0, retryAfterMs: 35_000 });

    const res = await POST(makeRequest(AGENT_ID), { params: Promise.resolve({ agentId: AGENT_ID }) });
    const body = await res.json();

    expect(res.status).toBe(429);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/rate limit/i);
    expect(res.headers.get("Retry-After")).toBe("35");
    expect(res.headers.get("X-RateLimit-Limit")).toBe("5");
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
  });

  it("does not call DB or queue when rate limited", async () => {
    mockCheckRateLimitAsync.mockResolvedValue({ allowed: false, remaining: 0, retryAfterMs: 10_000 });

    await POST(makeRequest(AGENT_ID), { params: Promise.resolve({ agentId: AGENT_ID }) });

    expect(mockCreatePipelineRun).not.toHaveBeenCalled();
    expect(mockAddPipelineRunJob).not.toHaveBeenCalled();
  });

  it("uses per-agentId key so different agents have independent limits", async () => {
    mockCheckRateLimitAsync.mockResolvedValue({ allowed: true, remaining: 4, retryAfterMs: 0 });

    await POST(makeRequest("agent-A"), { params: Promise.resolve({ agentId: "agent-A" }) });
    await POST(makeRequest("agent-B"), { params: Promise.resolve({ agentId: "agent-B" }) });

    expect(mockCheckRateLimitAsync).toHaveBeenCalledWith("pipeline:agent-A", 5);
    expect(mockCheckRateLimitAsync).toHaveBeenCalledWith("pipeline:agent-B", 5);
  });

  it("returns 429 even when auth succeeds", async () => {
    mockCheckRateLimitAsync.mockResolvedValue({ allowed: false, remaining: 0, retryAfterMs: 20_000 });

    const res = await POST(makeRequest(AGENT_ID), { params: Promise.resolve({ agentId: AGENT_ID }) });
    expect(res.status).toBe(429);
    expect(mockRequireAgentOwner).toHaveBeenCalledOnce();
  });
});
