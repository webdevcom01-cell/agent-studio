import { describe, it, expect } from "vitest";
import vm from "node:vm";

// Extracted from TI agent flow node "inject-since" (repurposed → "Build Search Query (dual-mode)")
// Agent: Trend Intelligence (cmpnu72fy0008p401ixaaehq8), 2026-06-15 via as_inspect_flow (OQ-4)
// Builds web_search query: scan command/empty → generic site-filtered query; pasted trend → query from input.
// Run through the same vm.Script wrapper the function-handler uses in production.
// BUILD_CODE embedded as a JSON string literal (= exact production code, no escaping drift).
const BUILD_CODE = "var d = new Date();\nvar s = new Date(d.getTime() - 14*24*60*60*1000);\nvar since = s.toISOString().slice(0,10);\nvar SITE = \"(site:anthropic.com OR site:openai.com OR site:blog.google OR site:deepmind.google OR site:github.blog OR site:news.ycombinator.com OR site:arxiv.org)\";\nvar GENERIC = SITE + \" (new AI model OR release OR benchmark OR paper) after:\" + since;\nvar msg = String(variables.last_message || \"\");\n// strip leading \"Today is YYYY-MM-DD.\" prefix that soma-run prepends (no-op if absent)\nvar topic = msg.replace(/^\\s*Today is \\d{4}-\\d{2}-\\d{2}\\.?\\s*/i, \"\").trim();\nvar lc = topic.toLowerCase();\nvar isScan = (topic === \"\" || /^(scan|scan now|scan trends|scan trends now|trends)\\b/.test(lc));\nvar query;\nif (isScan) {\n  query = GENERIC;\n} else {\n  var terms = topic\n    .replace(/https?:\\/\\/[^\\s)\"'<>]+/g, \" \")\n    .replace(/[\"'(){}\\[\\]]/g, \" \")\n    .replace(/\\s+/g, \" \")\n    .trim();\n  if (terms.length > 240) terms = terms.slice(0, 240);\n  query = terms;\n}\nif (!query || !query.trim()) query = GENERIC;\nreturn query;\n";

function runBuild(lastMessage: string): string {
  const variables: Record<string, unknown> = { last_message: lastMessage };
  const sandbox: Record<string, unknown> = {
    variables,
    String,
    Number,
    Boolean,
    Array,
    Object,
    Date,
    Math,
    JSON,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    RegExp,
    Map,
    Set,
    Error,
    NaN,
    Infinity,
    undefined,
  };
  const ctx = vm.createContext(sandbox, {
    codeGeneration: { strings: false, wasm: false },
  });
  const script = new vm.Script(`"use strict"; (function() { ${BUILD_CODE} })();`);
  return script.runInContext(ctx, { timeout: 5_000 }) as string;
}

const GENERIC_MARKER = "(site:anthropic.com OR site:openai.com";

describe("TI build-search-query — dual-mode (direct vm execution)", () => {
  describe("Scan mode → generic site-filtered query", () => {
    it("'scan trends now' with date prefix → generic", () => {
      const q = runBuild("Today is 2026-06-15. scan trends now");
      expect(q.startsWith(GENERIC_MARKER)).toBe(true);
      expect(q).toContain("new AI model OR release OR benchmark OR paper");
      expect(q).toContain("after:");
    });

    it("'scan trends now' bare → generic", () => {
      expect(runBuild("scan trends now").startsWith(GENERIC_MARKER)).toBe(true);
    });

    it("empty input → generic (guard)", () => {
      expect(runBuild("").startsWith(GENERIC_MARKER)).toBe(true);
    });

    it("date-prefix only (no topic) → generic (guard)", () => {
      expect(runBuild("Today is 2026-06-15.").startsWith(GENERIC_MARKER)).toBe(true);
    });
  });

  describe("Topic mode → query built from pasted trend", () => {
    it("pasted trend with date prefix → terms only, no site filter", () => {
      const q = runBuild("Today is 2026-06-15. Google releases Gemma 4 with Multi-Token Prediction");
      expect(q).toBe("Google releases Gemma 4 with Multi-Token Prediction");
      expect(q).not.toContain("site:");
    });

    it("strips URLs from topic terms (URL handled by D5 grounding via last_message)", () => {
      const q = runBuild("Check https://example.com/x Anthropic Claude Opus 4.8 released");
      expect(q).not.toContain("http");
      expect(q).toContain("Anthropic Claude Opus 4.8 released");
    });

    it("strips quotes and brackets that would break the search query", () => {
      const q = runBuild('New paper "Foo (Bar)" achieves 95% jailbreak detection');
      expect(q).not.toMatch(/["'(){}\[\]]/);
      expect(q).toContain("Foo");
      expect(q).toContain("95%");
    });

    it("truncates very long topics to 240 chars", () => {
      const longTopic = "AI ".repeat(200); // 600 chars
      const q = runBuild(longTopic);
      expect(q.length).toBeLessThanOrEqual(240);
    });
  });
});
