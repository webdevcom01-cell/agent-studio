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

// ─── Architecture Output ──────────────────────────────────────────────────────

export const ArchitectureTechStackItemSchema = z.object({
  category: z.string().describe("e.g. Database, Auth, API, Frontend"),
  choice: z.string().describe("e.g. PostgreSQL, NextAuth v5, tRPC"),
  justification: z.string().describe("Why this choice fits the project"),
});

export const ArchitectureOutputSchema = z.object({
  techStack: z
    .array(ArchitectureTechStackItemSchema)
    .min(1)
    .describe("Technology choices with justifications"),
  systemDesign: z.string().describe("High-level system design narrative"),
  databaseSchema: z
    .string()
    .optional()
    .describe("Prisma schema additions or table design, if applicable"),
  apiDesign: z
    .string()
    .optional()
    .describe("API contract outline: routes, methods, request/response shapes"),
  securityConsiderations: z
    .array(z.string())
    .default([])
    .describe("Security controls and threat mitigations"),
  deploymentStrategy: z
    .string()
    .describe("How this will be deployed (Railway, Vercel, Docker, etc.)"),
  summary: z.string().describe("Short human-readable architecture decision summary"),
});

export type ArchitectureOutput = z.infer<typeof ArchitectureOutputSchema>;

// ─── Schema registry ───────────────────────────────────────────────────────────

const SCHEMA_REGISTRY: Record<string, z.ZodTypeAny> = {
  CodeGenOutput: CodeGenOutputSchema,
  PRGateOutput: PRGateOutputSchema,
  ArchitectureOutput: ArchitectureOutputSchema,
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
