/**
 * AI Eval Suite Generator
 *
 * Generates a complete eval suite (name + description + test cases) from
 * agent context using generateObject() + Zod schema validation.
 *
 * Pipeline:
 *   1. Resolve category standard (getCategoryStandard)
 *   2. Build system/user prompts (buildGeneratorPrompt)
 *   3. Call AI via generateObject() with exponential-backoff retry
 *   4. Validate output with GeneratedEvalSuiteSchema
 *   5. Persist suite + test cases via Prisma
 *   6. Return created suite ID for the UI to navigate to
 *
 * Model strategy: deepseek-chat primary (cost-efficient), gpt-4o-mini fallback.
 * Timeout: 60s (eval generation is simpler than full CLI pipeline phases).
 */

import { generateObject } from "ai";
import { getModel } from "@/lib/ai";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { buildGeneratorPrompt } from "./generator-prompts";
import { GeneratedEvalSuiteSchema } from "./generator-schemas";
import type { GenerateEvalSuiteRequest } from "./generator-schemas";

// ─── Constants ────────────────────────────────────────────────────────────────

const GENERATOR_TIMEOUT_MS = 60_000;
const PRIMARY_MODEL = "deepseek-chat";
const FALLBACK_MODEL = "gpt-4o-mini";
const MAX_ROUNDS = 2;

// ─── Result type ──────────────────────────────────────────────────────────────

export interface GeneratedSuiteResult {
  suiteId: string;
  suiteName: string;
  suiteDescription: string;
  testCaseCount: number;
  modelUsed: string;
}

// ─── Internal: call AI with retry ────────────────────────────────────────────

async function callAIWithRetry(
  system: string,
  user: string,
): Promise<{ object: ReturnType<typeof GeneratedEvalSuiteSchema.parse>; modelUsed: string }> {
  const models = [PRIMARY_MODEL, FALLBACK_MODEL];
  let lastError = "";

  for (let round = 0; round < MAX_ROUNDS; round++) {
    for (const modelId of models) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), GENERATOR_TIMEOUT_MS);

      try {
        const model = getModel(modelId);
        const response = await generateObject({
          model,
          schema: GeneratedEvalSuiteSchema,
          system,
          prompt: user,
          abortSignal: controller.signal,
          maxTokens: 4096,
        });

        clearTimeout(timeout);
        return { object: response.object, modelUsed: modelId };
      } catch (err) {
        clearTimeout(timeout);
        const msg = err instanceof Error ? err.message : String(err);
        lastError = msg;

        if (err instanceof Error && err.name === "AbortError") {
          throw new Error(`Eval generation timed out after ${GENERATOR_TIMEOUT_MS / 1000}s`);
        }

        logger.warn("eval_generator_ai_call_failed", {
          modelId,
          round,
          error: msg,
        });
      }
    }

    // Exponential backoff between rounds
    if (round < MAX_ROUNDS - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, round)));
    }
  }

  throw new Error(`Eval generation failed after ${MAX_ROUNDS} rounds: ${lastError}`);
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Generate and persist an eval suite for a given agent.
 *
 * @param agentId  - The agent to create the suite for
 * @param request  - Generator request (agent name, system prompt, category, etc.)
 * @returns        - Created suite metadata
 */
export async function generateEvalSuite(
  agentId: string,
  request: GenerateEvalSuiteRequest,
): Promise<GeneratedSuiteResult> {
  const { agentName, systemPrompt, category, kbSamples, targetCount, runOnDeploy } = request;

  logger.info("eval_generator_start", {
    agentId,
    agentName,
    category,
    targetCount,
    hasSystemPrompt: !!systemPrompt,
    kbSampleCount: kbSamples?.length ?? 0,
  });

  // 1. Build prompts
  const { system, user } = buildGeneratorPrompt(
    agentName,
    systemPrompt,
    category,
    kbSamples,
    targetCount,
  );

  // 2. Call AI
  const { object: generated, modelUsed } = await callAIWithRetry(system, user);

  logger.info("eval_generator_ai_done", {
    agentId,
    modelUsed,
    suiteName: generated.suiteName,
    testCaseCount: generated.testCases.length,
  });

  // 3. Persist suite + test cases in a transaction
  const suite = await prisma.$transaction(async (tx) => {
    const newSuite = await tx.evalSuite.create({
      data: {
        agentId,
        name: generated.suiteName,
        description: generated.suiteDescription,
        isDefault: false,
        runOnDeploy,
      },
    });

    // Bulk-create test cases preserving order
    await tx.evalTestCase.createMany({
      data: generated.testCases.map((tc, idx) => ({
        suiteId: newSuite.id,
        label: tc.label,
        input: tc.input,
        assertions: tc.assertions,
        tags: tc.tags,
        order: idx,
      })),
    });

    return newSuite;
  });

  logger.info("eval_generator_persisted", {
    agentId,
    suiteId: suite.id,
    testCaseCount: generated.testCases.length,
  });

  return {
    suiteId: suite.id,
    suiteName: suite.name,
    suiteDescription: suite.description ?? "",
    testCaseCount: generated.testCases.length,
    modelUsed,
  };
}
