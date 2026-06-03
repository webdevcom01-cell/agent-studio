import { z } from "zod";
import type { Request, Response } from "express";

const AuthorizeQuerySchema = z.object({
  redirect_uri: z.string().url(),
  state: z.string().optional(),
  code_challenge: z.string().optional(),
  code_challenge_method: z.string().optional(),
});

function loadAllowlist(): string[] {
  const raw = process.env.MCP_OAUTH_REDIRECT_ALLOWLIST ?? "";
  if (!raw.trim()) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function isAllowedRedirectUri(redirectUri: string, allowlist: string[]): boolean {
  let normalizedInput: string;
  try {
    normalizedInput = new URL(redirectUri).href;
  } catch {
    return false;
  }
  return allowlist.some((entry) => {
    try {
      return new URL(entry).href === normalizedInput;
    } catch {
      return false;
    }
  });
}

export function handleAuthorize(req: Request, res: Response): void {
  const parsed = AuthorizeQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request" });
    return;
  }

  const { redirect_uri, state, code_challenge } = parsed.data;

  const allowlist = loadAllowlist();
  if (allowlist.length === 0) {
    res.status(400).json({ error: "OAuth redirect allowlist not configured" });
    return;
  }

  if (!isAllowedRedirectUri(redirect_uri, allowlist)) {
    res.status(400).json({ error: "redirect_uri not allowed" });
    return;
  }

  const code = "mcp_auth_code_" + Date.now();
  const separator = redirect_uri.includes("?") ? "&" : "?";
  const location = `${redirect_uri}${separator}code=${encodeURIComponent(code)}${state ? `&state=${encodeURIComponent(state)}` : ""}`;
  process.stderr.write(`[MCP] OAuth /authorize → redirecting (challenge=${code_challenge ?? "none"})\n`);
  res.redirect(302, location);
}
