import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

interface NotionTokenResponse {
  access_token: string;
  token_type: string;
  bot_id: string;
  workspace_name?: string;
  workspace_icon?: string;
  workspace_id: string;
  owner?: { type: string; user?: { name?: string } };
  duplicated_template_id?: string | null;
  request_id?: string;
}

/**
 * GET /api/auth/oauth/notion/callback
 *
 * Handles the redirect from Notion's OAuth flow.
 * Exchanges the authorization code for an access token, then creates (or
 * updates) the user's Notion MCP server entry.
 *
 * On success → sends postMessage to the opener and closes the popup.
 * On failure → sends error postMessage and closes the popup.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const errorParam = searchParams.get("error");

  // User denied access in Notion
  if (errorParam) {
    return popupPage(false, "Authorization was cancelled or denied.");
  }

  if (!code || !state) {
    return popupPage(false, "Invalid callback — missing code or state.");
  }

  // Validate CSRF state
  const cookieState = request.cookies.get("notion_oauth_state")?.value;
  if (!cookieState || cookieState !== state) {
    return popupPage(false, "Invalid state parameter. Please try connecting again.");
  }

  // Require authenticated session
  const session = await auth();
  if (!session?.user?.id) {
    return popupPage(false, "Session expired — please log in and try again.");
  }

  const clientId = process.env.NOTION_CLIENT_ID;
  const clientSecret = process.env.NOTION_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return popupPage(false, "Notion OAuth is not configured on this server.");
  }

  const redirectUri = buildRedirectUri(request);

  // Exchange authorization code for access token
  let tokenData: NotionTokenResponse;
  try {
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const tokenRes = await fetch("https://api.notion.com/v1/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${credentials}`,
      },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      const body = await tokenRes.text();
      logger.error("Notion OAuth token exchange failed", {
        status: tokenRes.status,
        body,
        userId: session.user.id,
      });
      return popupPage(false, "Token exchange failed. Please try again.");
    }

    tokenData = (await tokenRes.json()) as NotionTokenResponse;
  } catch (err) {
    logger.error("Notion OAuth token exchange threw", { err });
    return popupPage(false, "Network error during token exchange. Please try again.");
  }

  const { access_token, workspace_name } = tokenData;
  const notionMcpUrl = "https://mcp.notion.com/mcp";
  const serverName = workspace_name ? `Notion (${workspace_name})` : "Notion";

  // Upsert the MCP server (update token if already connected)
  try {
    const existing = await prisma.mCPServer.findFirst({
      where: { userId: session.user.id, url: notionMcpUrl },
      select: { id: true },
    });

    if (existing) {
      await prisma.mCPServer.update({
        where: { id: existing.id },
        data: {
          name: serverName,
          headers: { Authorization: `Bearer ${access_token}` },
          enabled: true,
        },
      });
    } else {
      await prisma.mCPServer.create({
        data: {
          userId: session.user.id,
          name: serverName,
          url: notionMcpUrl,
          transport: "STREAMABLE_HTTP",
          headers: { Authorization: `Bearer ${access_token}` },
          enabled: true,
        },
      });
    }
  } catch (err) {
    logger.error("Failed to upsert Notion MCP server", {
      err,
      userId: session.user.id,
    });
    return popupPage(false, "Failed to save Notion connection. Please try again.");
  }

  // Clear the CSRF cookie and close the popup
  const response = popupPage(true, `✅ ${serverName} connected successfully!`);
  response.cookies.set("notion_oauth_state", "", { maxAge: 0, path: "/" });
  return response;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildRedirectUri(request: NextRequest): string {
  const host = request.headers.get("host") ?? "localhost:3000";
  const protocol =
    process.env.NODE_ENV === "production" ||
    request.headers.get("x-forwarded-proto") === "https"
      ? "https"
      : "http";
  return `${protocol}://${host}/api/auth/oauth/notion/callback`;
}

/**
 * Returns an HTML page that sends a postMessage to the opener (the MCP manager
 * dialog) and then closes itself. This avoids a full-page navigation.
 */
function popupPage(success: boolean, message: string): NextResponse {
  const postMessagePayload = success
    ? JSON.stringify({ type: "notion_oauth_success" })
    : JSON.stringify({ type: "notion_oauth_error", error: message });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Notion OAuth</title>
  <style>
    body { font-family: system-ui, sans-serif; padding: 2rem; max-width: 360px;
           margin: auto; text-align: center; color: #111; }
    .icon { font-size: 2.5rem; margin-bottom: 1rem; }
    p { color: #555; font-size: 0.9rem; }
    button { margin-top: 1rem; padding: 0.5rem 1.2rem; border: none; border-radius: 6px;
             background: #f3f3f3; cursor: pointer; font-size: 0.9rem; }
    button:hover { background: #e5e5e5; }
  </style>
</head>
<body>
  <div class="icon">${success ? "✅" : "❌"}</div>
  <p>${message}</p>
  <p style="color:#999;font-size:0.8rem">This window will close automatically.</p>
  <button onclick="window.close()">Close</button>
  <script>
    try {
      if (window.opener) {
        window.opener.postMessage(${postMessagePayload}, window.location.origin);
      }
    } catch (e) { /* cross-origin guard */ }
    setTimeout(function() { window.close(); }, 1500);
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
