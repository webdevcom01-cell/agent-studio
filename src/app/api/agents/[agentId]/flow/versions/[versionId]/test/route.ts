import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { executeFlow } from "@/lib/runtime/engine";
import type { FlowContent } from "@/types";
import type { RuntimeContext } from "@/lib/runtime/types";

interface RouteParams {
  params: Promise<{ agentId: string; versionId: string }>;
}

export async function POST(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { agentId, versionId } = await params;

  const body = await request.json();
  const input = typeof body.input === "string" ? body.input.trim() : "";

  if (!input) {
    return NextResponse.json(
      { success: false, error: "Test input is required" },
      { status: 400 }
    );
  }

  const version = await prisma.flowVersion.findUnique({
    where: { id: versionId },
  });

  if (!version) {
    return NextResponse.json(
      { success: false, error: "Version not found" },
      { status: 404 }
    );
  }

  const flowContent = version.content as unknown as FlowContent;

  const sandboxConversation = await prisma.conversation.create({
    data: {
      agentId,
      status: "COMPLETED",
      variables: {},
      flowVersionId: versionId,
    },
  });

  try {
    const context: RuntimeContext = {
      conversationId: sandboxConversation.id,
      agentId,
      flowContent,
      currentNodeId: null,
      variables: {},
      messageHistory: [],
      isNewConversation: true,
    };

    const result = await executeFlow(context, input);

    return NextResponse.json({
      success: true,
      data: {
        messages: result.messages,
        waitingForInput: result.waitingForInput,
        versionId,
        version: version.version,
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Test execution failed" },
      { status: 500 }
    );
  }
}
