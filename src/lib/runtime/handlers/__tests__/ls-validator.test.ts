import { describe, it, expect } from "vitest";
import vm from "node:vm";

// Source of truth = flow node "ls-validator" of agent Lead Scorer (cmpvcm2my00aps601oqykk7nu).
// Captured 2026-06-13 via as_inspect_flow. Run through the same vm.Script wrapper the
// function-handler uses in production.
//
// ANTI-DRIFT: if the flow validator is changed via as_patch_node_field / as_update_flow,
// update VALIDATOR_CODE below to match, or these fixtures will silently test stale logic.
// A live-pull from the flow is intentionally NOT used here: unit tests must stay hermetic
// (offline, no DB/network) for CI. The eval suite exercises the live flow; this file is the
// deterministic regression layer for the BLOCK rules.
const VALIDATOR_CODE = `
var raw = variables.lead_score_payload || "";
raw = raw.replace(/^\`\`\`(?:json)?\\s*\\n?/,"").replace(/\\n?\`\`\`$/,"").trim();
var p;
try { p = JSON.parse(raw); }
catch(e){ var head=String(raw).slice(0,80);
  if(head.indexOf("MALFORMED")===0||head.indexOf("BLOCKED:")===0){return JSON.stringify([{field:"all",rule:"agent_error",detail:head,severity:"error"}]);}
  return JSON.stringify([{field:"all",rule:"json_parse_error",detail:"cannot parse",severity:"error"}]); }
var v=[];
var co=String(p.company||"").trim().toLowerCase();
if(!co||co==="n/a"||co==="na"||co==="none"||co==="unknown"){v.push({field:"company",rule:"missing_lead",detail:"company empty/N/A — no lead to score",severity:"error"});}
var s=p.score;
if(typeof s!=="number"||isNaN(s)||s<0||s>100){v.push({field:"score",rule:"invalid_score",detail:String(s)+" not 0-100",severity:"error"});}
var fit=String(p.fit||"").toLowerCase();
if(["high","medium","low"].indexOf(fit)===-1){v.push({field:"fit",rule:"invalid_fit",detail:fit,severity:"error"});}
if(!Array.isArray(p.reasons)||p.reasons.length===0){v.push({field:"reasons",rule:"missing_reasons",detail:"reasons empty",severity:"error"});}
var BANNED=/\\b(game[- ]?changer|revolutionize|groundbreaking|paradigm shift)\\b/i;
var rtext=(Array.isArray(p.reasons)?p.reasons.join(" "):"");
if(BANNED.test(rtext)){var m=rtext.match(BANNED);v.push({field:"reasons",rule:"banned_phrase",detail:(m?m[0]:"?"),severity:"error"});}
var blocking=v.filter(function(x){return x.severity!=="warning";});
if(blocking.length===0) return "PASS"; return JSON.stringify(v);
`.trim();

interface Violation {
  field: string;
  rule: string;
  detail: string;
  severity: string;
}

function runValidator(lsPayload: unknown): string {
  const raw =
    typeof lsPayload === "string" ? lsPayload : JSON.stringify(lsPayload);
  const variables: Record<string, unknown> = { lead_score_payload: raw };

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

const VALID_LEAD = {
  company: "Acme Corp",
  score: 72,
  fit: "high",
  reasons: ["500-employee B2B SaaS in fintech", "VP Eng downloaded whitepaper"],
  confidence: "2 stars",
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("LS Validator — unit tests (direct vm execution)", () => {
  describe("PASS cases", () => {
    it("accepts a fully valid high-fit lead", () => {
      expect(runValidator(VALID_LEAD)).toBe("PASS");
    });

    it("accepts a medium-fit lead", () => {
      expect(runValidator({ ...VALID_LEAD, score: 55, fit: "medium" })).toBe("PASS");
    });

    it("accepts a low-fit lead (score 0 boundary)", () => {
      expect(runValidator({ ...VALID_LEAD, score: 0, fit: "low" })).toBe("PASS");
    });
  });

  describe("BLOCK — agent_error / json_parse_error", () => {
    it("returns agent_error when payload starts with MALFORMED", () => {
      const result = runValidator("MALFORMED_PAYLOAD: missing lead");
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

  describe("BLOCK — missing_lead", () => {
    it("blocks empty company", () => {
      const result = runValidator({ ...VALID_LEAD, company: "" });
      expect(result).not.toBe("PASS");
      expect(hasRule(result, "missing_lead")).toBe(true);
    });

    it("blocks company = 'N/A'", () => {
      expect(hasRule(runValidator({ ...VALID_LEAD, company: "N/A" }), "missing_lead")).toBe(true);
    });

    it("blocks company = 'unknown'", () => {
      expect(hasRule(runValidator({ ...VALID_LEAD, company: "unknown" }), "missing_lead")).toBe(true);
    });
  });

  describe("BLOCK — invalid_score", () => {
    it("blocks a string score", () => {
      const result = runValidator({ ...VALID_LEAD, score: "good" });
      expect(result).not.toBe("PASS");
      expect(hasRule(result, "invalid_score")).toBe(true);
    });

    it("blocks a score above 100", () => {
      expect(hasRule(runValidator({ ...VALID_LEAD, score: 150 }), "invalid_score")).toBe(true);
    });

    it("blocks a negative score", () => {
      expect(hasRule(runValidator({ ...VALID_LEAD, score: -5 }), "invalid_score")).toBe(true);
    });
  });

  describe("BLOCK — invalid_fit", () => {
    it("blocks fit = 'maybe'", () => {
      const result = runValidator({ ...VALID_LEAD, fit: "maybe" });
      expect(result).not.toBe("PASS");
      expect(hasRule(result, "invalid_fit")).toBe(true);
    });
  });

  describe("BLOCK — missing_reasons", () => {
    it("blocks empty reasons array", () => {
      const result = runValidator({ ...VALID_LEAD, reasons: [] });
      expect(result).not.toBe("PASS");
      expect(hasRule(result, "missing_reasons")).toBe(true);
    });

    it("blocks non-array reasons", () => {
      expect(hasRule(runValidator({ ...VALID_LEAD, reasons: "n/a" }), "missing_reasons")).toBe(true);
    });
  });

  describe("BLOCK — banned_phrase", () => {
    it("blocks a banned hype word in reasons", () => {
      const result = runValidator({
        ...VALID_LEAD,
        reasons: ["Their approach to banking is groundbreaking for the industry"],
      });
      expect(result).not.toBe("PASS");
      expect(hasRule(result, "banned_phrase")).toBe(true);
    });
  });
});
