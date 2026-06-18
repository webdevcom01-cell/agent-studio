import { describe, it, expect } from "vitest";
import vm from "node:vm";

// Mirrors the cr-x-repair function node to be deployed in agent cgfnroihfs8ma03wsmp9bvbhq.
// Node sits between `start` (AI output) and `cr-validator`, with outputVariable: "cr_payload".
// Phase 1: strip trailing hashtags iteratively — always safe, never touches hook content.
// Phase 2: word-boundary truncate at 277+… — guarded by hookLen ≤ 277 to preserve hook verbatim.
// Transparency: po.x_trim_applied = true (separate field — NOT overwritten by cr-pass-emitter).
// Algorithm verified 2026-06-14 (34/34 hermetic tests before vitest write). PR #201.
const REPAIR_CODE = `
var raw = variables.cr_payload || "";
raw = raw.replace(/^\\\`\\\`\\\`(?:json)?\\s*\\n?/, "").replace(/\\n?\\\`\\\`\\\`$/, "").trim();
var p;
try { p = JSON.parse(raw); } catch(e) { return raw; }
var posts = p.posts || [];
var changed = false;
for (var i = 0; i < posts.length; i++) {
  var po = posts[i];
  if (po.platform !== "X") continue;
  var fp = po.full_post;
  if (typeof fp !== "string") continue;
  if (fp.length <= 280) continue;
  var hook = po.hook_text || "";
  var hookLen = hook.length;
  var trimmed = fp;
  var hashTagRe = /\\s+#\\w+\\s*$/;
  for (var t = 0; t < 10 && trimmed.length > 280 && hashTagRe.test(trimmed); t++) {
    trimmed = trimmed.replace(hashTagRe, "").replace(/\\s+$/, "");
  }
  if (trimmed.length > 280 && hookLen <= 277) {
    var searchFrom = hookLen + 1;
    var cut = trimmed.slice(0, 277);
    var lastSpace = -1;
    for (var j = 276; j >= searchFrom; j--) {
      if (cut.charAt(j) === " ") { lastSpace = j; break; }
    }
    if (lastSpace > hookLen) {
      trimmed = trimmed.slice(0, lastSpace) + "\\u2026";
    } else {
      trimmed = trimmed.slice(0, 277) + "\\u2026";
    }
  }
  if (trimmed.length <= 280) {
    po.full_post = trimmed;
    po.x_trim_applied = true;
    changed = true;
  }
}
if (changed) { return JSON.stringify(p); }
return raw;
`.trim();

// ── runner ──────────────────────────────────────────────────────────────────
function runRepair(payload: unknown): string {
  const raw = typeof payload === "string" ? payload : JSON.stringify(payload);
  const sandbox: Record<string, unknown> = {
    variables: { cr_payload: raw },
    String, Number, Boolean, Array, Object, Date, Math, JSON,
    parseInt, parseFloat, isNaN, isFinite, RegExp, Map, Set, Error, NaN, Infinity, undefined,
  };
  const ctx = vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } });
  const script = new vm.Script(`"use strict"; (function() { ${REPAIR_CODE} })();`);
  return script.runInContext(ctx, { timeout: 5_000 }) as string;
}

// ── payload builder ──────────────────────────────────────────────────────────
// IMPORTANT: hook_text on the X post MUST be set to the actual hook under test,
// not a generic placeholder — the repair node reads hook_text to determine hookLen.
const TREND = { title: "Claude context window", source_url: "https://x.com", date_observed: "2026-06-14", is_evergreen: false };
function mkPayload(xHook: string, xFullPost: string): object {
  return {
    objective: "Human review of 5 posts",
    output_format: "5 platform posts",
    tool_guidance: "MAY use kb_search.",
    task_boundaries: "One post per hook.",
    trend_context: TREND,
    angle_used: "Context window beats parameters",
    posts: [
      { platform: "LinkedIn",  hook_text: "LinkedIn hook",  pattern_id: "P1", full_post: "LinkedIn post body.",                                                                                          status: "READY_FOR_REVIEW" },
      { platform: "X",         hook_text: xHook,            pattern_id: "P2", full_post: xFullPost,                                                                                                      status: "READY_FOR_REVIEW" },
      { platform: "YouTube",   hook_text: "YouTube hook",   pattern_id: "P3", full_post: { title: "YT title", description: "YT desc", script_opener: "YT opener", tags: ["#AI"] },                      status: "READY_FOR_REVIEW" },
      { platform: "Instagram", hook_text: "Instagram hook", pattern_id: "P5", full_post: { slide_1: "slide1", slides_2_4: ["s2", "s3", "s4"], slide_cta: "cta", caption: "cap" },                       status: "READY_FOR_REVIEW" },
      { platform: "TikTok",    hook_text: "TikTok hook",    pattern_id: "P4", full_post: { overlay: "overlay", spoken_body: "body", screen_text: ["a", "b"], cta: "cta" },                              status: "READY_FOR_REVIEW" },
    ],
  };
}

// ── test suites ──────────────────────────────────────────────────────────────
describe("CR X Repair — unit tests (direct vm execution)", () => {

  // ── T1: no-op ──────────────────────────────────────────────────────────────
  describe("no-op: X post within 280 chars", () => {
    it("T1: X post ≤ 280 — passthrough unchanged, x_trim_applied NOT set", () => {
      const hook = "Short hook for no-op test."; // 26 chars
      const fp   = hook + " This is a short post that stays intact."; // 66 chars
      const result = JSON.parse(runRepair(mkPayload(hook, fp)));
      expect(result.posts[1].full_post).toBe(fp);
      expect(result.posts[1].x_trim_applied).toBeUndefined();
    });
  });

  // ── Phase 1: hashtag stripping ─────────────────────────────────────────────
  describe("Phase 1: trailing hashtag stripping", () => {
    it("T2: single large hashtag stripped, body intact, x_trim_applied=true", () => {
      // Design: hook(40) + body(200) = 240; tag(100) pushes to 340 > 280.
      // After ONE strip → 240 ≤ 280 — loop stops, no hashtag remains.
      const hook   = "A".repeat(40);
      const body   = " " + "B".repeat(199); // 200 chars
      const tag    = " #" + "T".repeat(98); // 100 chars — a single long hashtag (" #" = 2, "T"*98 = 98 → 100)
      const fp     = hook + body + tag;     // 340 chars
      expect(fp.length).toBe(340);
      expect((hook + body).length).toBe(240);

      const result = JSON.parse(runRepair(mkPayload(hook, fp)));
      const xPost  = result.posts[1];

      expect(xPost.full_post.length).toBeLessThanOrEqual(280);
      expect(xPost.full_post.startsWith(hook)).toBe(true);
      expect(xPost.full_post.includes("B".repeat(199))).toBe(true); // body intact — Phase2 did NOT cut
      expect(/#\w+\s*$/.test(xPost.full_post)).toBe(false);         // no trailing hashtag
      expect(xPost.x_trim_applied).toBe(true);
    });
  });

  // ── Phase 2: word-boundary truncation ─────────────────────────────────────
  describe("Phase 2: word-boundary truncation (hookLen ≤ 277 guard)", () => {
    it("T3: no hashtags — truncates at word boundary with …, hook verbatim", () => {
      // hook(77) + space + 'X'*214 = 292 chars > 280; hookLen=77 ≤ 277 → Phase2 runs.
      // searchFrom=78; cut=292[:277]='...X*200'; no spaces in cut after pos78 → hard cut at 277.
      // Result: hook + space + X*200 + '…' = 278 chars.
      const hook = "Unpopular opinion: context window beats parameters for senior research teams."; // 77
      const fp   = hook + " " + "X".repeat(214); // 292 chars
      expect(hook.length).toBe(77);
      expect(fp.length).toBe(292);

      const result = JSON.parse(runRepair(mkPayload(hook, fp)));
      const xPost  = result.posts[1];

      expect(xPost.full_post.length).toBeLessThanOrEqual(280);
      expect(xPost.full_post.startsWith(hook)).toBe(true);
      expect(xPost.full_post.endsWith("…")).toBe(true);
      expect(xPost.x_trim_applied).toBe(true);
    });

    it("T4b: hookLen=277 (boundary) — Phase 2 allowed, hook verbatim in result", () => {
      // hookLen=277 ≤ 277 → Phase2 runs. searchFrom=278; cut=303[:277]='B'*277=hook exactly.
      // for j=276..278: never executes (276 < 278) → lastSpace=-1 → hard cut at 277+'…'=278 chars.
      const hook = "B".repeat(277);
      const fp   = hook + " overflow content here yes"; // 303 chars
      expect(hook.length).toBe(277);
      expect(fp.length).toBe(303);

      const result = JSON.parse(runRepair(mkPayload(hook, fp)));
      const xPost  = result.posts[1];

      expect(xPost.full_post.length).toBeLessThanOrEqual(280);
      expect(xPost.full_post.slice(0, 277)).toBe(hook); // hook verbatim
      expect(xPost.full_post.endsWith("…")).toBe(true);
      expect(xPost.x_trim_applied).toBe(true);
    });

    it("T4: hookLen=278 (over boundary) — Phase 2 BLOCKED, post UNCHANGED (>280)", () => {
      // hookLen=278 > 277 → Phase2 guard blocks. Phase1 finds no hashtags.
      // Repair fails → full_post stays at 300 chars → cr-validator will fire char_limit.
      const hook = "A".repeat(278);
      const fp   = hook + " overflow content here"; // 300 chars
      expect(hook.length).toBe(278);
      expect(fp.length).toBe(300);

      const result = JSON.parse(runRepair(mkPayload(hook, fp)));
      const xPost  = result.posts[1];

      expect(xPost.full_post.length).toBeGreaterThan(280); // still over limit
      expect(xPost.x_trim_applied).toBeUndefined();        // no repair applied
    });
  });

  // ── cr-tc-09 eval regression guard ────────────────────────────────────────
  describe("cr-tc-09 eval regression guard", () => {
    it("T5: hookLen=303 bare hook as full_post — repair FAILS, validator will fire char_limit ERROR", () => {
      // This mirrors the cr-tc-09 eval case (FIX-LOG confirmed: 303-char hook, no follow text).
      // Phase1: no hashtags. Phase2: hookLen=303 > 277 → BLOCKED.
      // Repair fails → validator fires char_limit ERROR → eval case grade = PASS ✅
      const hook = "C".repeat(303); // 303-char hook IS the full_post
      const fp   = "C".repeat(303);
      expect(hook.length).toBe(303);

      const result = JSON.parse(runRepair(mkPayload(hook, fp)));
      const xPost  = result.posts[1];

      expect(xPost.full_post).toBe(fp);          // unchanged
      expect(xPost.x_trim_applied).toBeUndefined();
    });
  });

  // ── transparency: x_trim_applied ──────────────────────────────────────────
  describe("transparency: x_trim_applied field", () => {
    it("T6: quality_flags overwrite (cr-pass-emitter) does NOT clear x_trim_applied", () => {
      // cr-pass-emitter always does `po.quality_flags = flags` — verified via as_inspect_flow.
      // x_trim_applied uses a DIFFERENT field name and survives that overwrite.
      const hook = "Context window beats parameter count for production teams at scale."; // 67
      const fp   = hook + " " + "Z".repeat(220); // 288 chars > 280
      expect(hook.length).toBe(67);
      expect(fp.length).toBe(288);

      const result = JSON.parse(runRepair(mkPayload(hook, fp)));
      const xPost  = result.posts[1];
      expect(xPost.full_post.length).toBeLessThanOrEqual(280);
      expect(xPost.x_trim_applied).toBe(true);

      // Simulate cr-pass-emitter writing quality_flags AFTER repair node
      xPost.quality_flags = [{ rule: "vague_filler", detail: "signals a shift", severity: "warning" }];
      expect(xPost.x_trim_applied).toBe(true); // still intact
    });
  });

  // ── edge cases ─────────────────────────────────────────────────────────────
  describe("edge cases", () => {
    it("T7: invalid JSON passthrough — raw string returned as-is", () => {
      expect(runRepair("Cannot generate posts right now.")).toBe("Cannot generate posts right now.");
    });

    it("T8: non-X platforms completely untouched", () => {
      const result = JSON.parse(runRepair(mkPayload("short hook", "short x post")));
      expect(result.posts[0].full_post).toBe("LinkedIn post body.");  // LinkedIn unchanged
      expect(typeof result.posts[2].full_post).toBe("object");        // YouTube object intact
      expect(typeof result.posts[3].full_post).toBe("object");        // Instagram object intact
      expect(typeof result.posts[4].full_post).toBe("object");        // TikTok object intact
    });

    it("T9: Phase 1 + Phase 2 combined — hashtags stripped first, still >280, then truncated", () => {
      // hook(70) + body(1+240=241) = 311 chars; after Phase1 strips both hashtags: still 311 > 280.
      // Phase2: hookLen=70 ≤ 277, cut=311[:277], no spaces in W-block → hard cut at 277+'…'=278.
      const hook = "AI context windows change inference at scale for production teams now."; // 70
      const body = " " + "W".repeat(240); // 241 chars, no spaces (forces hard cut)
      const tags = " #AITools #OpenSource"; // 21 chars — TWO hashtags for 2-iteration Phase1
      const fp   = hook + body + tags; // 332 chars
      expect(hook.length).toBe(70);
      expect((hook + body).length).toBe(311); // still >280 after tag removal

      const result = JSON.parse(runRepair(mkPayload(hook, fp)));
      const xPost  = result.posts[1];

      expect(xPost.full_post.length).toBeLessThanOrEqual(280);
      expect(xPost.full_post.startsWith(hook)).toBe(true);
      expect(xPost.full_post.endsWith("…")).toBe(true);
      expect(xPost.x_trim_applied).toBe(true);
    });

    it("T10: markdown code fence stripped before JSON parse", () => {
      const hook  = "Markdown fences get stripped before JSON parse."; // 47
      const inner = mkPayload(hook, hook + " " + "Y".repeat(250));
      const fenced = "```json\n" + JSON.stringify(inner) + "\n```";
      const result = JSON.parse(runRepair(fenced));
      const xPost  = result.posts[1];

      expect(xPost.full_post.length).toBeLessThanOrEqual(280);
      expect(xPost.full_post.startsWith(hook)).toBe(true);
      expect(xPost.x_trim_applied).toBe(true);
    });
  });
});
