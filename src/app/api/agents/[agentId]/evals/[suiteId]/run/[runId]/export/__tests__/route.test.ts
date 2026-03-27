/**
 * Tests for eval run CSV export endpoint.
 * Covers: CSV formatting, flattening logic, auth guard, not found cases.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/prisma", () => ({
  prisma: {
    evalSuite: { findUnique: vi.fn() },
    evalRun: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/api/auth-guard", () => ({
  requireAgentOwner: vi.fn(),
  isAuthError: (r: unknown) => r instanceof Response,
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { GET } from "../route";
import { prisma } from "@/lib/prisma";
import { requireAgentOwner } from "@/lib/api/auth-guard";

const mockPrisma = prisma as {
  evalSuite: { findUnique: ReturnType<typeof vi.fn> };
  evalRun: { findUnique: ReturnType<typeof vi.fn> };
};
const mockRequireAgentOwner = requireAgentOwner as ReturnType<typeof vi.fn>;

function makeRequest(agentId = "a1", suiteId = "s1", runId = "r1") {
  return new NextRequest(
    `http://localhost/api/agents/${agentId}/evals/${suiteId}/run/${runId}/export`,
  );
}

function makeParams(agentId = "a1", suiteId = "s1", runId = "r1") {
  return { params: Promise.resolve({ agentId, suiteId, runId }) };
}

const MOCK_SUITE = { id: "s1", name: "Smoke Tests" };

const MOCK_RUN = {
  id: "r1",
  suiteId: "s1",
  status: "COMPLETED",
  score: 0.85,
  passedCases: 2,
  failedCases: 1,
  totalCases: 3,
  durationMs: 5000,
  triggeredBy: "manual",
  createdAt: new Date("2026-03-01T10:00:00Z"),
  completedAt: new Date("2026-03-01T10:00:05Z"),
  errorMessage: null,
  results: [
    {
      id: "res1",
      status: "PASSED",
      agentOutput: "Paris is the capital of France.",
      score: 1.0,
      latencyMs: 1200,
      errorMessage: null,
      createdAt: new Date("2026-03-01T10:00:01Z"),
      assertions: [
        { type: "contains", passed: true, score: 1.0, message: "Output contains 'Paris'" },
        { type: "relevance", passed: true, score: 0.92, message: "Response is relevant" },
      ],
      testCase: {
        id: "tc1",
        label: "Capital of France",
        input: "What is the capital of France?",
        tags: ["geography", "basic"],
        order: 0,
      },
    },
    {
      id: "res2",
      status: "FAILED",
      agentOutput: "I don't know.",
      score: 0.0,
      latencyMs: 800,
      errorMessage: null,
      createdAt: new Date("2026-03-01T10:00:02Z"),
      assertions: [
        { type: "contains", passed: false, score: 0.0, message: "Output does not contain 'Berlin'" },
      ],
      testCase: {
        id: "tc2",
        label: "Capital of Germany",
        input: "What is the capital of Germany?",
        tags: ["geography"],
        order: 1,
      },
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAgentOwner.mockResolvedValue({ userId: "u1", agentId: "a1" });
});

describe("GET /export (per-run CSV)", () => {
  it("returns 401 when not authenticated", async () => {
    mockRequireAgentOwner.mockResolvedValue(
      new Response(JSON.stringify({ success: false, error: "Unauthorized" }), { status: 401 }),
    );
    const res = await GET(makeRequest(), makeParams());
    expect(res.status).toBe(401);
  });

  it("returns 404 when suite not found", async () => {
    mockPrisma.evalSuite.findUnique.mockResolvedValue(null);
    const res = await GET(makeRequest(), makeParams());
    expect(res.status).toBe(404);
  });

  it("returns 404 when run not found", async () => {
    mockPrisma.evalSuite.findUnique.mockResolvedValue(MOCK_SUITE);
    mockPrisma.evalRun.findUnique.mockResolvedValue(null);
    const res = await GET(makeRequest(), makeParams());
    expect(res.status).toBe(404);
  });

  it("returns CSV with correct Content-Type and Content-Disposition", async () => {
    mockPrisma.evalSuite.findUnique.mockResolvedValue(MOCK_SUITE);
    mockPrisma.evalRun.findUnique.mockResolvedValue(MOCK_RUN);
    const res = await GET(makeRequest(), makeParams());
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    expect(res.headers.get("Content-Disposition")).toContain("attachment");
    expect(res.headers.get("Content-Disposition")).toContain("smoke-tests");
    expect(res.headers.get("Content-Disposition")).toContain(".csv");
  });

  it("CSV has header row as first line", async () => {
    mockPrisma.evalSuite.findUnique.mockResolvedValue(MOCK_SUITE);
    mockPrisma.evalRun.findUnique.mockResolvedValue(MOCK_RUN);
    const res = await GET(makeRequest(), makeParams());
    const text = await res.text();
    const firstLine = text.split("\r\n")[0] ?? "";
    expect(firstLine).toContain("run_id");
    expect(firstLine).toContain("test_case_label");
    expect(firstLine).toContain("assertion_type");
    expect(firstLine).toContain("assertion_passed");
  });

  it("flattens: 2 assertions on case1 + 1 on case2 = 3 data rows", async () => {
    mockPrisma.evalSuite.findUnique.mockResolvedValue(MOCK_SUITE);
    mockPrisma.evalRun.findUnique.mockResolvedValue(MOCK_RUN);
    const res = await GET(makeRequest(), makeParams());
    const text = await res.text();
    const lines = text.split("\r\n").filter((l) => l.length > 0);
    // 1 header + 2 assertions(case1) + 1 assertion(case2) = 4
    expect(lines.length).toBe(4);
  });

  it("properly escapes commas and double quotes in cell values", async () => {
    const runWithSpecialChars = {
      ...MOCK_RUN,
      results: [
        {
          ...MOCK_RUN.results[0],
          agentOutput: 'She said "hello, world"',
          assertions: [
            { type: "contains", passed: true, score: 1.0, message: 'Contains "hello"' },
          ],
        },
      ],
    };
    mockPrisma.evalSuite.findUnique.mockResolvedValue(MOCK_SUITE);
    mockPrisma.evalRun.findUnique.mockResolvedValue(runWithSpecialChars);
    const res = await GET(makeRequest(), makeParams());
    const text = await res.text();
    // Double quotes should be escaped as ""
    expect(text).toContain('""hello, world""');
  });

  it("handles test case with tags joined by semicolons", async () => {
    mockPrisma.evalSuite.findUnique.mockResolvedValue(MOCK_SUITE);
    mockPrisma.evalRun.findUnique.mockResolvedValue(MOCK_RUN);
    const res = await GET(makeRequest(), makeParams());
    const text = await res.text();
    expect(text).toContain("geography; basic");
  });

  it("handles empty assertions array with single row per case", async () => {
    const runNoAssertions = {
      ...MOCK_RUN,
      results: [
        {
          ...MOCK_RUN.results[0],
          assertions: [],
        },
      ],
    };
    mockPrisma.evalSuite.findUnique.mockResolvedValue(MOCK_SUITE);
    mockPrisma.evalRun.findUnique.mockResolvedValue(runNoAssertions);
    const res = await GET(makeRequest(), makeParams());
    const text = await res.text();
    const lines = text.split("\r\n").filter((l) => l.length > 0);
    // 1 header + 1 case row
    expect(lines.length).toBe(2);
  });

  it("handles unicode characters in agent output", async () => {
    const runWithUnicode = {
      ...MOCK_RUN,
      results: [
        {
          ...MOCK_RUN.results[0],
          agentOutput: "Pariž je главный город Франции 🇫🇷",
          assertions: [{ type: "contains", passed: true, score: 1.0, message: "ok" }],
        },
      ],
    };
    mockPrisma.evalSuite.findUnique.mockResolvedValue(MOCK_SUITE);
    mockPrisma.evalRun.findUnique.mockResolvedValue(runWithUnicode);
    const res = await GET(makeRequest(), makeParams());
    const text = await res.text();
    expect(text).toContain("Pariž");
    expect(text).toContain("🇫🇷");
  });
});
