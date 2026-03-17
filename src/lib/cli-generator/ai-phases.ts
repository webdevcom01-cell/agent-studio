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
async function callAIObject<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  parts: PromptParts,
  phase: string,
  options: { maxTokens?: number } = {},
): Promise<{ object: z.infer<TSchema>; usage: TokenUsage | undefined; modelUsed: string }> {
  const models = [PRIMARY_MODEL, FALLBACK_MODEL];
  const MAX_ROUNDS = 2;
  let lastError = "";

  for (let round = 0; round < MAX_ROUNDS; round++) {
    for (const modelId of models) {
      try {
        const result = await callAIObjectWithModel(modelId, schema, parts, options);
        return { ...result, modelUsed: modelId };
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

  const { object, usage, modelUsed } = await callAIObject(AnalyzeOutputSchema, prompt, "analyze");

  return {
    result: object,
    tokensUsed: buildTokensUsed(usage),
    modelUsed,
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

  const { object, usage, modelUsed } = await callAIObject(DesignOutputSchema, prompt, "design");

  return {
    // Store just the tools array for backward compat with downstream prompts
    result: object.tools,
    tokensUsed: buildTokensUsed(usage),
    modelUsed,
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

  const { object, usage, modelUsed } = await callAIObject(DocsOutputSchema, prompt, "docs", {
    maxTokens: 3000,
  });

  return {
    result: object,
    generatedFiles: { "README.md": object["README.md"] },
    tokensUsed: buildTokensUsed(usage),
    modelUsed,
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
    const { object, usage, modelUsed } = await callAIObject(
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
    };
  }

  const prompt = buildPublishPrompt(ctx);
  const { object, usage, modelUsed } = await callAIObject(PublishOutputSchema, prompt, "publish", {
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
  };
}
