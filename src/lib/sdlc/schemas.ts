import { z } from "zod";

// ─── Code Generation Output ────────────────────────────────────────────────────

export const CodeGenFileSchema = z.object({
  path: z.string().describe("Relative file path, e.g. src/app/api/urls/route.ts"),
  content: z.string().describe("Full file content"),
  // No .default() — OpenAI strict-mode response_format does not support default keywords
  language: z.string().describe("Language identifier: typescript, tsx, javascript, python, etc."),
  isNew: z.boolean().describe("true = new file, false = modifying existing"),
});

export const CodeGenOutputSchema = z
  .object({
    // No .min(1) — minItems is not supported by OpenAI structured output strict mode.
    // Non-empty validation is enforced via .superRefine() below (invisible to JSON Schema).
    files: z.array(CodeGenFileSchema).describe("Generated or modified source files"),
  // .optional() instead of .default([]) — OpenAI strict mode rejects the 'default' JSON schema keyword
  dependencies: z
    .array(
      z.object({
        name: z.string(),
        version: z.string(),
        isDev: z.boolean(),
      }),
    )
    .optional()
    .describe("npm packages to add; omit if none"),
  envVariables: z
    .array(
      z.object({
        key: z.string(),
        description: z.string(),
        required: z.boolean(),
      }),
    )
    .optional()
    .describe("Environment variables required; omit if none"),
  prismaSchemaChanges: z
    .string()
    .optional()
    .describe("Prisma schema additions/changes, if any"),
  summary: z.string().describe("Short human-readable description of what was generated"),
  slug: z
    .string()
    .describe(
      "Kebab-case task identifier, max 30 characters, used as workspace dir and git branch suffix (e.g. 'sum-array', 'user-auth-jwt')",
    ),
  runId: z
    .string()
    .describe(
      "Random 8-character lowercase hex string unique to this run (e.g. 'a3f9e1b7'). Must differ on every invocation.",
    ),
  })
  .superRefine((data, ctx) => {
    if (data.files.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.too_small,
        minimum: 1,
        type: "array",
        inclusive: true,
        message: "CodeGenOutput must contain at least one file",
        path: ["files"],
      });
    }
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

// ─── Process Run Output ────────────────────────────────────────────────────────

export const ProcessRunOutputSchema = z.object({
  success: z.boolean(),
  command: z.string(),
  stdout: z.string().default(""),
  stderr: z.string().default(""),
  exitCode: z.number().default(0),
  durationMs: z.number().default(0),
});

export type ProcessRunOutput = z.infer<typeof ProcessRunOutputSchema>;

// ─── File Write Output ────────────────────────────────────────────────────────

export const FileWriteOutputSchema = z.object({
  filesWritten: z.array(z.string()),
  errors: z.array(z.string()).default([]),
  targetDir: z.string(),
  success: z.boolean(),
});

export type FileWriteOutput = z.infer<typeof FileWriteOutputSchema>;

// ─── Git Output ───────────────────────────────────────────────────────────────

export const GitOutputSchema = z.object({
  branch: z.string(),
  commitHash: z.string().optional(),
  pushed: z.boolean().default(false),
  success: z.boolean(),
  message: z.string(),
});

export type GitOutput = z.infer<typeof GitOutputSchema>;

// ─── Deploy Output ────────────────────────────────────────────────────────────

export const DeployOutputSchema = z.object({
  deploymentId: z.string(),
  url: z.string(),
  status: z.enum(["READY", "ERROR", "BUILDING", "CANCELED"]),
  target: z.enum(["staging", "production"]),
  durationMs: z.number().default(0),
  logs: z.string().default(""),
});

export type DeployOutput = z.infer<typeof DeployOutputSchema>;

// ─── Code Review Output (v2 SDLC pipeline) ────────────────────────────────────
// Used by the code_review node in the Autonomous Pipeline to gate the human_approval
// step. Decision == "BLOCK" routes into the fix loop; APPROVE* proceeds to approval.

export const CodeReviewIssueSchema = z.object({
  severity: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]),
  category: z.enum(["security", "quality", "convention", "performance"]),
  file: z.string().describe("Relative file path where the issue was found"),
  line: z.number().optional().describe("Approximate line number, if determinable"),
  message: z.string().describe("Clear description of the issue"),
  fix: z.string().describe("Concrete, actionable fix — not just a diagnosis"),
});

export const CodeReviewOutputSchema = z.object({
  decision: z
    .enum(["APPROVE", "APPROVE_WITH_NOTES", "BLOCK"])
    .describe(
      "APPROVE = merge-ready, APPROVE_WITH_NOTES = minor issues (proceed), BLOCK = must fix before proceeding"
    ),
  compositeScore: z.number().min(0).max(100).describe("Overall code quality score 0–100"),
  securityScore: z.number().min(0).max(100),
  qualityScore: z.number().min(0).max(100),
  conventionScore: z.number().min(0).max(100).describe("Adherence to project conventions"),
  issues: z.array(CodeReviewIssueSchema).describe("All identified issues with concrete fixes"),
  blockingIssues: z
    .array(CodeReviewIssueSchema)
    .describe("Subset of issues that must be resolved before APPROVE"),
  summary: z.string().describe("Short review summary (2–4 sentences) for the developer"),
  fixInstructions: z
    .string()
    .optional()
    .describe("If BLOCK: precise instructions for the fix loop to resolve blocking issues"),
});

export type CodeReviewIssue = z.infer<typeof CodeReviewIssueSchema>;
export type CodeReviewOutput = z.infer<typeof CodeReviewOutputSchema>;

// ─── Static Analysis Output ───────────────────────────────────────────────────

export const StaticAnalysisTsErrorSchema = z.object({
  file: z.string().describe("Absolute file path where the error was found"),
  line: z.number(),
  col: z.number(),
  code: z.string().describe("TypeScript error code, e.g. TS2345"),
  message: z.string(),
});

export const StaticAnalysisEslintIssueSchema = z.object({
  file: z.string().describe("Absolute file path where the issue was found"),
  line: z.number(),
  col: z.number(),
  severity: z.enum(["error", "warning"]),
  ruleId: z.string().describe("ESLint rule ID, e.g. @typescript-eslint/no-unused-vars"),
  message: z.string(),
});

export const StaticAnalysisOutputSchema = z.object({
  typecheckPassed: z.boolean(),
  lintPassed: z.boolean(),
  typescriptErrors: z.array(StaticAnalysisTsErrorSchema),
  eslintErrors: z.array(StaticAnalysisEslintIssueSchema),
  eslintWarnings: z.array(StaticAnalysisEslintIssueSchema),
  summary: z.string().describe("One-line human-readable result, e.g. '✅ TypeScript: PASSED | ⚠️ ESLint: 0 errors, 2 warnings'"),
  durationMs: z.number().default(0),
});

export type StaticAnalysisTsError = z.infer<typeof StaticAnalysisTsErrorSchema>;
export type StaticAnalysisEslintIssue = z.infer<typeof StaticAnalysisEslintIssueSchema>;
export type StaticAnalysisOutput = z.infer<typeof StaticAnalysisOutputSchema>;

// ─── Schema registry ───────────────────────────────────────────────────────────

const SCHEMA_REGISTRY: Record<string, z.ZodTypeAny> = {
  CodeGenOutput: CodeGenOutputSchema,
  PRGateOutput: PRGateOutputSchema,
  ArchitectureOutput: ArchitectureOutputSchema,
  ProcessRunOutput: ProcessRunOutputSchema,
  FileWriteOutput: FileWriteOutputSchema,
  GitOutput: GitOutputSchema,
  DeployOutput: DeployOutputSchema,
  CodeReviewOutput: CodeReviewOutputSchema,
  StaticAnalysisOutput: StaticAnalysisOutputSchema,
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
