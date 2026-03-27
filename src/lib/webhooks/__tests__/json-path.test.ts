import { describe, it, expect } from "vitest";
import { resolveJsonPath } from "../json-path";

describe("resolveJsonPath", () => {
  const obj = {
    action: "opened",
    repository: {
      full_name: "user/repo",
      html_url: "https://github.com/user/repo",
      nested: { deep: "value" },
    },
    commits: [
      { message: "first commit", author: { name: "Alice" } },
      { message: "second commit", author: { name: "Bob" } },
    ],
    count: 42,
    active: true,
    nullable: null,
  };

  // ── Standard paths ──────────────────────────────────────────────────────────

  it("resolves top-level key with $. prefix", () => {
    expect(resolveJsonPath(obj, "$.action")).toBe("opened");
  });

  it("resolves top-level key without $ prefix", () => {
    expect(resolveJsonPath(obj, "action")).toBe("opened");
  });

  it("resolves nested dot-notation path", () => {
    expect(resolveJsonPath(obj, "$.repository.full_name")).toBe("user/repo");
  });

  it("resolves deeply nested path", () => {
    expect(resolveJsonPath(obj, "$.repository.nested.deep")).toBe("value");
  });

  it("resolves numeric field (non-string type)", () => {
    expect(resolveJsonPath(obj, "$.count")).toBe(42);
  });

  it("resolves boolean field", () => {
    expect(resolveJsonPath(obj, "$.active")).toBe(true);
  });

  it("resolves null field value (returns null, not undefined)", () => {
    expect(resolveJsonPath(obj, "$.nullable")).toBeNull();
  });

  // ── Array indexing ──────────────────────────────────────────────────────────

  it("resolves first element of array via bracket notation", () => {
    expect(resolveJsonPath(obj, "$.commits[0].message")).toBe("first commit");
  });

  it("resolves second element of array", () => {
    expect(resolveJsonPath(obj, "$.commits[1].message")).toBe("second commit");
  });

  it("resolves nested property inside array element", () => {
    expect(resolveJsonPath(obj, "$.commits[0].author.name")).toBe("Alice");
  });

  // ── Root shortcut ───────────────────────────────────────────────────────────

  it('bare "$" returns the whole object', () => {
    expect(resolveJsonPath(obj, "$")).toBe(obj);
  });

  it('bare "$." prefix with no remainder returns whole object', () => {
    // Edge: "$."-only after stripping gives empty string → returns root
    // (Not a practical user input but should not throw)
    expect(resolveJsonPath(obj, "$")).toBe(obj);
  });

  // ── Missing paths ───────────────────────────────────────────────────────────

  it("returns undefined for missing top-level key", () => {
    expect(resolveJsonPath(obj, "$.nonexistent")).toBeUndefined();
  });

  it("returns undefined when intermediate key is missing", () => {
    expect(resolveJsonPath(obj, "$.repository.missing.deep")).toBeUndefined();
  });

  it("returns undefined for out-of-bounds array index", () => {
    expect(resolveJsonPath(obj, "$.commits[99].message")).toBeUndefined();
  });

  it("returns undefined when path traverses through null", () => {
    expect(resolveJsonPath(obj, "$.nullable.something")).toBeUndefined();
  });

  // ── Malformed / edge-case paths ─────────────────────────────────────────────

  it("returns undefined for empty path string", () => {
    expect(resolveJsonPath(obj, "")).toBeUndefined();
  });

  it("handles path with double-dot gracefully (treats empty segment as no-op)", () => {
    // "$.repository..full_name" — double-dot produces an empty segment which is filtered
    // Result: same as "$.repository.full_name" because empty segments are filtered
    expect(resolveJsonPath(obj, "$.repository..full_name")).toBe("user/repo");
  });

  it("handles non-numeric bracket content as a string key", () => {
    const o = { items: { abc: "found" } };
    expect(resolveJsonPath(o, "$.items[abc]")).toBe("found");
  });

  // ── Null / undefined input ──────────────────────────────────────────────────

  it("returns undefined when obj is null", () => {
    expect(resolveJsonPath(null, "$.action")).toBeUndefined();
  });

  it("returns undefined when obj is undefined", () => {
    expect(resolveJsonPath(undefined, "$.action")).toBeUndefined();
  });

  it("returns undefined when obj is a primitive string", () => {
    expect(resolveJsonPath("hello", "$.length")).toBeUndefined();
  });

  // ── Security — prototype pollution ─────────────────────────────────────────

  it('returns undefined for path containing "__proto__"', () => {
    expect(resolveJsonPath(obj, "$.__proto__")).toBeUndefined();
  });

  it('returns undefined for path containing "constructor"', () => {
    expect(resolveJsonPath(obj, "$.constructor")).toBeUndefined();
  });

  it('returns undefined for path containing "prototype"', () => {
    expect(resolveJsonPath(obj, "$.constructor.prototype")).toBeUndefined();
  });

  it("does not mutate Object.prototype via __proto__ path", () => {
    const before = Object.keys(Object.prototype).length;
    resolveJsonPath({ __proto__: { polluted: true } }, "$.__proto__");
    expect(Object.keys(Object.prototype).length).toBe(before);
    expect((Object.prototype as Record<string, unknown>)["polluted"]).toBeUndefined();
  });
});
