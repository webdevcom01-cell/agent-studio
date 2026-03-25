import type { NodeHandler } from "../types";
import { resolveTemplate } from "../template";
import { logger } from "@/lib/logger";

/**
 * Notification node — sends notifications via configured channels.
 * Supports multiple channels: webhook (Slack/Discord/Teams), in-app, and log.
 * Template resolution in title and message fields.
 */
export const notificationHandler: NodeHandler = async (node, context) => {
  const channel = (node.data.channel as string) ?? "log"; // webhook | in_app | log
  const titleTemplate = (node.data.title as string) ?? "";
  const messageTemplate = (node.data.message as string) ?? "";
  const level = (node.data.level as string) ?? "info"; // info | warning | error | success
  const webhookUrl = (node.data.webhookUrl as string) ?? "";
  const outputVariable = (node.data.outputVariable as string) ?? "notification_result";

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

  const notificationContent = title ? `${title}: ${message}` : message;

  try {
    if (channel === "log") {
      // Simple log-based notification
      const logFn = level === "error" ? logger.error : logger.info;
      if (level === "error") {
        logFn(`[Notification] ${notificationContent}`, undefined, {
          agentId: context.agentId,
          level,
        });
      } else {
        logFn(`[Notification] ${notificationContent}`, {
          agentId: context.agentId,
          level,
        });
      }

      return {
        messages: [],
        nextNodeId: null,
        waitForInput: false,
        updatedVariables: {
          [outputVariable]: {
            success: true,
            channel: "log",
            title,
            message,
            level,
            sentAt: new Date().toISOString(),
          },
        },
      };
    }

    if (channel === "in_app") {
      // In-app notification — store as a message for the chat UI
      return {
        messages: [
          {
            role: "assistant",
            content: `📋 **${title || "Notification"}**${message ? `\n${message}` : ""}`,
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
            sentAt: new Date().toISOString(),
          },
        },
      };
    }

    if (channel === "webhook") {
      if (!webhookUrl.trim()) {
        return {
          messages: [
            {
              role: "assistant",
              content: "Notification failed: no webhook URL configured.",
            },
          ],
          nextNodeId: null,
          waitForInput: false,
          updatedVariables: {
            [outputVariable]: { success: false, error: "No webhook URL" },
          },
        };
      }

      const resolvedUrl = resolveTemplate(webhookUrl, context.variables);

      // Format for common webhook platforms (Slack/Discord/Teams compatible)
      const payload = {
        text: notificationContent,
        title,
        message,
        level,
        agentId: context.agentId,
        timestamp: new Date().toISOString(),
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(resolvedUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        logger.warn("Notification webhook returned error", {
          agentId: context.agentId,
          status: response.status,
        });

        return {
          messages: [],
          nextNodeId: null,
          waitForInput: false,
          updatedVariables: {
            [outputVariable]: {
              success: false,
              channel: "webhook",
              status: response.status,
            },
          },
        };
      }

      logger.info("Notification sent via webhook", {
        agentId: context.agentId,
      });

      return {
        messages: [],
        nextNodeId: null,
        waitForInput: false,
        updatedVariables: {
          [outputVariable]: {
            success: true,
            channel: "webhook",
            title,
            level,
            sentAt: new Date().toISOString(),
          },
        },
      };
    }

    // Unknown channel
    return {
      messages: [
        {
          role: "assistant",
          content: `Notification failed: unknown channel "${channel}".`,
        },
      ],
      nextNodeId: null,
      waitForInput: false,
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
