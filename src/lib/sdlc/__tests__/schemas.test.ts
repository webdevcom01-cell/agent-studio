import { describe, it, expect } from "vitest";
import {
  CodeGenOutputSchema,
  PRGateOutputSchema,
  resolveSchema,
  validateAgainstSchema,
  AVAILABLE_SCHEMAS,
} from "../schemas";

describe("CodeGenOutputSchema", () => {
  it("parses a valid CodeGenOutput", () => {
    const result = CodeGenOutputSchema.safeParse({
      files: [{ path: "src/foo.ts", content: "export const x = 1;", language: "typescript", isNew: true }],
      summary: "Generated a module",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing files array", () => {
    const result = CodeGenOutputSchema.safeParse({ summary: "oops" });
    expect(result.success).toBe(false);
  });

  it("rejects empty files array via superRefine", () => {
    // .min(1) was removed from the z.array() to avoid the minItems JSON Schema keyword
    // (not supported by OpenAI strict-mode response_format). Validation is instead enforced
    // via .superRefine() which is invisible to JSON Schema generation but runs during safeParse.
    const result = CodeGenOutputSchema.safeParse({ files: [], summary: "empty" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain("files");
    }
  });

  it("optional fields are undefined when omitted (no defaults)", () => {
    // .default([]) was removed because OpenAI strict-mode rejects the 'default' keyword.
    // Callers use ?? [] to handle the undefined case.
    const result = CodeGenOutputSchema.safeParse({
      files: [{ path: "a.ts", content: "const x = 1", language: "typescript", isNew: false }],
      summary: "ok",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dependencies).toBeUndefined();
      expect(result.data.envVariables).toBeUndefined();
    }
  });

  it("accepts optional prismaSchemaChanges", () => {
    const result = CodeGenOutputSchema.safeParse({
      files: [{ path: "a.ts", content: "x", language: "typescript", isNew: true }],
      summary: "with prisma",
      prismaSchemaChanges: "model Foo { id Int @id }",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.prismaSchemaChanges).toBe("model Foo { id Int @id }");
    }
  });
});

describe("PRGateOutputSchema", () => {
  const validPRGate = {
    decision: "APPROVE" as const,
    compositeScore: 85,
    securityScore: 90,
    qualityScore: 80,
    issues: [],
    summary: "LGTM",
  };

  it("parses a valid PRGateOutput with no issues", () => {
    const result = PRGateOutputSchema.safeParse(validPRGate);
    expect(result.success).toBe(true);
  });

  it("parses BLOCK decision with issues", () => {
    const result = PRGateOutputSchema.safeParse({
      ...validPRGate,
      decision: "BLOCK",
      compositeScore: 30,
      issues: [
        {
          severity: "CRITICAL",
          category: "security",
          file: "src/auth.ts",
          line: 42,
          message: "SQL injection risk",
          fix: "Use parameterized queries",
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid decision value", () => {
    const result = PRGateOutputSchema.safeParse({ ...validPRGate, decision: "REJECT" });
    expect(result.success).toBe(false);
  });

  it("rejects score out of range", () => {
    const result = PRGateOutputSchema.safeParse({ ...validPRGate, compositeScore: 150 });
    expect(result.success).toBe(false);
  });

  it("rejects issue with missing fix field", () => {
    const result = PRGateOutputSchema.safeParse({
      ...validPRGate,
      issues: [{ severity: "HIGH", category: "quality", file: "a.ts", message: "bad" }],
    });
    expect(result.success).toBe(false);
  });
});

describe("resolveSchema", () => {
  it("resolves CodeGenOutput", () => {
    expect(resolveSchema("CodeGenOutput")).not.toBeNull();
  });

  it("resolves PRGateOutput", () => {
    expect(resolveSchema("PRGateOutput")).not.toBeNull();
  });

  it("returns null for unknown schema", () => {
    expect(resolveSchema("NonExistent")).toBeNull();
  });
});

describe("validateAgainstSchema", () => {
  it("returns success for valid CodeGenOutput", () => {
    const value = {
      files: [{ path: "a.ts", content: "x", language: "typescript", isNew: true }],
      summary: "ok",
    };
    const result = validateAgainstSchema("CodeGenOutput", value);
    expect(result.success).toBe(true);
  });

  it("returns error for invalid CodeGenOutput (missing files)", () => {
    const result = validateAgainstSchema("CodeGenOutput", { summary: "no files" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Schema validation failed");
    }
  });

  it("returns error for unknown schema name", () => {
    const result = validateAgainstSchema("UnknownSchema", {});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Unknown schema");
    }
  });

  it("AVAILABLE_SCHEMAS lists all registered schemas", () => {
    expect(AVAILABLE_SCHEMAS).toContain("CodeGenOutput");
    expect(AVAILABLE_SCHEMAS).toContain("PRGateOutput");
    expect(AVAILABLE_SCHEMAS).toContain("ArchitectureOutput");
    expect(AVAILABLE_SCHEMAS).toContain("ProcessRunOutput");
    expect(AVAILABLE_SCHEMAS).toContain("FileWriteOutput");
    expect(AVAILABLE_SCHEMAS).toContain("GitOutput");
    expect(AVAILABLE_SCHEMAS).toContain("DeployOutput");
    expect(AVAILABLE_SCHEMAS).toContain("CodeReviewOutput");
    expect(AVAILABLE_SCHEMAS.length).toBe(8);
  });
});
