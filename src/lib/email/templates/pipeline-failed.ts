import { sendEmail } from "../client";

export async function sendPipelineFailedEmail(
  to: string,
  agentName: string,
  errorMessage: string,
  agentId: string,
): Promise<boolean> {
  return sendEmail({
    to,
    subject: `Pipeline failed: ${agentName}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="color: #dc2626; font-size: 24px; margin-bottom: 16px;">Pipeline Execution Failed</h1>
        <p style="color: #444; font-size: 16px; line-height: 1.6;">
          Your agent <strong>${escapeHtml(agentName)}</strong> encountered an error:
        </p>
        <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 16px 0;">
          <code style="color: #dc2626; font-size: 14px; word-break: break-all;">${escapeHtml(errorMessage.slice(0, 500))}</code>
        </div>
        <p style="color: #444; font-size: 16px; line-height: 1.6;">
          Check the flow editor for details and retry the execution.
        </p>
        <p style="color: #888; font-size: 14px; margin-top: 32px;">
          Agent ID: ${escapeHtml(agentId)}
        </p>
      </div>
    `,
    text: `Pipeline failed for ${agentName}: ${errorMessage.slice(0, 200)}`,
  });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
