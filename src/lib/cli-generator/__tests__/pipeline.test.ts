/**
 * Tests for pipeline utilities now living in types.ts.
 * runPipeline() was removed in the Phase 7 dead-code cleanup — the per-phase
 * /advance architecture replaced it.  These tests cover the remaining exported
 * helpers that are still used by the production code.
 */
import { describe, it, expect } from "vitest";
import { createInitialPhases } from "../types";
import { PIPELINE_PHASES, PHASE_COUNT } from "../types";

describe("pipeline", () => {
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

  describe("PIPELINE_PHASES", () => {
    it("has 6 phases", () => {
      expect(PIPELINE_PHASES).toHaveLength(6);
    });

    it("first phase is analyze", () => {
      expect(PIPELINE_PHASES[0].name).toBe("analyze");
    });

    it("last phase is publish", () => {
      expect(PIPELINE_PHASES[5].name).toBe("publish");
    });
  });
});
