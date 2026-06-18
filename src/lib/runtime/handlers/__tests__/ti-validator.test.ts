import { describe, it, expect } from "vitest";
import vm from "node:vm";

// Extracted from TI agent flow node "ti-validator"
// Agent: Trend Intelligence (cmpnu72fy0008p401ixaaehq8), 2026-06-15 via as_inspect_flow
// 2026-06-15 (D5): added deterministic source_url grounding check — source_url MUST be
//   present (normalized exact match) in variables.search_results OR variables.last_message,
//   with an "EVERGREEN:no-source" sentinel allowed only when is_evergreen===true.
// Run through the same vm.Script wrapper the function-handler uses in production.
// VALIDATOR_CODE is embedded as a JSON string literal (= exact production code, no escaping drift).
const VALIDATOR_CODE = "var raw = variables.ti_payload || \"\";\nraw = raw.replace(/^```(?:json)?\\s*\\n?/,\"\").replace(/\\n?```$/,\"\").trim();\nvar p;\ntry { p = JSON.parse(raw); }\ncatch(e){\n  var head = String(raw).slice(0,80);\n  if(/^(MALFORMED_PAYLOAD:|BLOCKED:|NO_TREND:|VAGUE_TREND)/.test(head)){\n    return JSON.stringify([{field:\"all\",rule:\"agent_error\",detail:head,severity:\"error\"}]);\n  }\n  return JSON.stringify([{field:\"all\",rule:\"json_parse_error\",detail:\"cannot parse ti_payload\",severity:\"error\"}]);\n}\nvar v = [];\n[\"objective\",\"output_format\",\"tool_guidance\",\"task_boundaries\"].forEach(function(f){\n  if(!p[f] || String(p[f]).trim()===\"\"){ v.push({field:f,rule:\"missing_a2a_field\",detail:f+\" empty/missing\",severity:\"error\"}); }\n});\nvar tr = p.trend || {};\nvar title = String(tr.title||\"\").trim().toLowerCase();\nif(!title || title===\"n/a\" || title===\"na\" || title===\"none\" || title===\"unknown\"){\n  v.push({field:\"trend.title\",rule:\"missing_trend\",detail:\"title empty/N/A\",severity:\"error\"});\n}\nvar src = String(tr.source_url||\"\").trim();\nif(!src || src.toLowerCase()===\"n/a\"){ v.push({field:\"trend.source_url\",rule:\"missing_source\",detail:\"source_url empty/N/A\",severity:\"error\"}); }\n// D5: source_url grounding — normalized exact match vs search_results + last_message; EVERGREEN sentinel allowed\nif(src && src.toLowerCase()!==\"n/a\"){\n  var SENTINEL = \"EVERGREEN:no-source\";\n  if(src === SENTINEL){\n    if(tr.is_evergreen !== true){\n      v.push({field:\"trend.source_url\",rule:\"sentinel_requires_evergreen\",detail:\"EVERGREEN:no-source allowed only when is_evergreen=true\",severity:\"error\"});\n    }\n  } else {\n    var _norm = function(u){\n      return String(u||\"\").trim().toLowerCase().replace(/^https?:\\/\\//,\"\").replace(/^www\\./,\"\").replace(/[#?].*$/,\"\").replace(/\\/+$/,\"\");\n    };\n    var srcN = _norm(src);\n    var allowed = [];\n    if(Array.isArray(variables.search_results)){\n      variables.search_results.forEach(function(r){ if(r && r.url){ allowed.push(_norm(r.url)); } });\n    }\n    var msg = String(variables.last_message||\"\");\n    var urls = msg.match(/https?:\\/\\/[^\\s)\"'<>]+/g) || [];\n    urls.forEach(function(u){ allowed.push(_norm(u)); });\n    if(allowed.indexOf(srcN) === -1){\n      v.push({field:\"trend.source_url\",rule:\"source_url_not_grounded\",detail:\"source_url not found in search_results or user input\",severity:\"error\"});\n    }\n  }\n}\nif(typeof p.confidence !== \"string\"){\n  v.push({field:\"confidence\",rule:\"confidence_not_string\",detail:typeof p.confidence,severity:\"error\"});\n} else if([\"1 stars\",\"2 stars\",\"3 stars\"].indexOf(p.confidence) === -1){\n  v.push({field:\"confidence\",rule:\"invalid_confidence\",detail:p.confidence,severity:\"error\"});\n}\nif(typeof p.confidence === \"string\"){\n  if(p.confidence === \"1 stars\" && tr.is_evergreen !== true){\n    v.push({field:\"is_evergreen\",rule:\"evergreen_mismatch\",detail:\"1 stars requires is_evergreen=true\",severity:\"error\"});\n  }\n  if((p.confidence === \"2 stars\" || p.confidence === \"3 stars\") && tr.is_evergreen !== false){\n    v.push({field:\"is_evergreen\",rule:\"evergreen_mismatch\",detail:p.confidence+\" requires is_evergreen=false\",severity:\"error\"});\n  }\n}\nvar ser = JSON.stringify(p).toLowerCase();\nif(/\"hooks\"\\s*:/.test(ser) || /\"posts\"\\s*:/.test(ser)){\n  v.push({field:\"all\",rule:\"scope_violation\",detail:\"output contains hooks/posts\",severity:\"error\"});\n}\nif(!Array.isArray(p.platforms_target) || p.platforms_target.length !== 5){\n  v.push({field:\"platforms_target\",rule:\"invalid_platforms\",detail:(Array.isArray(p.platforms_target)?p.platforms_target.length:0)+\"/5\",severity:\"error\"});\n}\nvar LISTICLE = /\\b\\d+\\s+(ai\\s+)?(trends|tools|predictions|insights|practices|tactics|secrets|tips|tricks|hacks)\\b|trends to watch|year in review|what'?s next in ai|roundup|wrap-?up/i;\nif(LISTICLE.test(String(tr.title||\"\"))){\n  if(!(p.confidence === \"1 stars\" && tr.is_evergreen === true)){\n    v.push({field:\"trend.title\",rule:\"listicle_not_evergreen\",detail:\"listicle must be 1 stars + evergreen\",severity:\"error\"});\n  }\n}\nvar BANNED = /\\b(enhance\\w*|boost\\w*|transform\\w*|expand\\w*|revolutioniz\\w*|groundbreaking|paradigm shift|harness the power|unlock potential|highlights|increased focus|ai-powered)\\b/i;\nvar MEAS = /\\d+(?:\\.\\d+)?\\s*(%|x|times|fold|hours|tokens|points|k)\\b/i;\nvar angle = String(p.angle_suggested||\"\");\nif(BANNED.test(angle) && !MEAS.test(angle)){\n  var m = angle.match(BANNED);\n  v.push({field:\"angle_suggested\",rule:\"banned_phrase\",detail:(m?m[0]:\"?\"),severity:\"error\"});\n}\nvar blocking = v.filter(function(x){ return x.severity !== \"warning\"; });\nif(blocking.length === 0){ return \"PASS\"; }\nreturn JSON.stringify(v);\n";

interface Violation {
  field: string;
  rule: string;
  detail: string;
  severity: string;
}

interface RunOpts {
  search_results?: Array<{ url?: string }>;
  last_message?: string;
}

// Default grounded source so pre-D5 PASS fixtures stay green:
// DEFAULT_SEARCH contains VALID_TREND.source_url (normalized exact match).
const DEFAULT_SEARCH = [
  {
    url: "https://anthropic.com/blog/claude-opus-4-8",
    title: "t",
    snippet: "s",
    score: 1,
    publishedDate: null,
  },
];

function runValidator(tiPayload: unknown, opts?: RunOpts): string {
  const raw =
    typeof tiPayload === "string" ? tiPayload : JSON.stringify(tiPayload);
  const variables: Record<string, unknown> = {
    ti_payload: raw,
    search_results:
      opts && "search_results" in opts ? opts.search_results : DEFAULT_SEARCH,
    last_message: opts && "last_message" in opts ? opts.last_message : "",
  };

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

  // ─── D5: source_url grounding (added 2026-06-15) ────────────────────────────
  describe("D5 — source_url grounding (normalized exact match)", () => {
    it("PASS: source_url grounded in search_results", () => {
      // VALID_PAYLOAD.source_url matches DEFAULT_SEARCH → grounded
      expect(runValidator(VALID_PAYLOAD)).toBe("PASS");
    });

    it("PASS: source_url grounded in user message (last_message), empty search_results", () => {
      const payload = {
        ...VALID_PAYLOAD,
        trend: { ...VALID_TREND, source_url: "https://example.com/post/abc" },
      };
      const result = runValidator(payload, {
        search_results: [],
        last_message: "please check this trend https://example.com/post/abc thanks",
      });
      expect(result).toBe("PASS");
    });

    it("BLOCK: fabricated source_url not in search_results or input → source_url_not_grounded", () => {
      const payload = {
        ...VALID_PAYLOAD,
        trend: { ...VALID_TREND, source_url: "https://anthropic.com/news/made-up-2026-06" },
      };
      const result = runValidator(payload, {
        search_results: [{ url: "https://openai.com/index/something" }],
        last_message: "",
      });
      expect(result).not.toBe("PASS");
      expect(hasRule(result, "source_url_not_grounded")).toBe(true);
    });

    it("PASS: normalization tolerates www + trailing slash differences", () => {
      const payload = {
        ...VALID_PAYLOAD,
        trend: { ...VALID_TREND, source_url: "https://anthropic.com/blog/claude-opus-4-8/" },
      };
      const result = runValidator(payload, {
        search_results: [{ url: "https://www.anthropic.com/blog/claude-opus-4-8" }],
        last_message: "",
      });
      expect(result).toBe("PASS");
    });

    it("PASS: EVERGREEN sentinel allowed when is_evergreen=true (no grounded URL available)", () => {
      const payload = {
        ...VALID_PAYLOAD,
        trend: {
          ...VALID_TREND,
          title: "Layered security defaults in agent systems",
          source_url: "EVERGREEN:no-source",
          is_evergreen: true,
        },
        confidence: "1 stars",
        angle_suggested:
          "Reminds builders that agent scope isolation prevents cascading failures better than broad error handling",
      };
      const result = runValidator(payload, { search_results: [], last_message: "" });
      expect(result).toBe("PASS");
    });

    it("BLOCK: EVERGREEN sentinel rejected when is_evergreen=false → sentinel_requires_evergreen", () => {
      const payload = {
        ...VALID_PAYLOAD,
        trend: { ...VALID_TREND, source_url: "EVERGREEN:no-source", is_evergreen: false },
        confidence: "2 stars",
      };
      const result = runValidator(payload, { search_results: [], last_message: "" });
      expect(result).not.toBe("PASS");
      expect(hasRule(result, "sentinel_requires_evergreen")).toBe(true);
    });
  });
});
