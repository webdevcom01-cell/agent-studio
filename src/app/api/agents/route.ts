import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api/auth-guard";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";

const VALID_MODELS = ["deepseek-chat", "gpt-4o-mini", "gpt-4o", "claude-sonnet-4-20250514", "claude-haiku-4-5-20251001"] as const;
const MAX_AGENTS_PER_USER = 100;

const createAgentSchema = z.object({
  name: z.string().min(1, "Name is required").max(200, "Name must be 200 characters or less"),
  description: z.string().max(2000).optional().default(""),
  systemPrompt: z.string().max(10000).optional().default("You are a helpful assistant."),
  model: z.enum(VALID_MODELS).optional().default("deepseek-chat"),
});

export async function GET(): Promise<NextResponse> {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  const agents = await prisma.agent.findMany({
    where: {
      OR: [{ userId: authResult.userId }, { userId: null }],
    },
    orderBy: { updatedAt: "desc" },
    include: {
      flow: { select: { id: true } },
      knowledgeBase: { select: { id: true } },
      _count: { select: { conversations: true } },
    },
  });

  return NextResponse.json({ success: true, data: agents });
}

const WRITE_RATE_LIMIT = 10;

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const authResult = await requireAuth();
    if (isAuthError(authResult)) return authResult;

    const rateResult = checkRateLimit(`create-agent:${authResult.userId}`, WRITE_RATE_LIMIT);
    if (!rateResult.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many requests" },
        { status: 429 }
      );
    }

    const agentCount = await prisma.agent.count({
      where: { userId: authResult.userId },
    });
    if (agentCount >= MAX_AGENTS_PER_USER) {
      return NextResponse.json(
        { success: false, error: `Agent limit reached (${MAX_AGENTS_PER_USER} max)` },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = createAgentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0].message },
        { status: 400 }
      );
    }

    const { name, description, systemPrompt, model } = parsed.data;

    const agent = await prisma.agent.create({
      data: {
        name,
        description,
        systemPrompt,
        model,
        userId: authResult.userId,
        flow: {
          create: {
            content: {
              nodes: [
                {
                  id: "start",
                  type: "ai_response",
                  position: { x: 250, y: 100 },
                  data: { label: "AI Response", prompt: "", model },
                },
              ],
              edges: [],
              variables: [],
            },
          },
        },
        knowledgeBase: {
          create: {
            name: `${name} KB`,
          },
        },
      },
      include: {
        flow: { select: { id: true } },
        knowledgeBase: { select: { id: true } },
      },
    });

    return NextResponse.json({ success: true, data: agent }, { status: 201 });
  } catch (err) {
    logger.error("Failed to create agent", err);
    return NextResponse.json(
      { success: false, error: "Failed to create agent" },
      { status: 500 }
    );
  }
}
