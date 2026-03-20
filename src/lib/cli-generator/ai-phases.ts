import { generateObject } from "ai";
import type { z } from "zod";
import { getModel } from "@/lib/ai";
import { logger } from "@/lib/logger";
import type { PipelineConfig, AIPhaseOutput, GeneratedFiles } from "./types";
import {
  buildAnalyzePrompt,
  buildDesignPrompt,
  buildImplementSingleFilePrompt,
  buildTSImplementSingleFilePrompt,
  buildTestSingleFilePrompt,
  buildTSTestSingleFilePrompt,
  buildDocsPrompt,
  buildTSDocsPrompt,
  buildPublishPrompt,
  buildTSPublishPrompt,
  IMPLEMENT_FILES,
  TS_IMPLEMENT_FILES,
  TEST_FILES,
  TS_TEST_FILES,
  extractPythonSignatures,
  extractTypeScriptSignatures,
  type PromptParts,
} from "./prompts";
import {
  AnalyzeOutputSchema,
  DesignOutputSchema,
  FileContentSchema,
  DocsOutputSchema,
  PublishOutputSchema,
  TSPublishOutputSchema,
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
 * Uses system/user split (Phase 3 — prompt caching) for all providers.
 * Returns the typed object + token usage.
 */
async function callAIObjectWithModel<TSchema extends z.ZodTypeAny>(
  modelId: string,
  schema: TSchema,
  parts: PromptParts,
  options: { maxTokens?: number } = {},
): Promise<{ object: z.infer<TSchema>; usage: TokenUsage | undefined }> {
  const model = getModel(modelId);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_PHASE_TIMEOUT_MS);

  try {
    const response = await generateObject({
      model,
      schema,
      system: parts.system,
      prompt: parts.user,
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
 * Uses generateObject() + Zod schema (Phase 2) and system/user split (Phase 3).
 */
/**
 * Checks if an error is retryable (API 429/500/502/503/504 or network errors).
 * Non-retryable: AbortError (timeout), 400 (bad request), 401 (auth), 403 (forbidden).
 */
function isRetryableError(err: unknown): boolean {
  if (!(err instanceof Error)) return true;
  if (err.name === "AbortError") return false;

  const msg = err.message;
  if (msg.includes("429") || msg.includes("rate limit")) return true;
  if (msg.includes("500") || msg.includes("502") || msg.includes("503") || msg.includes("504")) return true;
  if (msg.includes("ECONNREFUSED") || msg.includes("ETIMEDOUT") || msg.includes("fetch failed")) return true;
  if (msg.includes("400") || msg.includes("401") || msg.includes("403")) return false;

  return true;
}

async function callAIObject<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  parts: PromptParts,
  phase: string,
  options: { maxTokens?: number } = {},
): Promise<{ object: z.infer<TSchema>; usage: TokenUsage | undefined; modelUsed: string; retryCount: number }> {
  const models = [PRIMARY_MODEL, FALLBACK_MODEL];
  const MAX_ROUNDS = 3;
  let lastError = "";
  let totalAttempts = 0;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    for (const modelId of models) {
      totalAttempts++;
      try {
        const result = await callAIObjectWithModel(modelId, schema, parts, options);
        const retryCount = totalAttempts - 1;
        if (retryCount > 0) {
          logger.info(`AI call succeeded after ${retryCount} retries`, { phase, modelId, retryCount });
        }
        return { ...result, modelUsed: modelId, retryCount };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        lastError = msg;

        if (!isRetryableError(err)) {
          throw err instanceof Error && err.name === "AbortError"
            ? new Error(`Phase ${phase} timed out after ${AI_PHASE_TIMEOUT_MS / 1000}s`)
            : err;
        }

        logger.warn(`AI object call failed (round ${round + 1}, model ${modelId})`, {
          phase,
          modelId,
          round,
          attempt: totalAttempts,
          error: msg,
        });
      }
    }

    // Exponential backoff between rounds: 1s, 2s, 4s
    if (round < MAX_ROUNDS - 1) {
      const delayMs = 1000 * Math.pow(2, round);
      logger.info(`AI retry backoff: ${delayMs}ms`, { phase, round: round + 1 });
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw new Error(
    `AI generation failed for phase "${phase}" after ${totalAttempts} attempts (${MAX_ROUNDS} rounds): ${lastError}`,
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

  const { object, usage, modelUsed, retryCount } = await callAIObject(AnalyzeOutputSchema, prompt, "analyze");

  return {
    result: object,
    tokensUsed: buildTokensUsed(usage),
    modelUsed,
    retryCount,
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

  const { object, usage, modelUsed, retryCount } = await callAIObject(DesignOutputSchema, prompt, "design");

  return {
    result: object.tools,
    tokensUsed: buildTokensUsed(usage),
    modelUsed,
    retryCount,
  };
}

// ─── Phase 2: Implement ──────────────────────────────────────────────────────

/**
 * Generates each implementation file in PARALLEL AI calls.
 * Branches on config.target: Python (FastMCP) or TypeScript (Node.js MCP SDK).
 * Files run concurrently via Promise.allSettled.
 * generateObject() replaces parseJsonResponse() — no JSON fragility.
 */
export async function aiImplement(
  config: PipelineConfig,
  designResult: unknown,
): Promise<AIPhaseOutput> {
  const isTS = config.target === "typescript";
  const ctx = {
    applicationName: config.applicationName,
    description: config.description,
    capabilities: config.capabilities,
    platform: config.platform,
    previousResults: [designResult],
  };

  const fileSpecs = isTS ? TS_IMPLEMENT_FILES : IMPLEMENT_FILES;
  const buildPrompt = isTS ? buildTSImplementSingleFilePrompt : buildImplementSingleFilePrompt;

  const results = await Promise.allSettled(
    fileSpecs.map((fileSpec) =>
      callAIObject(
        FileContentSchema,
        buildPrompt(ctx, fileSpec),
        `implement:${fileSpec.filename}`,
        { maxTokens: 2048 },
      ).then((res) => ({ fileSpec, res })),
    ),
  );

  const allFiles: GeneratedFiles = {};
  let totalInput = 0;
  let totalOutput = 0;
  let firstModelUsed: string | undefined;

  for (const result of results) {
    if (result.status === "fulfilled") {
      const { fileSpec, res } = result.value;
      allFiles[fileSpec.filename] = res.object.content;
      totalInput += res.usage?.inputTokens ?? 0;
      totalOutput += res.usage?.outputTokens ?? 0;
      firstModelUsed ??= res.modelUsed;
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
    modelUsed: firstModelUsed,
  };
}

// ─── Phase 3: Test ───────────────────────────────────────────────────────────

/**
 * Generates each test file in PARALLEL AI calls with actual signatures.
 * Branches on config.target: Python (pytest) or TypeScript (Vitest).
 * implementResult is the pre-extracted signatures map from buildPhaseRunners().
 */
export async function aiTest(
  config: PipelineConfig,
  implementResult: unknown,
): Promise<AIPhaseOutput> {
  const isTS = config.target === "typescript";

  // Re-extract signatures with the correct extractor for the target.
  // implementResult may be pre-extracted (from buildPhaseRunners) or raw files.
  const signatures = isTS
    ? extractTypeScriptSignatures(implementResult)
    : extractPythonSignatures(implementResult);

  const ctx = {
    applicationName: config.applicationName,
    description: config.description,
    capabilities: config.capabilities,
    platform: config.platform,
  };

  const fileSpecs = isTS ? TS_TEST_FILES : TEST_FILES;
  const buildPrompt = isTS ? buildTSTestSingleFilePrompt : buildTestSingleFilePrompt;

  const results = await Promise.allSettled(
    fileSpecs.map((fileSpec) =>
      callAIObject(
        FileContentSchema,
        buildPrompt(ctx, fileSpec, signatures),
        `test:${fileSpec.filename}`,
        { maxTokens: 2048 },
      ).then((res) => ({ fileSpec, res })),
    ),
  );

  const allFiles: GeneratedFiles = {};
  let totalInput = 0;
  let totalOutput = 0;
  let firstModelUsed: string | undefined;

  for (const result of results) {
    if (result.status === "fulfilled") {
      const { fileSpec, res } = result.value;
      allFiles[fileSpec.filename] = res.object.content;
      totalInput += res.usage?.inputTokens ?? 0;
      totalOutput += res.usage?.outputTokens ?? 0;
      firstModelUsed ??= res.modelUsed;
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
    modelUsed: firstModelUsed,
  };
}

// ─── Phase 4: Docs ───────────────────────────────────────────────────────────

export async function aiDocs(
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
  const prompt = config.target === "typescript"
    ? buildTSDocsPrompt(ctx)
    : buildDocsPrompt(ctx);

  const { object, usage, modelUsed, retryCount } = await callAIObject(DocsOutputSchema, prompt, "docs", {
    maxTokens: 3000,
  });

  return {
    result: object,
    generatedFiles: { "README.md": object["README.md"] },
    tokensUsed: buildTokensUsed(usage),
    modelUsed,
    retryCount,
  };
}

// ─── Phase 5: Publish ────────────────────────────────────────────────────────

export async function aiPublish(
  config: PipelineConfig,
  designResult: unknown,
): Promise<AIPhaseOutput> {
  const isTS = config.target === "typescript";
  const ctx = {
    applicationName: config.applicationName,
    description: config.description,
    capabilities: config.capabilities,
    platform: config.platform,
    previousResults: [designResult],
  };

  if (isTS) {
    const prompt = buildTSPublishPrompt(ctx);
    const { object, usage, modelUsed, retryCount } = await callAIObject(
      TSPublishOutputSchema,
      prompt,
      "publish",
      { maxTokens: 2000 },
    );
    return {
      result: object,
      generatedFiles: {
        "package.json": object["package.json"],
        "tsconfig.json": object["tsconfig.json"],
      },
      tokensUsed: buildTokensUsed(usage),
      modelUsed,
      retryCount,
    };
  }

  const prompt = buildPublishPrompt(ctx);
  const { object, usage, modelUsed, retryCount } = await callAIObject(PublishOutputSchema, prompt, "publish", {
    maxTokens: 2000,
  });

  return {
    result: object,
    generatedFiles: {
      "requirements.txt": object["requirements.txt"],
      "pyproject.toml": object["pyproject.toml"],
    },
    tokensUsed: buildTokensUsed(usage),
    modelUsed,
    retryCount,
  };
}
