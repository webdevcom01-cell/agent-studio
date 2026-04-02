/**
 * Resend Email Client — singleton for transactional emails.
 *
 * All send functions are fire-and-forget safe — they catch errors
 * internally and log warnings instead of throwing.
 *
 * Required env: RESEND_API_KEY
 * Optional env: RESEND_FROM_EMAIL (default: "Agent Studio <noreply@agent-studio.app>")
 */

import { logger } from "@/lib/logger";

const DEFAULT_FROM = "Agent Studio <noreply@agent-studio.app>";

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

async function getClient(): Promise<InstanceType<typeof import("resend").Resend> | null> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    logger.warn("RESEND_API_KEY not configured — email will not be sent");
    return null;
  }

  const { Resend } = await import("resend");
  return new Resend(apiKey);
}

export async function sendEmail(options: SendEmailOptions): Promise<boolean> {
  const client = await getClient();
  if (!client) return false;

  const from = process.env.RESEND_FROM_EMAIL || DEFAULT_FROM;

  try {
    const { error } = await client.emails.send({
      from,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });

    if (error) {
      logger.warn("Email send failed", {
        to: options.to,
        subject: options.subject,
        error: error.message,
      });
      return false;
    }

    logger.info("Email sent", {
      to: options.to,
      subject: options.subject,
    });
    return true;
  } catch (err) {
    logger.warn("Email send error", {
      to: options.to,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}
