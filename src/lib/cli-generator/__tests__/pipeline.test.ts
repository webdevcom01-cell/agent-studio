import { describe, it, expect, vi, beforeEach } from "vitest";
import { createInitialPhases } from "../pipeline";
import { PIPELINE_PHASES, PHASE_COUNT } from "../types";
import type { AIPhaseOutput } from "../types";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    cLIGeneration: {
      update: vi.fn().mockResolvedValue({ userId: "user-1" }),
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

function makePhaseOutput(data: Record<string, unknown> = {}): AIPhaseOutput {
  return {
    result: { phase: "mock", ...data },
    tokensUsed: { input: 50, output: 100 },
  };
}

function makeFilePhaseOutput(files: Record<string, string>): AIPhaseOutput {
  return {
    result: files,
    generatedFiles: files,
    tokensUsed: { input: 80, output: 150 },
  };
}

vi.mock("../ai-phases", () => ({
  aiAnalyze: vi.fn().mockImplementation(() =>
    Promise.resolve(makePhaseOutput({ detectedCLIPaths: ["/usr/bin/app"] })),
  ),
  aiDesign: vi.fn().mockImplementation(() =>
    Promise.resolve(makePhaseOutput({ commands: [{ name: "app_run" }] })),
  ),
  aiImplement: vi.fn().mockImplementation(() =>
    Promise.resolve(makeFilePhaseOutput({ "main.py": "import click", "bridge.py": "import subprocess" })),
  ),
  aiTest: vi.fn().mockImplementation(() =>
    Promise.resolve(makeFilePhaseOutput({ "test_bridge.py": "def test(): pass" })),
  ),
  aiDocs: vi.fn().mockImplementation(() =>
    Promise.resolve(makeFilePhaseOutput({ "README.md": "# App" })),
  ),
  aiPublish: vi.fn().mockImplementation(() =>
    Promise.resolve({
      result: { mcp_config: { name: "app-mcp" }, "requirements.txt": "click>=8.0" },
      generatedFiles: { "requirements.txt": "click>=8.0" },
      tokensUsed: { input: 60, output: 120 },
    }),
  ),
}));

vi.mock("../mcp-registration", () => ({
  registerCLIBridgeAsMCP: vi.fn().mockResolvedValue({ id: "mcp-1" }),
}));

import { prisma } from "@/lib/prisma";
const mockUpdate = vi.mocked(prisma.cLIGeneration.update);

describe("pipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdate.mockResolvedValue({ userId: "user-1" } as ReturnType<typeof mockUpdate> extends Promise<infer T> ? T : never);
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

      expect(mockUpdate.mock.calls.length).toBeGreaterThanOrEqual(PHASE_COUNT);
    });

    it("accumulates generatedFiles across phases", async () => {
      const { runPipeline } = await import("../pipeline");

      const result = await runPipeline("gen-3", {
        applicationName: "GIMP",
      });

      expect(result.status).toBe("COMPLETED");

      const implementPhase = result.phases[2];
      expect(implementPhase.generatedFiles).toBeDefined();
      expect(implementPhase.generatedFiles?.["main.py"]).toBeDefined();
    });

    it("stores tokensUsed in phase results", async () => {
      const { runPipeline } = await import("../pipeline");

      const result = await runPipeline("gen-4", {
        applicationName: "FFmpeg",
      });

      expect(result.phases[0].tokensUsed).toBeDefined();
      expect(result.phases[0].tokensUsed?.input).toBeGreaterThan(0);
    });

    it("handles AI phase failure gracefully", async () => {
      const { aiAnalyze } = await import("../ai-phases");
      vi.mocked(aiAnalyze).mockRejectedValueOnce(new Error("AI unavailable"));

      const { runPipeline } = await import("../pipeline");

      const result = await runPipeline("gen-fail", {
        applicationName: "FailApp",
      });

      expect(result.status).toBe("FAILED");
      expect(result.phases[0].status).toBe("failed");
      expect(result.phases[0].error).toContain("AI unavailable");
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
