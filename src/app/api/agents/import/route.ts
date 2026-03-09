import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { agentExportSchema } from "@/lib/schemas/agent-export";
import { checkRateLimit } from "@/lib/rate-limit";

const MAX_IMPORT_SIZE = 5 * 1024 * 1024;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const rateResult = checkRateLimit(`import-agent:${session.user.id}`, 5);
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
      userId: session.user.id,
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
