import { generateObject } from "ai";
import type { z } from "zod";
import { getModel } from "@/lib/ai";
import { logger } from "@/lib/logger";
import type { PipelineConfig, AIPhaseOutput, GeneratedFiles } from "./types";
import {
  buildAnalyzePrompt,
  buildDesignPrompt,
  buildImplementSingleFilePrompt,
  buildTestSingleFilePrompt,
  buildDocsPrompt,
  buildPublishPrompt,
  IMPLEMENT_FILES,
  TEST_FILES,
  extractPythonSignatures,
} from "./prompts";
import {
  AnalyzeOutputSchema,
  DesignOutputSchema,
  FileContentSchema,
  DocsOutputSchema,
  PublishOutputSchema,
} from "./schemas";

const AI_PHASE_TIMEOUT_MS = 180_000;
const PRIMARY_MODEL = "deepseek-chat";
const FALLBACK_MODEL = "gpt-4o-mini";

interface TokenUsage {
  inputTokens: number | undefined;
  outputTokens: number | undefined;
}

function buildTokensUsed(
  usage: TokenUsage | undefined,
): { input: number; output: number } | undefined {
  if (!usage) return undefined;
  return { input: usage.inputTokens ?? 0, output: usage.outputTokens ?? 0 };
}

/**
 * Calls generateObject on a single model with an AbortController timeout.
 * Returns the typed object + token usage.
 */
async function callAIObjectWithModel<TSchema extends z.ZodTypeAny>(
  modelId: string,
  schema: TSchema,
  prompt: string,
  options: { maxTokens?: number } = {},
): Promise<{ object: z.infer<TSchema>; usage: TokenUsage | undefined }> {
  const model = getModel(modelId);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_PHASE_TIMEOUT_MS);

  try {
    const response = await generateObject({
      model,
      schema,
      prompt,
      abortSignal: controller.signal,
      ...(options.maxTokens ? { maxTokens: options.maxTokens } : {}),
    });
    return { object: response.object, usage: response.usage };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Calls AI with exponential backoff retry across both models.
 * Retry order: primary → fallback → primary(retry) → fallback(retry)
 * Backoff: 1s, 2s between rounds.
 * Timeout AbortErrors are never retried — they indicate a fundamental size issue.
 *
 * Uses generateObject() + Zod schema — no JSON parsing fragility.
 */
async function callAIObject<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  prompt: string,
  phase: string,
  options: { maxTokens?: number } = {},
): Promise<{ object: z.infer<TSchema>; usage: TokenUsage | undefined }> {
  const models = [PRIMARY_MODEL, FALLBACK_MODEL];
  const MAX_ROUNDS = 2;
  let lastError = "";

  for (let round = 0; round < MAX_ROUNDS; round++) {
    for (const modelId of models) {
      try {
        return await callAIObjectWithModel(modelId, schema, prompt, options);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        lastError = msg;

        // Timeout is non-recoverable — abort immediately
        if (err instanceof Error && err.name === "AbortError") {
          throw new Error(`Phase ${phase} timed out after ${AI_PHASE_TIMEOUT_MS / 1000}s`);
        }

        logger.warn(`AI object call failed (round ${round + 1}, model ${modelId})`, {
          phase,
          modelId,
          round,
          error: msg,
        });
      }
    }

    // Exponential backoff between rounds: 1s, 2s, 4s…
    if (round < MAX_ROUNDS - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, round)));
    }
  }

  throw new Error(
    `AI generation failed for phase "${phase}" after ${MAX_ROUNDS} retry rounds: ${lastError}`,
  );
}

// ─── Phase 0: Analyze ────────────────────────────────────────────────────────

export async function aiAnalyze(config: PipelineConfig): Promise<AIPhaseOutput> {
  const prompt = buildAnalyzePrompt({
    applicationName: config.applicationName,
    description: config.description,
    capabilities: config.capabilities,
    platform: config.platform,
  });

  const { object, usage } = await callAIObject(AnalyzeOutputSchema, prompt, "analyze");

  return {
    result: object,
    tokensUsed: buildTokensUsed(usage),
  };
}

// ─── Phase 1: Design ─────────────────────────────────────────────────────────

export async function aiDesign(
  config: PipelineConfig,
  analysisResult: unknown,
): Promise<AIPhaseOutput> {
  const prompt = buildDesignPrompt({
    applicationName: config.applicationName,
    description: config.description,
    capabilities: config.capabilities,
    platform: config.platform,
    previousResults: [analysisResult],
  });

  const { object, usage } = await callAIObject(DesignOutputSchema, prompt, "design");

  return {
    // Store just the tools array for backward compat with downstream prompts
    result: object.tools,
    tokensUsed: buildTokensUsed(usage),
  };
}

// ─── Phase 2: Implement ──────────────────────────────────────────────────────

/**
 * Generates each implementation file in PARALLEL AI calls.
 * 4 files run concurrently via Promise.allSettled.
 * generateObject() replaces parseJsonResponse() — no JSON fragility.
 */
export async function aiImplement(
  config: PipelineConfig,
  designResult: unknown,
): Promise<AIPhaseOutput> {
  const ctx = {
    applicationName: config.applicationName,
    description: config.description,
    capabilities: config.capabilities,
    platform: config.platform,
    previousResults: [designResult],
  };

  const results = await Promise.allSettled(
    IMPLEMENT_FILES.map((fileSpec) =>
      callAIObject(
        FileContentSchema,
        buildImplementSingleFilePrompt(ctx, fileSpec),
        `implement:${fileSpec.filename}`,
        { maxTokens: 2048 },
      ).then((res) => ({ fileSpec, res })),
    ),
  );

  const allFiles: GeneratedFiles = {};
  let totalInput = 0;
  let totalOutput = 0;

  for (const result of results) {
    if (result.status === "fulfilled") {
      const { fileSpec, res } = result.value;
      allFiles[fileSpec.filename] = res.object.content;
      totalInput += res.usage?.inputTokens ?? 0;
      totalOutput += res.usage?.outputTokens ?? 0;
    } else {
      logger.warn("Implement file generation failed (partial result kept)", {
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    }
  }

  return {
    result: allFiles,
    generatedFiles: Object.keys(allFiles).length > 0 ? allFiles : undefined,
    tokensUsed: { input: totalInput, output: totalOutput },
  };
}

// ─── Phase 3: Test ───────────────────────────────────────────────────────────

/**
 * Generates each test file in PARALLEL AI calls with actual Python signatures.
 * extractPythonSignatures() splits on real newlines (not \\n).
 */
export async function aiTest(
  config: PipelineConfig,
  implementResult: unknown,
): Promise<AIPhaseOutput> {
  const signatures = extractPythonSignatures(implementResult);

  const ctx = {
    applicationName: config.applicationName,
    description: config.description,
    capabilities: config.capabilities,
    platform: config.platform,
  };

  const results = await Promise.allSettled(
    TEST_FILES.map((fileSpec) =>
      callAIObject(
        FileContentSchema,
        buildTestSingleFilePrompt(ctx, fileSpec, signatures),
        `test:${fileSpec.filename}`,
        { maxTokens: 2048 },
      ).then((res) => ({ fileSpec, res })),
    ),
  );

  const allFiles: GeneratedFiles = {};
  let totalInput = 0;
  let totalOutput = 0;

  for (const result of results) {
    if (result.status === "fulfilled") {
      const { fileSpec, res } = result.value;
      allFiles[fileSpec.filename] = res.object.content;
      totalInput += res.usage?.inputTokens ?? 0;
      totalOutput += res.usage?.outputTokens ?? 0;
    } else {
      logger.warn("Test file generation failed (partial result kept)", {
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    }
  }

  return {
    result: allFiles,
    generatedFiles: Object.keys(allFiles).length > 0 ? allFiles : undefined,
    tokensUsed: { input: totalInput, output: totalOutput },
  };
}

// ─── Phase 4: Docs ───────────────────────────────────────────────────────────

export async function aiDocs(
  config: PipelineConfig,
  designResult: unknown,
): Promise<AIPhaseOutput> {
  const prompt = buildDocsPrompt({
    applicationName: config.applicationName,
    description: config.description,
    capabilities: config.capabilities,
    platform: config.platform,
    previousResults: [designResult],
  });

  const { object, usage } = await callAIObject(DocsOutputSchema, prompt, "docs", {
    maxTokens: 3000,
  });

  return {
    result: object,
    generatedFiles: { "README.md": object["README.md"] },
    tokensUsed: buildTokensUsed(usage),
  };
}

// ─── Phase 5: Publish ────────────────────────────────────────────────────────

export async function aiPublish(
  config: PipelineConfig,
  designResult: unknown,
): Promise<AIPhaseOutput> {
  const prompt = buildPublishPrompt({
    applicationName: config.applicationName,
    description: config.description,
    capabilities: config.capabilities,
    platform: config.platform,
    previousResults: [designResult],
  });

  const { object, usage } = await callAIObject(PublishOutputSchema, prompt, "publish", {
    maxTokens: 2000,
  });

  return {
    result: object,
    generatedFiles: {
      "requirements.txt": object["requirements.txt"],
      "pyproject.toml": object["pyproject.toml"],
    },
    tokensUsed: buildTokensUsed(usage),
  };
}
