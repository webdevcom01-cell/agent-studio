import { handlers } from "@/lib/auth";
import { NextRequest } from "next/server";

/**
 * Auth.js v5 beta.30 derives the JWT `issuer` from `request.url`.
 * On Railway (and other reverse proxies), the internal request URL is
 * something like `http://0.0.0.0:8080`, so Auth.js falls back to
 * `https://authjs.dev` as the issuer — causing `unexpected "iss"` errors
 * on every OAuth callback.
 *
 * Fix: rewrite the request URL to use the public AUTH_URL origin before
 * passing the request to Auth.js handlers.
 */
function withPublicOrigin(request: NextRequest): NextRequest {
  const publicBase = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
  if (!publicBase) return request;

  try {
    const base = new URL(publicBase);
    const incoming = new URL(request.url);
    // Nothing to rewrite if already on the correct origin
    if (incoming.origin === base.origin) return request;

    const rewritten = new URL(incoming.pathname + incoming.search, base.origin);
    return new NextRequest(rewritten, { headers: request.headers });
  } catch {
    return request;
  }
}

export function GET(request: NextRequest) {
  return handlers.GET(withPublicOrigin(request));
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
