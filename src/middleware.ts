import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "authjs.session-token";
const SECURE_SESSION_COOKIE = "__Secure-authjs.session-token";

function isPublicPath(pathname: string): boolean {
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

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
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
