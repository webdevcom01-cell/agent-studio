import { logger } from "@/lib/logger";

export interface RetryOptions {
  /** Maximum number of retry attempts after the first failure. Default: 3 */
  maxRetries?: number;
  /** Base delay in ms before first retry. Doubles each attempt. Default: 1000 */
  baseDelayMs?: number;
  /** Upper bound on computed delay (before jitter). Default: 30_000 */
  maxDelayMs?: number;
}

function isRetryableError(error: unknown): boolean {
  if (
    error !== null &&
    typeof error === "object" &&
    "statusCode" in error &&
    typeof (error as Record<string, unknown>).statusCode === "number"
  ) {
    const code = (error as Record<string, unknown>).statusCode as number;
    if (code === 429 || code === 503) return true;
  }

  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (
      msg.includes("rate limit") ||
      msg.includes("quota exceeded") ||
      msg.includes("too many requests") ||
      msg.includes("service unavailable")
    ) {
      return true;
    }
  }

  return false;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 3;
  const baseDelayMs = options?.baseDelayMs ?? 1000;
  const maxDelayMs = options?.maxDelayMs ?? 30_000;

  let attempt = 0;

  for (;;) {
    try {
      return await fn();
    } catch (error: unknown) {
      if (!isRetryableError(error)) {
        throw error;
      }

      if (attempt >= maxRetries) {
        logger.error("AI call failed after retries exhausted", {
          attempts: maxRetries + 1,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }

      const rawDelay = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
      const jitter = Math.random() * rawDelay * 0.2;
      const delay = Math.round(rawDelay + jitter);

      logger.warn("AI call rate-limited, retrying", {
        attempt,
        maxRetries,
        delayMs: delay,
        error: error instanceof Error ? error.message : String(error),
      });

      await new Promise<void>((resolve) => setTimeout(resolve, delay));
      attempt++;
    }
  }
}
