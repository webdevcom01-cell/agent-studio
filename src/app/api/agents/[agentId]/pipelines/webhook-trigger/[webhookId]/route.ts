/**
 * POST /api/agents/[agentId]/pipelines/webhook-trigger/[webhookId]
 *
 * PUBLIC endpoint — no session auth required.
 * Authentication is entirely via signature verification (GitHub HMAC / GitLab token).
 *
 * This is the bridge between the webhook system and the SDLC pipeline system.
 * When a GitHub PR or GitLab MR event arrives, this route:
 *   1. Loads the WebhookConfig and verifies isPipelineTrigger=true
 *   2. Verifies the request signature using signatureProvider
 *   3. Parses the PR/MR payload into a normalized PRContext
 *   4. Filters irrelevant events (closed PRs, draft PRs, non-PR actions)
 *   5. Checks idempotency (prevents duplicate runs for the same commit)
 *   6. Creates a PipelineRun record
 *   7. Enqueues a BullMQ job
 *   8. Returns 202 Accepted immediately (does NOT wait for pipeline to finish)
 *
 * Rate limit: "pipeline:webhook" (30/min) — higher than manual "pipeline" (5/min)
 * because webhook events are machine-generated and repos can be busy.
 *
 * Responses:
 *   202 — Run queued successfully
 *   200 — Event skipped (draft, irrelevant action, etc.) — GitHub still gets 2xx
 *   400 — Invalid signature or unparseable payload
 *   404 — WebhookConfig not found, disabled, or not a pipeline trigger
 *   409 — Duplicate event (idempotent — same pipeline run already exists)
 *   429 — Rate limit exceeded
 *   500 — Internal error
 */

import { NextRequest, NextResponse } from "next/server";
import { applySecurityHeaders } from "@/lib/api/security-headers";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  verifyGitHubSignature,
  verifyGitLabToken,
  verifyWebhookSignature,
  decryptWebhookSecret,
} from "@/lib/webhooks/verify";
import {
  parseGitHubPRPayload,
  parseGitLabMRPayload,
  buildTaskDescription,
  buildIdempotencyKey,
  isActionRelevant,
} from "@/lib/webhooks/pipeline-trigger";
import { createPipelineRun } from "@/lib/sdlc/pipeline-manager";
import { addPipelineRunJob } from "@/lib/queue";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { getEndpointLimit } from "@/lib/rate-limit-config";

// This route only enqueues — it does NOT wait for pipeline execution.
// 30s is more than enough for DB write + BullMQ enqueue.
export const maxDuration = 30;

// Pipeline step IDs for code review (mirrors ROUTING_TABLE["code-review"])
const CODE_REVIEW_PIPELINE = ["project_context", "ecc-code-reviewer"];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string; webhookId: string }> }
): Promise<NextResponse> {
  const { agentId, webhookId } = await params;
  const pathname = request.nextUrl.pathname;

  const makeResponse = (body: unknown, status: number): NextResponse => {
    const res = NextResponse.json(body, { status });
    applySecurityHeaders(res, pathname);
    return res;
  };

  try {
    // ── 1. Load WebhookConfig ─────────────────────────────────────────────────
    const config = await prisma.webhookConfig.findFirst({
      where: { id: webhookId, agentId },
      select: {
        id: true,
        enabled: true,
        secret: true,
        secretEncrypted: true,
        signatureProvider: true,
        isPipelineTrigger: true,
      },
    }) as { id: string; enabled: boolean; secret: string; secretEncrypted: boolean; signatureProvider: string; isPipelineTrigger: boolean } | null;

    if (!config) {
      return makeResponse({ error: "Webhook not found" }, 404);
    }
    if (!config.enabled) {
      return makeResponse({ error: "Webhook is disabled" }, 404);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!(config as any).isPipelineTrigger) {
      // This webhook is configured for flow execution, not pipeline triggering
      return makeResponse(
        { error: "This webhook is not configured as a pipeline trigger" },
        404
      );
    }

    // ── 2. Read raw body (must happen before JSON parsing) ───────────────────
    const rawBody = await request.text();

    // ── 3. Build headers map ──────────────────────────────────────────────────
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });

    // ── 4. Decrypt secret ─────────────────────────────────────────────────────
    const secret = decryptWebhookSecret(config.secret, config.secretEncrypted);

    // ── 5. Verify signature based on provider ────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const provider = (config as any).signatureProvider ?? "standard";
    let verifyResult: { valid: boolean; error?: string };

    if (provider === "github") {
      verifyResult = verifyGitHubSignature(rawBody, headers, secret);
    } else if (provider === "gitlab") {
      verifyResult = verifyGitLabToken(headers, secret);
    } else {
      // "standard" — Standard Webhooks spec
      verifyResult = verifyWebhookSignature(rawBody, headers, secret);
    }

    if (!verifyResult.valid) {
      logger.warn("Webhook pipeline trigger: signature verification failed", {
        agentId,
        webhookId,
        provider,
        error: verifyResult.error,
      });
      return makeResponse(
        { error: "Invalid webhook signature", detail: verifyResult.error },
        400
      );
    }

    // ── 6. Parse JSON payload ─────────────────────────────────────────────────
    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return makeResponse({ error: "Invalid JSON body" }, 400);
    }

    // ── 7. Parse PR/MR context based on provider ─────────────────────────────
    let ctx = null;
    if (provider === "github") {
      ctx = parseGitHubPRPayload(body);
    } else if (provider === "gitlab") {
      ctx = parseGitLabMRPayload(body);
    } else {
      // Standard webhooks provider — try GitHub format first, then GitLab
      ctx = parseGitHubPRPayload(body) ?? parseGitLabMRPayload(body);
    }

    if (!ctx) {
      // Not a PR/MR payload — could be a ping, push, or other event
      // Return 200 so GitHub/GitLab doesn't retry
      logger.info("Webhook pipeline trigger: non-PR payload, skipping", {
        agentId,
        webhookId,
        provider,
      });
      return makeResponse({ skipped: true, reason: "Not a PR/MR event" }, 200);
    }

    // ── 8. Filter irrelevant actions ──────────────────────────────────────────
    if (!isActionRelevant(ctx.action)) {
      logger.info("Webhook pipeline trigger: irrelevant action, skipping", {
        agentId,
        webhookId,
        action: ctx.action,
        prNumber: ctx.prNumber,
      });
      return makeResponse(
        { skipped: true, reason: `Action '${ctx.action}' does not trigger pipeline` },
        200
      );
    }

    // Draft PRs don't get a pipeline run — they'd immediately be re-triggered
    // as "ready_for_review" when the author marks them ready.
    if (ctx.isDraft) {
      logger.info("Webhook pipeline trigger: draft PR, skipping", {
        agentId,
        webhookId,
        prNumber: ctx.prNumber,
      });
      return makeResponse({ skipped: true, reason: "Draft PR/MR" }, 200);
    }

    // ── 9. Idempotency check (DB-level, race condition safe) ──────────────────
    const idempotencyKey = buildIdempotencyKey(ctx);

    const existing = await prisma.pipelineRun.findUnique({
      where: { webhookIdempotencyKey: idempotencyKey },
      select: { id: true, status: true },
    });

    if (existing) {
      logger.info("Webhook pipeline trigger: duplicate event, skipping", {
        agentId,
        webhookId,
        idempotencyKey,
        existingRunId: existing.id,
        existingStatus: existing.status,
      });
      return makeResponse(
        {
          skipped: true,
          reason: "Pipeline run already exists for this commit",
          existingRunId: existing.id,
          existingStatus: existing.status,
        },
        409
      );
    }

    // ── 10. Rate limit ────────────────────────────────────────────────────────
    const { maxRequests } = getEndpointLimit("pipeline:webhook");
    const rateLimitResult = await checkRateLimitAsync(
      `pipeline:webhook:${agentId}`,
      maxRequests
    );
    if (!rateLimitResult.allowed) {
      return makeResponse(
        { error: "Rate limit exceeded", retryAfterMs: rateLimitResult.retryAfterMs },
        429
      );
    }

    // ── 11. Create PipelineRun (no LLM — task type is always "code-review") ───
    const run = await createPipelineRun({
      taskDescription: buildTaskDescription(ctx),
      taskType: "code-review",
      complexity: "simple",
      pipeline: CODE_REVIEW_PIPELINE,
      agentId,
      // userId omitted — webhook-triggered runs have no user session
      repoUrl: ctx.repoUrl,
      prUrl: ctx.prUrl,        // available immediately from payload
      webhookIdempotencyKey: idempotencyKey,
      triggerSource: ctx.provider,
      triggerBranch: ctx.headBranch,
      triggerPrNumber: ctx.prNumber,
    });

    // ── 12. Enqueue BullMQ job ────────────────────────────────────────────────
    await addPipelineRunJob({
      pipelineRunId: run.id,
      agentId,
      // userId omitted — webhook-triggered runs have no user session
      repoUrl: ctx.repoUrl,
    });

    logger.info("Webhook pipeline trigger: run queued", {
      agentId,
      webhookId,
      provider: ctx.provider,
      prNumber: ctx.prNumber,
      prTitle: ctx.prTitle,
      headSha: ctx.headSha.slice(0, 8),
      runId: run.id,
      idempotencyKey,
    });

    // ── 13. Respond 202 immediately (don't wait for pipeline execution) ───────
    return makeResponse(
      {
        success: true,
        queued: true,
        pipelineRunId: run.id,
        message: `Code review pipeline queued for ${ctx.provider === "gitlab" ? "MR" : "PR"} #${ctx.prNumber}`,
      },
      202
    );
  } catch (error) {
    logger.error("Webhook pipeline trigger: unexpected error", {
      agentId,
      webhookId,
      error,
    });
    return makeResponse({ error: "Internal server error" }, 500);
  }
}
