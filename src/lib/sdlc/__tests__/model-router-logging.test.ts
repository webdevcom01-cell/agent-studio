/**
 * Fix 3: Model router fallback logging
 *
 * Verifies that resolveStepModel, getEscalationModel, and resolveStepModelAdaptive
 * emit logger.info when a fallback or escalation occurs, so operators can detect
 * misconfigured or missing API keys in production logs.
 *
 * Before fix: silent fallback — no log entry when primary model is unavailable.
 * After fix:  logger.info is emitted with phase, stepId, requested, and resolved model.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — hoisted before imports
// ---------------------------------------------------------------------------

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

const mockFindMany = vi.hoisted(() => vi.fn().mockResolvedValue([]));

vi.mock("@/lib/logger", () => ({ logger: mockLogger }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    modelPerformanceStat: {
      findMany: mockFindMany,
    },
  },
}));

// Controlled model catalog — makes availability deterministic regardless of
// what models.ts contains or which API keys are set on the developer's machine.
vi.mock("@/lib/models", () => ({
  ALL_MODELS: [
    { id: "gpt-4.1",           envKey: "OPENAI_API_KEY" },
    { id: "gpt-4o",            envKey: "OPENAI_API_KEY" },
    { id: "gpt-4o-mini",       envKey: undefined },       // always available
    { id: "gpt-4.1-mini",      envKey: "OPENAI_API_KEY" },
    { id: "deepseek-chat",     envKey: undefined },       // always available
    { id: "deepseek-reasoner", envKey: undefined },       // always available
    { id: "o4-mini",           envKey: undefined },       // always available
    { id: "claude-sonnet-4-6", envKey: "ANTHROPIC_API_KEY" },
  ],
}));

// ---------------------------------------------------------------------------
// Import under test (after mocks)
// ---------------------------------------------------------------------------

import { resolveStepModel, getEscalationModel, resolveStepModelAdaptive } from "../model-router";

// ---------------------------------------------------------------------------
// Shared setup — clear mocks and ensure env is clean before every test.
// vi.unstubAllEnvs() only restores previously-stubbed values; it does NOT
// remove real process.env vars. Explicitly stubbing to "" prevents the
// developer's local API keys from leaking into tests.
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  mockFindMany.mockResolvedValue([]);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Fix 3 — model router fallback logging", () => {
  // ─── resolveStepModel ─────────────────────────────────────────────────────

  describe("resolveStepModel", () => {
    it("does NOT log when the primary candidate is directly available", () => {
      // gpt-4.1 is first in implementation priority; stub OPENAI_API_KEY → available
      vi.stubEnv("OPENAI_API_KEY", "sk-test");

      const result = resolveStepModel("implementation", {}, "ecc-impl", "deepseek-chat", true);

      expect(result).toBe("gpt-4.1");
      expect(mockLogger.info).not.toHaveBeenCalled();
    });

    it("logs when falling back to a secondary candidate (primary key missing)", () => {
      // OPENAI_API_KEY="" (set in beforeEach) → gpt-4.1 (idx 0) and gpt-4o (idx 1) unavailable
      // gpt-4o-mini (idx 2) has no envKey → always available → fallback fires

      const result = resolveStepModel("implementation", {}, "ecc-impl", "deepseek-chat", true);

      expect(result).toBe("gpt-4o-mini");
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("fallback"),
        expect.objectContaining({
          phase: "implementation",
          stepId: "ecc-impl",
          requested: "gpt-4.1",
          resolved: "gpt-4o-mini",
        }),
      );
    });

    it("does NOT log when a step override is used (explicit choice, not a fallback)", () => {
      const result = resolveStepModel(
        "implementation",
        { "ecc-impl": "my-custom-model" },
        "ecc-impl",
        "deepseek-chat",
        true,
      );

      expect(result).toBe("my-custom-model");
      expect(mockLogger.info).not.toHaveBeenCalled();
    });

    it("does NOT log when useSmartRouting=false and phase is not implementation", () => {
      // planning + useSmartRouting=false → condition is false → skips priority list silently
      const result = resolveStepModel("planning", {}, "ecc-plan", "deepseek-chat", false);

      expect(result).toBe("deepseek-chat");
      expect(mockLogger.info).not.toHaveBeenCalled();
    });
  });

  // ─── getEscalationModel ───────────────────────────────────────────────────

  describe("getEscalationModel", () => {
    it("does NOT log on attempt <= 1 (first retry keeps same model)", () => {
      const result = getEscalationModel("implementation", "gpt-4.1", 1);

      expect(result).toBe("gpt-4.1");
      expect(mockLogger.info).not.toHaveBeenCalled();
    });

    it("logs when model escalates to a different candidate on attempt 2", () => {
      // OPENAI_API_KEY set → gpt-4.1 (idx 0) and gpt-4o (idx 1) both available
      // currentModelId = "gpt-4.1" (idx 0), attempt 2 → targetIdx = 1 → "gpt-4o"
      vi.stubEnv("OPENAI_API_KEY", "sk-test");

      const result = getEscalationModel("implementation", "gpt-4.1", 2);

      expect(result).toBe("gpt-4o");
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("escalat"),
        expect.objectContaining({
          phase: "implementation",
          attempt: 2,
          from: "gpt-4.1",
          to: "gpt-4o",
        }),
      );
    });
  });

  // ─── resolveStepModelAdaptive ─────────────────────────────────────────────

  describe("resolveStepModelAdaptive", () => {
    it("logs info when DB has no qualifying stats and static fallback is used", async () => {
      // mockFindMany returns [] → no qualifying stats → static priority
      // OPENAI_API_KEY="" → gpt-4o-mini (no envKey) is first available in implementation

      const result = await resolveStepModelAdaptive(
        "implementation",
        {},
        "ecc-impl",
        "deepseek-chat",
      );

      expect(result).toBe("gpt-4o-mini");
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("static"),
        expect.objectContaining({ phase: "implementation" }),
      );
    });

    it("does NOT log info when DB provides a model that meets the threshold", async () => {
      // deepseek-chat has no envKey → always available; success rate 80% >= 60%
      mockFindMany.mockResolvedValueOnce([
        {
          modelId: "deepseek-chat",
          phase: "implementation",
          runCount: 10,
          successCount: 8,
          totalInputTokens: 5000,
        },
      ]);

      const result = await resolveStepModelAdaptive(
        "implementation",
        {},
        "ecc-impl",
        "deepseek-chat",
      );

      expect(result).toBe("deepseek-chat");
      expect(mockLogger.info).not.toHaveBeenCalled();
    });
  });
});
