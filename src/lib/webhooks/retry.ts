/**
 * Webhook Retry Engine — exponential backoff with circuit breaker.
 *
 * Retry delays: 1min → 5min → 30min (3 attempts)
 * Circuit breaker: 5 consecutive failures → auto-disable webhook
 * Dead letter: failed after all retries → moved to WebhookDeadLetter
 */

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [60_000, 300_000, 1_800_000]; // 1min, 5min, 30min
const CIRCUIT_BREAKER_THRESHOLD = 5;

export interface RetryDecision {
  shouldRetry: boolean;
  delayMs: number;
  retryCount: number;
  reason: string;
}

/**
 * Determines whether a failed webhook execution should be retried.
 */
export function shouldRetryExecution(
  currentRetryCount: number,
  errorMessage: string,
): RetryDecision {
  if (currentRetryCount >= MAX_RETRIES) {
    return {
      shouldRetry: false,
      delayMs: 0,
      retryCount: currentRetryCount,
      reason: `Max retries (${MAX_RETRIES}) exhausted`,
    };
  }

  // Non-retryable errors
  if (isNonRetryable(errorMessage)) {
    return {
      shouldRetry: false,
      delayMs: 0,
      retryCount: currentRetryCount,
      reason: `Non-retryable error: ${errorMessage.slice(0, 100)}`,
    };
  }

  const delayMs = RETRY_DELAYS_MS[currentRetryCount] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];

  return {
    shouldRetry: true,
    delayMs,
    retryCount: currentRetryCount + 1,
    reason: `Retry #${currentRetryCount + 1} in ${delayMs / 1000}s`,
  };
}

function isNonRetryable(error: string): boolean {
  const lower = error.toLowerCase();
  return (
    lower.includes("signature verification failed") ||
    lower.includes("webhook not found") ||
    lower.includes("webhook is disabled") ||
    lower.includes("rate limit") // already handled by rate limiter
  );
}

/**
 * Moves a permanently failed execution to the dead letter queue.
 */
export async function moveToDeadLetter(
  executionId: string,
  webhookConfigId: string,
  errorMessage: string,
): Promise<string> {
  const execution = await prisma.webhookExecution.findUnique({
    where: { id: executionId },
    select: {
      eventType: true,
      rawPayload: true,
      rawHeaders: true,
      retryCount: true,
    },
  });

  const deadLetter = await prisma.webhookDeadLetter.create({
    data: {
      webhookConfigId,
      executionId,
      eventType: execution?.eventType,
      payload: execution?.rawPayload,
      headers: execution?.rawHeaders ?? undefined,
      errorMessage,
      retryCount: execution?.retryCount ?? 0,
    },
  });

  logger.info("Webhook moved to dead letter", {
    executionId,
    webhookConfigId,
    deadLetterId: deadLetter.id,
  });

  return deadLetter.id;
}

/**
 * Checks if a webhook has exceeded the circuit breaker threshold.
 * If so, auto-disables the webhook config.
 */
export async function checkCircuitBreaker(
  webhookConfigId: string,
): Promise<{ tripped: boolean }> {
  const config = await prisma.webhookConfig.findUnique({
    where: { id: webhookConfigId },
    select: { failureCount: true, enabled: true },
  });

  if (!config || !config.enabled) {
    return { tripped: false };
  }

  if (config.failureCount >= CIRCUIT_BREAKER_THRESHOLD) {
    await prisma.webhookConfig.update({
      where: { id: webhookConfigId },
      data: { enabled: false },
    });

    logger.warn("Webhook circuit breaker tripped — auto-disabled", {
      webhookConfigId,
      consecutiveFailures: config.failureCount,
      threshold: CIRCUIT_BREAKER_THRESHOLD,
    });

    return { tripped: true };
  }

  return { tripped: false };
}

/**
 * Processes a failed execution: decide retry vs dead letter, check circuit breaker.
 */
export async function handleFailedExecution(
  executionId: string,
  webhookConfigId: string,
  currentRetryCount: number,
  errorMessage: string,
): Promise<{ action: "retry" | "dead_letter" | "circuit_broken"; details: string }> {
  // Check circuit breaker first
  const circuit = await checkCircuitBreaker(webhookConfigId);
  if (circuit.tripped) {
    await moveToDeadLetter(executionId, webhookConfigId, errorMessage);
    return { action: "circuit_broken", details: "Webhook auto-disabled after consecutive failures" };
  }

  const decision = shouldRetryExecution(currentRetryCount, errorMessage);

  if (!decision.shouldRetry) {
    await moveToDeadLetter(executionId, webhookConfigId, errorMessage);
    return { action: "dead_letter", details: decision.reason };
  }

  // Mark execution for retry
  await prisma.webhookExecution.update({
    where: { id: executionId },
    data: {
      retryCount: decision.retryCount,
      status: "PENDING",
    },
  });

  logger.info("Webhook retry scheduled", {
    executionId,
    webhookConfigId,
    retryCount: decision.retryCount,
    delayMs: decision.delayMs,
  });

  return { action: "retry", details: decision.reason };
}

export { MAX_RETRIES, RETRY_DELAYS_MS, CIRCUIT_BREAKER_THRESHOLD };
