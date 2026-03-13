import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export const runtime = "nodejs";

const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

/**
 * GET /api/auth/oauth/google-workspace
 *
 * Initiates the Google Workspace OAuth flow. Opens as a popup from the MCP manager UI.
 * Redirects the user to Google's OAuth consent screen.
 *
 * Required env vars: GOOGLE_WORKSPACE_CLIENT_ID, GOOGLE_WORKSPACE_CLIENT_SECRET
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  // Must be authenticated before initiating OAuth
  const session = await auth();
  if (!session?.user?.id) {
    return googleErrorPage(
      "Please log in to your account before connecting Google Workspace.",
    );
  }

  const clientId = process.env.GOOGLE_WORKSPACE_CLIENT_ID;
  if (!clientId) {
    return googleErrorPage(
      "Google Workspace OAuth is not configured on this server.<br/>" +
        "Add <code>GOOGLE_WORKSPACE_CLIENT_ID</code> and <code>GOOGLE_WORKSPACE_CLIENT_SECRET</code> " +
        "to your environment variables, then create an OAuth client at " +
        '<a href="https://console.cloud.google.com/apis/credentials" target="_blank">Google Cloud Console</a>.',
    );
  }

  // Generate a random CSRF state token
  const state = crypto.randomUUID();

  const redirectUri = buildRedirectUri(request);

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", GOOGLE_SCOPES);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("access_type", "offline"); // request refresh token
  authUrl.searchParams.set("prompt", "consent"); // force consent to always get refresh token

  const response = NextResponse.redirect(authUrl.toString());

  // Store state in a short-lived httpOnly cookie for CSRF validation
  response.cookies.set("google_workspace_oauth_state", state, {
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
  return `${protocol}://${host}/api/auth/oauth/google-workspace/callback`;
}

function googleErrorPage(message: string): NextResponse {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Google Workspace OAuth — Error</title>
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
  <h2>Google Workspace Connection Error</h2>
  <p>${message}</p>
  <button onclick="window.close()">Close</button>
</body>
</html>`;

  return new NextResponse(html, {
    status: 400,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
