/**
 * POST /api/agents/[agentId]/knowledge/evaluate
 *
 * Runs a RAGAS evaluation: search → generate answer → evaluate quality.
 * Returns answer, metrics (faithfulness, precision, recall, relevancy), and citations.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateText } from "ai";
import { getModel } from "@/lib/ai";
import { requireAgentOwner, isAuthError } from "@/lib/api/auth-guard";
import { parseBodyWithLimit } from "@/lib/api/body-limit";
import { sanitizeErrorMessage } from "@/lib/api/sanitize-error";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { hybridSearch } from "@/lib/knowledge/search";
import { extractCitations, formatCitationsForUI } from "@/lib/knowledge/citations";
import { evaluateRAGAS } from "@/lib/knowledge/ragas";

export const maxDuration = 120;

const EvalRequestSchema = z.object({
  question: z.string().min(1).max(2000),
  groundTruth: z.string().max(5000).optional(),
});

interface RouteParams {
  params: Promise<{ agentId: string }>;
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
    const parsed = EvalRequestSchema.parse(raw);

    const searchResults = await hybridSearch(parsed.question, kb.id);
    const contexts = searchResults.map((r) => r.content);
    const citations = extractCitations(searchResults);

    const contextBlock = contexts
      .map((c, i) => `[${i + 1}] ${c}`)
      .join("\n\n");

    const { text: answer } = await generateText({
      model: getModel("deepseek-chat"),
      system: `Answer the question using ONLY the provided context. If the context doesn't contain enough information, say so.\n\nContext:\n${contextBlock}`,
      prompt: parsed.question,
      maxOutputTokens: 1000,
    });

    const metrics = await evaluateRAGAS({
      question: parsed.question,
      answer,
      contexts,
      groundTruth: parsed.groundTruth,
    });

    return NextResponse.json({
      success: true,
      data: {
        answer,
        metrics,
        citations: formatCitationsForUI(citations),
        contextsUsed: contexts.length,
      },
    });
  } catch (error) {
    logger.error("KB evaluation failed", error, { agentId });
    return NextResponse.json(
      { success: false, error: sanitizeErrorMessage(error) },
      { status: 500 }
    );
  }
}
