/**
 * Webhook → flow execution pipeline.
 *
 * Handles the full lifecycle of an inbound webhook trigger:
 *  1. Validate webhook config exists and is enabled
 *  2. Verify HMAC-SHA256 signature
 *  3. Enforce idempotency (skip duplicate events)
 *  4. Apply rate limiting (per-webhook)
 *  5. Map request payload → flow variables (body + header mappings)
 *  6. Create conversation + RuntimeContext
 *  7. Execute flow (starting from webhook_trigger node)
 *  8. Persist WebhookExecution record
 *  9. Return result
 */

import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { loadContext, saveContext, saveMessages } from "@/lib/runtime/context";
import { executeFlow } from "@/lib/runtime/engine";
import { verifyWebhookSignature, decryptWebhookSecret } from "./verify";

/** Per-webhook rate limit: 60 requests per minute. */
const WEBHOOK_RATE_LIMIT = 60;

export interface WebhookExecuteOptions {
  agentId: string;
  webhookId: string;
  rawBody: string;
  headers: Record<string, string | string[] | undefined>;
  sourceIp?: string;
  /**
   * When true, skips signature verification (replay uses the stored body —
   * there is no live HMAC signature to check).
   */
  isReplay?: boolean;
  /**
   * For replay executions, the ID of the original execution being replayed.
   * Stored on the new execution record for traceability.
   */
  replayOf?: string;
}

export interface WebhookExecuteResult {
  success: boolean;
  status: number;
  executionId?: string;
  conversationId?: string;
  error?: string;
  /** When true, caller should respond with 409 Conflict (idempotent skip) */
  skipped?: boolean;
}

/**
 * Resolves a simple dot-notation or bracket-notation JSON path against an object.
 * Supports: "repository.name", "event.type", "commits[0].message"
 * Does NOT support wildcard queries — keeps the dependency footprint zero.
 */
function resolveJsonPath(obj: unknown, path: string): unknown {
  if (typeof obj !== "object" || obj === null) return undefined;

  // Normalise: "$.foo.bar" → "foo.bar", then split on "." and "["
  const normalised = path.startsWith("$.") ? path.slice(2) : path;
  const parts = normalised
    .split(/[.[\]]/)
    .filter((p) => p.length > 0);

  let current: unknown = obj;
  for (const part of parts) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Extracts event type from provider-specific request headers.
 * Returns the value of the first recognised header, or null.
 */
function extractEventType(
  headers: Record<string, string | string[] | undefined>
): string | null {
  const candidates = [
    "x-github-event",
    "x-gitlab-event",
    "stripe-webhook-event",
    "x-slack-event",
    "x-event-type",
    "x-webhook-event",
    "webhook-event-type",
  ];

  const normalised = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])
  );

  for (const key of candidates) {
    const val = normalised[key];
    if (val) return Array.isArray(val) ? val[0] : val;
  }
  return null;
}

/**
 * Extracts event type from parsed body for providers that embed it there.
 * Priority:
 *   1. Slack Events API: $.event.type (e.g. "app_mention", "message")
 *      Slack's top-level $.type is always "event_callback" — not useful for filtering.
 *   2. Stripe / generic: $.type (e.g. "payment_intent.succeeded")
 * Falls back to null.
 */
function extractEventTypeFromBody(parsedBody: unknown): string | null {
  if (typeof parsedBody !== "object" || parsedBody === null) return null;
  const body = parsedBody as Record<string, unknown>;

  // Slack Events API: { "event": { "type": "app_mention", ... }, "type": "event_callback" }
  // Check $.event.type first — the inner event type is what users configure filters on.
  const event = body.event;
  if (typeof event === "object" && event !== null) {
    const eventObj = event as Record<string, unknown>;
    if (typeof eventObj.type === "string") return eventObj.type;
  }

  // Stripe / generic: { "type": "payment_intent.succeeded", ... }
  if (typeof body.type === "string") return body.type;

  return null;
}

/**
 * Executes the full inbound webhook pipeline.
 */
/**
 * Strips sensitive headers (Authorization, Cookie, API keys, secrets) and
 * flattens array values for storage.  Returns a plain Record<string, string>.
 */
export function sanitizeHeadersForStorage(
  headers: Record<string, string | string[] | undefined>
): Record<string, string> {
  const BLOCKED = new Set([
    "authorization",
    "cookie",
    "set-cookie",
    "x-api-key",
    "api-key",
    "x-secret",
    "x-auth-token",
    "x-access-token",
  ]);
  const result: Record<string, string> = {};
  for (const [key, val] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (BLOCKED.has(lower)) continue;
    if (val === undefined) continue;
    // x-webhook-signature contains the HMAC — redact value but keep the key so
    // recipients know it existed without being able to re-use the signature.
    if (lower === "x-webhook-signature" || lower === "webhook-signature") {
      result[key] = "[REDACTED]";
      continue;
    }
    result[key] = Array.isArray(val) ? val[0] : val;
  }
  return result;
}

export async function executeWebhookTrigger(
  opts: WebhookExecuteOptions
): Promise<WebhookExecuteResult> {
  const { agentId, webhookId, rawBody, headers, sourceIp, isReplay = false, replayOf } = opts;
  const startedAt = Date.now();

  // ── 1. Load webhook config ────────────────────────────────────────────────
  const webhookConfig = await prisma.webhookConfig.findFirst({
    where: { id: webhookId, agentId },
    select: {
      id: true,
      enabled: true,
      secret: true,
      secretEncrypted: true,
      bodyMappings: true,
      headerMappings: true,
      eventFilters: true,
    },
  });

  if (!webhookConfig) {
    return { success: false, status: 404, error: "Webhook not found" };
  }

  if (!webhookConfig.enabled) {
    return { success: false, status: 404, error: "Webhook is disabled" };
  }

  // ── 2. Signature verification ─────────────────────────────────────────────
  // Replay executions re-use the original stored body; there is no live HMAC
  // signature to verify, so we skip this step for them.
  if (!isReplay) {
    const rawSecret = decryptWebhookSecret(
      webhookConfig.secret,
      webhookConfig.secretEncrypted
    );
    const verification = verifyWebhookSignature(rawBody, headers, rawSecret);
    if (!verification.valid) {
      logger.warn("Webhook signature verification failed", {
        webhookId,
        agentId,
        error: verification.error,
        sourceIp,
      });
      return { success: false, status: 400, error: verification.error };
    }
  }

  // ── 3. Idempotency check ──────────────────────────────────────────────────
  // Replay executions always get a fresh unique key so they are never blocked
  // by the original execution's idempotency entry.
  const rawId = isReplay
    ? undefined
    : (headers["x-webhook-id"] ??
       headers["webhook-id"] ??
       headers["x-request-id"]);
  const idempotencyKey = Array.isArray(rawId)
    ? rawId[0]
    : rawId ?? `${webhookId}:${startedAt}`;

  const existing = await prisma.webhookExecution.findUnique({
    where: { idempotencyKey },
    select: { id: true, conversationId: true, status: true },
  });

  if (existing) {
    logger.info("Webhook event already processed (idempotent skip)", {
      webhookId,
      idempotencyKey,
    });
    return {
      success: true,
      status: 409,
      executionId: existing.id,
      conversationId: existing.conversationId ?? undefined,
      skipped: true,
    };
  }

  // ── 4. Rate limiting ──────────────────────────────────────────────────────
  const rl = checkRateLimit(`webhook:${webhookId}`, WEBHOOK_RATE_LIMIT);
  if (!rl.allowed) {
    return {
      success: false,
      status: 429,
      error: `Rate limit exceeded. Retry after ${Math.ceil(rl.retryAfterMs / 1000)}s`,
    };
  }

  // ── 5. Parse payload & build variable mappings ────────────────────────────
  let parsedBody: unknown = null;
  try {
    parsedBody = rawBody.trim().length > 0 ? JSON.parse(rawBody) : {};
  } catch {
    // Non-JSON payload — store as raw string
    parsedBody = { __raw: rawBody };
  }

  // Resolve event type: prefer provider-specific headers, fall back to body
  const headerEventType = extractEventType(headers);
  const eventType = headerEventType ?? extractEventTypeFromBody(parsedBody);

  // ── 5a. Event filter check ─────────────────────────────────────────────────
  const eventFilters = webhookConfig.eventFilters as string[];
  if (eventFilters.length > 0) {
    if (eventType === null || !eventFilters.includes(eventType)) {
      logger.info("Webhook event filtered out (event type not in filter list)", {
        webhookId,
        agentId,
        eventType,
        eventFilters,
      });
      return {
        success: true,
        status: 200,
        skipped: true,
        error: eventType
          ? `Event type '${eventType}' not in filter list`
          : "No event type detected; event filters are configured",
      };
    }
  }

  // Start with full payload in __webhook_payload
  const webhookVariables: Record<string, unknown> = {
    __webhook_payload: parsedBody,
    __webhook_event_type: eventType,
    __webhook_id: idempotencyKey,
  };

  // Apply body mappings: JSONPath → flow variable
  const bodyMappings = webhookConfig.bodyMappings as Array<{
    jsonPath: string;
    variableName: string;
    type?: string;
  }>;
  if (Array.isArray(bodyMappings)) {
    for (const mapping of bodyMappings) {
      if (!mapping.jsonPath || !mapping.variableName) continue;
      const extracted = resolveJsonPath(parsedBody, mapping.jsonPath);
      if (extracted !== undefined) {
        webhookVariables[mapping.variableName] = extracted;
      }
    }
  }

  // Apply header mappings: header name → flow variable
  const headerMappings = webhookConfig.headerMappings as Array<{
    headerName: string;
    variableName: string;
  }>;
  const normalisedHeaders = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])
  );
  if (Array.isArray(headerMappings)) {
    for (const mapping of headerMappings) {
      if (!mapping.headerName || !mapping.variableName) continue;
      const val = normalisedHeaders[mapping.headerName.toLowerCase()];
      if (val !== undefined) {
        webhookVariables[mapping.variableName] = Array.isArray(val) ? val[0] : val;
      }
    }
  }

  // ── 6. Create execution record (PENDING) ──────────────────────────────────
  const sanitizedHeaders = sanitizeHeadersForStorage(headers);

  const execution = await prisma.webhookExecution.create({
    data: {
      webhookConfigId: webhookId,
      idempotencyKey,
      status: "PENDING",
      triggeredAt: new Date(),
      sourceIp: sourceIp ?? null,
      eventType,
      // Store original payload and sanitized headers for replay support.
      // rawPayload is capped at 1 MB to prevent unbounded storage.
      rawPayload: rawBody.length <= 1_048_576 ? rawBody : null,
      rawHeaders: sanitizedHeaders,
      isReplay,
      replayOf: replayOf ?? null,
    },
    select: { id: true },
  });

  // ── 7. Execute flow ───────────────────────────────────────────────────────
  let conversationId: string | undefined;
  let errorMessage: string | undefined;
  let executionStatus: "COMPLETED" | "FAILED" = "COMPLETED";

  try {
    // Mark as RUNNING
    await prisma.webhookExecution.update({
      where: { id: execution.id },
      data: { status: "RUNNING" },
    });

    // Create context with webhook variables pre-loaded
    const context = await loadContext(agentId);
    conversationId = context.conversationId;

    // Inject webhook variables into context (they'll override flow defaults)
    context.variables = { ...context.variables, ...webhookVariables };

    // Run the flow
    const result = await executeFlow(context);

    // Persist messages & context
    await Promise.allSettled([
      saveMessages(context.conversationId, result.messages),
      saveContext(context),
    ]);

    logger.info("Webhook trigger executed successfully", {
      webhookId,
      agentId,
      executionId: execution.id,
      conversationId,
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    executionStatus = "FAILED";
    errorMessage =
      error instanceof Error ? error.message : "Unknown execution error";
    logger.error("Webhook trigger execution failed", error, {
      webhookId,
      agentId,
      executionId: execution.id,
    });
  }

  // ── 8. Persist execution result ───────────────────────────────────────────
  const durationMs = Date.now() - startedAt;

  await Promise.allSettled([
    prisma.webhookExecution.update({
      where: { id: execution.id },
      data: {
        status: executionStatus,
        completedAt: new Date(),
        durationMs,
        conversationId: conversationId ?? null,
        errorMessage: errorMessage ?? null,
      },
    }),
    // Update aggregate stats on the config
    prisma.webhookConfig.update({
      where: { id: webhookId },
      data: {
        lastTriggeredAt: new Date(),
        triggerCount: { increment: 1 },
        ...(executionStatus === "FAILED" && { failureCount: { increment: 1 } }),
      },
    }),
  ]);

  if (executionStatus === "FAILED") {
    return {
      success: false,
      status: 500,
      executionId: execution.id,
      conversationId,
      error: errorMessage,
    };
  }

  return {
    success: true,
    status: 200,
    executionId: execution.id,
    conversationId,
  };
}
