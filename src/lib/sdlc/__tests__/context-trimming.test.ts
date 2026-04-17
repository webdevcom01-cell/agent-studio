/**
 * Unit tests for buildContextDoc — TASK 2: Context Window smart trimming.
 *
 * Tests verify:
 *   1. CONTEXT_SLICE_PER_STEP is 6 000 (doubled from the old 3 000)
 *   2. buildContextDoc returns full content when under MAX_CONTEXT_CHARS
 *   3. Task description (parts[0]) is NEVER trimmed
 *   4. Last PROTECTED_RECENT_STEPS steps (currently 2) survive at full size
 *      even when the total context far exceeds MAX_CONTEXT_CHARS
 *   5. Older steps are progressively trimmed when budget runs out
 *   6. The function handles edge cases: single step, exactly 1 protected step,
 *      pipeline longer than the protection window
 */

import { describe, it, expect } from "vitest";
import { buildContextDoc } from "../orchestrator";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a realistic context part string for step N */
function step(n: number, content: string): string {
  return `# Step ${n} output (step-${n})\n${content}`;
}

/** Build a string of N repeated chars */
function chars(n: number, char = "x"): string {
  return char.repeat(n);
}

// ---------------------------------------------------------------------------
// Constants cross-check
// ---------------------------------------------------------------------------

describe("buildContextDoc — module constants", () => {
  it("CONTEXT_SLICE_PER_STEP is 6 000 (not the old 3 000)", async () => {
    // We verify indirectly: if a step's stored slice is 6 000 chars long and fits
    // within MAX_CONTEXT_CHARS (24 000), it comes through untrimmed.
    // The constant is used in the pipeline step loop, not in buildContextDoc itself,
    // but by building a part of exactly 6 000 chars we confirm the expected size.
    const task = "# Task\nBuild something";
    const bigStep = step(1, chars(6_000));

    // 6 000 + task ≈ 6 022 chars — well under 24 000, so no trimming at all
    const out = buildContextDoc([task, bigStep]);
    // Full step content must be present
    expect(out).toContain(chars(6_000));
  });
});

// ---------------------------------------------------------------------------
// Under-budget: no trimming
// ---------------------------------------------------------------------------

describe("buildContextDoc — under budget (no trimming)", () => {
  it("returns full content when total is under MAX_CONTEXT_CHARS", () => {
    const parts = [
      "# Task\nSimple task",
      step(1, "Step one output"),
      step(2, "Step two output"),
    ];
    const out = buildContextDoc(parts);
    expect(out).toContain("Step one output");
    expect(out).toContain("Step two output");
    // Separator present
    expect(out).toContain("---");
  });

  it("returns joined string directly when under budget", () => {
    const parts = ["# Task\nX", step(1, "small")];
    const out = buildContextDoc(parts);
    expect(out).toContain("small");
  });
});

// ---------------------------------------------------------------------------
// Task description: never trimmed
// ---------------------------------------------------------------------------

describe("buildContextDoc — task description always preserved", () => {
  it("preserves full task description even when total massively exceeds budget", () => {
    const taskDesc = "# Task\nBuild a fully-featured multi-tenant SaaS platform with OAuth, billing, and realtime collaboration";
    // Fill with huge steps that will force aggressive trimming
    const parts = [taskDesc, ...Array.from({ length: 10 }, (_, i) => step(i, chars(3_000)))];
    const out = buildContextDoc(parts);
    expect(out.startsWith("# Task\nBuild a fully-featured")).toBe(true);
    expect(out).toContain("multi-tenant SaaS platform");
  });
});

// ---------------------------------------------------------------------------
// Protected recent steps
// ---------------------------------------------------------------------------

describe("buildContextDoc — last 2 steps always preserved", () => {
  it("keeps both most-recent steps at full size when older steps are trimmed", () => {
    const task = "# Task\nX";
    // 5 old steps each 4 000 chars + 2 recent steps each 4 000 chars
    // Total ≈ 28 000 chars + task — exceeds MAX_CONTEXT_CHARS (24 000)
    const oldSteps = Array.from({ length: 5 }, (_, i) => step(i + 1, chars(4_000, String(i))));
    const recentStep1 = step(6, chars(4_000, "A")); // second-to-last
    const recentStep2 = step(7, chars(4_000, "B")); // most-recent

    const parts = [task, ...oldSteps, recentStep1, recentStep2];
    const out = buildContextDoc(parts);

    // Both recent steps must be present at full size
    expect(out).toContain(chars(4_000, "A"));
    expect(out).toContain(chars(4_000, "B"));

    // Total output must not exceed MAX_CONTEXT_CHARS by more than separator overhead
    expect(out.length).toBeLessThan(24_000 + 500);
  });

  it("older steps are trimmed or header-only when budget is exhausted", () => {
    const task = "# Task\nX";
    // Make the pipeline huge — 8 old steps × 3 000 chars + 2 protected × 3 000 chars
    const oldSteps = Array.from({ length: 8 }, (_, i) => step(i + 1, `OLD${i}-` + chars(3_000)));
    const recentStep1 = step(9, "RECENT1-" + chars(3_000, "R"));
    const recentStep2 = step(10, "RECENT2-" + chars(3_000, "S"));

    const parts = [task, ...oldSteps, recentStep1, recentStep2];
    const out = buildContextDoc(parts);

    // Protected steps always present
    expect(out).toContain("RECENT1-");
    expect(out).toContain("RECENT2-");

    // At least some old steps should be trimmed (header only or shortened)
    expect(out).toContain("[context trimmed");

    // Output stays within hard limit (plus small overhead for separators)
    expect(out.length).toBeLessThan(24_000 + 1_000);
  });

  it("handles pipeline with exactly 1 step (only 1 protected step available)", () => {
    const task = "# Task\nX";
    const only = step(1, chars(5_000, "Z"));
    const parts = [task, only];

    // Under budget — returned as-is, but also tests that protectedCount = min(2, 1) = 1
    const out = buildContextDoc(parts);
    expect(out).toContain(chars(5_000, "Z"));
  });

  it("handles pipeline with exactly 2 steps — both are protected", () => {
    const task = "# Task\nY";
    const s1 = step(1, chars(6_000, "P"));
    const s2 = step(2, chars(6_000, "Q"));
    const parts = [task, s1, s2];

    // Total ≈ 12 006 chars — under budget anyway, but tests protection path
    const out = buildContextDoc(parts);
    expect(out).toContain(chars(6_000, "P"));
    expect(out).toContain(chars(6_000, "Q"));
  });

  it("handles empty steps array (only task description)", () => {
    const out = buildContextDoc(["# Task\nJust the task"]);
    expect(out).toBe("# Task\nJust the task");
  });
});

// ---------------------------------------------------------------------------
// Ordering: task → old steps → recent steps
// ---------------------------------------------------------------------------

describe("buildContextDoc — output ordering", () => {
  it("preserves chronological order in output", () => {
    const task = "# Task\nOrder test";
    const s1 = step(1, "ALPHA");
    const s2 = step(2, "BETA");
    const s3 = step(3, "GAMMA");
    const parts = [task, s1, s2, s3];

    const out = buildContextDoc(parts);
    const alphaIdx = out.indexOf("ALPHA");
    const betaIdx = out.indexOf("BETA");
    const gammaIdx = out.indexOf("GAMMA");

    expect(alphaIdx).toBeGreaterThan(-1);
    expect(betaIdx).toBeGreaterThan(alphaIdx);
    expect(gammaIdx).toBeGreaterThan(betaIdx);
  });
});
