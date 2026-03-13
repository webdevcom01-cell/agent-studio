import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * GET /api/auth/oauth/notion
 *
 * Initiates the Notion OAuth flow. Opens as a popup from the MCP manager UI.
 * Redirects the user to Notion's OAuth authorization page.
 *
 * Required env vars: NOTION_CLIENT_ID, NOTION_CLIENT_SECRET
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  // Must be authenticated before initiating OAuth
  const session = await auth();
  if (!session?.user?.id) {
    return notionErrorPage(
      "Please log in to your account before connecting Notion.",
    );
  }

  const clientId = process.env.NOTION_CLIENT_ID;
  if (!clientId) {
    return notionErrorPage(
      "Notion OAuth is not configured on this server.<br/>" +
        "Add <code>NOTION_CLIENT_ID</code> and <code>NOTION_CLIENT_SECRET</code> to your environment variables, " +
        "then create an OAuth integration at " +
        '<a href="https://www.notion.so/my-integrations" target="_blank">notion.so/my-integrations</a>.',
    );
  }

  // Generate a random CSRF state token
  const state = crypto.randomUUID();

  const redirectUri = buildRedirectUri(request);

  const authUrl = new URL("https://api.notion.com/v1/oauth/authorize");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("owner", "user");
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", state);

  const response = NextResponse.redirect(authUrl.toString());

  // Store state in a short-lived httpOnly cookie for CSRF validation
  response.cookies.set("notion_oauth_state", state, {
    httpOnly: true,
    maxAge: 600, // 10 minutes
    path: "/",
    sameSite: "lax",
  });

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

function notionErrorPage(message: string): NextResponse {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Notion OAuth — Error</title>
  <style>
    body { font-family: system-ui, sans-serif; padding: 2rem; max-width: 420px; margin: auto; color: #111; }
    .icon { font-size: 2rem; margin-bottom: 1rem; }
    h2 { margin: 0 0 0.5rem; font-size: 1.1rem; }
    p { margin: 0; color: #555; font-size: 0.9rem; line-height: 1.5; }
    code { background: #f3f3f3; padding: 1px 4px; border-radius: 3px; font-size: 0.82rem; }
    a { color: #0070f3; }
    button { margin-top: 1.5rem; padding: 0.5rem 1.2rem; border: none; border-radius: 6px;
             background: #f3f3f3; cursor: pointer; font-size: 0.9rem; }
    button:hover { background: #e5e5e5; }
  </style>
</head>
<body>
  <div class="icon">⚠️</div>
  <h2>Notion Connection Error</h2>
  <p>${message}</p>
  <button onclick="window.close()">Close</button>
</body>
</html>`;

  return new NextResponse(html, {
    status: 400,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
