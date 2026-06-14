import { describe, it, expect } from "vitest";
import vm from "node:vm";

// Extracted from Content Repurposer flow node "cr-validator"
// Agent: Content Repurposer (cgfnroihfs8ma03wsmp9bvbhq), 2026-06-14 via as_inspect_flow.
// Hardened P1-11: robust JSON extraction (recover prose-wrapped JSON) on parse failure.
// Run through the same vm.Script wrapper the function-handler uses in production.
const VALIDATOR_CODE = `
var raw=variables.cr_payload||"";
raw=raw.replace(/^\\\`\\\`\\\`(?:json)?\\s*\\n?/,"").replace(/\\n?\\\`\\\`\\\`$/,"").trim();
var p;
try{p=JSON.parse(raw);}catch(e){
  var t=String(raw).slice(0,80);
  if(t.indexOf("BLOCKED:")===0||t.indexOf("MALFORMED_PAYLOAD:")===0){return JSON.stringify([{platform:"all",rule:"agent_error",detail:t,severity:"error"}]);}
  var s=raw.indexOf("{");var en=raw.lastIndexOf("}");
  var ok=false;
  if(s>=0&&en>s){try{p=JSON.parse(raw.slice(s,en+1));ok=true;}catch(e2){ok=false;}}
  if(!ok){return JSON.stringify([{platform:"all",rule:"json_parse_error",detail:"cannot parse cr_payload",severity:"error"}]);}
}
var BN=/\\b(enhance|enhances|enhanced|enhancing|boost|boosts|boosted|boosting|transform|transforms|transformed|transforming|expand|expands|expanded|expanding|revolutionize|revolutionizes|revolutionized|revolutionizing|revolutionary|groundbreaking|game[- ]?changer|game[- ]?changing|paradigm shift|harness the power|unlock potential|drives transformation|AI[- ]powered)\\b/i;
var MX=/\\b(enhance|enhances|enhanced|enhancing|boost|boosts|boosted|boosting|transform|transforms|transformed|transforming|expand|expands|expanded|expanding)\\s+(?:by\\s+)?(\\d+(?:\\.\\d+)?\\s*[%x]|\\d+(?:\\.\\d+)?\\s*times|\\d+(?:\\.\\d+)?\\s*-?fold)/i;
var PLATFORMS=["LinkedIn","X","YouTube","Instagram","TikTok"];
var a2a=["objective","output_format","tool_guidance","task_boundaries"];
var v=[];
// anti-hallucination: reject N/A/empty trend (defense-in-depth; HW guards upstream)
var __ct=((p.trend_context||{}).title||"").trim().toLowerCase();
if(!__ct||__ct==="n/a"||__ct==="na"||__ct==="none"||__ct==="unknown"){v.push({platform:"all",rule:"missing_trend",detail:"trend_context.title empty/N/A",severity:"error"});}
for(var ai=0;ai<a2a.length;ai++){if(!p[a2a[ai]]){v.push({platform:"all",rule:"missing_a2a",detail:a2a[ai],severity:"error"});}}
var posts=p.posts||[];
if(posts.length!==5){v.push({platform:"all",rule:"wrong_count",detail:posts.length+"/5",severity:"error"});}
var seen={};
for(var i=0;i<posts.length;i++){
  var po=posts[i];var pl=po.platform||"?";seen[pl]=true;
  var hook=po.hook_text||"";var fp=po.full_post;
  var fptext="";
  if(typeof fp==="string"){fptext=fp;}
  else if(fp&&typeof fp==="object"){
    var parts=[];
    for(var k in fp){if(fp.hasOwnProperty(k)){var val=fp[k];if(typeof val==="string"){parts.push(val);}else if(Array.isArray(val)){parts.push(val.join(" "));}}}
    fptext=parts.join(" \\n ");
  }
  if(typeof fp==="string"&&hook){
    var __norm=function(s){return String(s).toLowerCase().replace(/\\s+/g," ").replace(/[^a-z0-9 ]/g,"").trim();};
    var hookHead=__norm(hook.split("\\n")[0]);
    if(hookHead.length>0&&__norm(fp).indexOf(hookHead)===-1){v.push({platform:pl,rule:"hook_not_verbatim",detail:"hook opening missing (normalized)",severity:"error"});}
  }
  if(pl==="X"){
    var xlen=(typeof fp==="string"?fp.length:fptext.length);
    if(xlen>280){v.push({platform:pl,rule:"char_limit",detail:xlen+"/280",severity:"error"});}
  }
  if(BN.test(fptext)&&!MX.test(fptext)){var bm=fptext.match(BN);v.push({platform:pl,rule:"banned_phrase",detail:(bm?bm[0]:"?"),severity:"error"});}
}
for(var pi=0;pi<PLATFORMS.length;pi++){if(!seen[PLATFORMS[pi]]){v.push({platform:PLATFORMS[pi],rule:"missing_platform",detail:"not in posts",severity:"error"});}}
var bl=v.filter(function(x){return x.severity!=="warning";});
if(bl.length===0){return "PASS";}
return JSON.stringify(v);
`.trim();

interface Violation { platform: string; rule: string; detail: string; severity: string; }

function runValidator(payload: unknown): string {
  const raw = typeof payload === "string" ? payload : JSON.stringify(payload);
  const sandbox: Record<string, unknown> = {
    variables: { cr_payload: raw },
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
function post(platform: string, hook: string, full: unknown) {
  return { platform, hook_text: hook, pattern_id: "P1", full_post: full, status: "READY_FOR_REVIEW" };
}
const VALID = {
  objective: "Human review and approval of 5 platform posts",
  output_format: "5 platform posts",
  tool_guidance: "MAY use kb_search.",
  task_boundaries: "One post per hook.",
  trend_context: TREND,
  angle_used: "Shows Claude Opus handling million token context for research teams",
  posts: [
    post("LinkedIn", "Claude Opus shifts how teams handle context.", "Claude Opus shifts how teams handle context. Research workflows still ignore the window limits that matter for builders."),
    post("X", "Unpopular opinion: context window beats parameters for research.", "Unpopular opinion: context window beats parameters for research. #Research"),
    post("YouTube", "THUMBNAIL: Claude Opus context | OPEN: what the window means", { title: "Claude Opus context", description: "What the million token window means for research teams.", script_opener: "Claude Opus context changes research.", tags: ["#AI"] }),
    post("Instagram", "We builders watched Claude Opus context grow.", { slide_1: "We builders watched Claude Opus context grow.", slides_2_4: ["window", "tokens", "research"], slide_cta: "Worth saving.", caption: "Claude Opus context #AI" }),
    post("TikTok", "OVERLAY: Claude Opus handles context", { overlay: "Claude Opus handles context", spoken_body: "Claude Opus handles a million token context window for research.", screen_text: ["context", "window"], cta: "Link in bio." }),
  ],
};

describe("CR Validator — unit tests (direct vm execution)", () => {
  describe("PASS", () => {
    it("accepts a fully valid 5-post payload", () => {
      expect(runValidator(VALID)).toBe("PASS");
    });
  });

  describe("Robust JSON extraction (Bug A hardening)", () => {
    it("recovers a valid payload wrapped in leading+trailing prose", () => {
      const wrapped = "Sure, here are the posts:\n" + JSON.stringify(VALID) + "\nHope this helps.";
      expect(runValidator(wrapped)).toBe("PASS");
    });
    it("still returns json_parse_error for prose with no JSON object", () => {
      expect(hasRule(runValidator("I could not expand these hooks."), "json_parse_error")).toBe(true);
    });
  });

  describe("BLOCK / agent_error", () => {
    it("agent_error when payload starts with MALFORMED_PAYLOAD:", () => {
      expect(hasRule(runValidator("MALFORMED_PAYLOAD: missing hooks"), "agent_error")).toBe(true);
    });
    it("char_limit: X full_post over 280 chars", () => {
      const long = "Unpopular opinion: " + "context window ".repeat(30);
      const p = { ...VALID, posts: VALID.posts.map((x) => x.platform === "X" ? post("X", x.hook_text, long) : x) };
      expect(hasRule(runValidator(p), "char_limit")).toBe(true);
    });
    it("banned_phrase: full_post containing 'AI-powered'", () => {
      const p = { ...VALID, posts: VALID.posts.map((x) => x.platform === "LinkedIn" ? post("LinkedIn", x.hook_text, x.hook_text + " This AI-powered approach helps teams.") : x) };
      expect(hasRule(runValidator(p), "banned_phrase")).toBe(true);
    });
    it("missing_a2a: missing objective", () => {
      const { objective: _o, ...rest } = VALID;
      expect(hasRule(runValidator(rest), "missing_a2a")).toBe(true);
    });
    it("wrong_count: fewer than 5 posts", () => {
      expect(hasRule(runValidator({ ...VALID, posts: VALID.posts.slice(0, 4) }), "wrong_count")).toBe(true);
    });
    it("missing_platform: a platform dropped", () => {
      const p = { ...VALID, posts: VALID.posts.filter((x) => x.platform !== "TikTok") };
      expect(hasRule(runValidator(p), "missing_platform")).toBe(true);
    });
    it("hook_not_verbatim: LinkedIn full_post missing hook opening", () => {
      const p = { ...VALID, posts: VALID.posts.map((x) => x.platform === "LinkedIn" ? post("LinkedIn", x.hook_text, "A completely different opening sentence about something else entirely.") : x) };
      expect(hasRule(runValidator(p), "hook_not_verbatim")).toBe(true);
    });
  });
});
