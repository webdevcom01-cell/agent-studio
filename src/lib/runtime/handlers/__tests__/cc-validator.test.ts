import { describe, it, expect } from "vitest";
import vm from "node:vm";

// Source of truth = flow node "cc-validator" of agent Content Creator (cmpntw5i50004p401wevvodt0).
// Captured 2026-06-13 via as_inspect_flow. Run through the same vm.Script wrapper the
// function-handler uses in production.
//
// ANTI-DRIFT: if the flow validator is changed via as_patch_node_field / as_update_flow,
// update VALIDATOR_CODE below to match, or these fixtures will silently test stale logic.
// A live-pull from the flow is intentionally NOT used here: unit tests must stay hermetic
// (offline, no DB/network) for CI. The eval suite exercises the live flow; this file is the
// deterministic regression layer for the BLOCK rules.
const VALIDATOR_CODE = `
var raw = variables.cc_payload || "";
raw = raw.replace(/^\`\`\`(?:json)?\\s*\\n?/,"").replace(/\\n?\`\`\`$/,"").trim();
var p;
try { p = JSON.parse(raw); }
catch(e){
  var head = String(raw).slice(0,80);
  if(/^(MALFORMED_PAYLOAD:|BLOCKED:)/.test(head)){
    return JSON.stringify([{field:"all",rule:"agent_error",detail:head,severity:"error"}]);
  }
  return JSON.stringify([{field:"all",rule:"json_parse_error",detail:"cannot parse cc_payload",severity:"error"}]);
}
var v = [];
var TYPES = ["social_post","blog","ad_copy","email"];
var ct = String(p.content_type||"").trim();
if(TYPES.indexOf(ct) === -1){ v.push({field:"content_type",rule:"invalid_type",detail:ct||"(empty)",severity:"error"}); }
function empty(x){ return x===undefined||x===null||String(x).trim()===""; }
if(empty(p.title)){ v.push({field:"title",rule:"missing_field",detail:"title empty",severity:"error"}); }
if(empty(p.body)){ v.push({field:"body",rule:"missing_field",detail:"body empty",severity:"error"}); }
var req = { social_post:["platform","hashtags"], blog:["seo_keywords","meta_description"], ad_copy:["cta"], email:["cta"] };
(req[ct]||[]).forEach(function(f){
  var val = p[f];
  var isEmpty = empty(val) || (Array.isArray(val) && val.length===0);
  if(isEmpty){ v.push({field:f,rule:"missing_field",detail:f+" required for "+ct,severity:"error"}); }
});
var body = String(p.body||"")+" "+String(p.title||"")+" "+String(p.cta||"");
var MEAS = /\\d+(?:\\.\\d+)?\\s*(%|x|times|fold|hours|hrs|tokens|points|days|weeks|k\\b)/i;
var BANNED = /\\b(game[- ]?changer|game[- ]?changing|revolutioniz\\w*|revolutionary|groundbreaking|paradigm shift|harness the power|unlock potential|transformative|cutting[- ]?edge|next[- ]?generation|seamless|synergy|ai-powered)\\b/i;
if(BANNED.test(body)){
  var bm = body.match(BANNED);
  v.push({field:"body",rule:"banned_phrase",detail:(bm?bm[0]:"?"),severity:"error"});
}
var GEN = /\\b(enhance\\w*|boost\\w*|transform\\w*)\\b/i;
if(GEN.test(body) && !MEAS.test(body)){
  var gm = body.match(GEN);
  v.push({field:"body",rule:"vague_verb",detail:(gm?gm[0]:"?")+" without measurable benefit",severity:"error"});
}
var SSN = /\\b\\d{3}-\\d{2}-\\d{4}\\b/;
var CC = /\\b\\d{4}[ -]\\d{4}[ -]\\d{4}[ -]\\d{4}\\b|\\b\\d{16}\\b/;
if(SSN.test(body) || CC.test(body)){
  v.push({field:"body",rule:"pii_block",detail:"SSN/credit-card pattern",severity:"error"});
}
var EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}/;
var PHONE = /\\b\\+?\\d{1,2}[ .\\-]?\\(?\\d{3}\\)?[ .\\-]?\\d{3}[ .\\-]?\\d{4}\\b/;
if(EMAIL.test(body) || PHONE.test(body)){
  v.push({field:"body",rule:"pii_warning",detail:"email/phone present (human review)",severity:"warning"});
}
var blen = String(p.body||"").length;
if(ct==="social_post"){
  var L = {LinkedIn:3000, X:280, Instagram:2200, TikTok:150, YouTube:5000};
  var plat = String(p.platform||"");
  if(L[plat] && blen > L[plat]){ v.push({field:"body",rule:"length_error",detail:blen+"/"+L[plat]+" ("+plat+")",severity:"error"}); }
}
if(ct==="blog"){
  var words = String(p.body||"").trim().split(/\\s+/).filter(Boolean).length;
  if(words < 300){ v.push({field:"body",rule:"length_error",detail:words+" words <300",severity:"error"}); }
  if(String(p.meta_description||"").length > 160){ v.push({field:"meta_description",rule:"length_error",detail:"meta >160",severity:"error"}); }
}
if(MEAS.test(body)){
  var srcs = p.sources;
  if(!Array.isArray(srcs) || srcs.length===0){ v.push({field:"sources",rule:"stat_unsourced",detail:"numeric claim without sources",severity:"warning"}); }
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

function runValidator(ccPayload: unknown): string {
  const raw =
    typeof ccPayload === "string" ? ccPayload : JSON.stringify(ccPayload);
  const variables: Record<string, unknown> = { cc_payload: raw };

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

const VALID_SOCIAL = {
  content_type: "social_post",
  platform: "LinkedIn",
  title: "Practical AI features for SaaS teams",
  body: "A short, concrete post about adding AI features for SaaS startups without an in-house ML team. Plain and direct.",
  cta: null,
  hashtags: ["AI", "SaaS"],
  sources: [],
};

const VALID_BLOG = {
  content_type: "blog",
  title: "Vector databases for RAG in production",
  body: Array.from({ length: 320 }, () => "word").join(" "),
  seo_keywords: ["vector database", "RAG"],
  meta_description: "A practical guide to vector databases for RAG.",
  sources: [],
};

const VALID_EMAIL = {
  content_type: "email",
  title: "Cut deployment time on your team",
  body: "We help engineering teams ship faster with a direct, no-fuss workflow. Reply to set up a walkthrough.",
  cta: "Book a 15-minute walkthrough",
  sources: [],
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("CC Validator — unit tests (direct vm execution)", () => {
  describe("PASS cases", () => {
    it("accepts a valid social_post", () => {
      expect(runValidator(VALID_SOCIAL)).toBe("PASS");
    });

    it("accepts a valid blog (>=300 words, meta <=160)", () => {
      expect(runValidator(VALID_BLOG)).toBe("PASS");
    });

    it("accepts a valid email with CTA", () => {
      expect(runValidator(VALID_EMAIL)).toBe("PASS");
    });

    it("accepts a benefit verb WHEN paired with a measured figure (vague_verb contract escape hatch)", () => {
      const payload = {
        ...VALID_SOCIAL,
        body: "Our pipeline boosts deploys 3x for teams.",
        sources: ["internal benchmark"],
      };
      expect(runValidator(payload)).toBe("PASS");
    });
  });

  describe("BLOCK — agent_error / json_parse_error", () => {
    it("returns agent_error when payload starts with MALFORMED_PAYLOAD prefix", () => {
      const result = runValidator("MALFORMED_PAYLOAD: missing request");
      expect(result).not.toBe("PASS");
      expect(hasRule(result, "agent_error")).toBe(true);
    });

    it("returns agent_error when payload starts with BLOCKED prefix", () => {
      expect(hasRule(runValidator("BLOCKED: nope"), "agent_error")).toBe(true);
    });

    it("returns json_parse_error for non-JSON, non-prefixed output", () => {
      const result = runValidator("not valid json {{{");
      expect(result).not.toBe("PASS");
      expect(hasRule(result, "json_parse_error")).toBe(true);
    });
  });

  describe("BLOCK — invalid_type", () => {
    it("blocks unknown content_type", () => {
      const result = runValidator({ ...VALID_SOCIAL, content_type: "tweet" });
      expect(result).not.toBe("PASS");
      expect(hasRule(result, "invalid_type")).toBe(true);
    });
  });

  describe("BLOCK — missing_field", () => {
    it("blocks empty title", () => {
      const result = runValidator({ ...VALID_SOCIAL, title: "" });
      expect(hasRule(result, "missing_field")).toBe(true);
      expect(violations(result).find((x) => x.rule === "missing_field")?.field).toBe("title");
    });

    it("blocks empty body", () => {
      const result = runValidator({ ...VALID_SOCIAL, body: "" });
      expect(hasRule(result, "missing_field")).toBe(true);
    });

    it("blocks social_post with empty hashtags (required-by-type)", () => {
      const result = runValidator({ ...VALID_SOCIAL, hashtags: [] });
      expect(hasRule(result, "missing_field")).toBe(true);
      expect(violations(result).some((x) => x.rule === "missing_field" && x.field === "hashtags")).toBe(true);
    });

    it("blocks blog missing seo_keywords (required-by-type)", () => {
      const { seo_keywords: _omit, ...rest } = VALID_BLOG;
      const result = runValidator(rest);
      expect(hasRule(result, "missing_field")).toBe(true);
      expect(violations(result).some((x) => x.rule === "missing_field" && x.field === "seo_keywords")).toBe(true);
    });
  });

  describe("BLOCK — banned_phrase", () => {
    it("blocks hype words in body", () => {
      const result = runValidator({
        ...VALID_SOCIAL,
        body: "This groundbreaking platform changes everything for developers.",
      });
      expect(result).not.toBe("PASS");
      expect(hasRule(result, "banned_phrase")).toBe(true);
    });
  });

  describe("BLOCK — vague_verb", () => {
    it("blocks a benefit verb with NO measurement", () => {
      const result = runValidator({
        ...VALID_SOCIAL,
        body: "Our tool will boost team output for everyone.",
      });
      expect(result).not.toBe("PASS");
      expect(hasRule(result, "vague_verb")).toBe(true);
    });
  });

  describe("BLOCK — pii_block (fake patterns only)", () => {
    it("blocks fake SSN pattern 000-00-0000", () => {
      const result = runValidator({
        ...VALID_SOCIAL,
        content_type: "blog",
        title: "GDPR example",
        body: `${Array.from({ length: 320 }, () => "word").join(" ")} 000-00-0000`,
        seo_keywords: ["gdpr"],
        meta_description: "GDPR example",
      });
      expect(result).not.toBe("PASS");
      expect(hasRule(result, "pii_block")).toBe(true);
    });

    it("blocks fake credit-card pattern 0000 0000 0000 0000", () => {
      const result = runValidator({
        ...VALID_SOCIAL,
        body: "Example card on file: 0000 0000 0000 0000 for the demo account.",
      });
      expect(hasRule(result, "pii_block")).toBe(true);
    });
  });

  describe("WARNING (non-blocking) — pii_warning", () => {
    it("treats a lone email as a non-blocking warning (still PASS)", () => {
      const result = runValidator({
        ...VALID_SOCIAL,
        body: "A short post. Reach us at info@example.com for details.",
      });
      expect(result).toBe("PASS");
    });

    it("emits pii_warning with severity 'warning' alongside a blocking rule", () => {
      const result = runValidator({
        ...VALID_SOCIAL,
        content_type: "tweet",
        body: "A short post. Reach us at info@example.com for details.",
      });
      const w = violations(result).find((x) => x.rule === "pii_warning");
      expect(w?.severity).toBe("warning");
    });
  });

  describe("BLOCK — length_error", () => {
    it("blocks X post body over 280 chars", () => {
      const result = runValidator({
        ...VALID_SOCIAL,
        platform: "X",
        body: "z".repeat(281),
      });
      expect(result).not.toBe("PASS");
      expect(hasRule(result, "length_error")).toBe(true);
    });

    it("blocks blog body under 300 words", () => {
      const result = runValidator({
        ...VALID_BLOG,
        body: Array.from({ length: 50 }, () => "word").join(" "),
      });
      expect(hasRule(result, "length_error")).toBe(true);
    });

    it("blocks blog meta_description over 160 chars", () => {
      const result = runValidator({
        ...VALID_BLOG,
        meta_description: "m".repeat(161),
      });
      expect(hasRule(result, "length_error")).toBe(true);
      expect(violations(result).some((x) => x.rule === "length_error" && x.field === "meta_description")).toBe(true);
    });
  });

  describe("WARNING (non-blocking) — stat_unsourced", () => {
    it("a sourced numeric claim passes clean", () => {
      const result = runValidator({
        ...VALID_SOCIAL,
        body: "We cut review time 40% last quarter.",
        sources: ["internal report"],
      });
      expect(result).toBe("PASS");
    });

    it("emits stat_unsourced with severity 'warning' when a numeric claim has no sources", () => {
      const result = runValidator({
        ...VALID_SOCIAL,
        content_type: "tweet",
        body: "We cut review time 40% last quarter.",
        sources: [],
      });
      const w = violations(result).find((x) => x.rule === "stat_unsourced");
      expect(w?.severity).toBe("warning");
    });
  });
});
