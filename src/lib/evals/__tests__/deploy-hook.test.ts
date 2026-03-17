/**
 * Tests for the deploy hook (src/lib/evals/deploy-hook.ts).
 *
 * The hook is fire-and-forget: triggerDeployEvals() returns void and kicks
 * off an async background process.  We flush microtasks with flushPromises()
 * to observe side-effects synchronously inside tests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Mock prisma BEFORE importing the module under test
vi.mock("@/lib/prisma", () => ({
  prisma: {
    evalSuite: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../runner", () => ({
  runEvalSuite: vi.fn(),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { runEvalSuite } from "../runner";
import { triggerDeployEvals } from "../deploy-hook";

// Typed access to the mocked modules
const db = prisma as unknown as {
  evalSuite: { findMany: ReturnType<typeof vi.fn> };
};
const mockLogger = logger as unknown as {
  info: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
};
const mockRunEvalSuite = runEvalSuite as ReturnType<typeof vi.fn>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Flush all pending microtasks so fire-and-forget work completes. */
function flushPromises(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

const BASE_URL = "https://example.com";
const AGENT_ID = "agent-abc";
const OPTIONS = { baseUrl: BASE_URL, authHeader: "authjs.session-token=tok" };

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("triggerDeployEvals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns void immediately without awaiting suite execution", async () => {
    // Make findMany hang forever to prove we don't wait for it
    db.evalSuite.findMany.mockReturnValue(new Promise(() => {}));

    const result = triggerDeployEvals(AGENT_ID, OPTIONS);
    expect(result).toBeUndefined();
    // runEvalSuite should NOT have been called yet (still fetching suites)
    expect(mockRunEvalSuite).not.toHaveBeenCalled();
  });

  it("runs nothing and logs when no suites have runOnDeploy: true", async () => {
    db.evalSuite.findMany.mockResolvedValue([]);

    triggerDeployEvals(AGENT_ID, OPTIONS);
    await flushPromises();

    expect(mockRunEvalSuite).not.toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenCalledWith(
      "deploy-hook: no eligible suites to run",
      expect.objectContaining({ agentId: AGENT_ID })
    );
  });

  it("skips suites that have 0 test cases", async () => {
    db.evalSuite.findMany.mockResolvedValue([
      { id: "suite-1", name: "Empty Suite", _count: { testCases: 0 } },
    ]);

    triggerDeployEvals(AGENT_ID, OPTIONS);
    await flushPromises();

    expect(mockRunEvalSuite).not.toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenCalledWith(
      "deploy-hook: no eligible suites to run",
      expect.objectContaining({ agentId: AGENT_ID })
    );
  });

  it("calls runEvalSuite for each eligible suite with correct options", async () => {
    const suites = [
      { id: "suite-1", name: "Smoke Tests", _count: { testCases: 3 } },
      { id: "suite-2", name: "Regression", _count: { testCases: 5 } },
    ];
    db.evalSuite.findMany.mockResolvedValue(suites);
    mockRunEvalSuite.mockResolvedValue({
      runId: "run-1",
      score: 0.9,
      passedCases: 3,
      failedCases: 0,
      totalCases: 3,
      status: "COMPLETED",
      durationMs: 1000,
      results: [],
    });

    triggerDeployEvals(AGENT_ID, OPTIONS);
    await flushPromises();

    expect(mockRunEvalSuite).toHaveBeenCalledTimes(2);
    expect(mockRunEvalSuite).toHaveBeenCalledWith("suite-1", AGENT_ID, {
      baseUrl: BASE_URL,
      triggeredBy: "deploy",
      authHeader: OPTIONS.authHeader,
    });
    expect(mockRunEvalSuite).toHaveBeenCalledWith("suite-2", AGENT_ID, {
      baseUrl: BASE_URL,
      triggeredBy: "deploy",
      authHeader: OPTIONS.authHeader,
    });
  });

  it("queries suites with runOnDeploy: true filter", async () => {
    db.evalSuite.findMany.mockResolvedValue([]);

    triggerDeployEvals(AGENT_ID, OPTIONS);
    await flushPromises();

    expect(db.evalSuite.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { agentId: AGENT_ID, runOnDeploy: true },
      })
    );
  });

  it("continues running remaining suites when one suite throws", async () => {
    const suites = [
      { id: "suite-fail", name: "Failing Suite", _count: { testCases: 2 } },
      { id: "suite-ok", name: "Good Suite", _count: { testCases: 2 } },
    ];
    db.evalSuite.findMany.mockResolvedValue(suites);
    mockRunEvalSuite
      .mockRejectedValueOnce(new Error("rate limited"))
      .mockResolvedValueOnce({
        runId: "run-2",
        score: 1.0,
        passedCases: 2,
        failedCases: 0,
        totalCases: 2,
        status: "COMPLETED",
        durationMs: 500,
        results: [],
      });

    triggerDeployEvals(AGENT_ID, OPTIONS);
    await flushPromises();

    // Both suites were attempted
    expect(mockRunEvalSuite).toHaveBeenCalledTimes(2);
    // Error was logged for the failing suite
    expect(mockLogger.error).toHaveBeenCalledWith(
      "deploy-hook: suite run failed",
      expect.objectContaining({ suiteId: "suite-fail" })
    );
    // Successful run was also logged
    expect(mockLogger.info).toHaveBeenCalledWith(
      "deploy-hook: suite finished",
      expect.objectContaining({ suiteId: "suite-ok", score: 1.0 })
    );
  });

  it("logs an error and returns when prisma.evalSuite.findMany throws", async () => {
    db.evalSuite.findMany.mockRejectedValue(new Error("DB connection lost"));

    triggerDeployEvals(AGENT_ID, OPTIONS);
    await flushPromises();

    expect(mockRunEvalSuite).not.toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalledWith(
      "deploy-hook: failed to query eval suites",
      expect.objectContaining({ agentId: AGENT_ID })
    );
  });

  it("logs start and finish when suites run successfully", async () => {
    db.evalSuite.findMany.mockResolvedValue([
      { id: "suite-1", name: "Suite A", _count: { testCases: 1 } },
    ]);
    mockRunEvalSuite.mockResolvedValue({
      runId: "run-xyz",
      score: 0.75,
      passedCases: 3,
      failedCases: 1,
      totalCases: 4,
      status: "COMPLETED",
      durationMs: 1200,
      results: [],
    });

    triggerDeployEvals(AGENT_ID, OPTIONS);
    await flushPromises();

    expect(mockLogger.info).toHaveBeenCalledWith(
      "deploy-hook: starting eval runs after deploy",
      expect.objectContaining({ agentId: AGENT_ID, suiteCount: 1 })
    );
    expect(mockLogger.info).toHaveBeenCalledWith(
      "deploy-hook: suite finished",
      expect.objectContaining({
        suiteId: "suite-1",
        runId: "run-xyz",
        score: 0.75,
      })
    );
    expect(mockLogger.info).toHaveBeenCalledWith(
      "deploy-hook: all suites finished",
      expect.objectContaining({ agentId: AGENT_ID, suiteCount: 1 })
    );
  });

  it("works without authHeader (optional field)", async () => {
    db.evalSuite.findMany.mockResolvedValue([
      { id: "suite-1", name: "Suite", _count: { testCases: 2 } },
    ]);
    mockRunEvalSuite.mockResolvedValue({
      runId: "r1", score: 1, passedCases: 2, failedCases: 0,
      totalCases: 2, status: "COMPLETED", durationMs: 100, results: [],
    });

    triggerDeployEvals(AGENT_ID, { baseUrl: BASE_URL });
    await flushPromises();

    expect(mockRunEvalSuite).toHaveBeenCalledWith("suite-1", AGENT_ID, {
      baseUrl: BASE_URL,
      triggeredBy: "deploy",
      authHeader: undefined,
    });
  });

  it("mixes eligible and ineligible suites — only runs eligible ones", async () => {
    db.evalSuite.findMany.mockResolvedValue([
      { id: "suite-empty", name: "Empty", _count: { testCases: 0 } },
      { id: "suite-has-cases", name: "With cases", _count: { testCases: 4 } },
    ]);
    mockRunEvalSuite.mockResolvedValue({
      runId: "r1", score: 0.5, passedCases: 2, failedCases: 2,
      totalCases: 4, status: "COMPLETED", durationMs: 800, results: [],
    });

    triggerDeployEvals(AGENT_ID, OPTIONS);
    await flushPromises();

    expect(mockRunEvalSuite).toHaveBeenCalledTimes(1);
    expect(mockRunEvalSuite).toHaveBeenCalledWith("suite-has-cases", AGENT_ID, expect.anything());
  });
});
