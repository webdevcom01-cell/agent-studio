/**
 * GET /api/agents/[agentId]/webhooks/[webhookId]/executions
 *
 * Paginated execution history for a webhook config.
 *
 * Query params:
 *   cursor  — ID of the last execution seen (cursor-based pagination, append-only)
 *   limit   — number of rows to return (1–50, default 20)
 *   status  — filter by execution status: ALL | COMPLETED | FAILED | RUNNING | SKIPPED
 *
 * Response:
 *   { data: ExecutionListItem[], nextCursor: string | null, total: number, hasMore: boolean }
 *
 * Design notes:
 *   - Cursor-based pagination (not offset) to avoid skipped/duplicated rows as new
 *     executions arrive between pages. Cursor is the `id` of the last item returned.
 *   - rawPayload is intentionally OMITTED from list items — it can be several KB per
 *     execution and is only needed for replay (already handled by the replay endpoint).
 *   - total reflects the filtered count so the UI can show "Showing N of M".
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAgentOwner, isAuthError } from "@/lib/api/auth-guard";
import { sanitizeErrorMessage } from "@/lib/api/sanitize-error";
import { applySecurityHeaders } from "@/lib/api/security-headers";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

// ─── Validation ───────────────────────────────────────────────────────────────

const VALID_STATUSES = ["ALL", "COMPLETED", "FAILED", "RUNNING", "SKIPPED"] as const;
type StatusFilter = (typeof VALID_STATUSES)[number];

const QuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(VALID_STATUSES).default("ALL"),
});

// ─── Route ────────────────────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string; webhookId: string }> }
): Promise<NextResponse> {
  const { agentId, webhookId } = await params;
  const authResult = await requireAgentOwner(agentId);
  if (isAuthError(authResult)) return authResult;

  try {
    // Parse + validate query params
    const raw = Object.fromEntries(request.nextUrl.searchParams.entries());
    const parsed = QuerySchema.safeParse(raw);
    if (!parsed.success) {
      const response = NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message ?? "Invalid query params" },
        { status: 422 }
      );
      applySecurityHeaders(response, request.nextUrl.pathname);
      return response;
    }

    const { cursor, limit, status } = parsed.data;

    // Verify the webhook belongs to this agent
    const webhookExists = await prisma.webhookConfig.findFirst({
      where: { id: webhookId, agentId },
      select: { id: true },
    });
    if (!webhookExists) {
      const response = NextResponse.json(
        { success: false, error: "Webhook not found" },
        { status: 404 }
      );
      applySecurityHeaders(response, request.nextUrl.pathname);
      return response;
    }

    // Build status filter
    const statusWhere =
      status === "ALL" ? {} : { status: status as Exclude<StatusFilter, "ALL"> };

    // Run total count + page data in parallel
    const where = { webhookConfigId: webhookId, ...statusWhere };

    const [total, rows] = await Promise.all([
      prisma.webhookExecution.count({ where }),
      prisma.webhookExecution.findMany({
        where: cursor
          ? { ...where, id: { lt: cursor } } // cursor = last seen id; IDs are cuid (lexicographic DESC)
          : where,
        orderBy: { createdAt: "desc" },
        take: limit + 1, // fetch one extra to determine hasMore
        select: {
          id: true,
          status: true,
          triggeredAt: true,
          completedAt: true,
          durationMs: true,
          eventType: true,
          sourceIp: true,
          conversationId: true,
          errorMessage: true,
          // rawPayload intentionally excluded — use replay endpoint to access it
          isReplay: true,
          replayOf: true,
          createdAt: true,
        },
      }),
    ]);

    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? (data[data.length - 1]?.id ?? null) : null;

    const response = NextResponse.json({
      success: true,
      data,
      nextCursor,
      total,
      hasMore,
    });
    applySecurityHeaders(response, request.nextUrl.pathname);
    return response;
  } catch (error) {
    logger.error("Failed to list webhook executions", error, { agentId, webhookId });
    const response = NextResponse.json(
      { success: false, error: sanitizeErrorMessage(error) },
      { status: 500 }
    );
    applySecurityHeaders(response, request.nextUrl.pathname);
    return response;
  }
}
