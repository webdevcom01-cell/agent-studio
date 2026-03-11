import type { NodeHandler } from "../types";
import { resolveTemplate } from "../template";
import { logger } from "@/lib/logger";

/**
 * Email Send node — sends emails via configured SMTP or API provider.
 * Supports template resolution in all fields (to, subject, body).
 * Provider-agnostic: uses a webhook-style approach where the actual
 * sending is delegated to an external service endpoint.
 */
export const emailSendHandler: NodeHandler = async (node, context) => {
  const toTemplate = (node.data.to as string) ?? "";
  const subjectTemplate = (node.data.subject as string) ?? "";
  const bodyTemplate = (node.data.body as string) ?? "";
  const fromName = (node.data.fromName as string) ?? "Agent Studio";
  const replyTo = (node.data.replyTo as string) ?? "";
  const webhookUrl = (node.data.webhookUrl as string) ?? "";
  const outputVariable = (node.data.outputVariable as string) ?? "email_result";
  const isHtml = (node.data.isHtml as boolean) ?? false;

  // Resolve templates
  const to = toTemplate.trim()
    ? resolveTemplate(toTemplate, context.variables)
    : "";
  const subject = subjectTemplate.trim()
    ? resolveTemplate(subjectTemplate, context.variables)
    : "";
  const body = bodyTemplate.trim()
    ? resolveTemplate(bodyTemplate, context.variables)
    : "";

  // Validate required fields
  if (!to) {
    return {
      messages: [
        {
          role: "assistant",
          content: "Email send failed: no recipient specified.",
        },
      ],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: {
        [outputVariable]: { success: false, error: "No recipient" },
      },
    };
  }

  if (!subject && !body) {
    return {
      messages: [
        {
          role: "assistant",
          content: "Email send failed: both subject and body are empty.",
        },
      ],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: {
        [outputVariable]: { success: false, error: "Empty content" },
      },
    };
  }

  // Basic email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const recipients = to.split(",").map((e) => e.trim()).filter(Boolean);
  const invalidEmails = recipients.filter((e) => !emailRegex.test(e));

  if (invalidEmails.length > 0) {
    return {
      messages: [
        {
          role: "assistant",
          content: `Email send failed: invalid email address(es): ${invalidEmails.join(", ")}`,
        },
      ],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: {
        [outputVariable]: { success: false, error: "Invalid email format" },
      },
    };
  }

  if (!webhookUrl.trim()) {
    // No webhook configured — log the email intent but don't actually send
    logger.info("Email send (no webhook configured — dry run)", {
      agentId: context.agentId,
    });

    return {
      messages: [],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: {
        [outputVariable]: {
          success: true,
          dryRun: true,
          to: recipients,
          subject,
          sentAt: new Date().toISOString(),
        },
        __last_email: {
          success: true,
          dryRun: true,
          recipientCount: recipients.length,
        },
      },
    };
  }

  try {
    const resolvedWebhookUrl = resolveTemplate(webhookUrl, context.variables);
    const resolvedReplyTo = replyTo.trim()
      ? resolveTemplate(replyTo, context.variables)
      : undefined;

    const payload = {
      to: recipients,
      subject,
      body,
      isHtml,
      fromName,
      replyTo: resolvedReplyTo,
      agentId: context.agentId,
      conversationId: context.conversationId,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(resolvedWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      logger.warn("Email webhook returned error", {
        agentId: context.agentId,
        status: response.status,
      });

      return {
        messages: [
          {
            role: "assistant",
            content: "Email sending encountered an issue, but I'll continue.",
          },
        ],
        nextNodeId: null,
        waitForInput: false,
        updatedVariables: {
          [outputVariable]: {
            success: false,
            status: response.status,
            error: errorText.slice(0, 200),
          },
          __last_email: { success: false, status: response.status },
        },
      };
    }

    logger.info("Email sent successfully via webhook", {
      agentId: context.agentId,
    });

    return {
      messages: [],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: {
        [outputVariable]: {
          success: true,
          to: recipients,
          subject,
          sentAt: new Date().toISOString(),
        },
        __last_email: {
          success: true,
          recipientCount: recipients.length,
        },
      },
    };
  } catch (error) {
    logger.error("Email send failed", error, {
      agentId: context.agentId,
    });

    return {
      messages: [
        {
          role: "assistant",
          content: "I had trouble sending the email, but I'll continue.",
        },
      ],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: {
        [outputVariable]: { success: false, error: "Send failed" },
        __last_email: { success: false },
      },
    };
  }
};
