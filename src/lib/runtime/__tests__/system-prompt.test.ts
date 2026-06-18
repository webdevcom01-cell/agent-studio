import { describe, it, expect } from "vitest";
import { assembleSystemPrompt, type SystemPromptBlocks } from "../system-prompt";

const full: SystemPromptBlocks = {
  base: "BASE",
  summary: "SUMMARY",
  hotMemory: "HOTMEM",
  goal: "GOAL",
  skills: "SKILLS",
  lsp: "LSP",
};

/**
 * Replicates the OLD inline prepend/append sequence from the ai_response
 * handlers, to prove the default ordering is byte-identical for realistic
 * inputs (non-empty base).
 */
function legacyInline(b: SystemPromptBlocks): string {
  let s = b.base; // base (RAG-augmented)
  if (b.summary) s = `${b.summary}\n\n${s}`; // summary prepend
  if (b.hotMemory) s = `${b.hotMemory}\n\n${s}`; // hot-memory prepend
  if (b.goal) s = `${s}\n\n${b.goal}`; // goal append
  if (b.skills) s = `${b.skills}\n\n${s}`; // skills prepend
  if (b.lsp) s = `${b.lsp}\n\n${s}`; // lsp prepend
  return s;
}

describe("assembleSystemPrompt", () => {
  it("default order matches the explicit legacy ordering", () => {
    expect(assembleSystemPrompt(full)).toBe(
      "LSP\n\nSKILLS\n\nHOTMEM\n\nSUMMARY\n\nBASE\n\nGOAL",
    );
  });

  it("default is byte-identical to legacy inline for all realistic subsets", () => {
    const variants: SystemPromptBlocks[] = [
      full,
      { ...full, summary: "" },
      { ...full, hotMemory: "", lsp: "" },
      { ...full, skills: "", goal: "" },
      { base: "BASE", summary: "", hotMemory: "", goal: "", skills: "", lsp: "" },
      { base: "BASE", summary: "SUM", hotMemory: "", goal: "GOAL", skills: "", lsp: "" },
    ];
    for (const v of variants) {
      expect(assembleSystemPrompt(v)).toBe(legacyInline(v));
    }
  });

  it("stable order puts base first and volatile blocks last", () => {
    expect(assembleSystemPrompt(full, { stablePrefix: true })).toBe(
      "BASE\n\nGOAL\n\nSKILLS\n\nHOTMEM\n\nSUMMARY\n\nLSP",
    );
  });

  it("skips empty blocks in both orderings (no double separators)", () => {
    const partial: SystemPromptBlocks = {
      base: "BASE",
      summary: "",
      hotMemory: "",
      goal: "GOAL",
      skills: "",
      lsp: "",
    };
    expect(assembleSystemPrompt(partial)).toBe("BASE\n\nGOAL");
    expect(assembleSystemPrompt(partial, { stablePrefix: true })).toBe("BASE\n\nGOAL");
  });
});
