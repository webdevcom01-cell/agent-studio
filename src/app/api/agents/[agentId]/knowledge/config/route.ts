/**
 * GET   /api/agents/[agentId]/knowledge/config — get KB RAG pipeline configuration
 * PATCH /api/agents/[agentId]/knowledge/config — update KB configuration
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAgentOwner, isAuthError } from "@/lib/api/auth-guard";
import { parseBodyWithLimit } from "@/lib/api/body-limit";
import { sanitizeErrorMessage } from "@/lib/api/sanitize-error";
import { applySecurityHeaders } from "@/lib/api/security-headers";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { kbConfigUpdateSchema, resolveEmbeddingDimension } from "@/lib/schemas/kb-config";
import { ZodError } from "zod";

interface RouteParams {
  params: Promise<{ agentId: string }>;
}

const CONFIG_SELECT = {
  chunkingStrategy: true,
  embeddingModel: true,
  embeddingDimension: true,
  retrievalMode: true,
  rerankingModel: true,
  queryTransform: true,
  searchTopK: true,
  searchThreshold: true,
  hybridAlpha: true,
  maxChunks: true,
  contextOrdering: true,
} as const;

function withDefaults(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    chunkingStrategy: raw.chunkingStrategy ?? null,
    embeddingModel: raw.embeddingModel ?? "text-embedding-3-small",
    embeddingDimension: raw.embeddingDimension ?? 1536,
    retrievalMode: raw.retrievalMode ?? "hybrid",
    rerankingModel: raw.rerankingModel ?? "llm-rubric",
    queryTransform: raw.queryTransform ?? "none",
    searchTopK: raw.searchTopK ?? 5,
    searchThreshold: raw.searchThreshold ?? 0.25,
    hybridAlpha: raw.hybridAlpha ?? 0.7,
    maxChunks: raw.maxChunks ?? 500,
    contextOrdering: raw.contextOrdering ?? "relevance",
  };
}

export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { agentId } = await params;
  const authResult = await requireAgentOwner(agentId);
  if (isAuthError(authResult)) return authResult;

  try {
    const kb = await prisma.knowledgeBase.findFirst({
      where: { agentId },
      select: CONFIG_SELECT,
    });

    if (!kb) {
      const response = NextResponse.json(
        { success: false, error: "Knowledge base not found" },
        { status: 404 }
      );
      applySecurityHeaders(response, request.nextUrl.pathname);
      return response;
    }

    const response = NextResponse.json({
      success: true,
      data: withDefaults(kb as unknown as Record<string, unknown>),
    });
    applySecurityHeaders(response, request.nextUrl.pathname);
    return response;
  } catch (error) {
    logger.error("Failed to get KB config", error, { agentId });
    const response = NextResponse.json(
      { success: false, error: sanitizeErrorMessage(error) },
      { status: 500 }
    );
    applySecurityHeaders(response, request.nextUrl.pathname);
    return response;
  }
}

export async function PATCH(
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
      const response = NextResponse.json(
        { success: false, error: "Knowledge base not found" },
        { status: 404 }
      );
      applySecurityHeaders(response, request.nextUrl.pathname);
      return response;
    }

    const raw = await parseBodyWithLimit(request);
    const parsed = kbConfigUpdateSchema.parse(raw);

    const data: Record<string, unknown> = {};

    if (parsed.chunkingStrategy !== undefined) {
      data.chunkingStrategy = parsed.chunkingStrategy;
    }
    if (parsed.embeddingModel !== undefined) {
      data.embeddingModel = parsed.embeddingModel;
      data.embeddingDimension = resolveEmbeddingDimension(
        parsed.embeddingModel,
        parsed.embeddingDimension
      );
    } else if (parsed.embeddingDimension !== undefined) {
      data.embeddingDimension = parsed.embeddingDimension;
    }
    if (parsed.retrievalMode !== undefined) data.retrievalMode = parsed.retrievalMode;
    if (parsed.rerankingModel !== undefined) data.rerankingModel = parsed.rerankingModel;
    if (parsed.queryTransform !== undefined) data.queryTransform = parsed.queryTransform;
    if (parsed.searchTopK !== undefined) data.searchTopK = parsed.searchTopK;
    if (parsed.searchThreshold !== undefined) data.searchThreshold = parsed.searchThreshold;
    if (parsed.hybridAlpha !== undefined) data.hybridAlpha = parsed.hybridAlpha;
    if (parsed.maxChunks !== undefined) data.maxChunks = parsed.maxChunks;
    if (parsed.contextOrdering !== undefined) data.contextOrdering = parsed.contextOrdering;

    const updated = await prisma.knowledgeBase.update({
      where: { id: kb.id },
      select: CONFIG_SELECT,
      data,
    });

    logger.info("KB config updated", { agentId, fields: Object.keys(data) });

    const response = NextResponse.json({
      success: true,
      data: withDefaults(updated as unknown as Record<string, unknown>),
    });
    applySecurityHeaders(response, request.nextUrl.pathname);
    return response;
  } catch (error) {
    if (error instanceof ZodError) {
      const response = NextResponse.json(
        {
          success: false,
          error: "Validation failed",
          details: error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
        },
        { status: 422 }
      );
      applySecurityHeaders(response, request.nextUrl.pathname);
      return response;
    }

    logger.error("Failed to update KB config", error, { agentId });
    const response = NextResponse.json(
      { success: false, error: sanitizeErrorMessage(error) },
      { status: 500 }
    );
    applySecurityHeaders(response, request.nextUrl.pathname);
    return response;
  }
}
