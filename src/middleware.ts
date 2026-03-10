import { NextRequest, NextResponse } from "next/server";

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
    return NextResponse.next();
  }

  if (!isCsrfSafe(request)) {
    return NextResponse.json(
      { success: false, error: "Forbidden: origin mismatch" },
      { status: 403 }
    );
  }

  const hasSession =
    request.cookies.has(SESSION_COOKIE) ||
    request.cookies.has(SECURE_SESSION_COOKIE);

  if (!hasSession) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|embed\\.js|test-embed\\.html).*)"],
};
