import { generateText } from "ai";
import { getModel } from "@/lib/ai";
import { logger } from "@/lib/logger";
import type { PipelineConfig, AIPhaseOutput, GeneratedFiles } from "./types";
import {
  buildAnalyzePrompt,
  buildDesignPrompt,
  buildImplementPrompt,
  buildTestPrompt,
  buildDocsPrompt,
  buildPublishPrompt,
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

async function callAI(prompt: string, phase: string, maxTokens?: number): Promise<{
  text: string;
  usage: TokenUsage | undefined;
}> {
  const model = resolveModel();
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
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`AI phase "${phase}" failed`, err instanceof Error ? err : new Error(message), {
      phase,
    });
    throw new Error(`AI generation failed for phase "${phase}": ${message}`);
  } finally {
    clearTimeout(timeout);
  }
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

export async function aiImplement(
  config: PipelineConfig,
  designResult: unknown,
): Promise<AIPhaseOutput> {
  const prompt = buildImplementPrompt({
    applicationName: config.applicationName,
    description: config.description,
    capabilities: config.capabilities,
    platform: config.platform,
    previousResults: [designResult],
  });

  const { text, usage } = await callAI(prompt, "implement", 4096);
  const parsed = parseJsonResponse(text);
  const generatedFiles = extractGeneratedFiles(parsed);

  return {
    result: parsed,
    generatedFiles,
    tokensUsed: buildTokensUsed(usage),
  };
}

export async function aiTest(
  config: PipelineConfig,
  implementResult: unknown,
): Promise<AIPhaseOutput> {
  const prompt = buildTestPrompt({
    applicationName: config.applicationName,
    description: config.description,
    capabilities: config.capabilities,
    platform: config.platform,
    previousResults: [implementResult],
  });

  const { text, usage } = await callAI(prompt, "test", 4096);
  const parsed = parseJsonResponse(text);
  const generatedFiles = extractGeneratedFiles(parsed);

  return {
    result: parsed,
    generatedFiles,
    tokensUsed: buildTokensUsed(usage),
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
