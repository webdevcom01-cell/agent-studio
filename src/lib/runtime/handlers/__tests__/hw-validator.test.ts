import { describe, it, expect } from "vitest";
import vm from "node:vm";

// Extracted from Hook Writer flow node "hw-validator"
// Agent: Hook Writer (cmp832hkithbhj9suiqgmjqpw), 2026-06-14 via as_inspect_flow.
// Hardened P1-11: robust JSON extraction (recover prose-wrapped JSON) on parse failure.
// Run through the same vm.Script wrapper the function-handler uses in production.
const VALIDATOR_CODE = `
var raw=variables.hw_payload||"";
raw=raw.replace(/^\`\`\`(?:json)?\\s*\\n?/,"").replace(/\\n?\`\`\`$/,"").trim();
var p;
try{p=JSON.parse(raw);}catch(e){
  var t=String(raw).slice(0,80);
  if(t.indexOf("BLOCKED:")===0||t.indexOf("MALFORMED_PAYLOAD:")===0){return JSON.stringify([{platform:"all",rule:"agent_error",detail:t,severity:"error"}]);}
  var s=raw.indexOf("{");var en=raw.lastIndexOf("}");
  var ok=false;
  if(s>=0&&en>s){try{p=JSON.parse(raw.slice(s,en+1));ok=true;}catch(e2){ok=false;}}
  if(!ok){return JSON.stringify([{platform:"all",rule:"json_parse_error",detail:"cannot parse hw_payload",severity:"error"}]);}
}
var BN=/\\b(enhance|enhances|enhanced|enhancing|boost|boosts|boosted|boosting|transform|transforms|transformed|transforming|expand|expands|expanded|expanding)\\b/i;
var MX=/\\b(enhance|enhances|enhanced|enhancing|boost|boosts|boosted|boosting|transform|transforms|transformed|transforming|expand|expands|expanded|expanding)\\s+(?:by\\s+)?(\\d+(?:\\.\\d+)?\\s*[%x]|\\d+(?:\\.\\d+)?\\s*times|\\d+(?:\\.\\d+)?\\s*-?fold)/i;
var ST=/\\b\\d+(?:\\.\\d+)?\\s*[%x]|\\b\\d+(?:\\.\\d+)?\\s*(?:times|fold)\\b/i;
var tc=p.trend_context||p.trend||{};
var tt=(tc.title||"").toLowerCase();
var tk=tt.split(/\\s+/).filter(function(w){return w.length>3;});
var ta=(p.angle_used||"").toLowerCase();
var ak=ta.split(/\\s+/).filter(function(w){return w.length>4;});
var allk=tk.concat(ak);
var L={LinkedIn:210,X:280,YouTube:200,Instagram:2200};
var h=p.hooks||[];
var v=[];
// anti-hallucination input guards
var __tt=(tc.title||"").trim().toLowerCase();
if(!__tt||__tt==="n/a"||__tt==="na"||__tt==="none"||__tt==="unknown"){v.push({platform:"all",rule:"missing_trend",detail:"trend_context.title empty/N/A",severity:"error"});}
if(!Array.isArray(h)||h.length!==5){v.push({platform:"all",rule:"wrong_count",detail:(Array.isArray(h)?h.length:0)+"/5",severity:"error"});}
for(var i=0;i<h.length;i++){
  var hk=h[i];var tx=hk.hook_text||"";var pl=hk.platform||"";
  if(pl==="TikTok"){var wc=tx.trim().split(/\\s+/).length;if(wc>12){v.push({platform:pl,rule:"word_limit",detail:wc+"/12",severity:"error"});}}
  else if(L[pl]&&tx.length>L[pl]){v.push({platform:pl,rule:"char_limit",detail:tx.length+"/"+L[pl],severity:"error"});}
  if(BN.test(tx)&&!MX.test(tx)){var bm=tx.match(BN);v.push({platform:pl,rule:"banned_phrase",detail:(bm?bm[0]:"?"),severity:"error"});}
  var hl=tx.toLowerCase();
  var hr=allk.length===0||allk.some(function(kw){return hl.includes(kw);});
  if(!hr){v.push({platform:pl,rule:"trend_name_missing",detail:"no match in: "+tt,severity:"error"});}
  if(ST.test(tx)){v.push({platform:pl,rule:"stat_review",detail:"numeric claim",severity:"warning"});}
}
var bl=v.filter(function(x){return x.severity!=="warning";});
if(bl.length===0){return "PASS";}
return JSON.stringify(v);

`.trim();

interface Violation { platform: string; rule: string; detail: string; severity: string; }

function runValidator(payload: unknown): string {
  const raw = typeof payload === "string" ? payload : JSON.stringify(payload);
  const sandbox: Record<string, unknown> = {
    variables: { hw_payload: raw },
    String, Number, Boolean, Array, Object, Date, Math, JSON,
    parseInt, parseFloat, isNaN, isFinite, RegExp, Map, Set, Error, NaN, Infinity, undefined,
  };
  const ctx = vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } });
  const script = new vm.Script(`"use strict"; (function() { ${VALIDATOR_CODE} })();`);
  return script.runInContext(ctx, { timeout: 5_000 }) as string;
}
const violations = (r: string): Violation[] => JSON.parse(r) as Violation[];
const hasRule = (r: string, rule: string): boolean => violations(r).some((v) => v.rule === rule);

const TREND = { title: "Claude Opus context window", source_url: "https://anthropic.com/x", date_observed: "2026-06-14", is_evergreen: false };
const VALID = {
  objective: "Repurpose these 5 hooks into full platform-native posts",
  output_format: "5 expanded posts, one per platform",
  tool_guidance: "MUST use kb_search.",
  task_boundaries: "One post per hook.",
  trend_context: TREND,
  angle_used: "Shows Claude Opus handling million token context for research teams",
  hooks: [
    { platform: "LinkedIn", hook_text: "Claude Opus shifts how teams handle long context.\nMost research still ignores window limits.", pattern_id: "P1" },
    { platform: "X", hook_text: "Unpopular opinion: context window size matters more than parameters for research.", pattern_id: "P2" },
    { platform: "YouTube", hook_text: "THUMBNAIL: Claude Opus context leap | OPEN: what a million token window means for research teams as scale", pattern_id: "P3" },
    { platform: "Instagram", hook_text: "We builders just watched Claude Opus handle a million token context window.", pattern_id: "P5" },
    { platform: "TikTok", hook_text: "OVERLAY: Claude Opus handles million token context", pattern_id: "P4" },
  ],
};

describe("HW Validator — unit tests (direct vm execution)", () => {
  describe("PASS", () => {
    it("accepts a fully valid 5-hook payload", () => {
      expect(runValidator(VALID)).toBe("PASS");
    });
    it("MX escape: banned verb + immediate measurement is allowed", () => {
      const p = { ...VALID, hooks: VALID.hooks.map((h, i) => i === 0 ? { ...h, hook_text: "Claude Opus boosted 40% on context research" } : h) };
      expect(runValidator(p)).toBe("PASS");
    });
  });

  describe("Robust JSON extraction (Bug A hardening)", () => {
    it("recovers a valid payload wrapped in leading+trailing prose", () => {
      const wrapped = "Here are the 5 hooks:\n" + JSON.stringify(VALID) + "\nLet me know if you need changes.";
      expect(runValidator(wrapped)).toBe("PASS");
    });
    it("recovers a valid payload wrapped in a markdown json fence with trailing note", () => {
      const wrapped = "\u0060\u0060\u0060json\n" + JSON.stringify(VALID) + "\n\u0060\u0060\u0060\nDone.";
      expect(runValidator(wrapped)).toBe("PASS");
    });
    it("still returns json_parse_error for prose with no JSON object", () => {
      expect(hasRule(runValidator("I could not produce hooks for this trend."), "json_parse_error")).toBe(true);
    });
    it("still returns json_parse_error for braces wrapping non-JSON", () => {
      expect(hasRule(runValidator("result: { not really json at all }"), "json_parse_error")).toBe(true);
    });
  });

  describe("BLOCK / agent_error", () => {
    it("agent_error when payload starts with BLOCKED:", () => {
      expect(hasRule(runValidator("BLOCKED: FABRICATED_STAT"), "agent_error")).toBe(true);
    });
    it("banned_phrase: a hook containing 'boost' with no measurement", () => {
      const p = { ...VALID, hooks: VALID.hooks.map((h, i) => i === 1 ? { ...h, hook_text: "Context window boost for research teams" } : h) };
      expect(hasRule(runValidator(p), "banned_phrase")).toBe(true);
    });
    it("char_limit: X hook over 280 chars", () => {
      const long = "Context " + "window ".repeat(60) + "research";
      const p = { ...VALID, hooks: VALID.hooks.map((h) => h.platform === "X" ? { ...h, hook_text: long } : h) };
      expect(hasRule(runValidator(p), "char_limit")).toBe(true);
    });
    it("word_limit: TikTok hook over 12 words", () => {
      const p = { ...VALID, hooks: VALID.hooks.map((h) => h.platform === "TikTok" ? { ...h, hook_text: "OVERLAY: Claude Opus context window research teams scale tokens speed builders ship faster today" } : h) };
      expect(hasRule(runValidator(p), "word_limit")).toBe(true);
    });
    it("wrong_count: fewer than 5 hooks", () => {
      expect(hasRule(runValidator({ ...VALID, hooks: VALID.hooks.slice(0, 4) }), "wrong_count")).toBe(true);
    });
    it("trend_name_missing: hook with no trend terms", () => {
      const p = { ...VALID, hooks: VALID.hooks.map((h, i) => i === 0 ? { ...h, hook_text: "A generic line with nothing relevant here" } : h) };
      expect(hasRule(runValidator(p), "trend_name_missing")).toBe(true);
    });
    it("missing_trend: empty trend title", () => {
      expect(hasRule(runValidator({ ...VALID, trend_context: { ...TREND, title: "" } }), "missing_trend")).toBe(true);
    });
  });
});
