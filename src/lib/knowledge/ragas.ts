/**
 * RAGAS (Retrieval Augmented Generation Assessment) evaluation metrics.
 *
 * Measures RAG pipeline quality across 4 dimensions:
 * faithfulness, context precision, context recall, answer relevancy.
 */

import { generateObject } from "ai";
import { z } from "zod";
import { getModel } from "@/lib/ai";
import { logger } from "@/lib/logger";

const EVAL_MODEL = "gpt-4.1-mini";
const EVAL_TIMEOUT_MS = 30_000;

const ScoreSchema = z.object({
  score: z.number().min(0).max(1),
  reasoning: z.string().optional(),
});

export interface RAGASMetrics {
  faithfulness: number;
  contextPrecision: number;
  contextRecall: number;
  answerRelevancy: number;
  overallScore: number;
}

export interface RAGASEvalInput {
  question: string;
  answer: string;
  contexts: string[];
  groundTruth?: string;
}

export async function evaluateFaithfulness(
  answer: string,
  contexts: string[]
): Promise<number> {
  try {
    const contextBlock = contexts.map((c, i) => `[${i + 1}] ${c.slice(0, 500)}`).join("\n\n");

    const { object } = await generateObject({
      model: getModel(EVAL_MODEL),
      schema: ScoreSchema,
      system: "You are a factual accuracy evaluator. Score how faithful the answer is to the provided source contexts. 1.0 = every claim is supported by the contexts. 0.0 = the answer contradicts or fabricates information not in the contexts.",
      prompt: `Answer: ${answer}\n\nContexts:\n${contextBlock}`,
      maxOutputTokens: 200,
      abortSignal: AbortSignal.timeout(EVAL_TIMEOUT_MS),
    });

    return object.score;
  } catch (err) {
    logger.warn("RAGAS faithfulness eval failed", { error: err instanceof Error ? err.message : String(err) });
    return 0;
  }
}

export async function evaluateContextPrecision(
  question: string,
  contexts: string[]
): Promise<number> {
  if (contexts.length === 0) return 0;

  try {
    const ContextScoresSchema = z.object({
      scores: z.array(z.number().min(0).max(1)),
    });

    const contextList = contexts.map((c, i) => `[${i + 1}] ${c.slice(0, 300)}`).join("\n\n");

    const { object } = await generateObject({
      model: getModel(EVAL_MODEL),
      schema: ContextScoresSchema,
      system: "For each context passage, score whether it is relevant to answering the question. 1 = relevant, 0 = not relevant. Return an array of scores, one per context.",
      prompt: `Question: ${question}\n\nContexts:\n${contextList}`,
      maxOutputTokens: 200,
      abortSignal: AbortSignal.timeout(EVAL_TIMEOUT_MS),
    });

    const scores = object.scores.slice(0, contexts.length);
    if (scores.length === 0) return 0;
    return scores.reduce((sum, s) => sum + s, 0) / scores.length;
  } catch (err) {
    logger.warn("RAGAS context precision eval failed", { error: err instanceof Error ? err.message : String(err) });
    return 0;
  }
}

export async function evaluateAnswerRelevancy(
  question: string,
  answer: string
): Promise<number> {
  try {
    const { object } = await generateObject({
      model: getModel(EVAL_MODEL),
      schema: ScoreSchema,
      system: "You are a relevancy evaluator. Score how well the answer addresses the question. 1.0 = the answer directly and completely addresses the question. 0.0 = the answer is completely off-topic.",
      prompt: `Question: ${question}\n\nAnswer: ${answer}`,
      maxOutputTokens: 200,
      abortSignal: AbortSignal.timeout(EVAL_TIMEOUT_MS),
    });

    return object.score;
  } catch (err) {
    logger.warn("RAGAS answer relevancy eval failed", { error: err instanceof Error ? err.message : String(err) });
    return 0;
  }
}

async function evaluateContextRecall(
  contexts: string[],
  groundTruth: string
): Promise<number> {
  try {
    const { object } = await generateObject({
      model: getModel(EVAL_MODEL),
      schema: ScoreSchema,
      system: "You are a recall evaluator. Given the ground truth answer and the retrieved contexts, score how much of the ground truth information is covered by the contexts. 1.0 = all information in the ground truth can be found in the contexts. 0.0 = none of the ground truth information is in the contexts.",
      prompt: `Ground Truth: ${groundTruth}\n\nContexts:\n${contexts.map((c, i) => `[${i + 1}] ${c.slice(0, 300)}`).join("\n\n")}`,
      maxOutputTokens: 200,
      abortSignal: AbortSignal.timeout(EVAL_TIMEOUT_MS),
    });

    return object.score;
  } catch (err) {
    logger.warn("RAGAS context recall eval failed", { error: err instanceof Error ? err.message : String(err) });
    return 0;
  }
}

export async function evaluateRAGAS(input: RAGASEvalInput): Promise<RAGASMetrics> {
  const evaluations = [
    evaluateFaithfulness(input.answer, input.contexts),
    evaluateContextPrecision(input.question, input.contexts),
    evaluateAnswerRelevancy(input.question, input.answer),
    input.groundTruth
      ? evaluateContextRecall(input.contexts, input.groundTruth)
      : Promise.resolve(-1),
  ];

  const [faithfulness, contextPrecision, answerRelevancy, contextRecall] =
    await Promise.all(evaluations);

  const hasRecall = contextRecall >= 0;
  const scores = [faithfulness, contextPrecision, answerRelevancy];
  if (hasRecall) scores.push(contextRecall);

  const overallScore = scores.length > 0
    ? scores.reduce((sum, s) => sum + s, 0) / scores.length
    : 0;

  return {
    faithfulness,
    contextPrecision,
    contextRecall: hasRecall ? contextRecall : 0,
    answerRelevancy,
    overallScore,
  };
}
