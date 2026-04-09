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
import { resolveJsonPathTyped } from "./json-path";
import { handleFailedExecution, RETRY_DELAYS_MS } from "./retry";

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
  /**
   * When set, this is a BullMQ retry of an existing execution.
   * The function will skip idempotency/rate-limit checks and will update
   * this execution record in-place rather than creating a new one.
   */
  retryExecutionId?: string;
  /**
   * v2: When true, this call originates from the BullMQ async worker.
   * Skips the async-dispatch path so we don't infinitely re-queue.
   * Also skips idempotency and rate-limit checks (already done in the route).
   */
  isAsyncWorker?: boolean;
}

export interface WebhookExecuteResult {
  success: boolean;
  status: number;
  executionId?: string;
  conversationId?: string;
  error?: string;
  /** When true, caller should respond with 409 Conflict (idempotent skip) */
  skipped?: boolean;
  /** v2: When true, execution was queued async (status 202). Worker will run the flow. */
  queued?: boolean;
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

/**
 * Schedules a BullMQ delayed retry for a failed webhook execution,
 * or moves it to the dead-letter table if retries are exhausted.
 * Always called fire-and-forget — never throws to the caller.
 */
async function scheduleWebhookRetry(
  executionId: string,
  webhookId: string,
  agentId: string,
  currentRetryCount: number,
  errorMessage: string,
): Promise<void> {
  try {
    const retryResult = await handleFailedExecution(
      executionId,
      webhookId,
      currentRetryCount,
      errorMessage,
    );

    if (retryResult.action === "retry") {
      const delayMs =
        RETRY_DELAYS_MS[currentRetryCount] ??
        RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];

      try {
        const { addWebhookRetryJob } = await import("@/lib/queue");
        const jobId = await addWebhookRetryJob(
          {
            agentId,
            webhookId,
            executionId,
            retryCount: currentRetryCount + 1,
          },
          delayMs,
        );

        // Persist the BullMQ job ID so operators can look it up.
        await prisma.webhookExecution.update({
          where: { id: executionId },
          data: { retryJobId: jobId },
        });
      } catch (queueErr) {
        // Queue unavailable (Redis not configured) — log and let the dead
        // letter record serve as the audit trail.
        logger.warn("Webhook retry queue unavailable — retry not scheduled", {
          executionId,
          webhookId,
          error: queueErr,
        });
      }
    }

    logger.info("Webhook retry decision", {
      executionId,
      webhookId,
      action: retryResult.action,
      details: retryResult.details,
    });
  } catch (err) {
    logger.error("scheduleWebhookRetry error", err, { executionId, webhookId });
  }
}

export async function executeWebhookTrigger(
  opts: WebhookExecuteOptions
): Promise<WebhookExecuteResult> {
  const {
    agentId,
    webhookId,
    rawBody,
    headers,
    sourceIp,
    isReplay = false,
    replayOf,
    retryExecutionId,
    isAsyncWorker = false,
  } = opts;
  const isRetry = retryExecutionId !== undefined;
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
      asyncExecution: true,
      issueKeyTemplate: true,
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

  // Retries re-use an existing execution record — skip idempotency check entirely.
  if (!isRetry) {
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
  }

  // ── 4. Rate limiting ──────────────────────────────────────────────────────
  // Retries and async workers are dispatched internally — no rate limiting needed.
  if (!isRetry && !isAsyncWorker) {
    const rl = checkRateLimit(`webhook:${webhookId}`, WEBHOOK_RATE_LIMIT);
    if (!rl.allowed) {
      return {
        success: false,
        status: 429,
        error: `Rate limit exceeded. Retry after ${Math.ceil(rl.retryAfterMs / 1000)}s`,
      };
    }
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
  const strictMode = (webhookConfig as Record<string, unknown>).strictMode === true;
  const payloadPreview = rawBody.slice(0, 200);
  const mappingMisses: string[] = [];

  if (Array.isArray(bodyMappings)) {
    for (const mapping of bodyMappings) {
      if (!mapping.jsonPath || !mapping.variableName) continue;
      const result = resolveJsonPathTyped(parsedBody, mapping.jsonPath);

      if (result.found) {
        if (result.value === null) {
          logger.warn("Webhook body mapping resolved to null", {
            webhookId,
            variableName: mapping.variableName,
            jsonPath: mapping.jsonPath,
            payloadPreview,
          });
          mappingMisses.push(mapping.variableName);
        }
        webhookVariables[mapping.variableName] = result.value;
      } else {
        logger.warn("Webhook body mapping miss: JSONPath returned undefined", {
          webhookId,
          variableName: mapping.variableName,
          jsonPath: mapping.jsonPath,
          reason: result.reason,
          payloadPreview,
        });
        mappingMisses.push(mapping.variableName);
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
      } else {
        logger.warn("Webhook header mapping miss", {
          webhookId,
          variableName: mapping.variableName,
          headerName: mapping.headerName,
        });
        mappingMisses.push(mapping.variableName);
      }
    }
  }

  // Strict mode: reject if any mapping missed
  if (strictMode && mappingMisses.length > 0) {
    return {
      success: false,
      status: 422,
      error: `Strict mode: ${mappingMisses.length} mapping(s) unresolved: ${mappingMisses.join(", ")}`,
    };
  }

  // ── 5b. Issue-level idempotency (v2) ──────────────────────────────────────
  // Prevents duplicate pipeline runs for the same business event (e.g. same
  // GitHub issue re-opened multiple times in quick succession).
  // Only active when issueKeyTemplate is configured on the webhook and we're
  // not already inside a retry or async worker path.
  let issueKey: string | null = null;
  const issueKeyTemplate = (webhookConfig as Record<string, unknown>).issueKeyTemplate as string | null | undefined;

  if (issueKeyTemplate && !isRetry && !isAsyncWorker) {
    // Interpolate {{variable}} placeholders using the already-resolved webhookVariables
    issueKey = issueKeyTemplate.replace(/\{\{(\w+)\}\}/g, (_, k: string) => {
      const val = webhookVariables[k];
      return val !== undefined && val !== null ? String(val) : "";
    });

    // Only enforce if all placeholders resolved to non-empty strings
    if (issueKey && !issueKey.includes("{{")) {
      const existingByIssue = await prisma.webhookExecution.findFirst({
        where: {
          webhookConfigId: webhookId,
          issueKey,
          status: { in: ["PENDING", "QUEUED", "RUNNING"] },
        },
        select: { id: true, conversationId: true },
      });

      if (existingByIssue) {
        logger.info("Webhook issue-level idempotency skip", {
          webhookId,
          agentId,
          issueKey,
          existingExecutionId: existingByIssue.id,
        });
        return {
          success: true,
          status: 409,
          executionId: existingByIssue.id,
          conversationId: existingByIssue.conversationId ?? undefined,
          skipped: true,
        };
      }
    } else {
      // Template didn't fully resolve — log a warning, fall through without
      // issue-level dedup so the event is not silently dropped.
      logger.warn("Webhook issueKeyTemplate did not fully resolve — skipping issue dedup", {
        webhookId,
        issueKeyTemplate,
        resolvedKey: issueKey,
      });
      issueKey = null;
    }
  }

  // ── 6. Execution record ────────────────────────────────────────────────────
  const sanitizedHeaders = sanitizeHeadersForStorage(headers);

  // currentRetryCount tracks how many previous failures this execution has had.
  // For new executions it starts at 0; for retries it reads the persisted value.
  let currentRetryCount = 0;

  const execution: { id: string } = isRetry
    ? await (async () => {
        // Load the existing execution so we know its current retryCount.
        const existing = await prisma.webhookExecution.findUnique({
          where: { id: retryExecutionId },
          select: { id: true, retryCount: true },
        });
        if (!existing) {
          throw new Error(`Retry execution ${retryExecutionId} not found`);
        }
        currentRetryCount = existing.retryCount;
        return { id: existing.id };
      })()
    : await prisma.webhookExecution.create({
        data: {
          webhookConfigId: webhookId,
          idempotencyKey,
          issueKey,
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

  // ── 6b. Async dispatch (v2) ───────────────────────────────────────────────
  // When asyncExecution=true on the webhook config, enqueue a BullMQ job and
  // return 202 immediately. The worker will call executeWebhookTrigger again
  // with isAsyncWorker=true to do the actual flow execution.
  // This is required for slow pipelines (>10s) triggered by GitHub/Slack which
  // have strict response-time requirements.
  const isAsync = (webhookConfig as Record<string, unknown>).asyncExecution === true;
  if (isAsync && !isAsyncWorker && !isRetry) {
    try {
      const { addWebhookExecuteJob } = await import("@/lib/queue");
      const flatHeaders = Object.fromEntries(
        Object.entries(headers).map(([k, v]) => [k, Array.isArray(v) ? v[0] : (v ?? "")])
      );
      await addWebhookExecuteJob({
        agentId,
        webhookId,
        executionId: execution.id,
        rawBody,
        headers: flatHeaders,
        sourceIp,
      });

      await prisma.webhookExecution.update({
        where: { id: execution.id },
        data: { status: "QUEUED" },
      });

      logger.info("Webhook async dispatch: job enqueued, returning 202", {
        webhookId,
        agentId,
        executionId: execution.id,
      });

      return {
        success: true,
        status: 202,
        executionId: execution.id,
        queued: true,
      };
    } catch (queueErr) {
      // Queue unavailable — fall through to synchronous execution so the
      // webhook is not silently dropped.
      logger.warn("Webhook async queue unavailable, falling back to sync execution", {
        webhookId,
        agentId,
        executionId: execution.id,
        error: queueErr,
      });
    }
  }

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
    // Schedule a BullMQ retry (or move to dead letter) — fire-and-forget so it
    // doesn't block the HTTP response.  Errors in scheduling are logged but
    // never surfaced to the caller.
    void scheduleWebhookRetry(
      execution.id,
      webhookId,
      agentId,
      currentRetryCount,
      errorMessage ?? "Unknown execution error",
    );

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
