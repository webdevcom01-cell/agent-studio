import { describe, it, expect } from "vitest";
import { resolveTemplate } from "../template";

describe("resolveTemplate", () => {
  it("replaces simple variables", () => {
    const result = resolveTemplate("Hello {{name}}", { name: "Alice" });
    expect(result).toBe("Hello Alice");
  });

  it("replaces multiple variables", () => {
    const result = resolveTemplate("{{greeting}} {{name}}!", {
      greeting: "Hi",
      name: "Bob",
    });
    expect(result).toBe("Hi Bob!");
  });

  it("handles nested object paths", () => {
    const result = resolveTemplate("City: {{user.address.city}}", {
      user: { address: { city: "Berlin" } },
    });
    expect(result).toBe("City: Berlin");
  });

  it("handles array bracket notation", () => {
    const result = resolveTemplate("First: {{items[0]}}", {
      items: { "0": "apple" },
    });
    expect(result).toBe("First: apple");
  });

  it("preserves placeholder for missing variables", () => {
    const result = resolveTemplate("Value: {{missing}}", {});
    expect(result).toBe("Value: {{missing}}");
  });

  it("preserves template syntax for invalid paths", () => {
    const result = resolveTemplate("{{a.b.c}}", { a: "string" });
    expect(result).toBe("{{a.b.c}}");
  });

  it("returns original string when no placeholders exist", () => {
    const result = resolveTemplate("No variables here", { name: "test" });
    expect(result).toBe("No variables here");
  });

  it("converts numbers to string", () => {
    const result = resolveTemplate("Count: {{count}}", { count: 42 });
    expect(result).toBe("Count: 42");
  });

  it("handles empty template", () => {
    const result = resolveTemplate("", { name: "test" });
    expect(result).toBe("");
  });

  it("preserves placeholder with empty variables", () => {
    const result = resolveTemplate("{{name}}", {});
    expect(result).toBe("{{name}}");
  });

  // ── JSON string auto-parse for nested paths ────────────────────────────

  describe("JSON string auto-parse", () => {
    it("parses JSON string for nested field access", () => {
      const result = resolveTemplate("Decision: {{risk.final_decision}}", {
        risk: '{"final_decision":"APPROVE","score":85}',
      });
      expect(result).toBe("Decision: APPROVE");
    });

    it("accesses deeply nested field in JSON string", () => {
      const result = resolveTemplate("{{agent.result.data.value}}", {
        agent: '{"result":{"data":{"value":"deep_val"}}}',
      });
      expect(result).toBe("deep_val");
    });

    it("returns placeholder when JSON field does not exist", () => {
      const result = resolveTemplate("{{agent.nonexistent}}", {
        agent: '{"name":"test"}',
      });
      expect(result).toBe("{{agent.nonexistent}}");
    });

    it("returns placeholder when value is invalid JSON string", () => {
      const result = resolveTemplate("{{agent.field}}", {
        agent: "not json at all",
      });
      expect(result).toBe("{{agent.field}}");
    });

    it("returns placeholder when variable is null", () => {
      const result = resolveTemplate("{{agent.field}}", {
        agent: null,
      });
      expect(result).toBe("{{agent.field}}");
    });

    it("returns placeholder when variable is undefined", () => {
      const result = resolveTemplate("{{agent.field}}", {
        agent: undefined,
      });
      expect(result).toBe("{{agent.field}}");
    });

    it("serializes nested object from JSON string as JSON", () => {
      const result = resolveTemplate("{{agent.details}}", {
        agent: '{"details":{"a":1,"b":2}}',
      });
      expect(result).toBe('{"a":1,"b":2}');
    });

    it("does not attempt JSON parse for simple variables", () => {
      const result = resolveTemplate("{{name}}", {
        name: '{"should":"not parse"}',
      });
      expect(result).toBe('{"should":"not parse"}');
    });

    it("handles real call_agent scenario end-to-end", () => {
      const result = resolveTemplate(
        "Risk: {{risk_assessment.final_decision}}, Score: {{risk_assessment.score}}",
        {
          risk_assessment: JSON.stringify({
            final_decision: "APPROVE",
            score: 92,
            reasoning: "Low risk profile",
          }),
        },
      );
      expect(result).toBe("Risk: APPROVE, Score: 92");
    });
  });
});
