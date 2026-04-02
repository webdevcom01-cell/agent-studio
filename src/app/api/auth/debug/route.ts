/**
 * Temporary auth debug endpoint — diagnoses NextAuth Configuration errors.
 * Tests adapter connectivity, provider config, and env vars.
 * DELETE THIS FILE after debugging is complete.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createEncryptedAdapter } from "@/lib/auth-adapter";

export async function GET() {
  const checks: Record<string, unknown> = {};

  // 1. Check critical env vars (existence only, never values)
  checks.envVars = {
    AUTH_SECRET: !!process.env.AUTH_SECRET,
    AUTH_SECRET_LENGTH: process.env.AUTH_SECRET?.length ?? 0,
    AUTH_GITHUB_ID: !!process.env.AUTH_GITHUB_ID,
    AUTH_GITHUB_SECRET: !!process.env.AUTH_GITHUB_SECRET,
    AUTH_GOOGLE_ID: !!process.env.AUTH_GOOGLE_ID,
    AUTH_GOOGLE_SECRET: !!process.env.AUTH_GOOGLE_SECRET,
    OAUTH_ENCRYPTION_KEY: !!process.env.OAUTH_ENCRYPTION_KEY,
    NODE_ENV: process.env.NODE_ENV,
  };

  // 2. Test database connectivity (Account table)
  try {
    const count = await prisma.account.count();
    checks.database = { ok: true, accountCount: count };
  } catch (error) {
    checks.database = { ok: false, error: String(error) };
  }

  // 3. Test adapter creation
  try {
    const adapter = createEncryptedAdapter();
    checks.adapter = {
      ok: true,
      methods: Object.keys(adapter),
      hasLinkAccount: typeof adapter.linkAccount === "function",
      hasCreateUser: typeof adapter.createUser === "function",
      hasGetUserByAccount: typeof adapter.getUserByAccount === "function",
    };
  } catch (error) {
    checks.adapter = { ok: false, error: String(error) };
  }

  // 4. Test adapter.getUserByAccount (the method called during OAuth callback)
  try {
    const adapter = createEncryptedAdapter();
    const result = await adapter.getUserByAccount?.({
      provider: "github",
      providerAccountId: "__test_nonexistent__",
    });
    checks.getUserByAccount = { ok: true, result: result ?? "null (expected for non-existent)" };
  } catch (error) {
    checks.getUserByAccount = { ok: false, error: String(error), stack: error instanceof Error ? error.stack : undefined };
  }

  // 5. Check User table
  try {
    const userCount = await prisma.user.count();
    checks.users = { ok: true, count: userCount };
  } catch (error) {
    checks.users = { ok: false, error: String(error) };
  }

  // 6. Check if there are existing accounts for current providers
  try {
    const accounts = await prisma.account.findMany({
      select: { provider: true, providerAccountId: true, tokensEncrypted: true },
      take: 5,
    });
    checks.existingAccounts = accounts.map((a) => ({
      provider: a.provider,
      providerAccountId: a.providerAccountId.slice(0, 4) + "...",
      tokensEncrypted: a.tokensEncrypted,
    }));
  } catch (error) {
    checks.existingAccounts = { ok: false, error: String(error) };
  }

  return NextResponse.json({ success: true, data: checks });
}
