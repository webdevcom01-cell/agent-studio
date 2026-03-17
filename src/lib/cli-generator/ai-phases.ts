import { generateText } from "ai";
import { getModel } from "@/lib/ai";
import { logger } from "@/lib/logger";
import type { PipelineConfig, AIPhaseOutput, GeneratedFiles } from "./types";
import {
  buildAnalyzePrompt,
  buildDesignPrompt,
  buildImplementSingleFilePrompt,
  buildTestPrompt,
  buildTestSingleFilePrompt,
  buildDocsPrompt,
  buildPublishPrompt,
  IMPLEMENT_FILES,
  TEST_FILES,
  extractPythonSignatures,
} from "./prompts";

const AI_PHASE_TIMEOUT_MS = 180_000;
const PRIMARY_MODEL = "deepseek-chat";
const FALLBACK_MODEL = "gpt-4o-mini";

function resolveModel(): ReturnType<typeof getModel> {
  try {
    return getModel(PRIMARY_MODEL);
  } catch {
    return getModel(FALLBACK_MODEL);
  }
}

function stripCodeFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();
}

function tryRepairJson(text: string): string {
  let repaired = text.trim();

  // Count open/close braces and brackets
  const openBraces = (repaired.match(/{/g) || []).length;
  const closeBraces = (repaired.match(/}/g) || []).length;
  const openBrackets = (repaired.match(/\[/g) || []).length;
  const closeBrackets = (repaired.match(/]/g) || []).length;

  // If the JSON appears truncated (unterminated string), try to close it
  // Find the last complete key-value pair by looking for last complete string
  if (openBraces > closeBraces || openBrackets > closeBrackets) {
    // Check if we're inside an unterminated string value
    const lastQuote = repaired.lastIndexOf('"');
    const lastColon = repaired.lastIndexOf(":");
    const lastComma = repaired.lastIndexOf(",");

    // If the last significant char suggests we're mid-value, truncate to last complete entry
    if (lastComma > lastQuote || lastColon > lastQuote) {
      // We're likely mid-value — truncate to the last comma or complete entry
      const truncateAt = Math.max(
        repaired.lastIndexOf('",'),
        repaired.lastIndexOf('"}'),
        repaired.lastIndexOf('"]'),
      );
      if (truncateAt > 0) {
        repaired = repaired.substring(0, truncateAt + 1);
      }
    }

    // Close remaining brackets/braces
    const missingBrackets = openBrackets - (repaired.match(/]/g) || []).length;
    const missingBraces = openBraces - (repaired.match(/}/g) || []).length;
    repaired += "]".repeat(Math.max(0, missingBrackets));
    repaired += "}".repeat(Math.max(0, missingBraces));
  }

  return repaired;
}

function parseJsonResponse(text: string): unknown {
  const cleaned = stripCodeFences(text);

  // Try direct parse first
  try {
    return JSON.parse(cleaned);
  } catch {
    // Try repair on malformed/truncated JSON
    logger.warn("JSON parse failed, attempting repair", { textLength: cleaned.length });
    try {
      const repaired = tryRepairJson(cleaned);
      return JSON.parse(repaired);
    } catch (repairErr) {
      // Last resort: extract any valid JSON object from the text
      const objectMatch = cleaned.match(/\{[\s\S]*\}/);
      if (objectMatch) {
        try {
          return JSON.parse(objectMatch[0]);
        } catch {
          // Try repair on extracted object too
          try {
            return JSON.parse(tryRepairJson(objectMatch[0]));
          } catch {
            // Give up
          }
        }
      }
      throw new Error(
        `Failed to parse AI response as JSON (length: ${cleaned.length}): ${
          repairErr instanceof Error ? repairErr.message : String(repairErr)
        }`,
      );
    }
  }
}

function extractGeneratedFiles(parsed: unknown): GeneratedFiles | undefined {
  if (typeof parsed !== "object" || parsed === null) return undefined;

  const record = parsed as Record<string, unknown>;
  const files: GeneratedFiles = {};
  let hasFiles = false;

  for (const [key, value] of Object.entries(record)) {
    if (typeof value === "string") {
      files[key] = value;
      hasFiles = true;
    }
  }

  return hasFiles ? files : undefined;
}

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

async function callAIWithModel(
  modelId: string,
  prompt: string,
  phase: string,
  maxTokens?: number,
): Promise<{ text: string; usage: TokenUsage | undefined }> {
  const model = getModel(modelId);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_PHASE_TIMEOUT_MS);

  try {
    const response = await generateText({
      model,
      prompt,
      abortSignal: controller.signal,
      ...(maxTokens ? { maxTokens } : {}),
    });
    return { text: response.text, usage: response.usage };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Calls AI with exponential backoff retry across both models.
 * Retry order: primary → fallback → primary(retry) → fallback(retry)
 * Backoff: 1s, 2s between rounds (doubles each round).
 * Timeout AbortErrors are never retried — they indicate a fundamental size issue.
 */
async function callAI(prompt: string, phase: string, maxTokens?: number): Promise<{
  text: string;
  usage: TokenUsage | undefined;
}> {
  const models = [PRIMARY_MODEL, FALLBACK_MODEL];
  const MAX_ROUNDS = 2;
  let lastError: string = "";

  for (let round = 0; round < MAX_ROUNDS; round++) {
    for (const modelId of models) {
      try {
        return await callAIWithModel(modelId, prompt, phase, maxTokens);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        lastError = msg;

        // Timeout is non-recoverable — abort immediately
        if (err instanceof Error && err.name === "AbortError") {
          throw new Error(`Phase ${phase} timed out after ${AI_PHASE_TIMEOUT_MS / 1000}s`);
        }

        logger.warn(`AI call failed (round ${round + 1}, model ${modelId})`, { phase, modelId, round, error: msg });
      }
    }

    // Exponential backoff between rounds: 1s, 2s, 4s…
    if (round < MAX_ROUNDS - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, round)));
    }
  }

  throw new Error(`AI generation failed for phase "${phase}" after ${MAX_ROUNDS} retry rounds: ${lastError}`);
}

export async function aiAnalyze(config: PipelineConfig): Promise<AIPhaseOutput> {
  const prompt = buildAnalyzePrompt({
    applicationName: config.applicationName,
    description: config.description,
    capabilities: config.capabilities,
    platform: config.platform,
  });

  const { text, usage } = await callAI(prompt, "analyze");
  const result = parseJsonResponse(text);

  return {
    result,
    tokensUsed: buildTokensUsed(usage),
  };
}

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

  const { text, usage } = await callAI(prompt, "design");
  const result = parseJsonResponse(text);

  return {
    result,
    tokensUsed: buildTokensUsed(usage),
  };
}

/**
 * Generates each implementation file in PARALLEL AI calls.
 * 4 files run concurrently via Promise.allSettled — no interdependencies between files.
 * Before: ~97s sequential (4 × 25s). After: ~25s parallel (4x speedup).
 *
 * Promise.allSettled ensures partial success:
 * if one file fails, the others still complete and are kept.
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

  // Fire all 4 file generations concurrently
  const results = await Promise.allSettled(
    IMPLEMENT_FILES.map((fileSpec) =>
      callAI(
        buildImplementSingleFilePrompt(ctx, fileSpec),
        `implement:${fileSpec.filename}`,
        2048,
      ).then((res) => ({ fileSpec, res })),
    ),
  );

  const allFiles: GeneratedFiles = {};
  let totalInput = 0;
  let totalOutput = 0;

  for (const result of results) {
    if (result.status === "fulfilled") {
      const { res } = result.value;
      const parsed = parseJsonResponse(res.text);
      const files = extractGeneratedFiles(parsed);
      if (files) Object.assign(allFiles, files);
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

/**
 * Generates each test file in PARALLEL AI calls with actual Python signatures.
 * Uses extractPythonSignatures() to pass real function names — not truncated content.
 * Before: 3 files in one ~92s call. After: 3 concurrent calls ~30s (3x speedup).
 */
export async function aiTest(
  config: PipelineConfig,
  implementResult: unknown,
): Promise<AIPhaseOutput> {
  // Extract actual function signatures from generated implementation files
  const signatures = extractPythonSignatures(implementResult);

  const ctx = {
    applicationName: config.applicationName,
    description: config.description,
    capabilities: config.capabilities,
    platform: config.platform,
  };

  // Fire all 3 test file generations concurrently
  const results = await Promise.allSettled(
    TEST_FILES.map((fileSpec) =>
      callAI(
        buildTestSingleFilePrompt(ctx, fileSpec, signatures),
        `test:${fileSpec.filename}`,
        2048,
      ).then((res) => ({ fileSpec, res })),
    ),
  );

  const allFiles: GeneratedFiles = {};
  let totalInput = 0;
  let totalOutput = 0;

  for (const result of results) {
    if (result.status === "fulfilled") {
      const { res } = result.value;
      const parsed = parseJsonResponse(res.text);
      const files = extractGeneratedFiles(parsed);
      if (files) Object.assign(allFiles, files);
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

  const { text, usage } = await callAI(prompt, "docs", 3000);
  const parsed = parseJsonResponse(text);
  const generatedFiles = extractGeneratedFiles(parsed);

  return {
    result: parsed,
    generatedFiles,
    tokensUsed: buildTokensUsed(usage),
  };
}

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

  const { text, usage } = await callAI(prompt, "publish", 2000);
  const parsed = parseJsonResponse(text);

  const generatedFiles: GeneratedFiles = {};
  if (typeof parsed === "object" && parsed !== null) {
    const record = parsed as Record<string, unknown>;
    if (typeof record["requirements.txt"] === "string") {
      generatedFiles["requirements.txt"] = record["requirements.txt"];
    }
    if (typeof record["pyproject.toml"] === "string") {
      generatedFiles["pyproject.toml"] = record["pyproject.toml"];
    }
  }

  const hasFiles = Object.keys(generatedFiles).length > 0;

  return {
    result: parsed,
    generatedFiles: hasFiles ? generatedFiles : undefined,
    tokensUsed: buildTokensUsed(usage),
  };
}
