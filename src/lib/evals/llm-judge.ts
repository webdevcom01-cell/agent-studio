/**
 * Agent Evals — LLM-as-Judge Evaluators (Layer 3)
 *
 * Three evaluators that use a cheap AI model to score agent responses:
 *
 *   llm_rubric        — custom criteria, 0.0–1.0 score
 *   kb_faithfulness   — checks if response is grounded in KB context (no hallucination)
 *   relevance         — checks if response addresses the input question
 *
 * All evaluators use generateObject() with a strict Zod schema to avoid
 * fragile JSON parsing. Cheapest available model is chosen automatically.
 *
 * Scoring rubric (industry standard):
 *   1.0 → Fully meets criteria
 *   0.8 → Mostly correct with minor issues
 *   0.5 → Partially correct, significant gaps
 *   0.2 → Mostly incorrect
 *   0.0 → Completely wrong / off-topic
 */

import { generateObject } from "ai";
import { z } from "zod";
import { getModel, DEFAULT_MODEL } from "@/lib/ai";
import type { AssertionResult } from "./schemas";

// ─── Judge output schema ──────────────────────────────────────────────────────

const JudgeOutputSchema = z.object({
  score: z
    .number()
    .min(0)
    .max(1)
    .describe("Score from 0.0 (completely fails) to 1.0 (fully meets criteria)"),
  reasoning: z
    .string()
    .describe("1-3 sentence explanation of the score"),
});

type JudgeOutput = z.infer<typeof JudgeOutputSchema>;

// ─── Model selection ──────────────────────────────────────────────────────────

/** Use the default model (DeepSeek) for cost efficiency in evals. */
function getJudgeModel() {
  return getModel(DEFAULT_MODEL);
}

// ─── Shared judge caller ──────────────────────────────────────────────────────

async function callJudge(
  systemPrompt: string,
  userPrompt: string,
): Promise<JudgeOutput> {
  const { object } = await generateObject({
    model: getJudgeModel(),
    schema: JudgeOutputSchema,
    system: systemPrompt,
    prompt: userPrompt,
  });
  return object;
}

// ─── llm_rubric ───────────────────────────────────────────────────────────────

const LLM_RUBRIC_SYSTEM = `You are an impartial AI evaluator. Your job is to assess an AI agent's response against specific evaluation criteria.

## Scoring Scale
- 1.0: Fully meets all criteria — response is correct, complete, and well-formed
- 0.8: Mostly meets criteria — minor omissions that do not affect usefulness
- 0.5: Partially meets criteria — significant gaps or errors present
- 0.2: Mostly fails criteria — misses key requirements
- 0.0: Completely fails — wrong, off-topic, or harmful response

Be objective. Base your score only on the provided criteria, not personal preference.
Respond with a JSON object containing "score" (number) and "reasoning" (string).`;

export async function evaluateLLMRubric(
  input: string,
  output: string,
  rubric: string,
  threshold: number,
): Promise<AssertionResult> {
  const userPrompt = `## User Question
${input}

## Agent Response
${output}

## Evaluation Criteria
${rubric}

Rate the agent's response against the criteria above.`;

  const judge = await callJudge(LLM_RUBRIC_SYSTEM, userPrompt);
  const passed = judge.score >= threshold;

  return {
    type: "llm_rubric",
    passed,
    score: judge.score,
    message: passed
      ? `LLM rubric score ${judge.score.toFixed(2)} meets threshold ${threshold}. ${judge.reasoning}`
      : `LLM rubric score ${judge.score.toFixed(2)} is below threshold ${threshold}. ${judge.reasoning}`,
    details: {
      score: judge.score,
      threshold,
      reasoning: judge.reasoning,
      rubric,
    },
  };
}

// ─── kb_faithfulness ──────────────────────────────────────────────────────────

const KB_FAITHFULNESS_SYSTEM = `You are an impartial AI evaluator checking if an AI agent's response is grounded in the provided context. Your goal is to detect hallucination.

## Scoring Scale
- 1.0: Every claim in the response is fully supported by the context
- 0.8: Most claims are supported; minor additions that are reasonable inferences
- 0.5: Some claims supported, but notable unsupported assertions present
- 0.2: Many claims not found in context — significant hallucination
- 0.0: Response is completely unsupported by context — total hallucination

Focus only on factual grounding, not response quality or helpfulness.
Respond with a JSON object containing "score" (number) and "reasoning" (string).`;

export async function evaluateKBFaithfulness(
  input: string,
  output: string,
  kbContext: string | undefined,
  threshold: number,
): Promise<AssertionResult> {
  if (!kbContext || !kbContext.trim()) {
    return {
      type: "kb_faithfulness",
      passed: false,
      score: 0,
      message:
        "kb_faithfulness requires KB context to be available. No context was retrieved for this test case.",
      details: { threshold, reason: "no_kb_context" },
    };
  }

  const userPrompt = `## User Question
${input}

## Agent Response
${output}

## Retrieved Knowledge Base Context
${kbContext}

Assess how faithfully the agent's response is grounded in the provided KB context.`;

  const judge = await callJudge(KB_FAITHFULNESS_SYSTEM, userPrompt);
  const passed = judge.score >= threshold;

  return {
    type: "kb_faithfulness",
    passed,
    score: judge.score,
    message: passed
      ? `KB faithfulness score ${judge.score.toFixed(2)} meets threshold ${threshold}. ${judge.reasoning}`
      : `KB faithfulness score ${judge.score.toFixed(2)} is below threshold ${threshold}. ${judge.reasoning}`,
    details: {
      score: judge.score,
      threshold,
      reasoning: judge.reasoning,
    },
  };
}

// ─── relevance ────────────────────────────────────────────────────────────────

const RELEVANCE_SYSTEM = `You are an impartial AI evaluator assessing whether an AI agent's response is relevant to and actually answers the user's question.

## Scoring Scale
- 1.0: Response directly and completely addresses the question
- 0.8: Response mostly addresses the question with minor tangential content
- 0.5: Response partially addresses the question but misses key aspects
- 0.2: Response is mostly off-topic or fails to address the question
- 0.0: Response is completely irrelevant to the question

Consider: Does the response answer what was asked? Is the information applicable?
Do not penalize for brevity if the question was simple.
Respond with a JSON object containing "score" (number) and "reasoning" (string).`;

export async function evaluateRelevance(
  input: string,
  output: string,
  threshold: number,
): Promise<AssertionResult> {
  const userPrompt = `## User Question
${input}

## Agent Response
${output}

Assess whether the agent's response is relevant to and answers the user's question.`;

  const judge = await callJudge(RELEVANCE_SYSTEM, userPrompt);
  const passed = judge.score >= threshold;

  return {
    type: "relevance",
    passed,
    score: judge.score,
    message: passed
      ? `Relevance score ${judge.score.toFixed(2)} meets threshold ${threshold}. ${judge.reasoning}`
      : `Relevance score ${judge.score.toFixed(2)} is below threshold ${threshold}. ${judge.reasoning}`,
    details: {
      score: judge.score,
      threshold,
      reasoning: judge.reasoning,
    },
  };
}
