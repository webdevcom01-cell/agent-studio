import { NextRequest, NextResponse } from "next/server";
import { applySecurityHeaders } from "@/lib/api/security-headers";

// UX guard only — redirects unauthenticated users to /login.
// This is NOT a security boundary. Cookie existence is checked, not validated.
// All data access is protected by requireAuth()/requireAgentOwner() in API routes.
const SESSION_COOKIE = "authjs.session-token";
const SECURE_SESSION_COOKIE = "__Secure-authjs.session-token";

function isPublicPath(pathname: string): boolean {
  if (pathname === "/api/health") return true;
  if (pathname === "/login") return true;
  if (pathname.startsWith("/embed")) return true;
  if (pathname.startsWith("/chat/")) return true;
  if (pathname.startsWith("/api/auth")) return true;

  if (pathname.match(/^\/api\/agents\/[^/]+\/chat$/)) return true;

  // Internal MCP proxy — called server-to-server by the MCP client pool, no session cookie
  if (pathname.startsWith("/api/mcp/proxy/")) return true;

  if (pathname === "/favicon.ico") return true;
  if (pathname === "/embed.js") return true;
  if (pathname === "/test-embed.html") return true;
  if (pathname.startsWith("/_next")) return true;

  return false;
}

const MUTATION_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

function isCsrfSafe(request: NextRequest): boolean {
  if (!MUTATION_METHODS.has(request.method)) return true;

  const origin = request.headers.get("origin");
  if (!origin) return true;

  const requestOrigin = new URL(request.url).origin;
  return origin === requestOrigin;
}

export function middleware(request: NextRequest): NextResponse {
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

  const hasSession =
    request.cookies.has(SESSION_COOKIE) ||
    request.cookies.has(SECURE_SESSION_COOKIE);

  if (!hasSession) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    const response = NextResponse.redirect(loginUrl);
    applySecurityHeaders(response, pathname);
    return response;
  }

  const response = NextResponse.next();
  applySecurityHeaders(response, pathname);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|embed\\.js|test-embed\\.html).*)"],
};
