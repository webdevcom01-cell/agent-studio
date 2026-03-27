/**
 * Agent Evals / Testing Framework — Zod Schemas
 *
 * Assertion types follow a 3-layer strategy:
 *   Layer 1 — Deterministic (free, 100% reproducible)
 *   Layer 2 — Semantic similarity (embedding cosine distance)
 *   Layer 3 — LLM-as-Judge (scored 0.0–1.0)
 */

import { z } from "zod";

// ─── Layer 1: Deterministic Assertions ────────────────────────────────────────

const ExactMatchSchema = z.object({
  type: z.literal("exact_match"),
  value: z.string(),
});

const ContainsSchema = z.object({
  type: z.literal("contains"),
  value: z.string(),
});

const IContainsSchema = z.object({
  type: z.literal("icontains"),
  value: z.string(),
});

const NotContainsSchema = z.object({
  type: z.literal("not_contains"),
  value: z.string(),
});

const RegexSchema = z.object({
  type: z.literal("regex"),
  value: z.string(),
});

const StartsWithSchema = z.object({
  type: z.literal("starts_with"),
  value: z.string(),
});

const JsonValidSchema = z.object({
  type: z.literal("json_valid"),
});

const LatencySchema = z.object({
  type: z.literal("latency"),
  threshold: z.number().positive(), // max allowed milliseconds
});

// ─── Layer 2: Semantic Similarity ─────────────────────────────────────────────

const SemanticSimilaritySchema = z.object({
  type: z.literal("semantic_similarity"),
  value: z.string(), // reference text to compare against
  threshold: z.number().min(0).max(1).default(0.8),
});

// ─── Layer 3: LLM-as-Judge ────────────────────────────────────────────────────

const LLMRubricSchema = z.object({
  type: z.literal("llm_rubric"),
  rubric: z.string(), // evaluation criteria in natural language
  threshold: z.number().min(0).max(1).default(0.7),
});

const KBFaithfulnessSchema = z.object({
  type: z.literal("kb_faithfulness"),
  threshold: z.number().min(0).max(1).default(0.7),
});

const RelevanceSchema = z.object({
  type: z.literal("relevance"),
  threshold: z.number().min(0).max(1).default(0.7),
});

// ─── Combined Assertion Schema ────────────────────────────────────────────────

export const EvalAssertionSchema = z.discriminatedUnion("type", [
  ExactMatchSchema,
  ContainsSchema,
  IContainsSchema,
  NotContainsSchema,
  RegexSchema,
  StartsWithSchema,
  JsonValidSchema,
  LatencySchema,
  SemanticSimilaritySchema,
  LLMRubricSchema,
  KBFaithfulnessSchema,
  RelevanceSchema,
]);

export type EvalAssertion = z.infer<typeof EvalAssertionSchema>;

// ─── Assertion Result ─────────────────────────────────────────────────────────

export const AssertionResultSchema = z.object({
  type: z.string(),
  passed: z.boolean(),
  score: z.number().min(0).max(1),
  message: z.string(),
  details: z.record(z.unknown()).optional(),
});

export type AssertionResult = z.infer<typeof AssertionResultSchema>;

// ─── Test Case Input ──────────────────────────────────────────────────────────

export const EvalTestCaseInputSchema = z.object({
  label: z.string().min(1).max(255),
  input: z.string().min(1),
  assertions: z.array(EvalAssertionSchema).min(1).max(20),
  tags: z.array(z.string()).default([]),
  order: z.number().int().default(0),
});

export type EvalTestCaseInput = z.infer<typeof EvalTestCaseInputSchema>;

// ─── Suite Create/Update ──────────────────────────────────────────────────────

export const CreateEvalSuiteSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  isDefault: z.boolean().optional(),
  /** Auto-run this suite every time the agent flow is deployed */
  runOnDeploy: z.boolean().optional(),
});

export const UpdateEvalSuiteSchema = CreateEvalSuiteSchema.partial();

export type CreateEvalSuiteInput = z.infer<typeof CreateEvalSuiteSchema>;
export type UpdateEvalSuiteInput = z.infer<typeof UpdateEvalSuiteSchema>;

// ─── Run Trigger ──────────────────────────────────────────────────────────────

export const TriggerEvalRunSchema = z.object({
  triggeredBy: z.enum(["manual", "deploy", "schedule"]).default("manual"),
});

export type TriggerEvalRunInput = z.infer<typeof TriggerEvalRunSchema>;

// ─── Assertion Context (passed to evaluators) ─────────────────────────────────

export interface AssertionContext {
  /** Original user message sent to the agent */
  input: string;
  /** Agent's actual response */
  output: string;
  /** Response time in milliseconds */
  latencyMs: number;
  /** Retrieved KB context snippets (for kb_faithfulness assertions) */
  kbContext?: string;
}

// ─── Layer type helpers ───────────────────────────────────────────────────────

export type DeterministicAssertionType =
  | "exact_match"
  | "contains"
  | "icontains"
  | "not_contains"
  | "regex"
  | "starts_with"
  | "json_valid"
  | "latency";

export type SemanticAssertionType = "semantic_similarity";

export type LLMJudgeAssertionType =
  | "llm_rubric"
  | "kb_faithfulness"
  | "relevance";

export const DETERMINISTIC_ASSERTION_TYPES: DeterministicAssertionType[] = [
  "exact_match",
  "contains",
  "icontains",
  "not_contains",
  "regex",
  "starts_with",
  "json_valid",
  "latency",
];
