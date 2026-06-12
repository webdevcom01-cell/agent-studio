import { describe, it, expect } from "vitest";
import vm from "node:vm";

// Extracted from SAA agent flow node "saa-validator"
// Agent: Software Architecture Advisor (cmq7qzgkh0019nu01a1a261s5), 2026-06-12 via as_inspect_flow
// Run through the same vm.Script wrapper the function-handler uses in production.
const VALIDATOR_CODE = `
var r = variables.saa_response || "";
var v = [];
if (!r.trim()) {
  v.push({rule:"empty_response",severity:"error"});
} else {
  var trimmed = r.trim();
  if (trimmed.length < 200 && !/\\?\\s*$/.test(trimmed)) {
    v.push({rule:"too_short",detail:trimmed.length+" chars",severity:"error"});
  }
  var BANNED = /\\b(game[- ]?changer|revolutionize|groundbreaking|paradigm shift)\\b/i;
  if (BANNED.test(r)) {
    var m = r.match(BANNED);
    v.push({rule:"banned_phrase",detail:(m?m[0]:"?"),severity:"error"});
  }
  if (!/\\b(adr|architecture decision record|recommendation|assessment|analysis|tradeoff|pattern)\\b/i.test(r)) {
    v.push({rule:"missing_sections",detail:"no structural sections detected",severity:"warning"});
  }
}
var blocking = v.filter(function(x){return x.severity !== "warning";});
if (blocking.length === 0) return "PASS";
return JSON.stringify(v);
`.trim();

interface Violation {
  rule: string;
  detail?: string;
  severity: string;
}

function runValidator(response: string): string {
  const variables: Record<string, unknown> = { saa_response: response };

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

const VALID_RESPONSE = `
## Architecture Assessment

The current monolithic Rails application shows tight coupling between the order processing
and inventory modules. Cohesion is reasonable within each domain but scalability bottlenecks
appear at the database layer under write-heavy load.

## ADR: Adopt Modular Monolith Before Microservices

**Status:** Proposed
**Context:** 50k DAU growing 20% MoM; single PostgreSQL instance; 3-engineer team.
**Decision:** Extract bounded contexts into modules first; defer microservices until team reaches 8+.
**Tradeoff table:** Modular monolith — lower ops overhead, harder horizontal scaling.
Microservices — independent scaling, significantly higher operational complexity.
**Migration path:** Phase 1: module boundaries (2 weeks). Phase 2: separate read replicas.
**Failure modes:** Network partition risk eliminated; single point of failure remains at DB.

## Recommendation

Start with the strangler fig pattern on the inventory module. Assessment shows this carries the
lowest risk given current team capacity and provides measurable scalability improvement within 30 days.
`.trim();

function makeResponse(length: number, endChar = ""): string {
  const base = "Architecture analysis and recommendation for your system design tradeoffs pattern.";
  const repeated = base.repeat(Math.ceil((length + 10) / base.length));
  const truncated = repeated.slice(0, length - endChar.length);
  return truncated + endChar;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("SAA Validator — unit tests (direct vm execution)", () => {

  describe("PASS cases", () => {
    it("accepts a fully valid architecture response", () => {
      expect(runValidator(VALID_RESPONSE)).toBe("PASS");
    });

    it("accepts a short clarifying question (ends with ?, passes too_short gate)", () => {
      const question = "What is the current architecture of your system, and what are the main pain points you are experiencing?";
      expect(question.length).toBeLessThan(200);
      expect(runValidator(question)).toBe("PASS");
    });

    it("accepts response of exactly 200 chars without ? (boundary: < 200 triggers, = 200 does not)", () => {
      const r = makeResponse(200);
      expect(r.trim().length).toBe(200);
      expect(runValidator(r)).toBe("PASS");
    });

    it("accepts response with missing_sections keyword absence — missing_sections is warning only, not blocking", () => {
      const noKeywords = "A ".repeat(101).trim();
      expect(noKeywords.length).toBeGreaterThanOrEqual(200);
      const result = runValidator(noKeywords);
      expect(result).toBe("PASS");
    });
  });

  describe("BLOCK — empty_response", () => {
    it("blocks on empty string → empty_response", () => {
      const result = runValidator("");
      expect(result).not.toBe("PASS");
      expect(hasRule(result, "empty_response")).toBe(true);
    });

    it("blocks on whitespace-only string → empty_response", () => {
      const result = runValidator("   \n\t  ");
      expect(result).not.toBe("PASS");
      expect(hasRule(result, "empty_response")).toBe(true);
    });
  });

  describe("BLOCK — too_short", () => {
    it("blocks on 199-char response not ending with ? → too_short", () => {
      const r = makeResponse(199);
      expect(r.trim().length).toBe(199);
      const result = runValidator(r);
      expect(result).not.toBe("PASS");
      expect(hasRule(result, "too_short")).toBe(true);
      const v = violations(result).find((x) => x.rule === "too_short");
      expect(v?.detail).toBe("199 chars");
    });

    it("does NOT block on 199-char response ending with ? (question exemption)", () => {
      const r = makeResponse(199, "?");
      expect(r.trim().length).toBe(199);
      expect(r.trimEnd().endsWith("?")).toBe(true);
      expect(runValidator(r)).toBe("PASS");
    });

    it("does NOT block on 1-char response that is a single ?", () => {
      expect(runValidator("?")).toBe("PASS");
    });

    it("detail string includes char count", () => {
      const r = makeResponse(50);
      const result = runValidator(r);
      expect(hasRule(result, "too_short")).toBe(true);
      const v = violations(result).find((x) => x.rule === "too_short");
      expect(v?.detail).toMatch(/^\d+ chars$/);
    });
  });

  describe("BLOCK — banned_phrase", () => {
    const LONG_PREFIX = "Architecture tradeoff assessment recommendation ADR pattern analysis for this system. "
      .repeat(3);

    it("blocks on 'game-changer' (hyphenated) → banned_phrase", () => {
      const result = runValidator(LONG_PREFIX + "This approach is a game-changer for the platform.");
      expect(result).not.toBe("PASS");
      expect(hasRule(result, "banned_phrase")).toBe(true);
    });

    it("blocks on 'game changer' (spaced) → banned_phrase", () => {
      const result = runValidator(LONG_PREFIX + "This approach is a real game changer for teams.");
      expect(result).not.toBe("PASS");
      expect(hasRule(result, "banned_phrase")).toBe(true);
    });

    it("blocks on 'revolutionize' → banned_phrase", () => {
      const result = runValidator(LONG_PREFIX + "This will revolutionize your software delivery pipeline.");
      expect(result).not.toBe("PASS");
      expect(hasRule(result, "banned_phrase")).toBe(true);
    });

    it("blocks on 'groundbreaking' → banned_phrase", () => {
      const result = runValidator(LONG_PREFIX + "This is a groundbreaking architectural approach.");
      expect(result).not.toBe("PASS");
      expect(hasRule(result, "banned_phrase")).toBe(true);
    });

    it("blocks on 'paradigm shift' → banned_phrase", () => {
      const result = runValidator(LONG_PREFIX + "Microservices represent a paradigm shift in software design.");
      expect(result).not.toBe("PASS");
      expect(hasRule(result, "banned_phrase")).toBe(true);
    });

    it("detail contains the matched phrase", () => {
      const result = runValidator(LONG_PREFIX + "This is groundbreaking architecture work.");
      const v = violations(result).find((x) => x.rule === "banned_phrase");
      expect(v?.detail).toBe("groundbreaking");
    });
  });

  describe("interaction: too_short + banned_phrase both present", () => {
    it("reports both violations when short response contains banned phrase", () => {
      const result = runValidator("This is a game-changer.");
      expect(result).not.toBe("PASS");
      expect(hasRule(result, "too_short")).toBe(true);
      expect(hasRule(result, "banned_phrase")).toBe(true);
    });
  });
});
