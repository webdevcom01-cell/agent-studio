/**
 * Google Workspace MCP Tools
 *
 * Implements 10 tools across Calendar and Gmail that are exposed via the
 * internal MCP proxy at /api/mcp/proxy/google-workspace/[tokenId].
 *
 * Tool naming: <service>_<verb>_<resource>
 */

// ---------------------------------------------------------------------------
// MCP Tool schema types (minimal subset of the MCP spec)
// ---------------------------------------------------------------------------

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required?: string[];
  };
}

// ---------------------------------------------------------------------------
// Tool definitions (exposed to the AI via tools/list)
// ---------------------------------------------------------------------------

export const GOOGLE_WORKSPACE_TOOLS: MCPToolDefinition[] = [
  // ── Google Calendar ────────────────────────────────────────────────────────
  {
    name: "calendar_list_events",
    description:
      "List upcoming Google Calendar events. Optionally filter by time range or search query.",
    inputSchema: {
      type: "object",
      properties: {
        maxResults: {
          type: "number",
          description: "Maximum number of events to return (default 10, max 50)",
        },
        timeMin: {
          type: "string",
          description:
            "Start of the time range as ISO 8601 string (default: now). E.g. '2024-01-15T00:00:00Z'",
        },
        timeMax: {
          type: "string",
          description: "End of the time range as ISO 8601 string. E.g. '2024-01-31T23:59:59Z'",
        },
        query: {
          type: "string",
          description: "Free-text search query to filter events by title or description",
        },
        calendarId: {
          type: "string",
          description: "Calendar ID (default: 'primary'). Use 'primary' for the main calendar.",
        },
      },
    },
  },
  {
    name: "calendar_get_event",
    description: "Get full details of a specific Google Calendar event by its ID.",
    inputSchema: {
      type: "object",
      properties: {
        eventId: {
          type: "string",
          description: "The unique event ID (obtained from calendar_list_events)",
        },
        calendarId: {
          type: "string",
          description: "Calendar ID (default: 'primary')",
        },
      },
      required: ["eventId"],
    },
  },
  {
    name: "calendar_create_event",
    description: "Create a new Google Calendar event.",
    inputSchema: {
      type: "object",
      properties: {
        summary: { type: "string", description: "Event title" },
        description: { type: "string", description: "Event description (optional)" },
        location: { type: "string", description: "Location string (optional)" },
        startDateTime: {
          type: "string",
          description: "Start date/time as ISO 8601. E.g. '2024-01-20T14:00:00+01:00'",
        },
        endDateTime: {
          type: "string",
          description: "End date/time as ISO 8601. E.g. '2024-01-20T15:00:00+01:00'",
        },
        attendees: {
          type: "string",
          description: "Comma-separated list of attendee email addresses (optional)",
        },
        calendarId: {
          type: "string",
          description: "Calendar ID (default: 'primary')",
        },
      },
      required: ["summary", "startDateTime", "endDateTime"],
    },
  },
  {
    name: "calendar_update_event",
    description: "Update an existing Google Calendar event.",
    inputSchema: {
      type: "object",
      properties: {
        eventId: { type: "string", description: "The event ID to update" },
        summary: { type: "string", description: "New event title (optional)" },
        description: { type: "string", description: "New description (optional)" },
        location: { type: "string", description: "New location (optional)" },
        startDateTime: { type: "string", description: "New start date/time as ISO 8601 (optional)" },
        endDateTime: { type: "string", description: "New end date/time as ISO 8601 (optional)" },
        calendarId: { type: "string", description: "Calendar ID (default: 'primary')" },
      },
      required: ["eventId"],
    },
  },
  {
    name: "calendar_delete_event",
    description: "Delete a Google Calendar event.",
    inputSchema: {
      type: "object",
      properties: {
        eventId: { type: "string", description: "The event ID to delete" },
        calendarId: { type: "string", description: "Calendar ID (default: 'primary')" },
      },
      required: ["eventId"],
    },
  },
  {
    name: "calendar_list_calendars",
    description: "List all Google Calendars the user has access to.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },

  // ── Gmail ──────────────────────────────────────────────────────────────────
  {
    name: "gmail_list_messages",
    description:
      "List recent Gmail messages. Supports full Gmail search syntax (from:, to:, subject:, is:unread, etc.).",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Gmail search query. E.g. 'from:boss@company.com is:unread' or 'subject:invoice'",
        },
        maxResults: {
          type: "number",
          description: "Maximum number of messages to return (default 10, max 50)",
        },
        labelIds: {
          type: "string",
          description: "Comma-separated label IDs to filter (e.g. 'INBOX,UNREAD')",
        },
      },
    },
  },
  {
    name: "gmail_get_message",
    description: "Read the full content of a Gmail message by its ID.",
    inputSchema: {
      type: "object",
      properties: {
        messageId: {
          type: "string",
          description: "The message ID (obtained from gmail_list_messages)",
        },
      },
      required: ["messageId"],
    },
  },
  {
    name: "gmail_send_message",
    description: "Send an email via Gmail.",
    inputSchema: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient email address" },
        subject: { type: "string", description: "Email subject" },
        body: {
          type: "string",
          description: "Email body (plain text)",
        },
        cc: { type: "string", description: "CC email address (optional)" },
        replyToMessageId: {
          type: "string",
          description:
            "If replying, provide the original message ID to thread the reply (optional)",
        },
      },
      required: ["to", "subject", "body"],
    },
  },
  {
    name: "gmail_create_draft",
    description: "Create a Gmail draft (does not send).",
    inputSchema: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient email address" },
        subject: { type: "string", description: "Email subject" },
        body: { type: "string", description: "Email body (plain text)" },
        cc: { type: "string", description: "CC email address (optional)" },
      },
      required: ["to", "subject", "body"],
    },
  },
];

// ---------------------------------------------------------------------------
// Tool dispatcher
// ---------------------------------------------------------------------------

/**
 * Dispatch a tools/call request to the appropriate Google API handler.
 * Returns a plain text/JSON string suitable for wrapping in an MCP content block.
 */
export async function callGoogleTool(
  name: string,
  args: Record<string, unknown>,
  accessToken: string,
): Promise<string> {
  switch (name) {
    case "calendar_list_events":
      return calendarListEvents(args, accessToken);
    case "calendar_get_event":
      return calendarGetEvent(args, accessToken);
    case "calendar_create_event":
      return calendarCreateEvent(args, accessToken);
    case "calendar_update_event":
      return calendarUpdateEvent(args, accessToken);
    case "calendar_delete_event":
      return calendarDeleteEvent(args, accessToken);
    case "calendar_list_calendars":
      return calendarListCalendars(accessToken);
    case "gmail_list_messages":
      return gmailListMessages(args, accessToken);
    case "gmail_get_message":
      return gmailGetMessage(args, accessToken);
    case "gmail_send_message":
      return gmailSendMessage(args, accessToken);
    case "gmail_create_draft":
      return gmailCreateDraft(args, accessToken);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ---------------------------------------------------------------------------
// Google API helpers
// ---------------------------------------------------------------------------

async function googleFetch(
  url: string,
  accessToken: string,
  options?: RequestInit,
): Promise<unknown> {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...((options?.headers as Record<string, string>) ?? {}),
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google API error ${res.status}: ${body}`);
  }

  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return null;
  }

  return res.json();
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function num(v: unknown, def: number): number {
  return typeof v === "number" ? Math.min(v, 50) : def;
}

// ---------------------------------------------------------------------------
// Calendar implementations
// ---------------------------------------------------------------------------

async function calendarListEvents(
  args: Record<string, unknown>,
  token: string,
): Promise<string> {
  const calendarId = encodeURIComponent(str(args.calendarId) || "primary");
  const params = new URLSearchParams({
    maxResults: String(num(args.maxResults, 10)),
    singleEvents: "true",
    orderBy: "startTime",
    timeMin: str(args.timeMin) || new Date().toISOString(),
  });
  if (args.timeMax) params.set("timeMax", str(args.timeMax));
  if (args.query) params.set("q", str(args.query));

  const url = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?${params}`;
  const data = (await googleFetch(url, token)) as { items?: GoogleCalendarEvent[] };

  const events = data.items ?? [];
  if (events.length === 0) return "No events found.";

  return events
    .map((e) => formatCalendarEvent(e))
    .join("\n---\n");
}

async function calendarGetEvent(
  args: Record<string, unknown>,
  token: string,
): Promise<string> {
  const calendarId = encodeURIComponent(str(args.calendarId) || "primary");
  const eventId = encodeURIComponent(str(args.eventId));
  const url = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${eventId}`;
  const event = (await googleFetch(url, token)) as GoogleCalendarEvent;
  return formatCalendarEvent(event);
}

async function calendarCreateEvent(
  args: Record<string, unknown>,
  token: string,
): Promise<string> {
  const calendarId = encodeURIComponent(str(args.calendarId) || "primary");
  const url = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`;

  const body: Record<string, unknown> = {
    summary: str(args.summary),
    start: { dateTime: str(args.startDateTime) },
    end: { dateTime: str(args.endDateTime) },
  };
  if (args.description) body.description = str(args.description);
  if (args.location) body.location = str(args.location);
  if (args.attendees) {
    body.attendees = str(args.attendees)
      .split(",")
      .map((e) => ({ email: e.trim() }));
  }

  const event = (await googleFetch(url, token, {
    method: "POST",
    body: JSON.stringify(body),
  })) as GoogleCalendarEvent;

  return `Event created successfully.\n${formatCalendarEvent(event)}`;
}

async function calendarUpdateEvent(
  args: Record<string, unknown>,
  token: string,
): Promise<string> {
  const calendarId = encodeURIComponent(str(args.calendarId) || "primary");
  const eventId = encodeURIComponent(str(args.eventId));
  const url = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${eventId}`;

  const patch: Record<string, unknown> = {};
  if (args.summary) patch.summary = str(args.summary);
  if (args.description) patch.description = str(args.description);
  if (args.location) patch.location = str(args.location);
  if (args.startDateTime) patch.start = { dateTime: str(args.startDateTime) };
  if (args.endDateTime) patch.end = { dateTime: str(args.endDateTime) };

  const event = (await googleFetch(url, token, {
    method: "PATCH",
    body: JSON.stringify(patch),
  })) as GoogleCalendarEvent;

  return `Event updated successfully.\n${formatCalendarEvent(event)}`;
}

async function calendarDeleteEvent(
  args: Record<string, unknown>,
  token: string,
): Promise<string> {
  const calendarId = encodeURIComponent(str(args.calendarId) || "primary");
  const eventId = encodeURIComponent(str(args.eventId));
  const url = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${eventId}`;

  await googleFetch(url, token, { method: "DELETE" });
  return `Event ${str(args.eventId)} deleted successfully.`;
}

async function calendarListCalendars(token: string): Promise<string> {
  const url = "https://www.googleapis.com/calendar/v3/users/me/calendarList";
  const data = (await googleFetch(url, token)) as {
    items?: Array<{ id: string; summary: string; primary?: boolean; accessRole: string }>;
  };

  const items = data.items ?? [];
  if (items.length === 0) return "No calendars found.";

  return items
    .map((c) => `• ${c.summary}${c.primary ? " (primary)" : ""} [id: ${c.id}] (${c.accessRole})`)
    .join("\n");
}

// ---------------------------------------------------------------------------
// Gmail implementations
// ---------------------------------------------------------------------------

async function gmailListMessages(
  args: Record<string, unknown>,
  token: string,
): Promise<string> {
  const params = new URLSearchParams({
    maxResults: String(num(args.maxResults, 10)),
    format: "metadata",
  });
  if (args.query) params.set("q", str(args.query));
  if (args.labelIds) {
    for (const label of str(args.labelIds).split(",")) {
      params.append("labelIds", label.trim());
    }
  }

  const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`;
  const listData = (await googleFetch(listUrl, token)) as {
    messages?: Array<{ id: string; threadId: string }>;
  };

  const messages = listData.messages ?? [];
  if (messages.length === 0) return "No messages found.";

  // Fetch metadata for each message in parallel
  const details = await Promise.allSettled(
    messages.map(async ({ id }) => {
      const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Date`;
      return googleFetch(url, token) as Promise<GmailMessage>;
    }),
  );

  const lines: string[] = [];
  for (const result of details) {
    if (result.status === "fulfilled") {
      lines.push(formatGmailSummary(result.value));
    }
  }

  return lines.join("\n---\n");
}

async function gmailGetMessage(
  args: Record<string, unknown>,
  token: string,
): Promise<string> {
  const messageId = str(args.messageId);
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`;
  const message = (await googleFetch(url, token)) as GmailMessage;
  return formatGmailFull(message);
}

async function gmailSendMessage(
  args: Record<string, unknown>,
  token: string,
): Promise<string> {
  const mime = buildMimeMessage({
    to: str(args.to),
    subject: str(args.subject),
    body: str(args.body),
    cc: str(args.cc),
  });

  const url = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
  const result = (await googleFetch(url, token, {
    method: "POST",
    body: JSON.stringify({ raw: base64UrlEncode(mime) }),
  })) as { id: string; threadId: string };

  return `Email sent successfully. Message ID: ${result.id}`;
}

async function gmailCreateDraft(
  args: Record<string, unknown>,
  token: string,
): Promise<string> {
  const mime = buildMimeMessage({
    to: str(args.to),
    subject: str(args.subject),
    body: str(args.body),
    cc: str(args.cc),
  });

  const url = "https://gmail.googleapis.com/gmail/v1/users/me/drafts";
  const result = (await googleFetch(url, token, {
    method: "POST",
    body: JSON.stringify({ message: { raw: base64UrlEncode(mime) } }),
  })) as { id: string };

  return `Draft created successfully. Draft ID: ${result.id}`;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

interface GoogleCalendarEvent {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  status?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: Array<{ email: string; responseStatus?: string }>;
  htmlLink?: string;
}

function formatCalendarEvent(e: GoogleCalendarEvent): string {
  const start = e.start?.dateTime ?? e.start?.date ?? "unknown";
  const end = e.end?.dateTime ?? e.end?.date ?? "unknown";
  const parts = [
    `ID: ${e.id}`,
    `Title: ${e.summary ?? "(no title)"}`,
    `Start: ${start}`,
    `End: ${end}`,
  ];
  if (e.location) parts.push(`Location: ${e.location}`);
  if (e.description) parts.push(`Description: ${e.description}`);
  if (e.attendees?.length) {
    parts.push(`Attendees: ${e.attendees.map((a) => a.email).join(", ")}`);
  }
  if (e.htmlLink) parts.push(`Link: ${e.htmlLink}`);
  return parts.join("\n");
}

interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  payload?: {
    headers?: Array<{ name: string; value: string }>;
    body?: { data?: string; size?: number };
    parts?: GmailPart[];
    mimeType?: string;
  };
}

interface GmailPart {
  mimeType: string;
  body?: { data?: string };
  parts?: GmailPart[];
}

function getHeader(message: GmailMessage, name: string): string {
  return (
    message.payload?.headers?.find(
      (h) => h.name.toLowerCase() === name.toLowerCase(),
    )?.value ?? ""
  );
}

function formatGmailSummary(m: GmailMessage): string {
  const from = getHeader(m, "From");
  const subject = getHeader(m, "Subject");
  const date = getHeader(m, "Date");
  return [
    `ID: ${m.id}`,
    `From: ${from}`,
    `Subject: ${subject}`,
    `Date: ${date}`,
    m.snippet ? `Snippet: ${m.snippet}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function formatGmailFull(m: GmailMessage): string {
  const from = getHeader(m, "From");
  const to = getHeader(m, "To");
  const subject = getHeader(m, "Subject");
  const date = getHeader(m, "Date");

  const body = extractGmailBody(m);

  return [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `Date: ${date}`,
    "",
    body || "(no body)",
  ].join("\n");
}

/** Recursively find and decode the best text body from a Gmail message */
function extractGmailBody(m: GmailMessage): string {
  const payload = m.payload;
  if (!payload) return "";

  // Try direct body first
  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  // Recurse into parts
  if (payload.parts) {
    const plain = findPartByMimeType(payload.parts, "text/plain");
    if (plain?.body?.data) return decodeBase64Url(plain.body.data);

    const html = findPartByMimeType(payload.parts, "text/html");
    if (html?.body?.data) return stripHtml(decodeBase64Url(html.body.data));
  }

  return m.snippet ?? "";
}

function findPartByMimeType(
  parts: GmailPart[],
  mimeType: string,
): GmailPart | undefined {
  for (const part of parts) {
    if (part.mimeType === mimeType) return part;
    if (part.parts) {
      const found = findPartByMimeType(part.parts, mimeType);
      if (found) return found;
    }
  }
  return undefined;
}

function decodeBase64Url(encoded: string): string {
  // Convert URL-safe base64 to standard base64
  const standard = encoded.replace(/-/g, "+").replace(/_/g, "/");
  try {
    return Buffer.from(standard, "base64").toString("utf-8");
  } catch {
    return encoded;
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// MIME / base64 helpers for Gmail send/draft
// ---------------------------------------------------------------------------

interface MimeOptions {
  to: string;
  subject: string;
  body: string;
  cc?: string;
}

function buildMimeMessage(opts: MimeOptions): string {
  const lines: string[] = [
    `To: ${opts.to}`,
    `Subject: ${encodeSubject(opts.subject)}`,
    "Content-Type: text/plain; charset=UTF-8",
    "MIME-Version: 1.0",
  ];
  if (opts.cc) lines.push(`Cc: ${opts.cc}`);
  lines.push("", opts.body);
  return lines.join("\r\n");
}

function encodeSubject(subject: string): string {
  // RFC 2047 encoding for non-ASCII subjects
  if (/^[\x00-\x7F]*$/.test(subject)) return subject;
  return `=?UTF-8?B?${Buffer.from(subject, "utf-8").toString("base64")}?=`;
}

function base64UrlEncode(str: string): string {
  return Buffer.from(str, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
