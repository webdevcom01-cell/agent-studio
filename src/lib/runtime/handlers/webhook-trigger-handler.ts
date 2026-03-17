import type { NodeHandler } from "../types";
import { logger } from "@/lib/logger";

/**
 * Webhook Trigger is a flow entry-point node.
 * It is activated when an external system posts to:
 *   POST /api/agents/[agentId]/trigger/[webhookId]
 *
 * At runtime, the execute pipeline (src/lib/webhooks/execute.ts) already injects
 * the following variables into the context before calling executeFlow:
 *   __webhook_payload     — parsed body (object) or { __raw: string } for non-JSON
 *   __webhook_event_type  — value of x-webhook-event header (if present)
 *   __webhook_id          — x-webhook-id header value (idempotency key)
 *
 * This handler simply reads those ambient variables, optionally maps them to
 * user-defined output variables, and passes through to the next node.
 * No side-effects — the heavy lifting is done by executeWebhookTrigger().
 */
export const webhookTriggerHandler: NodeHandler = async (node, context) => {
  const outputVariable = (node.data.outputVariable as string) || "webhook_payload";
  const eventTypeVariable = (node.data.eventTypeVariable as string) || "";

  try {
    const payload = context.variables.__webhook_payload ?? null;
    const eventType = (context.variables.__webhook_event_type as string) ?? null;
    const webhookId = (context.variables.__webhook_id as string) ?? null;

    const triggerInfo = {
      payload,
      eventType,
      webhookId,
      receivedAt: new Date().toISOString(),
    };

    logger.info("Webhook trigger node executed", {
      agentId: context.agentId,
      nodeId: node.id,
      eventType,
      webhookId,
    });

    const updatedVariables: Record<string, unknown> = {
      [outputVariable]: payload,
      __webhook_received_at: triggerInfo.receivedAt,
    };

    if (eventTypeVariable) {
      updatedVariables[eventTypeVariable] = eventType;
    }

    return {
      messages: [],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables,
    };
  } catch (error) {
    logger.error("Webhook trigger handler failed", error, {
      agentId: context.agentId,
      nodeId: node.id,
    });

    return {
      messages: [
        {
          role: "assistant",
          content: "Webhook trigger encountered an error, but continuing flow.",
        },
      ],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: {
        [outputVariable]: null,
      },
    };
  }
};
