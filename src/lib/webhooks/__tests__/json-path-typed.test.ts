import { describe, it, expect } from "vitest";
import { resolveJsonPathTyped } from "../json-path";

describe("resolveJsonPathTyped", () => {
  const payload = {
    action: { type: "push", repo: "my-app" },
    commits: [{ message: "fix bug" }],
    nullField: null,
  };

  it("finds a nested value", () => {
    const result = resolveJsonPathTyped(payload, "$.action.type");
    expect(result).toEqual({ found: true, value: "push" });
  });

  it("finds array element", () => {
    const result = resolveJsonPathTyped(payload, "$.commits[0].message");
    expect(result).toEqual({ found: true, value: "fix bug" });
  });

  it("returns found:true for null value (value exists but is null)", () => {
    const result = resolveJsonPathTyped(payload, "$.nullField");
    expect(result).toEqual({ found: true, value: null });
  });

  it("returns found:false when key does not exist", () => {
    const result = resolveJsonPathTyped(payload, "$.nonexistent.deep");
    expect(result.found).toBe(false);
    if (!result.found) {
      expect(result.reason).toContain("nonexistent");
    }
  });

  it("returns found:false when traversing through null", () => {
    const result = resolveJsonPathTyped(payload, "$.nullField.deep");
    expect(result.found).toBe(false);
    if (!result.found) {
      expect(result.reason).toContain("null");
    }
  });

  it("returns found:false for empty path", () => {
    const result = resolveJsonPathTyped(payload, "");
    expect(result.found).toBe(false);
  });

  it("returns found:false for null root", () => {
    const result = resolveJsonPathTyped(null, "$.foo");
    expect(result.found).toBe(false);
  });

  it("returns root for bare $ path", () => {
    const result = resolveJsonPathTyped(payload, "$");
    expect(result).toEqual({ found: true, value: payload });
  });

  it("blocks prototype pollution segments", () => {
    const result = resolveJsonPathTyped(payload, "$.action.__proto__");
    expect(result.found).toBe(false);
    if (!result.found) {
      expect(result.reason).toContain("blocked");
    }
  });
});
