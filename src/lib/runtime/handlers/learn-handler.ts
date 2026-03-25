import type { NodeHandler } from "../types";
import type { Prisma } from "@/generated/prisma";
import { resolveTemplate } from "../template";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

const MAX_EXECUTIONS_TO_SCAN = 20;
const DEFAULT_CONFIDENCE_BOOST = 0.1;

export const learnHandler: NodeHandler = async (node, context) => {
  const agentId = context.agentId;
  const patternName = resolveTemplate(
    (node.data.patternName as string) || "",
    context.variables
  );
  const patternDescription = resolveTemplate(
    (node.data.patternDescription as string) || "",
    context.variables
  );
  const outputVariable =
    (node.data.outputVariable as string) || "learn_result";

  if (!patternName) {
    return {
      messages: [
        {
          role: "assistant",
          content: "Learn node requires a pattern name.",
        },
      ],
      nextNodeId: null,
      waitForInput: false,
    };
  }

  try {
    const existing = await prisma.instinct.findFirst({
      where: { agentId, name: patternName },
    });

    if (existing) {
      const newConfidence = Math.min(
        1.0,
        existing.confidence + DEFAULT_CONFIDENCE_BOOST
      );

      await prisma.instinct.update({
        where: { id: existing.id },
        data: {
          confidence: newConfidence,
          frequency: existing.frequency + 1,
          description: patternDescription || existing.description,
          examples: mergeExamples(
            existing.examples,
            context.variables
          ) as Prisma.InputJsonValue,
        },
      });

      const nextNodeId =
        context.flowContent.edges.find((e) => e.source === node.id)
          ?.target ?? null;

      return {
        messages: [
          {
            role: "assistant",
            content: `Reinforced instinct "${patternName}" (confidence: ${newConfidence.toFixed(2)}, frequency: ${existing.frequency + 1}).`,
          },
        ],
        nextNodeId,
        waitForInput: false,
        updatedVariables: {
          [outputVariable]: {
            action: "reinforced",
            name: patternName,
            confidence: newConfidence,
            frequency: existing.frequency + 1,
          },
        },
      };
    }

    const recentExecutions = await prisma.agentExecution.findMany({
      where: { agentId, status: "SUCCESS" },
      orderBy: { createdAt: "desc" },
      take: MAX_EXECUTIONS_TO_SCAN,
      select: { id: true, inputParams: true, outputResult: true },
    });

    await prisma.instinct.create({
      data: {
        agentId,
        name: patternName,
        description: patternDescription || `Pattern extracted: ${patternName}`,
        confidence: DEFAULT_CONFIDENCE_BOOST,
        frequency: 1,
        origin: "learn_node",
        examples: recentExecutions.length > 0
          ? { executionIds: recentExecutions.map((e) => e.id) }
          : undefined,
      },
    });

    const nextNodeId =
      context.flowContent.edges.find((e) => e.source === node.id)
        ?.target ?? null;

    return {
      messages: [
        {
          role: "assistant",
          content: `Created new instinct "${patternName}" (confidence: ${DEFAULT_CONFIDENCE_BOOST.toFixed(2)}).`,
        },
      ],
      nextNodeId,
      waitForInput: false,
      updatedVariables: {
        [outputVariable]: {
          action: "created",
          name: patternName,
          confidence: DEFAULT_CONFIDENCE_BOOST,
          frequency: 1,
        },
      },
    };
  } catch (err) {
    logger.error("Learn handler failed", err, { agentId, patternName });
    const nextNodeId =
      context.flowContent.edges.find((e) => e.source === node.id)
        ?.target ?? null;

    return {
      messages: [
        {
          role: "assistant",
          content: `Failed to learn pattern "${patternName}".`,
        },
      ],
      nextNodeId,
      waitForInput: false,
    };
  }
};

function mergeExamples(
  existing: unknown,
  variables: Record<string, unknown>
): Record<string, unknown> {
  const base =
    existing && typeof existing === "object"
      ? (existing as Record<string, unknown>)
      : {};

  const executionIds = Array.isArray(base.executionIds)
    ? (base.executionIds as string[])
    : [];

  const snapshot = {
    timestamp: new Date().toISOString(),
    variables: Object.keys(variables).slice(0, 10),
  };

  const snapshots = Array.isArray(base.snapshots)
    ? [...(base.snapshots as unknown[]).slice(-4), snapshot]
    : [snapshot];

  return { executionIds, snapshots };
}
