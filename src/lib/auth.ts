/**
 * NextAuth v5 configuration
 *
 * Supported providers (any combination via env vars):
 *   - Email/Password   (always enabled — no env var required)
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
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { createEncryptedAdapter } from "@/lib/auth-adapter";
import { prisma } from "@/lib/prisma";
import { withAdminBypass } from "@/lib/api/tenant-context";

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

// ── Credentials provider (email + password) ───────────────────────────────────
// Always enabled. Users registered via /api/auth/register have a bcrypt hash
// stored in User.password. OAuth-only users have password = null and cannot
// use this provider.

const credentialsProvider = Credentials({
  id: "credentials",
  name: "Email",
  credentials: {
    email: { label: "Email", type: "email" },
    password: { label: "Password", type: "password" },
  },
  async authorize(credentials) {
    const email = credentials?.email as string | undefined;
    const password = credentials?.password as string | undefined;

    if (!email || !password) return null;

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: { id: true, email: true, name: true, image: true, password: true },
    });

    if (!user?.password) return null; // OAuth-only user or not found

    const passwordMatch = await compare(password, user.password);
    if (!passwordMatch) return null;

    return { id: user.id, email: user.email, name: user.name, image: user.image };
  },
});

const providers = [
  credentialsProvider,
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
  ...(process.env.AUTH_GOOGLE_ID ? [Google({ allowDangerousEmailAccountLinking: true })] : []),
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
    async jwt({ token, user, trigger }) {
      if (user?.id) {
        token.id = user.id;
      }
      const userId = token.id as string | undefined;
      if (userId && (user || trigger === "update")) {
        const dbUser = await prisma.user.findUnique({
          where: { id: userId },
          select: { onboardingCompletedAt: true, name: true, email: true, currentOrgId: true },
        });
        token.onboardingCompleted = !!dbUser?.onboardingCompletedAt;

        // Honor an explicitly selected org (POST /api/users/switch-org), but only
        // if the user is STILL a member — guards a stale choice after removal.
        // SECURITY: this re-validation is mandatory because session.update() is
        // client-callable; the token alone cannot be trusted.
        let resolvedOrgId: string | null = null;
        const selectedOrgId = dbUser?.currentOrgId ?? null;
        if (selectedOrgId) {
          const stillMember = await withAdminBypass((db) => db.organizationMember.findUnique({
            where: { userId_organizationId: { userId, organizationId: selectedOrgId } },
            select: { organizationId: true },
          }));
          resolvedOrgId = stillMember ? selectedOrgId : null;
        }

        // No valid explicit choice → fall back to the user's primary org via the
        // SECURITY DEFINER fn user_primary_org() so it works even when
        // OrganizationMember is RLS-protected for the app_user role. Falls back to a
        // direct read if the function isn't deployed yet (keeps login working).
        if (!resolvedOrgId) {
          try {
            const orgRows = await prisma.$queryRaw<Array<{ org: string | null }>>`
              SELECT user_primary_org(${userId}) AS org
            `;
            resolvedOrgId = orgRows[0]?.org ?? null;
          } catch {
            const membership = await withAdminBypass((db) => db.organizationMember.findFirst({
              where: { userId },
              select: { organizationId: true },
              orderBy: { joinedAt: "asc" },
            }));
            resolvedOrgId = membership?.organizationId ?? null;
          }
        }
        token.currentOrgId = resolvedOrgId;
        // Auto-provision a personal org on first login so brand-new users work
        // under RLS (no org -> currentOrgId null -> they'd see nothing / create
        // org-less, invisible rows). Best-effort: login still succeeds if it fails.
        if (!token.currentOrgId) {
          try {
            const { ensurePersonalOrg } = await import("@/lib/org/ensure-personal-org");
            token.currentOrgId = await ensurePersonalOrg(
              userId,
              dbUser?.name ?? dbUser?.email ?? null,
            );
          } catch {
            token.currentOrgId = null;
          }
        }
      }
      return token;
    },
    session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
        session.user.onboardingCompleted = (token.onboardingCompleted as boolean | undefined) ?? false;
        session.user.currentOrgId = (token.currentOrgId as string | null | undefined) ?? null;
      }
      return session;
    },
  },
});
