import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import { createEncryptedAdapter } from "@/lib/auth-adapter";

const providers = [
  ...(process.env.AUTH_GITHUB_ID ? [GitHub] : []),
  ...(process.env.AUTH_GOOGLE_ID ? [Google] : []),
];

// NextAuth v5 Stabilization (P2-T2):
// Pin cookie names explicitly so NextAuth beta updates don't change them silently.
// These must match PRIMARY_SESSION_COOKIES in src/middleware.ts.
// Current version: next-auth@5.0.0-beta.30
const NEXTAUTH_COOKIE_PREFIX = "authjs";

export const { handlers, auth, signIn, signOut } = NextAuth({
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
