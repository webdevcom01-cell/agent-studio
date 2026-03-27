/**
 * GET  /api/agents/[agentId]/knowledge/maintenance — dead chunk report
 * POST /api/agents/[agentId]/knowledge/maintenance — cleanup or trigger reingestion
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAgentOwner, isAuthError } from "@/lib/api/auth-guard";
import { parseBodyWithLimit } from "@/lib/api/body-limit";
import { sanitizeErrorMessage } from "@/lib/api/sanitize-error";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import {
  detectDeadChunks,
  cleanupDeadChunks,
  getSourcesDueForReingestion,
  triggerReingestion,
} from "@/lib/knowledge/maintenance";

const ActionSchema = z.object({
  action: z.enum(["cleanup_dead", "trigger_reingestion"]),
  thresholdDays: z.number().int().min(1).max(365).optional(),
});

interface RouteParams {
  params: Promise<{ agentId: string }>;
}

export async function GET(
  _request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { agentId } = await params;
  const authResult = await requireAgentOwner(agentId);
  if (isAuthError(authResult)) return authResult;

  try {
    const kb = await prisma.knowledgeBase.findFirst({
      where: { agentId },
      select: { id: true },
    });

    if (!kb) {
      return NextResponse.json(
        { success: false, error: "Knowledge base not found" },
        { status: 404 }
      );
    }

    const report = await detectDeadChunks(kb.id);

    return NextResponse.json({ success: true, data: report });
  } catch (error) {
    logger.error("Failed to detect dead chunks", error, { agentId });
    return NextResponse.json(
      { success: false, error: sanitizeErrorMessage(error) },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { agentId } = await params;
  const authResult = await requireAgentOwner(agentId);
  if (isAuthError(authResult)) return authResult;

  try {
    const kb = await prisma.knowledgeBase.findFirst({
      where: { agentId },
      select: { id: true },
    });

    if (!kb) {
      return NextResponse.json(
        { success: false, error: "Knowledge base not found" },
        { status: 404 }
      );
    }

    const raw = await parseBodyWithLimit(request);
    const parsed = ActionSchema.parse(raw);

    if (parsed.action === "cleanup_dead") {
      const result = await cleanupDeadChunks(kb.id, parsed.thresholdDays);
      return NextResponse.json({ success: true, data: result });
    }

    if (parsed.action === "trigger_reingestion") {
      const dueSourceIds = await getSourcesDueForReingestion(kb.id);
      if (dueSourceIds.length === 0) {
        return NextResponse.json({
          success: true,
          data: { triggered: 0, failed: 0, message: "No sources due for re-ingestion" },
        });
      }
      const result = await triggerReingestion(dueSourceIds);
      return NextResponse.json({ success: true, data: result });
    }

    return NextResponse.json(
      { success: false, error: "Unknown action" },
      { status: 400 }
    );
  } catch (error) {
    logger.error("KB maintenance action failed", error, { agentId });
    return NextResponse.json(
      { success: false, error: sanitizeErrorMessage(error) },
      { status: 500 }
    );
  }
}
