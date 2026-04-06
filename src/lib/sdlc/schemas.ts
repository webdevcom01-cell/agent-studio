import { z } from "zod";

// ─── Code Generation Output ────────────────────────────────────────────────────

export const CodeGenFileSchema = z.object({
  path: z.string().describe("Relative file path, e.g. src/app/api/urls/route.ts"),
  content: z.string().describe("Full file content"),
  language: z.string().default("typescript"),
  isNew: z.boolean().describe("true = new file, false = modifying existing"),
});

export const CodeGenOutputSchema = z.object({
  files: z.array(CodeGenFileSchema).min(1).describe("Generated or modified files"),
  dependencies: z
    .array(
      z.object({
        name: z.string(),
        version: z.string(),
        isDev: z.boolean(),
      }),
    )
    .default([])
    .describe("npm packages to add"),
  envVariables: z
    .array(
      z.object({
        key: z.string(),
        description: z.string(),
        required: z.boolean(),
      }),
    )
    .default([])
    .describe("Environment variables required"),
  prismaSchemaChanges: z
    .string()
    .optional()
    .describe("Prisma schema additions/changes, if any"),
  summary: z.string().describe("Short human-readable description of what was generated"),
});

export type CodeGenOutput = z.infer<typeof CodeGenOutputSchema>;

// ─── PR Gate Output ────────────────────────────────────────────────────────────

export const PRGateIssueSchema = z.object({
  severity: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]),
  category: z.enum(["security", "quality", "convention", "performance"]),
  file: z.string(),
  line: z.number().optional(),
  message: z.string(),
  fix: z.string().describe("Concrete actionable fix, not just a diagnosis"),
});

export const PRGateOutputSchema = z.object({
  decision: z.enum(["APPROVE", "APPROVE_WITH_NOTES", "BLOCK"]),
  compositeScore: z.number().min(0).max(100),
  securityScore: z.number().min(0).max(100),
  qualityScore: z.number().min(0).max(100),
  issues: z.array(PRGateIssueSchema).describe("All identified issues with concrete fixes"),
  summary: z.string().describe("Short review summary for the developer"),
});

export type PRGateOutput = z.infer<typeof PRGateOutputSchema>;

// ─── Schema registry ───────────────────────────────────────────────────────────

const SCHEMA_REGISTRY: Record<string, z.ZodTypeAny> = {
  CodeGenOutput: CodeGenOutputSchema,
  PRGateOutput: PRGateOutputSchema,
};

export const AVAILABLE_SCHEMAS = Object.keys(SCHEMA_REGISTRY);

export function resolveSchema(name: string): z.ZodTypeAny | null {
  return SCHEMA_REGISTRY[name] ?? null;
}

/**
 * Validates an unknown value against a named schema.
 * Returns the parsed value on success, or a Zod error message on failure.
 */
export function validateAgainstSchema(
  name: string,
  value: unknown,
): { success: true; data: unknown } | { success: false; error: string } {
  const schema = resolveSchema(name);
  if (!schema) {
    return { success: false, error: `Unknown schema: "${name}"` };
  }
  const result = schema.safeParse(value);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const firstIssues = result.error.issues
    .slice(0, 3)
    .map((i) => `${i.path.join(".")}: ${i.message}`)
    .join("; ");
  return { success: false, error: `Schema validation failed — ${firstIssues}` };
}
