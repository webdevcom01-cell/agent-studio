/**
 * GET /api/agents/[agentId]/webhooks/[webhookId]/executions/export
 *
 * Download webhook execution history as a CSV file.
 *
 * Query params:
 *   limit   — max rows to include (1–500, default 200)
 *   status  — filter by status: ALL | COMPLETED | FAILED | RUNNING | SKIPPED
 *
 * Each row represents one execution.  The file is RFC-4180 compliant (CRLF line
 * endings, all fields double-quoted, embedded double-quotes doubled).
 *
 * Auth: agent owner required (same guard as the rest of the webhook API).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAgentOwner, isAuthError } from "@/lib/api/auth-guard";
import { sanitizeErrorMessage } from "@/lib/api/sanitize-error";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

// ─── CSV helpers (RFC-4180) ────────────────────────────────────────────────────

function csvCell(value: string | number | boolean | null | undefined): string {
  if (value == null) return '""';
  const str = String(value);
  return `"${str.replace(/"/g, '""')}"`;
}

function csvRow(cells: Array<string | number | boolean | null | undefined>): string {
  return cells.map(csvCell).join(",");
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const VALID_STATUSES = ["ALL", "COMPLETED", "FAILED", "RUNNING", "SKIPPED"] as const;

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(200),
  status: z.enum(VALID_STATUSES).default("ALL"),
});

// ─── CSV columns ──────────────────────────────────────────────────────────────

const CSV_HEADERS = [
  "id",
  "status",
  "event_type",
  "triggered_at",
  "completed_at",
  "duration_ms",
  "source_ip",
  "conversation_id",
  "is_replay",
  "replay_of",
  "error_message",
] as const;

// ─── Route ────────────────────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string; webhookId: string }> }
): Promise<NextResponse | Response> {
  const { agentId, webhookId } = await params;
  const authResult = await requireAgentOwner(agentId);
  if (isAuthError(authResult)) return authResult;

  try {
    // Validate query params
    const raw = Object.fromEntries(request.nextUrl.searchParams.entries());
    const parsed = QuerySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message ?? "Invalid query params" },
        { status: 422 }
      );
    }
    const { limit, status } = parsed.data;

    // Verify the webhook belongs to this agent and fetch its name for the filename
    const webhook = await prisma.webhookConfig.findFirst({
      where: { id: webhookId, agentId },
      select: { id: true, name: true },
    });
    if (!webhook) {
      return NextResponse.json(
        { success: false, error: "Webhook not found" },
        { status: 404 }
      );
    }

    // Build status filter
    const statusWhere =
      status === "ALL" ? {} : { status: status as Exclude<(typeof VALID_STATUSES)[number], "ALL"> };

    const rows = await prisma.webhookExecution.findMany({
      where: { webhookConfigId: webhookId, ...statusWhere },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        status: true,
        eventType: true,
        triggeredAt: true,
        completedAt: true,
        durationMs: true,
        sourceIp: true,
        conversationId: true,
        isReplay: true,
        replayOf: true,
        errorMessage: true,
      },
    });

    // Build CSV
    const lines: string[] = [];
    lines.push(CSV_HEADERS.join(","));

    for (const row of rows) {
      lines.push(
        csvRow([
          row.id,
          row.status,
          row.eventType ?? "",
          row.triggeredAt.toISOString(),
          row.completedAt?.toISOString() ?? "",
          row.durationMs ?? "",
          row.sourceIp ?? "",
          row.conversationId ?? "",
          row.isReplay ? "true" : "false",
          row.replayOf ?? "",
          row.errorMessage ?? "",
        ])
      );
    }

    const csv = lines.join("\r\n");

    // Build a clean filename from the webhook name
    const safeName = webhook.name.replace(/[^a-z0-9]/gi, "-").toLowerCase();
    const today = new Date().toISOString().split("T")[0] ?? "export";
    const statusSuffix = status === "ALL" ? "" : `-${status.toLowerCase()}`;
    const filename = `webhook-${safeName}-executions${statusSuffix}-${today}.csv`;

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    logger.error("Failed to export webhook executions", error, { agentId, webhookId });
    return NextResponse.json(
      { success: false, error: sanitizeErrorMessage(error) },
      { status: 500 }
    );
  }
}
