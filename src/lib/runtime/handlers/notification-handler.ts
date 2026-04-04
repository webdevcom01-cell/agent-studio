import type { NodeHandler } from "../types";
import { resolveTemplate } from "../template";
import { logger } from "@/lib/logger";
import { getRenderer, getSink } from "@/lib/notifications";
import type { NotificationInput, SinkConfig } from "@/lib/notifications";

/**
 * Notification node — sends notifications via configured channels.
 * Supports renderer/sink pattern (Phase E2):
 *   - Renderers: plain, discord, slack, markdown
 *   - Sinks: webhook, in_app, log
 *
 * Template resolution in title and message fields.
 */
export const notificationHandler: NodeHandler = async (node, context) => {
  const channel = (node.data.channel as string) ?? "log"; // webhook | in_app | log
  const titleTemplate = (node.data.title as string) ?? "";
  const messageTemplate = (node.data.message as string) ?? "";
  const level = (node.data.level as string) ?? "info"; // info | warning | error | success
  const webhookUrl = (node.data.webhookUrl as string) ?? "";
  const outputVariable = (node.data.outputVariable as string) ?? "notification_result";
  const rendererName = (node.data.renderer as string) ?? "plain";

  // Resolve templates
  const title = titleTemplate.trim()
    ? resolveTemplate(titleTemplate, context.variables)
    : "";
  const message = messageTemplate.trim()
    ? resolveTemplate(messageTemplate, context.variables)
    : "";

  if (!title && !message) {
    return {
      messages: [
        {
          role: "assistant",
          content: "Notification skipped: no title or message specified.",
        },
      ],
      nextNodeId: null,
      waitForInput: false,
    };
  }

  try {
    // Build notification input
    const input: NotificationInput = {
      title,
      message,
      level: (["info", "warning", "error", "success"].includes(level)
        ? level
        : "info") as NotificationInput["level"],
      agentId: context.agentId,
      timestamp: new Date().toISOString(),
    };

    // Render with selected renderer
    const renderer = getRenderer(rendererName);
    const rendered = renderer.render(input);

    // Resolve webhook URL (same priority as before: variable > config > env)
    const webhookUrlVariable = (node.data.webhookUrlVariable as string) ?? "";
    const runtimeUrl = webhookUrlVariable
      ? String(context.variables[webhookUrlVariable] ?? "")
      : "";
    const configUrl = webhookUrl.trim()
      ? resolveTemplate(webhookUrl, context.variables)
      : "";
    const envUrl = process.env.NOTIFICATION_WEBHOOK_URL ?? "";
    const resolvedUrl = runtimeUrl || configUrl || envUrl;

    // Build sink config
    const sinkConfig: SinkConfig = {
      webhookUrl: resolvedUrl || undefined,
      agentId: context.agentId,
      timeoutMs: 15000,
    };

    // Check webhook URL requirement
    if (channel === "webhook" && !resolvedUrl) {
      return {
        messages: [
          {
            role: "assistant",
            content: "Notification failed: no webhook URL configured. Set webhookUrlVariable, webhookUrl, or NOTIFICATION_WEBHOOK_URL env var.",
          },
        ],
        nextNodeId: null,
        waitForInput: false,
        updatedVariables: {
          [outputVariable]: { success: false, error: "No webhook URL" },
        },
      };
    }

    if (channel === "webhook") {
      logger.info("Notification webhook URL resolved", {
        agentId: context.agentId,
        source: runtimeUrl ? "runtime_variable" : configUrl ? "node_config" : "env_fallback",
      });
    }

    // Deliver via sink
    const sink = getSink(channel);
    const result = await sink.deliver(rendered, sinkConfig);

    // For in_app, include the rendered text as an assistant message
    if (channel === "in_app") {
      return {
        messages: [
          {
            role: "assistant",
            content: rendered.text,
          },
        ],
        nextNodeId: null,
        waitForInput: false,
        updatedVariables: {
          [outputVariable]: {
            success: true,
            channel: "in_app",
            title,
            message,
            level,
            renderer: rendererName,
            sentAt: input.timestamp,
          },
        },
      };
    }

    // For log and webhook — no visible message to the user
    return {
      messages: result.success
        ? []
        : [{ role: "assistant", content: `Notification delivery issue: ${result.error ?? "unknown"}` }],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: {
        [outputVariable]: {
          success: result.success,
          channel: result.channel,
          title,
          level,
          renderer: rendererName,
          sentAt: input.timestamp,
          ...(result.status != null ? { status: result.status } : {}),
          ...(result.error ? { error: result.error } : {}),
        },
      },
    };
  } catch (error) {
    logger.error("Notification failed", error, {
      agentId: context.agentId,
    });

    return {
      messages: [
        {
          role: "assistant",
          content: "Notification could not be sent, but I'll continue.",
        },
      ],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: {
        [outputVariable]: { success: false, error: "Send failed" },
      },
    };
  }
};
