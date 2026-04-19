import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { applySecurityHeaders } from "@/lib/api/security-headers";

// UX guard only — redirects unauthenticated users to /login.
// This is NOT a security boundary. Cookie existence is checked, not validated.
// All data access is protected by requireAuth()/requireAgentOwner() in API routes.
//
// NextAuth v5 Cookie Pinning (P2-T2):
// Primary cookie names are pinned to the current NextAuth v5 beta convention.
// Fallback detection scans for any cookie containing "session-token" to survive
// cookie name changes across NextAuth versions without logging out all users.
//
// Upgrade Plan:
//   1. Monitor https://github.com/nextauthjs/next-auth/releases for stable v5
//   2. When stable ships: pin to stable version, verify cookie names match
//   3. If cookie names change: update PRIMARY_COOKIES, users stay logged in via fallback
//   4. Run `pnpm add next-auth@latest` only after verifying no breaking session changes
const PRIMARY_SESSION_COOKIES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
] as const;

const SESSION_COOKIE_PATTERN = /session[_-]?token/i;

function isPublicPath(pathname: string): boolean {
  if (pathname === "/api/health") return true;
  if (pathname === "/api/openapi.json") return true;
  if (pathname === "/api/docs") return true;
  if (pathname === "/login") return true;
  if (pathname === "/register") return true;
  if (pathname === "/onboarding") return true;
  if (pathname.startsWith("/embed")) return true;
  if (pathname === "/evals/standards") return true;
  if (pathname.startsWith("/chat/")) return true;
  if (pathname.startsWith("/api/auth")) return true;

  if (pathname.match(/^\/api\/agents\/[^/]+\/chat$/)) return true;

  // A2A agent card — public discovery endpoints
  if (pathname.match(/^\/api\/agents\/[^/]+\/card\.json$/)) return true;
  if (pathname.match(/^\/api\/a2a\/[^/]+\/agent-card$/)) return true;
  if (pathname === "/.well-known/agent-cards") return true;

  // Inbound webhook trigger — public, authenticated via HMAC-SHA256 signature
  if (pathname.match(/^\/api\/agents\/[^/]+\/trigger\/[^/]+$/)) return true;

  // Internal MCP proxy — called server-to-server by the MCP client pool, no session cookie
  if (pathname.startsWith("/api/mcp/proxy/")) return true;

  // Remote MCP server — authenticated via Bearer API key in Authorization header
  if (pathname === "/api/mcp/agent-studio") return true;

  // Cron jobs — called by Vercel infrastructure, authenticated via CRON_SECRET header
  if (pathname.startsWith("/api/cron/")) return true;

  // ECC skill ingestion — authenticated via CRON_SECRET header
  if (pathname.startsWith("/api/ecc/")) return true;

  if (pathname === "/favicon.ico") return true;
  if (pathname === "/embed.js") return true;
  if (pathname === "/test-embed.html") return true;
  if (pathname.startsWith("/_next")) return true;

  return false;
}

/**
 * Checks for session cookie presence with fallback detection.
 * Primary: checks pinned NextAuth v5 cookie names.
 * Fallback: scans all cookies for "session-token" pattern to survive name changes.
 */
function hasSessionCookie(request: NextRequest): boolean {
  for (const name of PRIMARY_SESSION_COOKIES) {
    if (request.cookies.has(name)) return true;
  }

  for (const cookie of request.cookies.getAll()) {
    if (SESSION_COOKIE_PATTERN.test(cookie.name)) return true;
  }

  return false;
}

const MUTATION_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

function isCsrfSafe(request: NextRequest): boolean {
  if (!MUTATION_METHODS.has(request.method)) return true;

  const origin = request.headers.get("origin");
  if (!origin) return true;

  // Compare the browser Origin host against all plausible representations
  // of the server host. We check multiple sources because Railway (and other
  // reverse-proxies) may forward requests with an internal IP/port in the
  // raw URL while the real public hostname is carried in x-forwarded-host.
  //
  // Candidate hosts (in preference order):
  //   1. x-forwarded-host  — set by Railway's edge proxy, the external hostname
  //   2. host              — the Host header forwarded by the proxy
  //   3. request.nextUrl   — Next.js-reconstructed URL (may already use header 1)
  //   4. request.url       — raw internal URL (may be http://10.x.x.x:PORT/)
  //
  // If ANY candidate matches the Origin host, the request is same-host.
  try {
    const originHost = new URL(origin).host;
    const candidates: (string | null)[] = [
      request.headers.get("x-forwarded-host"),
      request.headers.get("host"),
      request.nextUrl.host,
      (() => { try { return new URL(request.url).host; } catch { return null; } })(),
    ];
    return candidates.some((h) => h !== null && h === originHost);
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    const response = NextResponse.next();
    applySecurityHeaders(response, pathname);
    return response;
  }

  if (!isCsrfSafe(request)) {
    const response = NextResponse.json(
      { success: false, error: "Forbidden: origin mismatch" },
      { status: 403 }
    );
    applySecurityHeaders(response, pathname);
    return response;
  }

  const hasSession = hasSessionCookie(request);

  if (!hasSession) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    const response = NextResponse.redirect(loginUrl);
    applySecurityHeaders(response, pathname);
    return response;
  }

  // Onboarding gate: redirect authenticated users who haven't completed onboarding.
  // Only runs when AUTH_SECRET is present; skipped if token is unreadable (fail open).
  if (process.env.AUTH_SECRET) {
    const token = await getToken({
      req: request,
      secret: process.env.AUTH_SECRET,
      secureCookie: process.env.NODE_ENV === "production",
    });
    if (token?.onboardingCompleted === false) {
      const response = NextResponse.redirect(new URL("/onboarding", request.url));
      applySecurityHeaders(response, pathname);
      return response;
    }
  }

  const response = NextResponse.next();
  applySecurityHeaders(response, pathname);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|embed\\.js|test-embed\\.html).*)"],
};
