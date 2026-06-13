import { describe, it, expect } from "vitest";
import vm from "node:vm";

// Extracted from TI agent flow node "ti-validator"
// Agent: Trend Intelligence (cmpnu72fy0008p401ixaaehq8), 2026-06-12 via as_inspect_flow
// Run through the same vm.Script wrapper the function-handler uses in production.
const VALIDATOR_CODE = `
var raw = variables.ti_payload || "";
raw = raw.replace(/^\`\`\`(?:json)?\\s*\\n?/,"").replace(/\\n?\`\`\`$/,"").trim();
var p;
try { p = JSON.parse(raw); }
catch(e){
  var head = String(raw).slice(0,80);
  if(/^(MALFORMED_PAYLOAD:|BLOCKED:|NO_TREND:|VAGUE_TREND)/.test(head)){
    return JSON.stringify([{field:"all",rule:"agent_error",detail:head,severity:"error"}]);
  }
  return JSON.stringify([{field:"all",rule:"json_parse_error",detail:"cannot parse ti_payload",severity:"error"}]);
}
var v = [];
["objective","output_format","tool_guidance","task_boundaries"].forEach(function(f){
  if(!p[f] || String(p[f]).trim()===""){ v.push({field:f,rule:"missing_a2a_field",detail:f+" empty/missing",severity:"error"}); }
});
var tr = p.trend || {};
var title = String(tr.title||"").trim().toLowerCase();
if(!title || title==="n/a" || title==="na" || title==="none" || title==="unknown"){
  v.push({field:"trend.title",rule:"missing_trend",detail:"title empty/N/A",severity:"error"});
}
var src = String(tr.source_url||"").trim();
if(!src || src.toLowerCase()==="n/a"){ v.push({field:"trend.source_url",rule:"missing_source",detail:"source_url empty/N/A",severity:"error"}); }
if(typeof p.confidence !== "string"){
  v.push({field:"confidence",rule:"confidence_not_string",detail:typeof p.confidence,severity:"error"});
} else if(["1 stars","2 stars","3 stars"].indexOf(p.confidence) === -1){
  v.push({field:"confidence",rule:"invalid_confidence",detail:p.confidence,severity:"error"});
}
if(typeof p.confidence === "string"){
  if(p.confidence === "1 stars" && tr.is_evergreen !== true){
    v.push({field:"is_evergreen",rule:"evergreen_mismatch",detail:"1 stars requires is_evergreen=true",severity:"error"});
  }
  if((p.confidence === "2 stars" || p.confidence === "3 stars") && tr.is_evergreen !== false){
    v.push({field:"is_evergreen",rule:"evergreen_mismatch",detail:p.confidence+" requires is_evergreen=false",severity:"error"});
  }
}
var ser = JSON.stringify(p).toLowerCase();
if(/"hooks"\\s*:/.test(ser) || /"posts"\\s*:/.test(ser)){
  v.push({field:"all",rule:"scope_violation",detail:"output contains hooks/posts",severity:"error"});
}
if(!Array.isArray(p.platforms_target) || p.platforms_target.length !== 5){
  v.push({field:"platforms_target",rule:"invalid_platforms",detail:(Array.isArray(p.platforms_target)?p.platforms_target.length:0)+"/5",severity:"error"});
}
var LISTICLE = /\\b\\d+\\s+(ai\\s+)?(trends|tools|predictions|insights|practices|tactics|secrets|tips|tricks|hacks)\\b|trends to watch|year in review|what'?s next in ai|roundup|wrap-?up/i;
if(LISTICLE.test(String(tr.title||""))){
  if(!(p.confidence === "1 stars" && tr.is_evergreen === true)){
    v.push({field:"trend.title",rule:"listicle_not_evergreen",detail:"listicle must be 1 stars + evergreen",severity:"error"});
  }
}
var BANNED = /\\b(enhance\\w*|boost\\w*|transform\\w*|expand\\w*|revolutioniz\\w*|groundbreaking|paradigm shift|harness the power|unlock potential|highlights|increased focus|ai-powered)\\b/i;
var MEAS = /\\d+(?:\\.\\d+)?\\s*(%|x|times|fold|hours|tokens|points|k)\\b/i;
var angle = String(p.angle_suggested||"");
if(BANNED.test(angle) && !MEAS.test(angle)){
  var m = angle.match(BANNED);
  v.push({field:"angle_suggested",rule:"banned_phrase",detail:(m?m[0]:"?"),severity:"error"});
}
var blocking = v.filter(function(x){ return x.severity !== "warning"; });
if(blocking.length === 0){ return "PASS"; }
return JSON.stringify(v);
`.trim();

interface Violation {
  field: string;
  rule: string;
  detail: string;
  severity: string;
}

function runValidator(tiPayload: unknown): string {
  const raw =
    typeof tiPayload === "string" ? tiPayload : JSON.stringify(tiPayload);
  const variables: Record<string, unknown> = { ti_payload: raw };

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
  const script = new vm.Script(`"use strict"; (function() { ${VALIDATOR_CODE} })();`);
  return script.runInContext(ctx, { timeout: 5_000 }) as string;
}

function violations(result: string): Violation[] {
  return JSON.parse(result) as Violation[];
}

function hasRule(result: string, rule: string): boolean {
  return violations(result).some((v) => v.rule === rule);
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const A2A = {
  objective: "Generate 5 platform-specific hooks for this trend, targeting score >=17/20 each",
  output_format: "5 distinct hooks (P1-P6 pattern variants), one per platform",
  tool_guidance: "MUST use kb_search to load winners-log + instincts. MAY use web_search.",
  task_boundaries: "Single trend per call. Do not generate cross-trend hooks.",
};

const VALID_TREND = {
  title: "Anthropic releases Claude Opus 4.8 with 1M context window",
  source_url: "https://anthropic.com/blog/claude-opus-4-8",
  date_observed: "2026-06-12",
  is_evergreen: false,
};

const VALID_PAYLOAD = {
  ...A2A,
  trend: VALID_TREND,
  angle_suggested:
    "Shows how Claude Opus 4.8 cuts multi-document research time by 60% with 1M context",
  confidence: "2 stars",
  platforms_target: ["LinkedIn", "X", "YouTube", "Instagram", "TikTok"],
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("TI Validator — unit tests (direct vm execution)", () => {

  describe("PASS cases", () => {
    it("accepts a fully valid 2-star payload", () => {
      expect(runValidator(VALID_PAYLOAD)).toBe("PASS");
    });

    it("accepts 3-star payload with is_evergreen=false", () => {
      expect(runValidator({ ...VALID_PAYLOAD, confidence: "3 stars" })).toBe("PASS");
    });

    it("accepts listicle correctly handled: 1 stars + is_evergreen=true", () => {
      const payload = {
        ...VALID_PAYLOAD,
        trend: {
          ...VALID_TREND,
          title: "Top 10 AI tools every developer should know",
          is_evergreen: true,
        },
        confidence: "1 stars",
        angle_suggested:
          "Reminds builders that layered security defaults prevent more breaches than reactive patching",
      };
      expect(runValidator(payload)).toBe("PASS");
    });

    it("accepts a banned verb WHEN paired with a word-char measurement (MEAS escape hatch)", () => {
      // BANNED matches "expand", MEAS matches "128k" (k is a word char → trailing \b holds) → no banned_phrase.
      // NOTE: a trailing "%" does NOT satisfy TI MEAS ((...)\b fails after a non-word char), unlike CC.
      const payload = {
        ...VALID_PAYLOAD,
        angle_suggested: "Shows how Claude Opus 4.8 expanded context to 128k tokens",
      };
      expect(runValidator(payload)).toBe("PASS");
    });
  });

  describe("BLOCK — A2A mandatory fields", () => {
    it("blocks on empty tool_guidance → missing_a2a_field", () => {
      const result = runValidator({ ...VALID_PAYLOAD, tool_guidance: "" });
      expect(result).not.toBe("PASS");
      expect(hasRule(result, "missing_a2a_field")).toBe(true);
      const v = violations(result).find((x) => x.rule === "missing_a2a_field");
      expect(v?.field).toBe("tool_guidance");
    });

    it("blocks on missing objective → missing_a2a_field", () => {
      const { objective: _o, ...rest } = VALID_PAYLOAD;
      const result = runValidator(rest);
      expect(hasRule(result, "missing_a2a_field")).toBe(true);
    });
  });

  describe("BLOCK — confidence-evergreen link", () => {
    it("blocks when confidence='1 stars' and is_evergreen=false → evergreen_mismatch", () => {
      const result = runValidator({
        ...VALID_PAYLOAD,
        confidence: "1 stars",
        trend: { ...VALID_TREND, is_evergreen: false },
      });
      expect(result).not.toBe("PASS");
      expect(hasRule(result, "evergreen_mismatch")).toBe(true);
    });

    it("blocks when confidence='2 stars' and is_evergreen=true → evergreen_mismatch", () => {
      const result = runValidator({
        ...VALID_PAYLOAD,
        confidence: "2 stars",
        trend: { ...VALID_TREND, is_evergreen: true },
      });
      expect(result).not.toBe("PASS");
      expect(hasRule(result, "evergreen_mismatch")).toBe(true);
    });
  });

  describe("BLOCK — confidence type/format", () => {
    it("blocks on numeric confidence → confidence_not_string", () => {
      const result = runValidator(
        JSON.stringify({ ...VALID_PAYLOAD, confidence: 2 }),
      );
      expect(result).not.toBe("PASS");
      expect(hasRule(result, "confidence_not_string")).toBe(true);
    });

    it("blocks on descriptive confidence string → invalid_confidence", () => {
      const result = runValidator({ ...VALID_PAYLOAD, confidence: "high confidence" });
      expect(result).not.toBe("PASS");
      expect(hasRule(result, "invalid_confidence")).toBe(true);
    });
  });

  describe("BLOCK — scope violation", () => {
    it("blocks when output contains a hooks array → scope_violation", () => {
      const result = runValidator({
        ...VALID_PAYLOAD,
        hooks: ["Hook 1 for LinkedIn", "Hook 2 for X", "Hook 3 for TikTok"],
      });
      expect(result).not.toBe("PASS");
      expect(hasRule(result, "scope_violation")).toBe(true);
    });
  });

  describe("BLOCK — listicle without evergreen", () => {
    it("blocks when title matches listicle but confidence != 1 stars → listicle_not_evergreen", () => {
      const result = runValidator({
        ...VALID_PAYLOAD,
        trend: {
          ...VALID_TREND,
          title: "7 AI trends every developer should know in 2026",
          is_evergreen: false,
        },
        confidence: "2 stars",
      });
      expect(result).not.toBe("PASS");
      expect(hasRule(result, "listicle_not_evergreen")).toBe(true);
    });
  });

  describe("BLOCK — source_url", () => {
    it("blocks when source_url is 'N/A' → missing_source", () => {
      const result = runValidator({
        ...VALID_PAYLOAD,
        trend: { ...VALID_TREND, source_url: "N/A" },
      });
      expect(result).not.toBe("PASS");
      expect(hasRule(result, "missing_source")).toBe(true);
    });
  });

  describe("BLOCK — unparseable / agent-error prefix", () => {
    it("returns json_parse_error for invalid JSON", () => {
      const result = runValidator("not valid json {{{");
      expect(result).not.toBe("PASS");
      expect(hasRule(result, "json_parse_error")).toBe(true);
    });

    it("returns agent_error when payload starts with MALFORMED_PAYLOAD prefix", () => {
      const result = runValidator("MALFORMED_PAYLOAD: missing trend data in search results");
      expect(result).not.toBe("PASS");
      expect(hasRule(result, "agent_error")).toBe(true);
    });
  });

  describe("BLOCK — missing_trend", () => {
    it("blocks empty trend.title → missing_trend", () => {
      const result = runValidator({ ...VALID_PAYLOAD, trend: { ...VALID_TREND, title: "" } });
      expect(result).not.toBe("PASS");
      expect(hasRule(result, "missing_trend")).toBe(true);
    });

    it("blocks trend.title = 'N/A' → missing_trend", () => {
      const result = runValidator({ ...VALID_PAYLOAD, trend: { ...VALID_TREND, title: "N/A" } });
      expect(hasRule(result, "missing_trend")).toBe(true);
    });
  });

  describe("BLOCK — invalid_platforms", () => {
    it("blocks platforms_target with fewer than 5 entries → invalid_platforms", () => {
      const result = runValidator({ ...VALID_PAYLOAD, platforms_target: ["LinkedIn", "X"] });
      expect(result).not.toBe("PASS");
      expect(hasRule(result, "invalid_platforms")).toBe(true);
    });

    it("blocks non-array platforms_target → invalid_platforms", () => {
      const result = runValidator({ ...VALID_PAYLOAD, platforms_target: "LinkedIn,X" });
      expect(hasRule(result, "invalid_platforms")).toBe(true);
    });
  });

  describe("BLOCK — banned_phrase", () => {
    it("blocks a banned verb in angle_suggested with no measurement", () => {
      const result = runValidator({
        ...VALID_PAYLOAD,
        angle_suggested: "revolutionizes content creation for developers",
      });
      expect(result).not.toBe("PASS");
      expect(hasRule(result, "banned_phrase")).toBe(true);
    });

    it("a trailing percentage does NOT satisfy MEAS → still banned_phrase (TI regex quirk)", () => {
      const result = runValidator({
        ...VALID_PAYLOAD,
        angle_suggested: "boosts developer throughput 40%",
      });
      expect(hasRule(result, "banned_phrase")).toBe(true);
    });
  });
});
