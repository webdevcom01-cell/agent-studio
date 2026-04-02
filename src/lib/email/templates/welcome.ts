import { sendEmail } from "../client";

export async function sendWelcomeEmail(
  to: string,
  userName: string,
): Promise<boolean> {
  return sendEmail({
    to,
    subject: "Welcome to Agent Studio",
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="color: #111; font-size: 24px; margin-bottom: 16px;">Welcome to Agent Studio</h1>
        <p style="color: #444; font-size: 16px; line-height: 1.6;">
          Hi ${escapeHtml(userName)},
        </p>
        <p style="color: #444; font-size: 16px; line-height: 1.6;">
          Your account is ready. You can now build AI agents with our visual flow editor,
          connect knowledge bases, and deploy pipelines.
        </p>
        <p style="color: #444; font-size: 16px; line-height: 1.6;">
          <strong>Quick start:</strong>
        </p>
        <ol style="color: #444; font-size: 16px; line-height: 1.8;">
          <li>Create your first agent from the dashboard</li>
          <li>Add nodes in the flow editor</li>
          <li>Chat with your agent to test it</li>
        </ol>
        <p style="color: #888; font-size: 14px; margin-top: 32px;">
          — The Agent Studio Team
        </p>
      </div>
    `,
    text: `Welcome to Agent Studio, ${userName}! Your account is ready. Create your first agent from the dashboard.`,
  });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
