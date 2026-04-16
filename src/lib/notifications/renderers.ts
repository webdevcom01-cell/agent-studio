/**
 * Notification Renderers — Phase E2.2
 *
 * Four renderers: PlainText, Discord, Slack, Markdown.
 * Each transforms a NotificationInput into a RenderedMessage.
 */

import type { NotificationRenderer, NotificationInput, RenderedMessage } from "./types";

// ---------------------------------------------------------------------------
// Level helpers
// ---------------------------------------------------------------------------

const LEVEL_EMOJI: Record<string, string> = {
  info: "ℹ️",
  warning: "⚠️",
  error: "❌",
  success: "✅",
};

const DISCORD_COLORS: Record<string, number> = {
  info: 0x3498db,     // blue
  warning: 0xf39c12,  // orange
  error: 0xe74c3c,    // red
  success: 0x2ecc71,  // green
};

// ---------------------------------------------------------------------------
// PlainTextRenderer
// ---------------------------------------------------------------------------

export class PlainTextRenderer implements NotificationRenderer {
  readonly name = "plain";

  render(input: NotificationInput): RenderedMessage {
    const emoji = LEVEL_EMOJI[input.level] ?? "";
    const text = input.title
      ? `${emoji} ${input.title}: ${input.message}`
      : `${emoji} ${input.message}`;

    return {
      text,
      body: {
        text,
        title: input.title,
        message: input.message,
        level: input.level,
        agentId: input.agentId,
        timestamp: input.timestamp,
      },
      level: input.level,
    };
  }
}

// ---------------------------------------------------------------------------
// DiscordRenderer
// ---------------------------------------------------------------------------

export class DiscordRenderer implements NotificationRenderer {
  readonly name = "discord";

  render(input: NotificationInput): RenderedMessage {
    const emoji = LEVEL_EMOJI[input.level] ?? "";
    const text = input.title
      ? `${emoji} ${input.title}: ${input.message}`
      : `${emoji} ${input.message}`;

    const fields: Array<{ name: string; value: string; inline: boolean }> = [];
    if (input.agentId) {
      fields.push({ name: "Agent", value: input.agentId.slice(0, 12), inline: true });
    }
    if (input.level) {
      fields.push({ name: "Level", value: input.level.toUpperCase(), inline: true });
    }

    return {
      text,
      body: {
        embeds: [{
          title: input.title
            ? `${emoji} ${input.title}`
            : `${emoji} Notification`,
          description: input.message,
          color: DISCORD_COLORS[input.level] ?? 0x95a5a6,
          fields,
          timestamp: input.timestamp,
          footer: { text: `Agent: ${input.agentId.slice(0, 12)}` },
        }],
      },
      level: input.level,
    };
  }
}

// ---------------------------------------------------------------------------
// SlackRenderer
// ---------------------------------------------------------------------------

// Slack Block Kit hard limits
const SLACK_HEADER_MAX = 150;   // plain_text in header block
const SLACK_SECTION_MAX = 2900; // mrkdwn text in section block (limit is 3000, leave buffer)
const SLACK_TEXT_MAX = 3900;    // top-level "text" fallback field

function slackTruncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 3) + "…";
}

export class SlackRenderer implements NotificationRenderer {
  readonly name = "slack";

  render(input: NotificationInput): RenderedMessage {
    const emoji = LEVEL_EMOJI[input.level] ?? "";
    const rawTitle = input.title
      ? `${emoji} ${input.title}`
      : `${emoji} Notification`;
    const rawFallback = input.title
      ? `${emoji} ${input.title}: ${input.message}`
      : `${emoji} ${input.message}`;

    const text = slackTruncate(rawFallback, SLACK_TEXT_MAX);

    const blocks: Array<Record<string, unknown>> = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: slackTruncate(rawTitle, SLACK_HEADER_MAX),
          emoji: true,
        },
      },
    ];

    if (input.message) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          // Truncate to avoid Slack's 3000-char section limit.
          // Long fields like {{pipelineReport}} or {{testResult}} can easily exceed it.
          text: slackTruncate(input.message, SLACK_SECTION_MAX),
        },
      });
    }

    blocks.push({
      type: "context",
      elements: [
        { type: "mrkdwn", text: `*Agent:* \`${input.agentId.slice(0, 12)}\`` },
        { type: "mrkdwn", text: `*Level:* ${input.level}` },
        { type: "mrkdwn", text: `*Time:* ${input.timestamp}` },
      ],
    });

    return {
      text,
      body: { text, blocks },
      level: input.level,
    };
  }
}

// ---------------------------------------------------------------------------
// MarkdownRenderer
// ---------------------------------------------------------------------------

export class MarkdownRenderer implements NotificationRenderer {
  readonly name = "markdown";

  render(input: NotificationInput): RenderedMessage {
    const emoji = LEVEL_EMOJI[input.level] ?? "";
    const title = input.title
      ? `**${emoji} ${input.title}**`
      : `**${emoji} Notification**`;

    const text = input.message
      ? `${title}\n${input.message}`
      : title;

    return {
      text,
      body: {
        text,
        title: input.title,
        message: input.message,
        level: input.level,
        agentId: input.agentId,
        timestamp: input.timestamp,
      },
      level: input.level,
    };
  }
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const RENDERERS: Record<string, NotificationRenderer> = {
  plain: new PlainTextRenderer(),
  discord: new DiscordRenderer(),
  slack: new SlackRenderer(),
  markdown: new MarkdownRenderer(),
};

/**
 * Get a renderer by name. Falls back to PlainTextRenderer for unknown names.
 */
export function getRenderer(name: string): NotificationRenderer {
  return RENDERERS[name] ?? RENDERERS.plain;
}
