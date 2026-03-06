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

  it("returns empty string for null/undefined values", () => {
    const result = resolveTemplate("Value: {{missing}}", {});
    expect(result).toBe("Value: ");
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

  it("handles empty variables", () => {
    const result = resolveTemplate("{{name}}", {});
    expect(result).toBe("");
  });
});
