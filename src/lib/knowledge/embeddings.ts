import { embed, embedMany } from "ai";
import { getEmbeddingModel, getEmbeddingModelById } from "@/lib/ai";
import { logger } from "@/lib/logger";

function resolveModel(modelId?: string) {
  return modelId ? getEmbeddingModelById(modelId) : getEmbeddingModel();
}

// ── Retry helpers ─────────────────────────────────────────────────────────────

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

/** Returns true for transient OpenAI errors worth retrying (rate-limit, server error). */
function isRetryable(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  // AIError carries a statusCode; fall back to message inspection
  const status = (err as { status?: number; statusCode?: number }).status
    ?? (err as { status?: number; statusCode?: number }).statusCode;
  if (status !== undefined) {
    return status === 429 || status >= 500;
  }
  return msg.includes("429") || msg.includes("rate limit") || msg.includes("503");
}

/** Exponential backoff with ±25% jitter (same pattern as cli-generator/ai-phases.ts). */
function backoffMs(attempt: number): number {
  const base = BASE_DELAY_MS * Math.pow(2, attempt); // 1s, 2s, 4s
  const jitter = base * (Math.random() * 0.5 - 0.25); // ±25%
  return Math.round(base + jitter);
}

async function withRetry<T>(
  operation: () => Promise<T>,
  context: string
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastError = err;
      if (!isRetryable(err) || attempt === MAX_RETRIES) {
        throw err;
      }
      const delay = backoffMs(attempt);
      logger.warn("Embedding API call failed, retrying", {
        context,
        attempt,
        delay,
        error: err instanceof Error ? err.message : String(err),
      });
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  // Unreachable but satisfies TypeScript
  throw lastError;
}

// ── Public API ─────────────────────────────────────────────────────────────────

export async function generateEmbedding(text: string, modelId?: string): Promise<number[]> {
  const { embedding } = await withRetry(
    () => embed({ model: resolveModel(modelId), value: text }),
    "generateEmbedding"
  );
  return embedding;
}

export async function generateEmbeddings(texts: string[], modelId?: string): Promise<number[][]> {
  if (texts.length === 0) return [];

  const model = resolveModel(modelId);
  const BATCH_SIZE = 100;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const batchIndex = Math.floor(i / BATCH_SIZE);

    const { embeddings } = await withRetry(
      () => embedMany({ model, values: batch }),
      `generateEmbeddings batch ${batchIndex}`
    );
    allEmbeddings.push(...embeddings);
  }

  return allEmbeddings;
}
