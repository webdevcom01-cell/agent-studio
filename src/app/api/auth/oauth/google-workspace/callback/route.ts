import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: string;
  id_token?: string;
}

interface GoogleUserInfo {
  email: string;
  verified_email: boolean;
  name?: string;
  picture?: string;
}

/**
 * GET /api/auth/oauth/google-workspace/callback
 *
 * Handles the redirect from Google's OAuth flow.
 * Exchanges the authorization code for tokens, stores the GoogleOAuthToken,
 * and creates an MCPServer pointing to our internal proxy.
 *
 * On success → sends postMessage to the opener and closes the popup.
 * On failure → sends error postMessage and closes the popup.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const errorParam = searchParams.get("error");

  // User denied access in Google
  if (errorParam) {
    return popupPage(false, "Authorization was cancelled or denied.");
  }

  if (!code || !state) {
    return popupPage(false, "Invalid callback — missing code or state.");
  }

  // Validate CSRF state
  const cookieState = request.cookies.get(
    "google_workspace_oauth_state",
  )?.value;
  if (!cookieState || cookieState !== state) {
    return popupPage(
      false,
      "Invalid state parameter. Please try connecting again.",
    );
  }

  // Require authenticated session
  const session = await auth();
  if (!session?.user?.id) {
    return popupPage(false, "Session expired — please log in and try again.");
  }

  const clientId = process.env.GOOGLE_WORKSPACE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_WORKSPACE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return popupPage(
      false,
      "Google Workspace OAuth is not configured on this server.",
    );
  }

  const redirectUri = buildRedirectUri(request);

  // Exchange authorization code for tokens
  let tokenData: GoogleTokenResponse;
  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      const body = await tokenRes.text();
      logger.error("Google Workspace OAuth token exchange failed", {
        status: tokenRes.status,
        body,
        userId: session.user.id,
      });
      return popupPage(false, "Token exchange failed. Please try again.");
    }

    tokenData = (await tokenRes.json()) as GoogleTokenResponse;
  } catch (err) {
    logger.error("Google Workspace OAuth token exchange threw", { err });
    return popupPage(
      false,
      "Network error during token exchange. Please try again.",
    );
  }

  // Fetch the user's Google email address
  let userInfo: GoogleUserInfo;
  try {
    const userRes = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      },
    );

    if (!userRes.ok) {
      logger.error("Google Workspace userinfo fetch failed", {
        status: userRes.status,
        userId: session.user.id,
      });
      return popupPage(
        false,
        "Failed to fetch Google account info. Please try again.",
      );
    }

    userInfo = (await userRes.json()) as GoogleUserInfo;
  } catch (err) {
    logger.error("Google Workspace userinfo fetch threw", { err });
    return popupPage(
      false,
      "Network error fetching account info. Please try again.",
    );
  }

  const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);

  // Upsert the GoogleOAuthToken record
  let tokenId: string;
  try {
    const existing = await prisma.googleOAuthToken.findUnique({
      where: {
        userId_email: {
          userId: session.user.id,
          email: userInfo.email,
        },
      },
      select: { id: true },
    });

    if (existing) {
      // Update — always refresh the access token; update refresh token if provided
      await prisma.googleOAuthToken.update({
        where: { id: existing.id },
        data: {
          accessToken: tokenData.access_token,
          expiresAt,
          scopes: tokenData.scope,
          ...(tokenData.refresh_token
            ? { refreshToken: tokenData.refresh_token }
            : {}),
        },
      });
      tokenId = existing.id;
    } else {
      const created = await prisma.googleOAuthToken.create({
        data: {
          userId: session.user.id,
          email: userInfo.email,
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token ?? null,
          expiresAt,
          scopes: tokenData.scope,
        },
        select: { id: true },
      });
      tokenId = created.id;
    }
  } catch (err) {
    logger.error("Failed to upsert GoogleOAuthToken", {
      err,
      userId: session.user.id,
    });
    return popupPage(
      false,
      "Failed to save Google credentials. Please try again.",
    );
  }

  // Build the internal MCP proxy URL for this token
  const host = request.headers.get("host") ?? "localhost:3000";
  const protocol =
    process.env.NODE_ENV === "production" ||
    request.headers.get("x-forwarded-proto") === "https"
      ? "https"
      : "http";
  const proxyUrl = `${protocol}://${host}/api/mcp/proxy/google-workspace/${tokenId}`;
  const serverName = `Google Workspace (${userInfo.email})`;

  // Upsert the MCPServer pointing to the internal proxy
  try {
    const existing = await prisma.mCPServer.findFirst({
      where: { userId: session.user.id, url: proxyUrl },
      select: { id: true },
    });

    if (existing) {
      await prisma.mCPServer.update({
        where: { id: existing.id },
        data: { name: serverName, enabled: true },
      });
    } else {
      // Also check if there's an old proxy URL for the same email (token was recreated)
      const oldEntry = await prisma.mCPServer.findFirst({
        where: {
          userId: session.user.id,
          url: { contains: "/api/mcp/proxy/google-workspace/" },
          name: { contains: userInfo.email },
        },
        select: { id: true },
      });

      if (oldEntry) {
        await prisma.mCPServer.update({
          where: { id: oldEntry.id },
          data: { name: serverName, url: proxyUrl, enabled: true },
        });
      } else {
        await prisma.mCPServer.create({
          data: {
            userId: session.user.id,
            name: serverName,
            url: proxyUrl,
            transport: "STREAMABLE_HTTP",
            enabled: true,
          },
        });
      }
    }
  } catch (err) {
    logger.error("Failed to upsert Google Workspace MCP server", {
      err,
      userId: session.user.id,
    });
    return popupPage(
      false,
      "Failed to save Google Workspace connection. Please try again.",
    );
  }

  // Clear the CSRF cookie and close the popup
  const response = popupPage(true, `✅ ${serverName} connected successfully!`);
  response.cookies.set("google_workspace_oauth_state", "", {
    maxAge: 0,
    path: "/",
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

/**
 * Returns an HTML page that sends a postMessage to the opener (the MCP manager
 * dialog) and then closes itself.
 */
function popupPage(success: boolean, message: string): NextResponse {
  const postMessagePayload = success
    ? JSON.stringify({ type: "google_workspace_oauth_success" })
    : JSON.stringify({ type: "google_workspace_oauth_error", error: message });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Google Workspace OAuth</title>
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
