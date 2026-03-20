import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import { createEncryptedAdapter } from "@/lib/auth-adapter";

const providers = [
  ...(process.env.AUTH_GITHUB_ID ? [GitHub] : []),
  ...(process.env.AUTH_GOOGLE_ID ? [Google] : []),
];

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: createEncryptedAdapter(),
  session: { strategy: "jwt", maxAge: 24 * 60 * 60 },
  providers,
  trustHost: true,
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
