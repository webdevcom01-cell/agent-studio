import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Mocks (factory pattern — no top-level variable references) ───────────────

vi.mock("@/lib/prisma", () => ({
  prisma: {
    evalSuite: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    evalTestCase: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
    },
    evalRun: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    evalResult: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
vi.mock("@/lib/api/auth-guard", () => ({
  requireAgentOwner: vi.fn().mockResolvedValue({ userId: "user-1", agentId: "agent-1" }),
  isAuthError: vi.fn().mockReturnValue(false),
}));
vi.mock("@/lib/evals/runner", () => ({
  runEvalSuite: vi.fn(),
  failEvalRun: vi.fn(),
}));

// Import mocked prisma for assertion access
import { prisma } from "@/lib/prisma";
const db = prisma as unknown as {
  evalSuite: Record<string, ReturnType<typeof vi.fn>>;
  evalTestCase: Record<string, ReturnType<typeof vi.fn>>;
  evalRun: Record<string, ReturnType<typeof vi.fn>>;
  evalResult: Record<string, ReturnType<typeof vi.fn>>;
  $transaction: ReturnType<typeof vi.fn>;
};

import { GET as listSuites, POST as createSuite } from "../route";
import { GET as getSuite, PATCH as updateSuite, DELETE as deleteSuite } from "../[suiteId]/route";
import { GET as listCases, POST as createCase, DELETE as deleteCase } from "../[suiteId]/cases/route";
import { GET as listRuns, POST as triggerRun } from "../[suiteId]/run/route";
import { GET as getRunDetail } from "../[suiteId]/run/[runId]/route";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const AGENT_ID = "agent-1";
const SUITE_ID = "suite-1";
const RUN_ID = "run-1";

function makeReq(url: string, opts: { method?: string; body?: unknown } = {}): NextRequest {
  return new NextRequest(`http://localhost:3000${url}`, {
    method: opts.method ?? "GET",
    ...(opts.body
      ? { body: JSON.stringify(opts.body), headers: { "Content-Type": "application/json" } }
      : {}),
  });
}

const agentParams = { params: Promise.resolve({ agentId: AGENT_ID }) };
const suiteParams = { params: Promise.resolve({ agentId: AGENT_ID, suiteId: SUITE_ID }) };
const runParams = { params: Promise.resolve({ agentId: AGENT_ID, suiteId: SUITE_ID, runId: RUN_ID }) };

const mockSuite = {
  id: SUITE_ID,
  name: "Smoke Tests",
  description: "Basic smoke tests",
  agentId: AGENT_ID,
  isDefault: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  _count: { testCases: 2, runs: 1 },
  runs: [
    {
      id: RUN_ID,
      status: "COMPLETED",
      score: 0.9,
      passedCases: 9,
      failedCases: 1,
      totalCases: 10,
      createdAt: new Date(),
    },
  ],
};

beforeEach(() => vi.clearAllMocks());

// ─── GET /evals ───────────────────────────────────────────────────────────────

describe("GET /api/agents/[agentId]/evals", () => {
  it("returns list of suites with counts", async () => {
    db.evalSuite.findMany.mockResolvedValue([mockSuite]);

    const res = await listSuites(makeReq(`/api/agents/${AGENT_ID}/evals`), agentParams);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe("Smoke Tests");
    expect(body.data[0].testCaseCount).toBe(2);
    expect(body.data[0].lastRun?.status).toBe("COMPLETED");
  });

  it("returns empty array when no suites exist", async () => {
    db.evalSuite.findMany.mockResolvedValue([]);

    const res = await listSuites(makeReq(`/api/agents/${AGENT_ID}/evals`), agentParams);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toEqual([]);
  });
});

// ─── POST /evals ──────────────────────────────────────────────────────────────

describe("POST /api/agents/[agentId]/evals", () => {
  it("creates a new eval suite", async () => {
    db.evalSuite.count.mockResolvedValue(0);
    db.evalSuite.create.mockResolvedValue({ ...mockSuite, _count: { testCases: 0, runs: 0 } });

    const res = await createSuite(
      makeReq(`/api/agents/${AGENT_ID}/evals`, { method: "POST", body: { name: "Smoke Tests" } }),
      agentParams,
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.name).toBe("Smoke Tests");
  });

  it("rejects missing name with 400", async () => {
    db.evalSuite.count.mockResolvedValue(0);

    const res = await createSuite(
      makeReq(`/api/agents/${AGENT_ID}/evals`, { method: "POST", body: { description: "no name" } }),
      agentParams,
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it("rejects when 20 suites already exist", async () => {
    db.evalSuite.count.mockResolvedValue(20);

    const res = await createSuite(
      makeReq(`/api/agents/${AGENT_ID}/evals`, { method: "POST", body: { name: "One More" } }),
      agentParams,
    );
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.error).toMatch(/Maximum/);
  });

  it("clears previous default when creating a new default suite", async () => {
    db.evalSuite.count.mockResolvedValue(0);
    db.evalSuite.updateMany.mockResolvedValue({ count: 1 });
    db.evalSuite.create.mockResolvedValue({ ...mockSuite, isDefault: true, _count: { testCases: 0, runs: 0 } });

    await createSuite(
      makeReq(`/api/agents/${AGENT_ID}/evals`, { method: "POST", body: { name: "Default Suite", isDefault: true } }),
      agentParams,
    );

    expect(db.evalSuite.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ agentId: AGENT_ID, isDefault: true }) }),
    );
  });
});

// ─── GET /evals/[suiteId] ─────────────────────────────────────────────────────

describe("GET /api/agents/[agentId]/evals/[suiteId]", () => {
  it("returns suite detail with test cases", async () => {
    db.evalSuite.findUnique.mockResolvedValue({ ...mockSuite, testCases: [], runs: [] });

    const res = await getSuite(makeReq(`/api/agents/${AGENT_ID}/evals/${SUITE_ID}`), suiteParams);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(SUITE_ID);
    expect(body.data.testCases).toEqual([]);
  });

  it("returns 404 when suite not found", async () => {
    db.evalSuite.findUnique.mockResolvedValue(null);

    const res = await getSuite(makeReq(`/api/agents/${AGENT_ID}/evals/nonexistent`), suiteParams);
    expect(res.status).toBe(404);
  });
});

// ─── PATCH /evals/[suiteId] ───────────────────────────────────────────────────

describe("PATCH /api/agents/[agentId]/evals/[suiteId]", () => {
  it("updates suite name and returns updated data", async () => {
    db.evalSuite.findUnique.mockResolvedValue(mockSuite);
    db.evalSuite.update.mockResolvedValue({ ...mockSuite, name: "Regression Tests" });

    const res = await updateSuite(
      makeReq(`/api/agents/${AGENT_ID}/evals/${SUITE_ID}`, { method: "PATCH", body: { name: "Regression Tests" } }),
      suiteParams,
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.name).toBe("Regression Tests");
  });

  it("returns 404 when suite not found", async () => {
    db.evalSuite.findUnique.mockResolvedValue(null);

    const res = await updateSuite(
      makeReq(`/api/agents/${AGENT_ID}/evals/${SUITE_ID}`, { method: "PATCH", body: { name: "X" } }),
      suiteParams,
    );
    expect(res.status).toBe(404);
  });
});

// ─── DELETE /evals/[suiteId] ──────────────────────────────────────────────────

describe("DELETE /api/agents/[agentId]/evals/[suiteId]", () => {
  it("deletes the suite and returns null", async () => {
    db.evalSuite.findUnique.mockResolvedValue(mockSuite);
    db.evalSuite.delete.mockResolvedValue(mockSuite);

    const res = await deleteSuite(makeReq(`/api/agents/${AGENT_ID}/evals/${SUITE_ID}`), suiteParams);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toBeNull();
    expect(db.evalSuite.delete).toHaveBeenCalledWith({ where: { id: SUITE_ID } });
  });

  it("returns 404 when suite not found", async () => {
    db.evalSuite.findUnique.mockResolvedValue(null);

    const res = await deleteSuite(makeReq(`/api/agents/${AGENT_ID}/evals/${SUITE_ID}`), suiteParams);
    expect(res.status).toBe(404);
  });
});

// ─── POST /evals/[suiteId]/cases ──────────────────────────────────────────────

describe("POST /api/agents/[agentId]/evals/[suiteId]/cases", () => {
  const validCase = {
    label: "Greeting test",
    input: "Hello",
    assertions: [{ type: "contains", value: "hi" }],
  };

  it("creates a test case with 201", async () => {
    db.evalSuite.findUnique.mockResolvedValue(mockSuite);
    db.evalTestCase.count.mockResolvedValue(3);
    db.evalTestCase.aggregate.mockResolvedValue({ _max: { order: 2 } });
    db.evalTestCase.create.mockResolvedValue({
      id: "case-1",
      suiteId: SUITE_ID,
      label: "Greeting test",
      input: "Hello",
      assertions: [{ type: "contains", value: "hi" }],
      order: 3,
      tags: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    db.evalSuite.update.mockResolvedValue(mockSuite);

    const res = await createCase(
      makeReq(`/api/agents/${AGENT_ID}/evals/${SUITE_ID}/cases`, { method: "POST", body: validCase }),
      suiteParams,
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.data.label).toBe("Greeting test");
    expect(body.data.order).toBe(3);
  });

  it("rejects missing input field", async () => {
    db.evalSuite.findUnique.mockResolvedValue(mockSuite);
    db.evalTestCase.count.mockResolvedValue(0);

    const res = await createCase(
      makeReq(`/api/agents/${AGENT_ID}/evals/${SUITE_ID}/cases`, { method: "POST", body: { label: "No input" } }),
      suiteParams,
    );
    expect(res.status).toBe(400);
  });

  it("enforces 50-case limit with 422", async () => {
    db.evalSuite.findUnique.mockResolvedValue(mockSuite);
    db.evalTestCase.count.mockResolvedValue(50);

    const res = await createCase(
      makeReq(`/api/agents/${AGENT_ID}/evals/${SUITE_ID}/cases`, { method: "POST", body: validCase }),
      suiteParams,
    );
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/Maximum/);
  });

  it("returns 404 when suite not found", async () => {
    db.evalSuite.findUnique.mockResolvedValue(null);

    const res = await createCase(
      makeReq(`/api/agents/${AGENT_ID}/evals/${SUITE_ID}/cases`, { method: "POST", body: validCase }),
      suiteParams,
    );
    expect(res.status).toBe(404);
  });
});

// ─── DELETE /evals/[suiteId]/cases ───────────────────────────────────────────

describe("DELETE /api/agents/[agentId]/evals/[suiteId]/cases", () => {
  it("deletes an existing test case", async () => {
    db.evalSuite.findUnique.mockResolvedValue(mockSuite);
    db.evalTestCase.findUnique.mockResolvedValue({ id: "case-1", suiteId: SUITE_ID });
    db.evalTestCase.delete.mockResolvedValue({});

    const res = await deleteCase(
      makeReq(`/api/agents/${AGENT_ID}/evals/${SUITE_ID}/cases`, { method: "DELETE", body: { id: "case-1" } }),
      suiteParams,
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("returns 404 for nonexistent case", async () => {
    db.evalSuite.findUnique.mockResolvedValue(mockSuite);
    db.evalTestCase.findUnique.mockResolvedValue(null);

    const res = await deleteCase(
      makeReq(`/api/agents/${AGENT_ID}/evals/${SUITE_ID}/cases`, { method: "DELETE", body: { id: "nope" } }),
      suiteParams,
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 when case ID is missing", async () => {
    db.evalSuite.findUnique.mockResolvedValue(mockSuite);

    const res = await deleteCase(
      makeReq(`/api/agents/${AGENT_ID}/evals/${SUITE_ID}/cases`, { method: "DELETE", body: {} }),
      suiteParams,
    );
    expect(res.status).toBe(400);
  });
});

// ─── GET /evals/[suiteId]/run ─────────────────────────────────────────────────

describe("GET /api/agents/[agentId]/evals/[suiteId]/run", () => {
  it("returns paginated run history", async () => {
    db.evalSuite.findUnique.mockResolvedValue({ id: SUITE_ID });
    db.evalRun.findMany.mockResolvedValue([
      { id: RUN_ID, status: "COMPLETED", score: 0.9, passedCases: 9, failedCases: 1, totalCases: 10, durationMs: 3000, triggeredBy: "manual", errorMessage: null, createdAt: new Date(), completedAt: new Date() },
    ]);
    db.evalRun.count.mockResolvedValue(1);

    const res = await listRuns(makeReq(`/api/agents/${AGENT_ID}/evals/${SUITE_ID}/run`), suiteParams);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.runs).toHaveLength(1);
    expect(body.data.total).toBe(1);
    expect(body.data.runs[0].score).toBe(0.9);
  });

  it("returns 404 when suite not found", async () => {
    db.evalSuite.findUnique.mockResolvedValue(null);

    const res = await listRuns(makeReq(`/api/agents/${AGENT_ID}/evals/${SUITE_ID}/run`), suiteParams);
    expect(res.status).toBe(404);
  });
});

// ─── POST /evals/[suiteId]/run ────────────────────────────────────────────────

describe("POST /api/agents/[agentId]/evals/[suiteId]/run", () => {
  it("returns 422 on empty suite (no test cases)", async () => {
    db.evalSuite.findUnique.mockResolvedValue({ ...mockSuite, _count: { testCases: 0 } });

    const res = await triggerRun(
      makeReq(`/api/agents/${AGENT_ID}/evals/${SUITE_ID}/run`, { method: "POST" }),
      suiteParams,
    );
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.error).toMatch(/empty/i);
  });

  it("returns 409 when a run is already in progress", async () => {
    db.evalSuite.findUnique.mockResolvedValue({ ...mockSuite, _count: { testCases: 5 } });
    db.evalRun.count.mockResolvedValue(1); // 1 active run

    const res = await triggerRun(
      makeReq(`/api/agents/${AGENT_ID}/evals/${SUITE_ID}/run`, { method: "POST" }),
      suiteParams,
    );
    expect(res.status).toBe(409);
  });

  it("returns 404 when suite not found", async () => {
    db.evalSuite.findUnique.mockResolvedValue(null);

    const res = await triggerRun(
      makeReq(`/api/agents/${AGENT_ID}/evals/${SUITE_ID}/run`, { method: "POST" }),
      suiteParams,
    );
    expect(res.status).toBe(404);
  });
});

// ─── GET /evals/[suiteId]/run/[runId] ────────────────────────────────────────

describe("GET /api/agents/[agentId]/evals/[suiteId]/run/[runId]", () => {
  it("returns full run detail with results", async () => {
    db.evalSuite.findUnique.mockResolvedValue({ id: SUITE_ID, name: "Smoke Tests" });
    db.evalRun.findUnique.mockResolvedValue({
      id: RUN_ID,
      suiteId: SUITE_ID,
      status: "COMPLETED",
      score: 0.9,
      passedCases: 9,
      failedCases: 1,
      totalCases: 10,
      durationMs: 3000,
      triggeredBy: "manual",
      errorMessage: null,
      createdAt: new Date(),
      completedAt: new Date(),
      results: [
        {
          id: "result-1",
          status: "PASSED",
          agentOutput: "Hello!",
          score: 1.0,
          latencyMs: 300,
          assertions: [{ type: "contains", passed: true, score: 1, message: "ok" }],
          tokensUsed: null,
          errorMessage: null,
          createdAt: new Date(),
          testCase: { id: "case-1", label: "Greeting", input: "Hi", tags: [], order: 0 },
        },
      ],
    });

    const res = await getRunDetail(makeReq(`/api/agents/${AGENT_ID}/evals/${SUITE_ID}/run/${RUN_ID}`), runParams);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.id).toBe(RUN_ID);
    expect(body.data.suiteName).toBe("Smoke Tests");
    expect(body.data.results).toHaveLength(1);
    expect(body.data.results[0].testCase.label).toBe("Greeting");
    expect(body.data.results[0].agentOutput).toBe("Hello!");
  });

  it("returns 404 when run not found", async () => {
    db.evalSuite.findUnique.mockResolvedValue({ id: SUITE_ID, name: "Smoke" });
    db.evalRun.findUnique.mockResolvedValue(null);

    const res = await getRunDetail(makeReq(`/api/agents/${AGENT_ID}/evals/${SUITE_ID}/run/nope`), runParams);
    expect(res.status).toBe(404);
  });

  it("returns 404 when suite not found", async () => {
    db.evalSuite.findUnique.mockResolvedValue(null);

    const res = await getRunDetail(makeReq(`/api/agents/${AGENT_ID}/evals/${SUITE_ID}/run/${RUN_ID}`), runParams);
    expect(res.status).toBe(404);
  });
});
