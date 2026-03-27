/**
 * RAG-specific Eval Assertions (RAGAS-inspired, Layer 3)
 *
 * Three assertion types that measure RAG pipeline quality:
 *
 *   rag_faithfulness       — Are response claims supported by retrieved context?
 *                            (similar to kb_faithfulness but RAGAS-framed: measures
 *                            what fraction of statements are attributable to context)
 *
 *   rag_context_precision  — Are the retrieved chunks relevant to the question?
 *                            (signal-to-noise in retrieval: 1.0 = all chunks useful,
 *                            0.0 = all chunks irrelevant)
 *
 *   rag_answer_relevancy   — Does the response actually answer what was asked?
 *                            (tests for tangential / evasive answers that are technically
 *                            grounded but still unhelpful)
 *
 * Reference: RAGAS paper (Es et al. 2023) https://arxiv.org/abs/2309.15217
 */

import { generateObject } from "ai";
import { z } from "zod";
import { getModel, DEFAULT_MODEL } from "@/lib/ai";
import type { AssertionResult } from "./schemas";

// ─── Shared judge infrastructure ──────────────────────────────────────────────

const JudgeOutputSchema = z.object({
  score: z.number().min(0).max(1),
  reasoning: z.string(),
});

async function callJudge(system: string, prompt: string) {
  const { object } = await generateObject({
    model: getModel(DEFAULT_MODEL),
    schema: JudgeOutputSchema,
    system,
    prompt,
  });
  return object;
}

// ─── rag_faithfulness ─────────────────────────────────────────────────────────

const RAG_FAITHFULNESS_SYSTEM = `You are a RAGAS evaluator measuring faithfulness.

Faithfulness measures what fraction of the statements in the AI response can be directly inferred from the retrieved context. Statements that rely on outside knowledge (not in the context) reduce the score.

Scoring:
- 1.0: All statements are directly supported by the context
- 0.8: Nearly all statements supported; trivial common-knowledge inferences acceptable
- 0.5: Roughly half the statements are supported; rest use outside knowledge
- 0.2: Most statements are not found in the context
- 0.0: No statements can be traced to the context

Respond with a JSON {"score": number, "reasoning": string}.`;

export async function evaluateRAGFaithfulness(
  input: string,
  output: string,
  kbContext: string | undefined,
  threshold: number,
): Promise<AssertionResult> {
  if (!kbContext?.trim()) {
    return {
      type: "rag_faithfulness",
      passed: false,
      score: 0,
      message: "rag_faithfulness requires KB context. No context was retrieved for this test case.",
      details: { threshold, reason: "no_kb_context" },
    };
  }

  const prompt = `## Question
${input}

## AI Response
${output}

## Retrieved Context
${kbContext}

What fraction of the AI response statements are directly supported by the retrieved context?`;

  const judge = await callJudge(RAG_FAITHFULNESS_SYSTEM, prompt);
  const passed = judge.score >= threshold;

  return {
    type: "rag_faithfulness",
    passed,
    score: judge.score,
    message: passed
      ? `RAG faithfulness ${judge.score.toFixed(2)} ≥ ${threshold}. ${judge.reasoning}`
      : `RAG faithfulness ${judge.score.toFixed(2)} < ${threshold}. ${judge.reasoning}`,
    details: { score: judge.score, threshold, reasoning: judge.reasoning },
  };
}

// ─── rag_context_precision ────────────────────────────────────────────────────

const RAG_CONTEXT_PRECISION_SYSTEM = `You are a RAGAS evaluator measuring context precision.

Context precision measures what fraction of the retrieved context is actually useful/relevant for answering the question. Irrelevant chunks that were retrieved reduce the score.

Scoring:
- 1.0: Every retrieved chunk directly helps answer the question
- 0.8: Most chunks are relevant; one minor off-topic chunk
- 0.5: About half the chunks are relevant; retrieval quality is mediocre
- 0.2: Most chunks are irrelevant to the question
- 0.0: No retrieved chunk is relevant to the question

Respond with a JSON {"score": number, "reasoning": string}.`;

export async function evaluateRAGContextPrecision(
  input: string,
  kbContext: string | undefined,
  threshold: number,
): Promise<AssertionResult> {
  if (!kbContext?.trim()) {
    return {
      type: "rag_context_precision",
      passed: false,
      score: 0,
      message: "rag_context_precision requires KB context. No context was retrieved for this test case.",
      details: { threshold, reason: "no_kb_context" },
    };
  }

  const prompt = `## Question
${input}

## Retrieved Context
${kbContext}

What fraction of the retrieved context chunks are actually relevant and useful for answering the question?`;

  const judge = await callJudge(RAG_CONTEXT_PRECISION_SYSTEM, prompt);
  const passed = judge.score >= threshold;

  return {
    type: "rag_context_precision",
    passed,
    score: judge.score,
    message: passed
      ? `RAG context precision ${judge.score.toFixed(2)} ≥ ${threshold}. ${judge.reasoning}`
      : `RAG context precision ${judge.score.toFixed(2)} < ${threshold}. ${judge.reasoning}`,
    details: { score: judge.score, threshold, reasoning: judge.reasoning },
  };
}

// ─── rag_answer_relevancy ─────────────────────────────────────────────────────

const RAG_ANSWER_RELEVANCY_SYSTEM = `You are a RAGAS evaluator measuring answer relevancy.

Answer relevancy measures whether the AI response actually addresses the question that was asked. A grounded but tangential or evasive response scores low.

Scoring:
- 1.0: Response completely and directly answers the question
- 0.8: Response mostly answers the question; minor tangential content
- 0.5: Response partially answers; misses important aspects or adds excessive padding
- 0.2: Response is mostly off-topic or evasive
- 0.0: Response does not answer the question at all

Do NOT penalise for correct refusals (e.g. "I don't know") — those score 1.0.
Respond with a JSON {"score": number, "reasoning": string}.`;

export async function evaluateRAGAnswerRelevancy(
  input: string,
  output: string,
  threshold: number,
): Promise<AssertionResult> {
  const prompt = `## Question
${input}

## AI Response
${output}

Does the AI response directly and completely answer the question?`;

  const judge = await callJudge(RAG_ANSWER_RELEVANCY_SYSTEM, prompt);
  const passed = judge.score >= threshold;

  return {
    type: "rag_answer_relevancy",
    passed,
    score: judge.score,
    message: passed
      ? `RAG answer relevancy ${judge.score.toFixed(2)} ≥ ${threshold}. ${judge.reasoning}`
      : `RAG answer relevancy ${judge.score.toFixed(2)} < ${threshold}. ${judge.reasoning}`,
    details: { score: judge.score, threshold, reasoning: judge.reasoning },
  };
}
