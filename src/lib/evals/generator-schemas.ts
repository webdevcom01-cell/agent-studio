/**
 * Zod schemas for AI Eval Suite Generator output.
 *
 * Used with generateObject() to produce structured, type-safe test suites
 * from agent context (system prompt + category + KB samples).
 * Follows the same generateObject() pattern as the CLI Generator pipeline.
 */

import { z } from "zod";

// ─── Single generated test case ───────────────────────────────────────────────

/**
 * A single assertion inside a generated test case.
 * We use a simplified subset of EvalAssertion types for generation —
 * the AI only produces the most reliable assertion types; exotic types
 * (exact_match, starts_with) are left to manual authoring.
 */
const GeneratedAssertionSchema = z.discriminatedUnion("type", [
  // Layer 1 — deterministic
  z.object({ type: z.literal("contains"),      value: z.string().min(1) }),
  z.object({ type: z.literal("icontains"),     value: z.string().min(1) }),
  z.object({ type: z.literal("not_contains"),  value: z.string().min(1) }),
  z.object({ type: z.literal("regex"),         value: z.string().min(1) }),
  z.object({ type: z.literal("json_valid") }),
  z.object({ type: z.literal("latency"),       threshold: z.number().positive() }),
  // Layer 2 — semantic
  z.object({
    type: z.literal("semantic_similarity"),
    value: z.string().min(1),
    threshold: z.number().min(0.5).max(0.95).default(0.75),
  }),
  // Layer 3 — LLM-as-Judge
  z.object({
    type: z.literal("llm_rubric"),
    rubric: z.string().min(10),
    threshold: z.number().min(0.5).max(0.95).default(0.70),
  }),
  z.object({
    type: z.literal("kb_faithfulness"),
    threshold: z.number().min(0.5).max(0.95).default(0.80),
  }),
  z.object({
    type: z.literal("relevance"),
    threshold: z.number().min(0.5).max(0.95).default(0.70),
  }),
]);

export type GeneratedAssertion = z.infer<typeof GeneratedAssertionSchema>;

export const GeneratedTestCaseSchema = z.object({
  /** Short, descriptive label e.g. "Node count — L1 deterministic" */
  label: z.string().min(3).max(120),
  /** The exact user message sent to the agent */
  input: z.string().min(5).max(1000),
  /** 1–4 assertions targeting different layers */
  assertions: z.array(GeneratedAssertionSchema).min(1).max(4),
  /** Semantic tags for grouping, e.g. ["happy-path", "rag", "l1"] */
  tags: z.array(z.string()).default([]),
});

export type GeneratedTestCase = z.infer<typeof GeneratedTestCaseSchema>;

// ─── Full generated suite ─────────────────────────────────────────────────────

export const GeneratedEvalSuiteSchema = z.object({
  /** Suite name, e.g. "Auto-generated — Product FAQ Agent" */
  suiteName: z.string().min(3).max(120),
  /** 1-2 sentence summary of what this suite tests */
  suiteDescription: z.string().min(10).max(500),
  /**
   * Generated test cases.
   * Min 3 (smoke test coverage), max 10 (avoids token bloat).
   * The AI is instructed to distribute across happy path, edge cases, and
   * adversarial cases per the category standard.
   */
  testCases: z.array(GeneratedTestCaseSchema).min(3).max(10),
});

export type GeneratedEvalSuite = z.infer<typeof GeneratedEvalSuiteSchema>;

// ─── Generator request ────────────────────────────────────────────────────────

/** Input payload for the /generate API route */
export const GenerateEvalSuiteRequestSchema = z.object({
  /** Agent name (for context in prompts) */
  agentName: z.string().min(1).max(200),
  /** Agent system prompt (main source of context for test generation) */
  systemPrompt: z.string().max(8000).optional(),
  /** Agent category — drives which standards are applied */
  category: z.string().optional(),
  /**
   * Sample KB content snippets (up to 3) for context.
   * Helps generate grounded factual test cases for RAG agents.
   */
  kbSamples: z.array(z.string().max(800)).max(3).optional(),
  /**
   * Target number of test cases (3–10).
   * Default: 5 (balanced coverage without overwhelming cost).
   */
  targetCount: z.number().int().min(3).max(10).default(5),
  /** If true, include runOnDeploy=true on the created suite */
  runOnDeploy: z.boolean().default(true),
});

export type GenerateEvalSuiteRequest = z.infer<typeof GenerateEvalSuiteRequestSchema>;
