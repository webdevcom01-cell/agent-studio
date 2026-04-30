import { describe, it, expect } from "vitest";
import { validateMCPInputArgs, validateNamedSchema } from "../schema-validator";

describe("validateMCPInputArgs", () => {
  const schema = {
    type: "object",
    required: ["query", "limit"],
    properties: {
      query: { type: "string" },
      limit: { type: "number" },
      verbose: { type: "boolean" },
    },
  };

  it("passes when all required fields are present with correct types", () => {
    const result = validateMCPInputArgs({ query: "test", limit: 10 }, schema);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("fails when a required field is missing", () => {
    const result = validateMCPInputArgs({ query: "test" }, schema);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Required parameter "limit" is missing or empty');
  });

  it("fails when a required field is empty string", () => {
    const result = validateMCPInputArgs({ query: "", limit: 5 }, schema);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('"query"');
  });

  it("fails when a field has wrong type", () => {
    const result = validateMCPInputArgs({ query: "test", limit: "ten" }, schema);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('"limit"');
    expect(result.errors[0]).toContain("number");
  });

  it("passes when optional field is absent", () => {
    const result = validateMCPInputArgs({ query: "hello", limit: 5 }, schema);
    expect(result.valid).toBe(true);
  });

  it("returns valid=true when schema is null", () => {
    const result = validateMCPInputArgs({ anything: "goes" }, null);
    expect(result.valid).toBe(true);
  });

  it("returns valid=true when schema has no required fields", () => {
    const result = validateMCPInputArgs({}, { type: "object", properties: {} });
    expect(result.valid).toBe(true);
  });

  it("handles arrays as type 'array'", () => {
    const arraySchema = {
      type: "object",
      required: ["items"],
      properties: { items: { type: "array" } },
    };
    const result = validateMCPInputArgs({ items: ["a", "b"] }, arraySchema);
    expect(result.valid).toBe(true);
  });
});

describe("validateNamedSchema", () => {
  it("returns valid=true when schemaName is undefined", () => {
    const result = validateNamedSchema(undefined, {}, "Input");
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("returns valid=true when schemaName is __none__", () => {
    const result = validateNamedSchema("__none__", {}, "Input");
    expect(result.valid).toBe(true);
  });

  it("returns valid=true for valid CodeGenOutput", () => {
    const value = {
      files: [{ path: "a.ts", content: "x", language: "typescript", isNew: true }],
      summary: "generated",
      slug: "test-task",
      runId: "a1b2c3d4",
    };
    const result = validateNamedSchema("CodeGenOutput", value, "Output");
    expect(result.valid).toBe(true);
  });

  it("returns valid=false for invalid CodeGenOutput (empty files)", () => {
    const result = validateNamedSchema("CodeGenOutput", { files: [], summary: "x" }, "Output");
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("CodeGenOutput");
  });

  it("returns valid=false for unknown schema name", () => {
    const result = validateNamedSchema("UnknownSchema", {}, "Input");
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("schema validation failed");
  });

  it("includes label in error message", () => {
    const result = validateNamedSchema("CodeGenOutput", { files: [], summary: "x" }, "Input");
    expect(result.errors[0]).toContain("Input schema validation failed");
  });
});
