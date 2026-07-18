/**
 * Tests for eval regression alerting (src/lib/evals/regression-alert.ts) — B6/G2.
 *
 * alertOnEvalRegression() compares a freshly-completed run's score against the
 * previous COMPLETED run for the same suite and, on a regression (delta >= DELTA)
 * or an edge-triggered floor breach (score < FLOOR and previous was >= FLOOR, or
 * no baseline), delivers a warning via the notifications module (Slack renderer +
 * webhook sink). It is fail-safe: it never throws.
 *
 * Defaults under test: DELTA = 0.15, FLOOR = 0.5.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Hoisted mock fns ───────────────────────────────────────────────────────

const { deliverMock, renderMock, findFirstMock, findUniqueMock } = vi.hoisted(() => ({
  deliverMock: vi.fn(),
  renderMock: vi.fn(),
  findFirstMock: vi.fn(),
  findUniqueMock: vi.fn(),
}));

// ─── Mocks (before importing the module under test) ─────────────────────────

vi.mock("@/lib/api/tenant-context", () => ({
  withAdminBypass: vi.fn(
    (fn: (db: unknown) => Promise<unknown>) =>
      fn({
        evalRun: { findFirst: findFirstMock },
        agent: { findUnique: findUniqueMock },
      }),
  ),
}));

vi.mock("@/lib/notifications", () => ({
  getSink: () => ({ name: "webhook", deliver: deliverMock }),
  getRenderer: () => ({ name: "slack", render: renderMock }),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ─── Imports (after mocks) ──────────────────────────────────────────────────

import { logger } from "@/lib/logger";
import { alertOnEvalRegression } from "../regression-alert";

const mockLogger = logger as unknown as { error: ReturnType<typeof vi.fn> };

interface CapturedInput {
  level: string;
  meta: { reasons: string[]; previousScore: number | null; currentScore: number };
}

function lastRenderInput(): CapturedInput {
  return renderMock.mock.calls[renderMock.mock.calls.length - 1][0] as CapturedInput;
}

const BASE = {
  suiteId: "suite_1",
  suiteName: "HW Quality Gate",
  agentId: "agent_1",
  runId: "run_current",
} as const;

describe("alertOnEvalRegression", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NOTIFICATION_WEBHOOK_URL", "https://hooks.test/webhook");
    vi.stubEnv("EVAL_ALERTS_ENABLED", "true");
    vi.stubEnv("EVAL_REGRESSION_THRESHOLD", "");
    vi.stubEnv("EVAL_REGRESSION_FLOOR", "");
    findUniqueMock.mockResolvedValue({ name: "Test Agent" });
    deliverMock.mockResolvedValue({ success: true, channel: "webhook" });
    renderMock.mockImplementation((input: unknown) => ({
      text: "rendered",
      body: {},
      level: (input as { level: string }).level,
    }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("regression: prev 1.0 → current 0.7 (Δ0.3) delivers one alert", async () => {
    findFirstMock.mockResolvedValue({ score: 1.0 });

    await alertOnEvalRegression({ ...BASE, score: 0.7 });

    expect(deliverMock).toHaveBeenCalledTimes(1);
    const input = lastRenderInput();
    expect(input.level).toBe("warning");
    expect(input.meta.reasons).toContain("regression");
    expect(input.meta.previousScore).toBe(1.0);
    expect(input.meta.currentScore).toBe(0.7);
  });

  it("stable: prev 1.0 → current 1.0 (Δ0) does not alert", async () => {
    findFirstMock.mockResolvedValue({ score: 1.0 });

    await alertOnEvalRegression({ ...BASE, score: 1.0 });

    expect(deliverMock).not.toHaveBeenCalled();
  });

  it("floor breach (edge): prev 0.9 → current 0.4 delivers one alert", async () => {
    findFirstMock.mockResolvedValue({ score: 0.9 });

    await alertOnEvalRegression({ ...BASE, score: 0.4 });

    expect(deliverMock).toHaveBeenCalledTimes(1);
    expect(lastRenderInput().meta.reasons).toContain("floor_breach");
  });

  it("floor already breached: prev 0.4 → current 0.3 does not re-alert", async () => {
    findFirstMock.mockResolvedValue({ score: 0.4 });

    await alertOnEvalRegression({ ...BASE, score: 0.3 });

    expect(deliverMock).not.toHaveBeenCalled();
  });

  it("bad first run: no baseline → current 0.4 alerts on floor breach", async () => {
    findFirstMock.mockResolvedValue(null);

    await alertOnEvalRegression({ ...BASE, score: 0.4 });

    expect(deliverMock).toHaveBeenCalledTimes(1);
    expect(lastRenderInput().meta.reasons).toContain("floor_breach");
  });

  it("first run OK: no baseline → current 1.0 does not alert", async () => {
    findFirstMock.mockResolvedValue(null);

    await alertOnEvalRegression({ ...BASE, score: 1.0 });

    expect(deliverMock).not.toHaveBeenCalled();
  });

  it("both reasons: prev 0.6 → current 0.45 delivers one alert with both reasons", async () => {
    findFirstMock.mockResolvedValue({ score: 0.6 });

    await alertOnEvalRegression({ ...BASE, score: 0.45 });

    expect(deliverMock).toHaveBeenCalledTimes(1);
    const reasons = lastRenderInput().meta.reasons;
    expect(reasons).toContain("regression");
    expect(reasons).toContain("floor_breach");
  });

  it("fail-safe: baseline query throws → does not throw, logs error, no delivery", async () => {
    findFirstMock.mockRejectedValue(new Error("db down"));

    await expect(alertOnEvalRegression({ ...BASE, score: 0.7 })).resolves.toBeUndefined();

    expect(deliverMock).not.toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalled();
  });

  it("kill-switch: EVAL_ALERTS_ENABLED=false skips everything", async () => {
    vi.stubEnv("EVAL_ALERTS_ENABLED", "false");
    findFirstMock.mockResolvedValue({ score: 1.0 });

    await alertOnEvalRegression({ ...BASE, score: 0.1 });

    expect(findFirstMock).not.toHaveBeenCalled();
    expect(deliverMock).not.toHaveBeenCalled();
  });
});
