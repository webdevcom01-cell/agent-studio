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

/**
 * Cron expression validation: 5 whitespace-separated fields, optional "|TZ" suffix.
 * Valid examples:
 *   "0 3 * * *"                  → UTC
 *   "0 3 * * *|Europe/Belgrade"  → localized to IANA timezone
 */
const cronExpressionSchema = z
  .string()
  .refine(
    (val) => {
      const pipeIdx = val.lastIndexOf("|");
      const cron = pipeIdx === -1 ? val.trim() : val.slice(0, pipeIdx).trim();
      return /^(\S+\s+){4}\S+$/.test(cron);
    },
    { message: "Invalid cron expression — must be 5 fields (e.g. '0 3 * * *')" },
  )
  .refine(
    (val) => {
      const pipeIdx = val.lastIndexOf("|");
      if (pipeIdx === -1) return true; // no TZ suffix — OK
      const tz = val.slice(pipeIdx + 1).trim();
      if (!tz) return true; // empty TZ — treated as UTC, OK
      try {
        Intl.DateTimeFormat("en-US", { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    },
    { message: "Invalid IANA timezone in cron expression (e.g. 'Europe/Belgrade')" },
  );

export const CreateEvalSuiteSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  isDefault: z.boolean().optional(),
  /** Auto-run this suite every time the agent flow is deployed */
  runOnDeploy: z.boolean().optional(),
  /** Auto-run this suite on a cron schedule */
  scheduleEnabled: z.boolean().optional(),
  /** Cron expression for scheduled runs (e.g. "0 3 * * *") */
  scheduleCron: cronExpressionSchema.optional(),
});

export const UpdateEvalSuiteSchema = CreateEvalSuiteSchema.partial();

export type CreateEvalSuiteInput = z.infer<typeof CreateEvalSuiteSchema>;
export type UpdateEvalSuiteInput = z.infer<typeof UpdateEvalSuiteSchema>;

// ─── Compare Input ────────────────────────────────────────────────────────────

export const CompareEvalRunSchema = z.object({
  /** Type of comparison */
  type: z.enum(["version", "model"]),
  /** ID of flow version A (or model ID if type="model") */
  a: z.string().min(1),
  /** ID of flow version B (or model ID if type="model") */
  b: z.string().min(1),
}).refine((data) => data.a !== data.b, {
  message: "Version/model A and B must be different",
  path: ["b"],
});

export type CompareEvalRunInput = z.infer<typeof CompareEvalRunSchema>;

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

// ─── Assertion layer classification ──────────────────────────────────────────

export const ASSERTION_LAYERS = {
  L1: {
    label: "Deterministic",
    types: [
      "exact_match",
      "contains",
      "icontains",
      "not_contains",
      "regex",
      "starts_with",
      "json_valid",
      "latency",
    ] as string[],
  },
  L2: {
    label: "Semantic",
    types: ["semantic_similarity"] as string[],
  },
  L3: {
    label: "LLM Judge",
    types: ["llm_rubric", "kb_faithfulness", "relevance"] as string[],
  },
} as const;

export type AssertionLayer = keyof typeof ASSERTION_LAYERS;

/**
 * Map an assertion type string to its evaluation layer (L1 / L2 / L3).
 * Defaults to L3 for unknown types (conservative — LLM judge is most expensive).
 */
export function getAssertionLayer(type: string): AssertionLayer {
  if ((ASSERTION_LAYERS.L1.types as string[]).includes(type)) return "L1";
  if ((ASSERTION_LAYERS.L2.types as string[]).includes(type)) return "L2";
  return "L3";
}

// ─── Assertion-level compare breakdown ───────────────────────────────────────

/**
 * Per-layer breakdown used in A/B comparison results.
 * Surfaces how much each evaluation layer contributed to the overall delta.
 */
export interface AssertionLayerBreakdown {
  /** Layer identifier */
  layer: AssertionLayer;
  /** Human-readable layer name */
  layerLabel: string;
  /** Assertion types present in this layer for these test cases */
  assertionTypes: string[];
  /** Total number of assertion comparisons in this layer */
  totalAssertions: number;
  /** Average score across all assertions in this layer for run A (0.0–1.0) */
  avgScoreA: number;
  /** Average score across all assertions in this layer for run B (0.0–1.0) */
  avgScoreB: number;
  /** scoreDelta = avgScoreB - avgScoreA (positive = B improved, negative = B regressed) */
  scoreDelta: number;
  /** Test cases where B scored higher than A in this layer */
  bWins: number;
  /** Test cases where A scored higher than B in this layer */
  aWins: number;
  /** Test cases with equal scores in this layer */
  ties: number;
}

// ─── Compare result types (shared between route and UI) ───────────────────────

/**
 * Comparison delta between two eval runs.
 * Includes overall metrics and per-layer assertion breakdown.
 */
export interface ComparisonDelta {
  /** Overall score difference: runA.score - runB.score (positive = A wins overall) */
  scoreDiff: number;
  /** Average latency difference in ms: avgLatencyA - avgLatencyB */
  latencyDiffMs: number;
  /** Number of test cases where A scored higher overall */
  aWins: number;
  /** Number of test cases where B scored higher overall */
  bWins: number;
  /** Number of test cases with equal overall scores */
  ties: number;
  /** Overall winner based on per-case wins */
  winner: "a" | "b" | "tie";
  /** Per-layer assertion breakdown — empty array if no assertion data available */
  assertionBreakdown: AssertionLayerBreakdown[];
}
