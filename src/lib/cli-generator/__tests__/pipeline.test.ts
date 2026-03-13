import { describe, it, expect, vi, beforeEach } from "vitest";
import { createInitialPhases } from "../pipeline";
import { PIPELINE_PHASES, PHASE_COUNT } from "../types";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    cLIGeneration: {
      update: vi.fn().mockResolvedValue({}),
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

import { prisma } from "@/lib/prisma";
const mockUpdate = vi.mocked(prisma.cLIGeneration.update);

describe("pipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createInitialPhases", () => {
    it("returns correct number of phases", () => {
      const phases = createInitialPhases();
      expect(phases).toHaveLength(PHASE_COUNT);
    });

    it("all phases start as pending", () => {
      const phases = createInitialPhases();
      for (const phase of phases) {
        expect(phase.status).toBe("pending");
      }
    });

    it("phases have sequential numbers", () => {
      const phases = createInitialPhases();
      phases.forEach((phase, i) => {
        expect(phase.phase).toBe(i);
      });
    });

    it("phase names match PIPELINE_PHASES", () => {
      const phases = createInitialPhases();
      PIPELINE_PHASES.forEach(({ phase, name }) => {
        expect(phases[phase].name).toBe(name);
      });
    });
  });

  describe("runPipeline", () => {
    it("runs all phases to completion", async () => {
      const { runPipeline } = await import("../pipeline");

      const result = await runPipeline("gen-1", {
        applicationName: "TestApp",
        capabilities: ["render", "export"],
      });

      expect(result.status).toBe("COMPLETED");
      expect(result.currentPhase).toBe(PHASE_COUNT - 1);
      expect(result.phases).toHaveLength(PHASE_COUNT);
      for (const phase of result.phases) {
        expect(phase.status).toBe("completed");
        expect(phase.startedAt).toBeDefined();
        expect(phase.completedAt).toBeDefined();
      }
    });

    it("updates prisma at each phase", async () => {
      const { runPipeline } = await import("../pipeline");

      await runPipeline("gen-2", {
        applicationName: "Blender",
      });

      // Called once per phase (running) + final completion
      expect(mockUpdate.mock.calls.length).toBeGreaterThanOrEqual(PHASE_COUNT);
    });

    it("generates cliConfig on completion", async () => {
      const { runPipeline } = await import("../pipeline");

      const result = await runPipeline("gen-3", {
        applicationName: "GIMP",
        capabilities: ["convert", "resize"],
      });

      expect(result.cliConfig).toBeDefined();
    });

    it("handles config with no capabilities", async () => {
      const { runPipeline } = await import("../pipeline");

      const result = await runPipeline("gen-4", {
        applicationName: "CustomApp",
      });

      expect(result.status).toBe("COMPLETED");
      expect(result.cliConfig).toBeDefined();
    });

    it("includes platform in analysis", async () => {
      const { runPipeline } = await import("../pipeline");

      const result = await runPipeline("gen-5", {
        applicationName: "MacApp",
        platform: "macos",
      });

      const analysisPhase = result.phases[0];
      expect(analysisPhase.status).toBe("completed");
      const output = analysisPhase.output as Record<string, unknown>;
      expect(output.platform).toBe("macos");
    });
  });

  describe("PIPELINE_PHASES", () => {
    it("has 7 phases", () => {
      expect(PIPELINE_PHASES).toHaveLength(7);
    });

    it("first phase is analyze", () => {
      expect(PIPELINE_PHASES[0].name).toBe("analyze");
    });

    it("last phase is publish", () => {
      expect(PIPELINE_PHASES[6].name).toBe("publish");
    });
  });
});
