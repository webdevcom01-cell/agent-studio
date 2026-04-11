/**
 * SDK Learn Hook — Phase 3 (P3) ECC integration for claude_agent_sdk node
 *
 * Fires **non-blocking** (fire-and-forget) after every successful claude_agent_sdk
 * execution. Two responsibilities:
 *
 *  1. Always  — record an AgentExecution row for observability/history
 *  2. ECC-only — if ECC is globally enabled AND the agent has `eccEnabled = true`:
 *               use a lightweight AI call (Haiku) to extract a reusable pattern,
 *               then create or reinforce the matching Instinct in the DB.
 *
 * Design constraints:
 *  - NEVER blocks the handler return path — call as `void fireSdkLearnHook(...)`
 *  - NEVER throws — all errors are caught and logged as warnings
 *  - Confidence boost is smaller than the manual Learn node (0.05 vs 0.1) because
 *    automatic extraction is less precise than human-labelled patterns
 *  - Pattern names are normalised to kebab-case and capped at 60 chars
 */

import { generateText } from "ai";
import { getModel } from "@/lib/ai";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { recordMetric } from "@/lib/observability/metrics";
import { isECCEnabled } from "./feature-flag";
import type { Prisma } from "@/generated/prisma";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Confidence added each time an auto-extracted pattern is seen again */
const AUTO_CONFIDENCE_BOOST = 0.05;

/** Starting confidence for a brand-new auto-extracted instinct */
const AUTO_CONFIDENCE_INITIAL = 0.05;

/** Max execution IDs to retain in the instinct examples JSON */
const MAX_EXAMPLE_IDS = 10;

/** Haiku is used for the extraction call — speed > power for background tasks */
const EXTRACT_MODEL = "claude-haiku-4-5-20251001";

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface SdkExecutionRecord {
  agentId: string;
  userId?: string;
  /** The resolved user task string sent to the model */
  task: string;
  /** The model's final text response */
  response: string;
  modelId: string;
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  /** DB session ID if session persistence was active */
  sessionId?: string;
  /** OTEL trace ID for cross-referencing */
  traceId?: string;
}

/**
 * Main hook entry point. Call as fire-and-forget from handler code:
 * ```ts
 * void fireSdkLearnHook({ agentId, task, response, ... });
 * ```
 */
export async function fireSdkLearnHook(
  record: SdkExecutionRecord
): Promise<void> {
  try {
    // 1. Record execution (always — ECC not required)
    const execution = await recordSdkExecution(record);

    recordMetric("sdk.execution.recorded", 1, "count", {
      agentId: record.agentId,
    });

    // 2. Early exit if ECC is globally disabled
    if (!isECCEnabled()) return;

    // 3. Check per-agent flag — single DB query, low cost
    const agent = await prisma.agent.findUnique({
      where: { id: record.agentId },
      select: { eccEnabled: true },
    });
    if (!agent?.eccEnabled) return;

    // 4. Extract pattern and create/reinforce Instinct
    await extractAndLearnPattern(record, execution.id);
  } catch (err) {
    // Never surface errors to the caller — this is a background hook
    logger.warn("SDK Learn Hook: non-blocking failure", {
      agentId: record.agentId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function recordSdkExecution(record: SdkExecutionRecord) {
  const startedAt = new Date(Date.now() - record.durationMs);

  return prisma.agentExecution.create({
    data: {
      agentId: record.agentId,
      status: "SUCCESS",
      startedAt,
      completedAt: new Date(),
      durationMs: record.durationMs,
      inputParams: {
        task: record.task.slice(0, 1000),
        model: record.modelId,
        sessionId: record.sessionId ?? null,
      } satisfies Prisma.InputJsonValue,
      outputResult: {
        response: record.response.slice(0, 2000),
      } satisfies Prisma.InputJsonValue,
      tokenUsage: {
        input: record.inputTokens,
        output: record.outputTokens,
        total: record.inputTokens + record.outputTokens,
      } satisfies Prisma.InputJsonValue,
      traceId: record.traceId ?? null,
    },
    select: { id: true },
  });
}

/**
 * Calls Haiku to extract a short pattern name + description from the
 * task/response pair, then upserts the Instinct in the DB.
 */
async function extractAndLearnPattern(
  record: SdkExecutionRecord,
  executionId: string
): Promise<void> {
  const taskSnippet = record.task.slice(0, 400);
  const responseSnippet = record.response.slice(0, 400);

  let patternName: string;
  let patternDescription: string;

  try {
    const model = getModel(EXTRACT_MODEL);
    const { text } = await generateText({
      model,
      prompt:
        `You are a pattern extractor. Given an agent task and its response, ` +
        `identify the reusable pattern type.\n\n` +
        `Task: ${taskSnippet}\n` +
        `Response: ${responseSnippet}\n\n` +
        `Reply with ONLY a JSON object (no markdown, no extra text):\n` +
        `{"name":"short-kebab-case-name","description":"One sentence describing the reusable pattern type"}\n\n` +
        `Rules:\n` +
        `- name: 2-5 words, kebab-case (e.g. "market-research-synthesis")\n` +
        `- description: what category of task/pattern this represents\n` +
        `- Focus on the PATTERN TYPE, not the specific content`,
      maxOutputTokens: 120,
    });

    const parsed = JSON.parse(text.trim()) as {
      name: string;
      description: string;
    };
    patternName = normalisePatternName(parsed.name);
    patternDescription =
      typeof parsed.description === "string" && parsed.description.length > 5
        ? parsed.description
        : `Auto-extracted pattern from: ${taskSnippet.slice(0, 80)}`;
  } catch {
    // Fallback: derive pattern name directly from the task text
    patternName = normalisePatternName(taskSnippet.slice(0, 40));
    patternDescription = `Auto-extracted pattern from: ${taskSnippet.slice(0, 100)}`;
  }

  // Upsert Instinct
  const existing = await prisma.instinct.findFirst({
    where: { agentId: record.agentId, name: patternName },
    select: { id: true, confidence: true, frequency: true, examples: true },
  });

  if (existing) {
    const newConfidence = Math.min(1.0, existing.confidence + AUTO_CONFIDENCE_BOOST);
    await prisma.instinct.update({
      where: { id: existing.id },
      data: {
        confidence: newConfidence,
        frequency: existing.frequency + 1,
        examples: appendExecutionId(
          existing.examples,
          executionId
        ) as Prisma.InputJsonValue,
      },
    });

    logger.info("SDK Learn Hook: reinforced instinct", {
      agentId: record.agentId,
      patternName,
      newConfidence: newConfidence.toFixed(3),
      frequency: existing.frequency + 1,
    });

    recordMetric("sdk.instinct.reinforced", 1, "count", {
      agentId: record.agentId,
    });
  } else {
    await prisma.instinct.create({
      data: {
        agentId: record.agentId,
        name: patternName,
        description: patternDescription,
        confidence: AUTO_CONFIDENCE_INITIAL,
        frequency: 1,
        origin: "sdk_hook",
        examples: {
          executionIds: [executionId],
        } satisfies Prisma.InputJsonValue,
      },
    });

    logger.info("SDK Learn Hook: created instinct", {
      agentId: record.agentId,
      patternName,
      confidence: AUTO_CONFIDENCE_INITIAL,
    });

    recordMetric("sdk.instinct.created", 1, "count", {
      agentId: record.agentId,
    });
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function normalisePatternName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

function appendExecutionId(
  existing: unknown,
  executionId: string
): Record<string, unknown> {
  const base =
    existing && typeof existing === "object"
      ? (existing as Record<string, unknown>)
      : {};
  const ids = Array.isArray(base.executionIds)
    ? (base.executionIds as string[])
    : [];
  return {
    ...base,
    executionIds: [...ids.slice(-(MAX_EXAMPLE_IDS - 1)), executionId],
  };
}
