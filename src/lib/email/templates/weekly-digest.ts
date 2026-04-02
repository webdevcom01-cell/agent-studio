import { sendEmail } from "../client";

interface DigestStats {
  totalConversations: number;
  totalMessages: number;
  totalAgents: number;
  topAgent: string;
  evalPassRate: number;
}

export async function sendWeeklyDigestEmail(
  to: string,
  userName: string,
  stats: DigestStats,
): Promise<boolean> {
  return sendEmail({
    to,
    subject: "Your weekly Agent Studio digest",
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="color: #111; font-size: 24px; margin-bottom: 16px;">Weekly Digest</h1>
        <p style="color: #444; font-size: 16px; line-height: 1.6;">
          Hi ${escapeHtml(userName)}, here's your activity this week:
        </p>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr>
            <td style="padding: 12px; border-bottom: 1px solid #eee; color: #666;">Conversations</td>
            <td style="padding: 12px; border-bottom: 1px solid #eee; font-weight: bold; text-align: right;">${stats.totalConversations}</td>
          </tr>
          <tr>
            <td style="padding: 12px; border-bottom: 1px solid #eee; color: #666;">Messages</td>
            <td style="padding: 12px; border-bottom: 1px solid #eee; font-weight: bold; text-align: right;">${stats.totalMessages}</td>
          </tr>
          <tr>
            <td style="padding: 12px; border-bottom: 1px solid #eee; color: #666;">Active Agents</td>
            <td style="padding: 12px; border-bottom: 1px solid #eee; font-weight: bold; text-align: right;">${stats.totalAgents}</td>
          </tr>
          <tr>
            <td style="padding: 12px; border-bottom: 1px solid #eee; color: #666;">Top Agent</td>
            <td style="padding: 12px; border-bottom: 1px solid #eee; font-weight: bold; text-align: right;">${escapeHtml(stats.topAgent)}</td>
          </tr>
          <tr>
            <td style="padding: 12px; color: #666;">Eval Pass Rate</td>
            <td style="padding: 12px; font-weight: bold; text-align: right;">${stats.evalPassRate}%</td>
          </tr>
        </table>
        <p style="color: #888; font-size: 14px; margin-top: 32px;">
          — The Agent Studio Team
        </p>
      </div>
    `,
    text: `Weekly digest for ${userName}: ${stats.totalConversations} conversations, ${stats.totalMessages} messages, ${stats.totalAgents} agents.`,
  });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
