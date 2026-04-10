/**
 * NextAuth v5 configuration
 *
 * Supported providers (any combination via env vars):
 *   - GitHub OAuth       AUTH_GITHUB_ID + AUTH_GITHUB_SECRET
 *   - Google OAuth       AUTH_GOOGLE_ID + AUTH_GOOGLE_SECRET
 *   - Generic OIDC       AUTH_OIDC_ISSUER + AUTH_OIDC_CLIENT_ID + AUTH_OIDC_CLIENT_SECRET
 *                        (works with Okta, Azure AD B2C, Keycloak, Auth0, Ping, …)
 *
 * Authentication methods (in priority order):
 *   1. Session cookie  (NextAuth JWT strategy)
 *   2. API key         (x-api-key header — see src/lib/api/auth-guard.ts)
 */

import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import { createEncryptedAdapter } from "@/lib/auth-adapter";

// ── OIDC provider factory ────────────────────────────────────────────────────
// Dynamically constructs a standards-compliant OIDC provider when all three
// required env vars are present. Compatible with any OAuth 2.0 + OIDC server.

function buildOIDCProvider() {
  const issuer = process.env.AUTH_OIDC_ISSUER;
  const clientId = process.env.AUTH_OIDC_CLIENT_ID;
  const clientSecret = process.env.AUTH_OIDC_CLIENT_SECRET;

  if (!issuer || !clientId || !clientSecret) return null;

  const displayName = process.env.AUTH_OIDC_DISPLAY_NAME ?? "SSO";

  // NextAuth v5 generic OAuth provider with OIDC discovery
  // The issuer URL MUST expose /.well-known/openid-configuration
  return {
    id: "oidc",
    name: displayName,
    type: "oidc" as const,
    issuer,
    clientId,
    clientSecret,
    // Request standard OIDC scopes
    authorization: {
      params: { scope: "openid email profile" },
    },
    // Map OIDC claims → NextAuth user
    profile(profile: Record<string, string>) {
      return {
        id: profile.sub,
        name: profile.name ?? profile.preferred_username ?? profile.email,
        email: profile.email,
        image: profile.picture ?? null,
      };
    },
  };
}

// ── Provider list ─────────────────────────────────────────────────────────────

const oidcProvider = buildOIDCProvider();

const providers = [
  ...(process.env.AUTH_GITHUB_ID
    ? [
        GitHub({
          // GitHub now returns `iss: "https://github.com"` in OAuth callbacks
          // (RFC 9207). @auth/core defaults to "https://authjs.dev" when no
          // issuer is set, causing an `unexpected "iss"` validation error in
          // oauth4webapi. Setting the correct issuer fixes the mismatch.
          issuer: "https://github.com",
        }),
      ]
    : []),
  ...(process.env.AUTH_GOOGLE_ID ? [Google] : []),
  ...(oidcProvider ? [oidcProvider] : []),
];

// ── NextAuth config ───────────────────────────────────────────────────────────

// NextAuth v5 Stabilization (P2-T2):
// Pin cookie names explicitly so NextAuth beta updates don't change them silently.
// These must match PRIMARY_SESSION_COOKIES in src/middleware.ts.
const NEXTAUTH_COOKIE_PREFIX = "authjs";

export const { handlers, auth, signIn, signOut } = NextAuth({
  debug: process.env.NODE_ENV !== "production",
  secret: process.env.AUTH_SECRET,
  adapter: createEncryptedAdapter(),
  session: { strategy: "jwt", maxAge: 24 * 60 * 60 },
  providers,
  trustHost: true,
  cookies: {
    sessionToken: {
      name: `${NEXTAUTH_COOKIE_PREFIX}.session-token`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
    callbackUrl: {
      name: `${NEXTAUTH_COOKIE_PREFIX}.callback-url`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
    csrfToken: {
      name: `${NEXTAUTH_COOKIE_PREFIX}.csrf-token`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
});
