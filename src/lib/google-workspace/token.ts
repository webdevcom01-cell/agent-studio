import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/** Five-minute buffer: refresh token this many ms before it actually expires */
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

/**
 * Returns a valid Google access token for the given DB record ID.
 * Automatically refreshes if the stored token has expired or is about to expire.
 *
 * Throws if the token cannot be retrieved or refreshed.
 */
export async function getValidAccessToken(tokenId: string): Promise<string> {
  const record = await prisma.googleOAuthToken.findUnique({
    where: { id: tokenId },
  });

  if (!record) {
    throw new Error(`Google OAuth token ${tokenId} not found`);
  }

  // Check if the current access token is still valid
  const needsRefresh =
    !record.expiresAt ||
    record.expiresAt.getTime() - Date.now() < REFRESH_BUFFER_MS;

  if (!needsRefresh) {
    return record.accessToken;
  }

  // Refresh the token
  if (!record.refreshToken) {
    throw new Error(
      "Google access token expired and no refresh token is available. " +
        "Please reconnect your Google Workspace account.",
    );
  }

  return refreshAccessToken(tokenId, record.refreshToken);
}

/**
 * Exchange a refresh token for a new access token via Google's token endpoint.
 * Updates the DB record in-place and returns the new access token.
 */
async function refreshAccessToken(
  tokenId: string,
  refreshToken: string,
): Promise<string> {
  const clientId = process.env.GOOGLE_WORKSPACE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_WORKSPACE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Google Workspace OAuth credentials are not configured.");
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    logger.error("Google token refresh failed", { status: res.status, body });
    throw new Error(`Google token refresh failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
    token_type: string;
  };

  const expiresAt = new Date(Date.now() + data.expires_in * 1000);

  await prisma.googleOAuthToken.update({
    where: { id: tokenId },
    data: {
      accessToken: data.access_token,
      expiresAt,
    },
  });

  return data.access_token;
}
