import type { NodeHandler, ExecutionResult } from "../types";
import { resolveTemplate } from "../template";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

const DEFAULT_TIMEOUT_MINUTES = 60;

export const humanApprovalHandler: NodeHandler = async (node, context) => {
  const prompt = (node.data.prompt as string) || "Please review and approve";
  const inputVariable = (node.data.inputVariable as string) || "";
  const outputVariable = (node.data.outputVariable as string) || "approval_result";
  const timeoutMinutes =
    (node.data.timeoutMinutes as number) || DEFAULT_TIMEOUT_MINUTES;
  const onTimeout = (node.data.onTimeout as string) || "continue";
  const defaultValue = (node.data.defaultValue as string) || "";

  const resolvedPrompt = resolveTemplate(prompt, context.variables);
  const contextData = inputVariable
    ? { [inputVariable]: context.variables[inputVariable] }
    : {};

  const userId = (context as unknown as Record<string, unknown>)["_userId"] as
    | string
    | undefined;

  if (!userId) {
    return {
      messages: [
        {
          role: "assistant",
          content: "Human approval requires an authenticated user.",
        },
      ],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: { [outputVariable]: null },
    };
  }

  const pendingRequestId = context.variables["_approval_request_id"] as string | undefined;

  if (pendingRequestId) {
    const updated = await prisma.humanApprovalRequest.findUnique({
      where: { id: pendingRequestId },
    });

    if (!updated) {
      return {
        messages: [{ role: "assistant", content: "Approval request not found." }],
        nextNodeId: null,
        waitForInput: false,
        updatedVariables: { [outputVariable]: null },
      };
    }

    if (updated.status === "approved" || updated.status === "rejected") {
      return {
        messages: [
          {
            role: "assistant",
            content: `Human ${updated.status}: ${updated.response ?? ""}`.trim(),
          },
        ],
        nextNodeId: null,
        waitForInput: false,
        updatedVariables: {
          [outputVariable]: updated.response ?? updated.status,
          _approval_request_id: null,
        },
      };
    }

    if (new Date() > updated.expiresAt) {
      await prisma.humanApprovalRequest
        .update({
          where: { id: pendingRequestId },
          data: { status: "timeout", resolvedAt: new Date() },
        })
        .catch((err) => {
          logger.error("Failed to update approval timeout", err, {
            requestId: pendingRequestId,
          });
        });

      return handleTimeout(onTimeout, timeoutMinutes, outputVariable, defaultValue);
    }

    return {
      messages: [{ role: "assistant", content: "Waiting for human approval..." }],
      nextNodeId: node.id,
      waitForInput: true,
      updatedVariables: {},
    };
  }

  const expiresAt = new Date(Date.now() + timeoutMinutes * 60 * 1000);

  const request = await prisma.humanApprovalRequest.create({
    data: {
      executionId: context.conversationId,
      agentId: context.agentId,
      userId,
      prompt: resolvedPrompt,
      contextData: contextData as Record<string, string>,
      status: "pending",
      expiresAt,
    },
  });

  return {
    messages: [
      {
        role: "assistant",
        content: `Awaiting human approval: ${resolvedPrompt}`,
      },
    ],
    nextNodeId: node.id,
    waitForInput: true,
    updatedVariables: { _approval_request_id: request.id },
  };
};

function handleTimeout(
  onTimeout: string,
  timeoutMinutes: number,
  outputVariable: string,
  defaultValue: string,
): ExecutionResult {
  if (onTimeout === "stop") {
    return {
      messages: [
        {
          role: "assistant",
          content: `Human approval timed out after ${timeoutMinutes} minutes`,
        },
      ],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: { _approval_request_id: null },
    };
  }

  if (onTimeout === "use_default") {
    return {
      messages: [
        {
          role: "assistant",
          content: "Human approval timed out. Using default value.",
        },
      ],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: {
        [outputVariable]: defaultValue || null,
        _approval_request_id: null,
      },
    };
  }

  return {
    messages: [
      {
        role: "assistant",
        content: "Human approval timed out. Continuing flow.",
      },
    ],
    nextNodeId: null,
    waitForInput: false,
    updatedVariables: { [outputVariable]: null, _approval_request_id: null },
  };
}
