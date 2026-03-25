/**
 * Zod schemas for all 6 CLI generator pipeline phases.
 *
 * Used with generateObject() to get structured, type-safe AI outputs.
 * Eliminates parseJsonResponse / tryRepairJson fragility.
 */

import { z } from "zod";

// ─── Phase 0: Analyze ────────────────────────────────────────────────────────

export const AnalyzeOutputSchema = z.object({
  detectedCLIPaths: z.array(z.string()).default([]).describe(
    "Absolute paths to CLI binary per platform",
  ),
  commonSubcommands: z
    .array(
      z.object({
        name: z.string(),
        description: z.string(),
        flags: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  scriptingInterfaces: z
    .array(
      z.object({
        type: z.string(),
        description: z.string(),
        example: z.string(),
      }),
    )
    .default([]),
  platformBehaviors: z
    .object({
      macOS: z.string().optional(),
      linux: z.string().optional(),
      windows: z.string().optional(),
    })
    .default({}),
});

export type AnalyzeOutput = z.infer<typeof AnalyzeOutputSchema>;

// ─── Phase 1: Design ─────────────────────────────────────────────────────────

export const DesignToolSchema = z.object({
  name: z.string().describe("snake_case tool name prefixed with app name"),
  description: z.string().describe("Clear description of what this tool does"),
  parameters: z
    .record(
      z.string(),
      z.object({
        type: z.enum(["string", "number", "boolean"]),
        description: z.string(),
        required: z.boolean().default(false),
        default: z.string().optional(),
      }),
    )
    .default({}),
});

export type DesignTool = z.infer<typeof DesignToolSchema>;

/** Wraps the tools array so generateObject can produce it reliably */
export const DesignOutputSchema = z.object({
  tools: z.array(DesignToolSchema),
});

export type DesignOutput = z.infer<typeof DesignOutputSchema>;

// ─── Phases 2 & 3: Per-file generation (implement + test) ────────────────────

/**
 * Single-key schema for per-file AI generation.
 * The AI generates one file per call; content is the complete file body.
 * Using { content } avoids special-character key issues (dots, underscores)
 * and eliminates the need for manual \\n escaping instructions.
 */
export const FileContentSchema = z.object({
  content: z.string().describe("Complete file content with real newlines"),
});

export type FileContentOutput = z.infer<typeof FileContentSchema>;

// ─── Phase 4: Docs ───────────────────────────────────────────────────────────

export const DocsOutputSchema = z.object({
  "README.md": z.string().describe("README documentation content"),
});

export type DocsOutput = z.infer<typeof DocsOutputSchema>;

// ─── Phase 5: Publish ────────────────────────────────────────────────────────

export const MCPConfigSchema = z.object({
  name: z.string(),
  version: z.string().default("1.0.0"),
  description: z.string(),
  command: z.string(),
  args: z.array(z.string()).default([]),
  env: z.record(z.string(), z.string()).default({}),
  tools: z.array(z.string()).default([]),
});

export const PublishOutputSchema = z.object({
  "requirements.txt": z.string().describe("Pinned pip dependencies"),
  "pyproject.toml": z.string().describe("PEP 621 project metadata"),
  mcp_config: MCPConfigSchema,
});

export type PublishOutput = z.infer<typeof PublishOutputSchema>;
export type MCPConfig = z.infer<typeof MCPConfigSchema>;

/** Publish schema for TypeScript/Node.js MCP bridge packages. */
export const TSPublishOutputSchema = z.object({
  "package.json": z.string().describe("npm package.json with MCP SDK + Zod dependencies"),
  "tsconfig.json": z.string().describe("TypeScript config: ES2022 NodeNext strict"),
  mcp_config: MCPConfigSchema,
});

export type TSPublishOutput = z.infer<typeof TSPublishOutputSchema>;
