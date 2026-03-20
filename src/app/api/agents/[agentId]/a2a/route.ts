import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/api/auth-guard";
import { prisma } from "@/lib/prisma";
import { generateId } from "@/lib/utils";
import { logger } from "@/lib/logger";
import { parseFlowContent } from "@/lib/validators/flow-content";
import {
  checkCircuit,
  recordSuccess,
  recordFailure,
  checkDepthLimit,
  checkCycleDetection,
  parseVisitedAgents,
  serializeVisitedAgents,
  A2ACircuitError,
} from "@/lib/a2a/circuit-breaker";

interface RouteParams {
  params: Promise<{ agentId: string }>;
}

interface JsonRpcRequest {
  jsonrpc: string;
  method: string;
  id: string | number | null;
  params?: {
    taskId?: string;
    message?: {
      parts?: { type: string; text?: string }[];
    };
  };
}

function jsonRpcError(
  id: string | number | null,
  code: number,
  message: string,
  status: number
): NextResponse {
  return NextResponse.json(
    { jsonrpc: "2.0", id, error: { code, message } },
    { status }
  );
}

export async function POST(
  req: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const authResult = await requireAuth();
    if (isAuthError(authResult)) {
      return jsonRpcError(null, -32000, "Unauthorized", 401);
    }

    const { agentId } = await params;
    const body = (await req.json()) as JsonRpcRequest;

    if (body.method !== "tasks/send") {
      return jsonRpcError(
        body.id ?? null,
        -32601,
        "Method not found",
        404
      );
    }

    // ── Distributed trace context from headers ──────────────────────────
    const visitedHeader = req.headers.get("x-a2a-visited-agents");
    const visitedAgents = parseVisitedAgents(visitedHeader);
    const traceId = req.headers.get("x-a2a-trace-id") ?? generateId();
    const depth = parseInt(req.headers.get("x-a2a-depth") ?? "0", 10);
    const callerAgentId = req.headers.get("x-a2a-caller-agent-id") ?? agentId;

    // ── Circuit breaker + depth + cycle checks ──────────────────────────
    try {
      checkDepthLimit(depth, visitedAgents);
      checkCycleDetection(agentId, visitedAgents);
      if (callerAgentId !== agentId) {
        checkCircuit(callerAgentId, agentId);
      }
    } catch (err) {
      if (err instanceof A2ACircuitError) {
        logger.warn("A2A request rejected", {
          agentId,
          code: err.code,
          message: err.message,
        });
        return jsonRpcError(body.id ?? null, err.code, err.message, 429);
      }
      throw err;
    }

    const taskId = body.params?.taskId ?? generateId();
    const inputParts = body.params?.message?.parts ?? [
      { type: "text", text: "" },
    ];
    const textPart = inputParts.find((p) => p.type === "text");
    const inputMessage = textPart?.text ?? "";

    const agent = await prisma.agent.findFirst({
      where: { id: agentId, userId: authResult.userId },
      include: { flow: true },
    });

    if (!agent) {
      return jsonRpcError(body.id ?? null, -32000, "Agent not found", 404);
    }

    if (!agent.flow) {
      return jsonRpcError(body.id ?? null, -32000, "Agent has no flow", 400);
    }

    await prisma.agentCallLog.create({
      data: {
        traceId,
        spanId: generateId(),
        callerAgentId,
        calleeAgentId: agentId,
        taskId,
        status: "SUBMITTED",
        inputParts,
        depth,
        isParallel: false,
        externalUrl: req.headers.get("referer") ?? undefined,
      },
    });

    const { executeFlow } = await import("@/lib/runtime/engine");

    const flowContent = parseFlowContent(agent.flow.content);

    const conversation = await prisma.conversation.create({
      data: {
        agentId,
        status: "ACTIVE",
        variables: inputMessage ? { message: inputMessage } : {},
      },
    });

    // Propagate visited-agents into flow context for sub-agent calls
    const updatedVisited = [...visitedAgents, agentId];

    const context = {
      conversationId: conversation.id,
      agentId,
      flowContent,
      currentNodeId: null as string | null,
      variables: inputMessage
        ? ({ message: inputMessage } as Record<string, unknown>)
        : ({} as Record<string, unknown>),
      messageHistory: [] as {
        role: "user" | "assistant" | "system";
        content: string;
      }[],
      isNewConversation: true,
      _a2aDepth: depth + 1,
      _a2aCallStack: updatedVisited,
      _a2aTraceId: traceId,
    };

    const startTime = Date.now();
    const result = await executeFlow(context, inputMessage || undefined);
    const durationMs = Date.now() - startTime;

    if (callerAgentId !== agentId) {
      recordSuccess(callerAgentId, agentId);
    }

    const lastAssistant = result.messages
      .filter((m) => m.role === "assistant")
      .pop();
    const outputText = lastAssistant?.content ?? "";

    await prisma.agentCallLog
      .update({
        where: { taskId },
        data: {
          status: "COMPLETED",
          outputParts: [{ type: "text", text: outputText }],
          durationMs,
          completedAt: new Date(),
        },
      })
      .catch((err) => logger.warn("A2A task update failed", err));

    const response = NextResponse.json({
      jsonrpc: "2.0",
      id: body.id ?? null,
      result: {
        id: taskId,
        status: { state: "completed" },
        artifacts: [
          {
            parts: [{ type: "text", text: outputText }],
          },
        ],
      },
    });

    // Propagate trace context in response headers for caller visibility
    response.headers.set("x-a2a-trace-id", traceId);
    response.headers.set("x-a2a-visited-agents", serializeVisitedAgents(updatedVisited));

    return response;
  } catch (err) {
    const agentId = (await params).agentId;
    const callerAgentId = req.headers.get("x-a2a-caller-agent-id");
    if (callerAgentId && callerAgentId !== agentId) {
      recordFailure(callerAgentId, agentId);
    }
    logger.error("A2A task execution failed", err, {});
    return jsonRpcError(null, -32000, "Internal execution error", 500);
  }
}
