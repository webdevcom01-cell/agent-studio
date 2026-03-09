import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";

const VALID_MODELS = ["deepseek-chat", "gpt-4o-mini", "gpt-4o", "claude-sonnet-4-20250514", "claude-haiku-4-5-20251001"] as const;

const createAgentSchema = z.object({
  name: z.string().min(1, "Name is required").max(200, "Name must be 200 characters or less"),
  description: z.string().max(2000).optional().default(""),
  systemPrompt: z.string().max(10000).optional().default("You are a helpful assistant."),
  model: z.enum(VALID_MODELS).optional().default("deepseek-chat"),
});

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const agents = await prisma.agent.findMany({
    where: {
      OR: [{ userId: session.user.id }, { userId: null }],
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
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const rateResult = checkRateLimit(`create-agent:${session.user.id}`, WRITE_RATE_LIMIT);
    if (!rateResult.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many requests" },
        { status: 429 }
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
        userId: session.user.id,
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
