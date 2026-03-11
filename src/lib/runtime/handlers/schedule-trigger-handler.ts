import type { NodeHandler } from "../types";
import { logger } from "@/lib/logger";

/**
 * Schedule Trigger is a flow entry-point node.
 * It defines when a flow should be triggered (cron schedule, interval, or manual).
 * At runtime, it simply passes through — the actual scheduling is handled
 * by the orchestration layer. This handler sets context variables
 * about the trigger event and routes to the next node.
 */
export const scheduleTriggerHandler: NodeHandler = async (node, context) => {
  const scheduleType = (node.data.scheduleType as string) ?? "manual"; // cron | interval | manual
  const cronExpression = (node.data.cronExpression as string) ?? "";
  const intervalMinutes = Math.max(1, Number(node.data.intervalMinutes) || 60);
  const timezone = (node.data.timezone as string) ?? "UTC";
  const outputVariable = (node.data.outputVariable as string) ?? "trigger_info";

  try {
    const now = new Date();

    const triggerInfo = {
      type: scheduleType,
      triggeredAt: now.toISOString(),
      timezone,
      ...(scheduleType === "cron" && { cronExpression }),
      ...(scheduleType === "interval" && { intervalMinutes }),
    };

    logger.info("Schedule trigger fired", {
      agentId: context.agentId,
      scheduleType,
    });

    return {
      messages: [],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: {
        [outputVariable]: triggerInfo,
        __trigger_type: scheduleType,
        __trigger_time: now.toISOString(),
      },
    };
  } catch (error) {
    logger.error("Schedule trigger failed", error, {
      agentId: context.agentId,
    });

    return {
      messages: [
        {
          role: "assistant",
          content: "Schedule trigger encountered an error, but continuing flow.",
        },
      ],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: {
        [outputVariable]: null,
        __trigger_type: "error",
      },
    };
  }
};
