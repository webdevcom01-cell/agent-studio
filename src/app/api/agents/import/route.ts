import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api/auth-guard";
import { agentExportSchema } from "@/lib/schemas/agent-export";
import { checkRateLimit } from "@/lib/rate-limit";

const MAX_IMPORT_SIZE = 5 * 1024 * 1024;
const MAX_AGENTS_PER_USER = 100;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  const rateResult = checkRateLimit(`import-agent:${authResult.userId}`, 5);
  if (!rateResult.allowed) {
    return NextResponse.json(
      { success: false, error: "Too many requests" },
      { status: 429 }
    );
  }

  const contentLength = parseInt(
    request.headers.get("content-length") ?? "0",
    10
  );
  if (contentLength > MAX_IMPORT_SIZE) {
    return NextResponse.json(
      { success: false, error: "Import file exceeds 5 MB limit" },
      { status: 400 }
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON" },
      { status: 400 }
    );
  }

  const parsed = agentExportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid export format" },
      { status: 422 }
    );
  }

  const { agent: agentData, flow: flowData } = parsed.data;

  const agent = await prisma.agent.create({
    data: {
      name: `${agentData.name} (imported)`,
      description: agentData.description,
      systemPrompt: agentData.systemPrompt,
      model: agentData.model,
      userId: authResult.userId,
      flow: {
        create: {
          content: flowData as unknown as Prisma.InputJsonValue,
        },
      },
      knowledgeBase: {
        create: {
          name: `${agentData.name} KB`,
        },
      },
    },
    include: {
      flow: { select: { id: true } },
      knowledgeBase: { select: { id: true } },
    },
  });

  return NextResponse.json({ success: true, data: agent }, { status: 201 });
}
