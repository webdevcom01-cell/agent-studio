import type { NodeHandler } from "../types";
import { resolveTemplate } from "../template";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import {
  checkCircuit,
  recordSuccess,
  recordFailure,
  checkDepthLimit,
  checkCycleDetection,
  A2ACircuitError,
} from "@/lib/a2a/circuit-breaker";
import { checkRateLimit } from "@/lib/a2a/rate-limiter";
import type { FlowContent } from "@/types";
import { parseFlowContent } from "@/lib/validators/flow-content";
import {
  createWorkspace,
  shareWorkspace,
  getFiles,
  type AgentWorkspace,
} from "@/lib/agents/agent-workspace";

const DEFAULT_TIMEOUT_SECONDS = 30;

interface ParallelTarget {
  agentId: string;
  agentName?: string;
  outputVariable: string;
  inputMapping: { key: string; value: string }[];
}

export const callAgentHandler: NodeHandler = async (node, context) => {
  const mode = (node.data.mode as string) || "internal";
  const allowParallel = (node.data.allowParallel as boolean) || false;
  const parallelTargets = (node.data.parallelTargets as ParallelTarget[]) || [];
  const targetAgentId = node.data.targetAgentId as string | undefined;
  const externalCardUrl = node.data.externalCardUrl as string | undefined;
  const inputMappingRaw = node.data.inputMapping as
    | { key: string; value: string }[]
    | Record<string, string>
    | undefined;
  const outputVariable = (node.data.outputVariable as string) || "agent_result";
  const timeoutSeconds =
    (node.data.timeoutSeconds as number) || DEFAULT_TIMEOUT_SECONDS;
  const onError = (node.data.onError as string) || "continue";
  const depth = (context as RuntimeContextWithDepth)._a2aDepth ?? 0;
  const callStack = (context as RuntimeContextWithDepth)._a2aCallStack ?? [
    context.agentId,
  ];
  const traceId =
    (context as RuntimeContextWithDepth)._a2aTraceId ?? generateSpanId();

  if (allowParallel && parallelTargets.length > 0) {
    return executeParallel({
      node,
      context,
      parallelTargets,
      depth,
      callStack,
      traceId,
      timeoutSeconds,
      onError,
    });
  }

  if (mode === "internal" && !targetAgentId) {
    return {
      messages: [
        {
          role: "assistant",
          content: "Call Agent node is not configured (no target agent selected).",
        },
      ],
      nextNodeId: null,
      waitForInput: false,
    };
  }

  if (mode === "external" && !externalCardUrl) {
    return {
      messages: [
        {
          role: "assistant",
          content: "Call Agent node is not configured (no Agent Card URL provided).",
        },
      ],
      nextNodeId: null,
      waitForInput: false,
    };
  }

  if (mode === "internal" && targetAgentId) {
    try {
      checkDepthLimit(depth, callStack);
      checkCycleDetection(targetAgentId, callStack);
    } catch (err) {
      if (err instanceof A2ACircuitError) {
        logger.warn(err.message, {
          agentId: context.agentId,
          code: err.code,
          depth,
        });
        if (onError === "stop") {
          return {
            messages: [{ role: "assistant", content: err.message }],
            nextNodeId: null,
            waitForInput: false,
          };
        }
        return {
          messages: [
            {
              role: "assistant",
              content: err.message,
            },
          ],
          nextNodeId: null,
          waitForInput: false,
          updatedVariables: { [outputVariable]: null },
        };
      }
      throw err;
    }
  }

  const inputMapping = normalizeInputMapping(inputMappingRaw);

  if (inputMapping.length === 0) {
    logger.warn("call_agent node has no inputMapping — sub-agent will run with empty context", {
      nodeId: node.id,
      targetAgentId,
      agentId: context.agentId,
    });
  } else {
    logger.info("call_agent passing variables to sub-agent", {
      nodeId: node.id,
      targetAgentId,
      mappedKeys: inputMapping.map((m) => m.key),
    });
  }

  const resolvedInput: Record<string, string> = {};
  for (const { key, value } of inputMapping) {
    resolvedInput[key] = resolveTemplate(value, context.variables);
  }

  const spanId = generateSpanId();
  const taskId = generateSpanId();

  const callLog = await prisma.agentCallLog.create({
    data: {
      traceId,
      spanId,
      parentSpanId: null,
      callerAgentId: context.agentId,
      calleeAgentId: mode === "internal" ? targetAgentId : undefined,
      externalUrl: mode === "external" ? externalCardUrl : undefined,
      taskId,
      status: "SUBMITTED",
      inputParts: [{ type: "text", text: JSON.stringify(resolvedInput) }],
      depth,
      isParallel: false,
      executionId: context.conversationId,
    },
  });

  const startTime = Date.now();
  const calleeId = targetAgentId ?? externalCardUrl ?? "unknown";
  const userId = getOwnerUserId(context as RuntimeContextWithDepth);

  try {
    if (userId) {
      checkRateLimit(userId, calleeId);
    }
    checkCircuit(context.agentId, calleeId);

    await prisma.agentCallLog.update({
      where: { id: callLog.id },
      data: { status: "WORKING" },
    });

    let output: unknown;

    if (mode === "external" && externalCardUrl) {
      output = await executeExternalAgent({
        cardUrl: externalCardUrl,
        input: resolvedInput,
        timeoutSeconds,
        skillId: node.data.externalSkillId as string | undefined,
      });
    } else {
      const subResult = await executeSubAgent({
        targetAgentId: targetAgentId!,
        callerUserId: userId,
        input: resolvedInput,
        depth: depth + 1,
        callStack: [...callStack, targetAgentId!],
        traceId,
        timeoutSeconds,
      });
      output = subResult.output;
    }

    recordSuccess(context.agentId, calleeId);

    const durationMs = Date.now() - startTime;

    await prisma.agentCallLog.update({
      where: { id: callLog.id },
      data: {
        status: "COMPLETED",
        outputParts: [
          { type: "text", text: JSON.stringify(output) },
        ],
        durationMs,
        completedAt: new Date(),
      },
    });

    const workspaceFiles = await getWorkspaceFiles(context.conversationId);

    const updatedVars: Record<string, unknown> = {
      [outputVariable]: output,
    };

    if (workspaceFiles.length > 0) {
      updatedVars[`${outputVariable}_files`] = workspaceFiles.map((f) => ({
        name: f.name,
        path: f.path,
        mimeType: f.mimeType,
        size: f.size,
      }));
    }

    return {
      messages: [
        {
          role: "assistant",
          content:
            typeof output === "string"
              ? output
              : JSON.stringify(output),
        },
      ],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: updatedVars,
    };
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const errorMsg = err instanceof Error ? err.message : String(err);

    await prisma.agentCallLog
      .update({
        where: { id: callLog.id },
        data: {
          status: "FAILED",
          errorMessage: errorMsg,
          durationMs,
          completedAt: new Date(),
        },
      })
      .catch((err) => logger.warn("Call log update failed", err));

    recordFailure(context.agentId, calleeId);

    logger.error("Sub-agent call failed", err, {
      agentId: context.agentId,
      targetAgentId: targetAgentId ?? externalCardUrl,
    });

    if (onError === "stop") {
      return {
        messages: [
          {
            role: "assistant",
            content: `Sub-agent call failed: ${errorMsg}`,
          },
        ],
        nextNodeId: null,
        waitForInput: false,
      };
    }

    return {
      messages: [
        {
          role: "assistant",
          content: "Sub-agent call failed. Continuing flow.",
        },
      ],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: { [outputVariable]: null },
    };
  }
};

interface ParallelExecParams {
  node: { data: Record<string, unknown> };
  context: {
    agentId: string;
    conversationId: string;
    variables: Record<string, unknown>;
  };
  parallelTargets: ParallelTarget[];
  depth: number;
  callStack: string[];
  traceId: string;
  timeoutSeconds: number;
  onError: string;
}

async function executeParallel(
  params: ParallelExecParams
): Promise<{
  messages: { role: "assistant"; content: string }[];
  nextNodeId: null;
  waitForInput: false;
  updatedVariables: Record<string, unknown>;
}> {
  const {
    context,
    parallelTargets,
    depth,
    callStack,
    traceId,
    timeoutSeconds,
    onError,
  } = params;

  const userId = getOwnerUserId(context as RuntimeContextWithDepth);
  const { executeFlow: execFlowFn } = await import("../engine");

  // Warn about parallel targets with empty inputMapping
  for (const target of parallelTargets) {
    if (target.inputMapping.length === 0) {
      logger.warn(
        `call_agent parallel target '${target.agentName || target.agentId}' has no inputMapping — sub-agent will run with empty context`,
        { targetAgentId: target.agentId, agentId: context.agentId },
      );
    }
  }

  const results = await Promise.allSettled(
    parallelTargets.map(async (target) => {
      const resolvedInput: Record<string, string> = {};
      for (const { key, value } of target.inputMapping) {
        resolvedInput[key] = resolveTemplate(value, context.variables);
      }

      const spanId = generateSpanId();
      const taskId = generateSpanId();

      await prisma.agentCallLog.create({
        data: {
          traceId,
          spanId,
          callerAgentId: context.agentId,
          calleeAgentId: target.agentId,
          taskId,
          status: "SUBMITTED",
          inputParts: [{ type: "text", text: JSON.stringify(resolvedInput) }],
          depth,
          isParallel: true,
          executionId: context.conversationId,
        },
      });

      const startTime = Date.now();

      try {
        if (userId) checkRateLimit(userId, target.agentId);
        checkCircuit(context.agentId, target.agentId);

        const subResult = await executeSubAgent({
          targetAgentId: target.agentId,
          callerUserId: userId,
          input: resolvedInput,
          depth: depth + 1,
          callStack: [...callStack, target.agentId],
          traceId,
          timeoutSeconds,
          executeFlowFn: execFlowFn as ExecuteFlowFn,
        });

        const durationMs = Date.now() - startTime;
        recordSuccess(context.agentId, target.agentId);

        await prisma.agentCallLog
          .update({
            where: { taskId },
            data: {
              status: "COMPLETED",
              outputParts: [
                { type: "text", text: JSON.stringify(subResult.output) },
              ],
              durationMs,
              completedAt: new Date(),
            },
          })
          .catch((err) => logger.warn("Call log update failed", err));

        return { variable: target.outputVariable, output: subResult.output };
      } catch (err) {
        const durationMs = Date.now() - startTime;
        recordFailure(context.agentId, target.agentId);

        await prisma.agentCallLog
          .update({
            where: { taskId },
            data: {
              status: "FAILED",
              errorMessage:
                err instanceof Error ? err.message : String(err),
              durationMs,
              completedAt: new Date(),
            },
          })
          .catch((err) => logger.warn("Call log update failed", err));

        throw err;
      }
    })
  );

  const updatedVariables: Record<string, unknown> = {};
  const messages: string[] = [];

  for (let i = 0; i < parallelTargets.length; i++) {
    const target = parallelTargets[i];
    const result = results[i];

    if (result.status === "fulfilled") {
      updatedVariables[target.outputVariable] = result.value.output;
      messages.push(
        `${target.agentName ?? target.agentId}: completed`
      );
    } else {
      updatedVariables[target.outputVariable] = null;
      const errorMsg =
        result.reason instanceof Error
          ? result.reason.message
          : String(result.reason);
      messages.push(
        `${target.agentName ?? target.agentId}: failed (${errorMsg})`
      );

      if (onError === "stop") {
        return {
          messages: [
            {
              role: "assistant" as const,
              content: `Parallel agent call failed: ${errorMsg}`,
            },
          ],
          nextNodeId: null,
          waitForInput: false as const,
          updatedVariables,
        };
      }
    }
  }

  return {
    messages: [
      {
        role: "assistant" as const,
        content: `Parallel execution complete: ${messages.join("; ")}`,
      },
    ],
    nextNodeId: null,
    waitForInput: false as const,
    updatedVariables,
  };
}

interface ExternalAgentParams {
  cardUrl: string;
  input: Record<string, string>;
  timeoutSeconds: number;
  skillId?: string;
}

async function executeExternalAgent(
  params: ExternalAgentParams
): Promise<unknown> {
  const { cardUrl, input, timeoutSeconds, skillId } = params;

  const cardRes = await fetch(cardUrl, {
    signal: AbortSignal.timeout(timeoutSeconds * 1000),
  });

  if (!cardRes.ok) {
    throw new Error(`Failed to fetch Agent Card: ${cardRes.status}`);
  }

  const card = (await cardRes.json()) as { url?: string; data?: { url?: string } };
  const a2aUrl = card.url ?? card.data?.url;

  if (!a2aUrl) {
    throw new Error("No A2A URL found in agent card");
  }

  const taskId = generateSpanId();
  const inputText = JSON.stringify(input);

  const response = await fetch(a2aUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "tasks/send",
      id: taskId,
      params: {
        taskId,
        skillId,
        message: {
          parts: [{ type: "text", text: inputText }],
        },
      },
    }),
    signal: AbortSignal.timeout(timeoutSeconds * 1000),
  });

  const data = (await response.json()) as {
    error?: { message?: string };
    result?: {
      artifacts?: { parts?: { type: string; text?: string }[] }[];
    };
  };

  if (data.error) {
    throw new Error(data.error.message ?? "External A2A call failed");
  }

  const artifact = data.result?.artifacts?.[0];
  const textPart = artifact?.parts?.find((p) => p.type === "text");

  if (textPart?.text) {
    try {
      return JSON.parse(textPart.text) as unknown;
    } catch {
      return textPart.text;
    }
  }

  return data.result ?? null;
}

type ExecuteFlowFn = (
  ctx: RuntimeContextWithDepth
) => Promise<{ messages: { role: string; content: string }[]; waitingForInput: boolean }>;

interface SubAgentParams {
  targetAgentId: string;
  callerUserId: string | null;
  input: Record<string, string>;
  depth: number;
  callStack: string[];
  traceId: string;
  timeoutSeconds: number;
  executeFlowFn?: ExecuteFlowFn;
}

interface SubAgentResult {
  output: unknown;
}

async function executeSubAgent(params: SubAgentParams): Promise<SubAgentResult> {
  const {
    targetAgentId,
    callerUserId,
    input,
    depth,
    callStack,
    traceId,
    timeoutSeconds,
    executeFlowFn,
  } = params;

  const whereClause = callerUserId
    ? { id: targetAgentId, userId: callerUserId }
    : { id: targetAgentId };

  const agent = await prisma.agent.findFirst({
    where: whereClause,
    include: { flow: true },
  });

  if (!agent) {
    throw new Error(`Agent "${targetAgentId}" not found or access denied`);
  }

  if (!agent.flow) {
    throw new Error(`Agent "${agent.name}" has no flow`);
  }

  const flowContent = parseFlowContent(agent.flow.content);

  const conversation = await prisma.conversation.create({
    data: {
      agentId: targetAgentId,
      status: "ACTIVE",
      variables: input,
    },
  });

  let workspace: AgentWorkspace | undefined;
  try {
    workspace = await createWorkspace(targetAgentId, conversation.id);
    workspace = shareWorkspace(workspace, callStack[0] ?? targetAgentId);
  } catch {
    // Workspace creation is non-critical
  }

  const subContext: RuntimeContextWithDepth = {
    conversationId: conversation.id,
    agentId: targetAgentId,
    flowContent,
    currentNodeId: null,
    variables: {
      ...input,
      ...(workspace ? { _workspace_path: workspace.basePath } : {}),
    },
    messageHistory: [],
    isNewConversation: true,
    _a2aDepth: depth,
    _a2aCallStack: callStack,
    _a2aTraceId: traceId,
  };

  const runFlow =
    executeFlowFn ?? (await import("../engine")).executeFlow;

  let timeoutRef: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutRef = setTimeout(
      () => reject(new Error(`Sub-agent timed out after ${timeoutSeconds}s`)),
      timeoutSeconds * 1000
    );
  });

  const executionPromise = runFlow(subContext);

  let result: Awaited<typeof executionPromise>;
  try {
    result = await Promise.race([executionPromise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutRef!);
  }

  const lastAssistantMessage = result.messages
    .filter((m) => m.role === "assistant")
    .pop();

  return {
    output: lastAssistantMessage?.content ?? null,
  };
}

interface RuntimeContextWithDepth {
  conversationId: string;
  agentId: string;
  flowContent: FlowContent;
  currentNodeId: string | null;
  variables: Record<string, unknown>;
  messageHistory: { role: "user" | "assistant" | "system"; content: string }[];
  isNewConversation: boolean;
  isResuming?: boolean;
  _a2aDepth?: number;
  _a2aCallStack?: string[];
  _a2aTraceId?: string;
  _userId?: string;
}

async function getWorkspaceFiles(
  conversationId: string,
): Promise<{ name: string; path: string; mimeType: string; size: number }[]> {
  try {
    return await getFiles(conversationId);
  } catch {
    return [];
  }
}

function normalizeInputMapping(
  raw: { key: string; value: string }[] | Record<string, string> | undefined
): { key: string; value: string }[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  return Object.entries(raw).map(([key, value]) => ({ key, value }));
}

function generateSpanId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function getOwnerUserId(
  context: RuntimeContextWithDepth
): string | null {
  return (context._userId as string | undefined) ?? null;
}
