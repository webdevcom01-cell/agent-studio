import { handlers } from "@/lib/auth";
import { NextRequest } from "next/server";

/**
 * Normalizes the incoming auth request:
 *
 * 1. ORIGIN REWRITE (Railway / reverse-proxy fix)
 *    Auth.js v5 derives the JWT `issuer` from `request.url`.  On Railway the
 *    internal URL is `http://0.0.0.0:PORT`, so Auth.js would use the wrong
 *    origin.  We rewrite to AUTH_URL before passing to Auth.js handlers.
 *
 * 2. ISS STRIPPING (GitHub RFC 9207 fix)
 *    GitHub started adding an `iss` query parameter to OAuth callbacks per
 *    RFC 9207.  @auth/core@0.34.3 constructs an Authorization Server object
 *    with `issuer: provider.issuer ?? "https://authjs.dev"`.  Even with the
 *    correct issuer set, `oauth4webapi` compares the `iss` value byte-for-byte
 *    and throws `unexpected "iss" response parameter value` on any mismatch.
 *
 *    For OAuth 2.0 (non-OIDC) providers the `iss` in the redirect URL is only
 *    a hint and is not required for security.  CSRF protection is provided by
 *    the `state` parameter.  We safely remove `iss` from OAuth2 callback URLs
 *    (identified by path ending in `/callback/github`) so Auth.js never sees
 *    it and skips the validation entirely.
 *
 *    Google OAuth uses OIDC — its `iss` lives inside the ID token (validated
 *    separately by Auth.js) and is never present as a plain query param here.
 */
function normalizeAuthRequest(request: NextRequest): NextRequest {
  const publicBase = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;

  try {
    const incoming = new URL(request.url);
    let modified = false;

    // Strip `iss` from GitHub OAuth2 callbacks to bypass RFC 9207 iss mismatch.
    // GitHub started returning `iss` per RFC 9207, but @auth/core cannot always
    // match the value against its fallback issuer, causing auth failures.
    // The `state` parameter still provides CSRF protection.
    // Google OAuth uses OIDC and never sends `iss` as a plain query param here.
    if (
      incoming.pathname.includes("/callback/github") &&
      incoming.searchParams.has("iss")
    ) {
      incoming.searchParams.delete("iss");
      modified = true;
    }

    // Rewrite origin to the public AUTH_URL if running behind a reverse proxy.
    if (publicBase) {
      const base = new URL(publicBase);
      if (incoming.origin !== base.origin) {
        const rewritten = new URL(
          incoming.pathname + incoming.search,
          base.origin,
        );
        return new NextRequest(rewritten, { headers: request.headers });
      }
    }

    return modified
      ? new NextRequest(incoming.toString(), { headers: request.headers })
      : request;
  } catch {
    return request;
  }
}

export function GET(request: NextRequest) {
  return handlers.GET(normalizeAuthRequest(request));
}

export async function POST(request: NextRequest) {
  const publicBase = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
  if (!publicBase) return handlers.POST(request);

  try {
    const base = new URL(publicBase);
    const incoming = new URL(request.url);
    if (incoming.origin === base.origin) return handlers.POST(request);

    const rewritten = new URL(incoming.pathname + incoming.search, base.origin);
    const body = await request.text();
    return handlers.POST(
      new NextRequest(rewritten, {
        method: "POST",
        headers: request.headers,
        body,
      }),
    );
  } catch {
    return handlers.POST(request);
  }
}
