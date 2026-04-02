import { NextRequest, NextResponse } from "next/server";
import { prisma, measureReplicationLag } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { isECCEnabled } from "@/lib/ecc";
import { getRedis, isRedisConfigured } from "@/lib/redis";
import { randomBytes } from "crypto";
import { isEncryptionConfigured } from "@/lib/crypto";

export const dynamic = "force-dynamic";

/** Stable per-process replica ID — survives requests but changes on redeploy. */
const REPLICA_ID = randomBytes(4).toString("hex");

interface ECCStatus {
  enabled: boolean;
  skillCount: number;
  mcpUrl: string | null;
}

async function getECCStatus(): Promise<ECCStatus> {
  const enabled = isECCEnabled();
  let skillCount = 0;

  if (enabled) {
    try {
      skillCount = await prisma.skill.count();
    } catch {
      // Non-critical — report 0
    }
  }

  return {
    enabled,
    skillCount,
    mcpUrl: process.env.ECC_MCP_URL ?? null,
  };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const clientIp =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  const rateResult = checkRateLimit(`health:${clientIp}`, 30);
  if (!rateResult.allowed) {
    return NextResponse.json(
      { success: false, error: "Too many requests" },
      { status: 429 }
    );
  }

  const timestamp = new Date().toISOString();
  let dbStatus: "ok" | "fail" = "fail";

  try {
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = "ok";
  } catch {
    // DB unreachable
  }

  const ecc = await getECCStatus();

  let redisStatus: "ok" | "not-configured" | "fail" = "not-configured";
  if (isRedisConfigured()) {
    try {
      const redis = await getRedis();
      redisStatus = redis ? "ok" : "fail";
    } catch {
      redisStatus = "fail";
    }
  }

  const replicationLagMs = dbStatus === "ok" ? await measureReplicationLag() : null;

  const status = dbStatus === "ok" ? "healthy" : "degraded";
  const statusCode = dbStatus === "ok" ? 200 : 503;

  // Temporary auth diagnostics — add ?authDebug=1 to health endpoint
  // DELETE THIS BLOCK after OAuth Configuration error is resolved
  let authDebug: Record<string, unknown> | undefined;
  if (request.nextUrl.searchParams.get("authDebug") === "1") {
    authDebug = {
      envVars: {
        AUTH_SECRET: !!process.env.AUTH_SECRET,
        AUTH_SECRET_LENGTH: process.env.AUTH_SECRET?.length ?? 0,
        NEXTAUTH_URL: process.env.NEXTAUTH_URL ?? "NOT_SET",
        AUTH_URL: process.env.AUTH_URL ?? "NOT_SET",
        AUTH_TRUST_HOST: process.env.AUTH_TRUST_HOST ?? "NOT_SET",
        AUTH_GITHUB_ID: !!process.env.AUTH_GITHUB_ID,
        AUTH_GITHUB_SECRET: !!process.env.AUTH_GITHUB_SECRET,
        AUTH_GITHUB_SECRET_LENGTH: process.env.AUTH_GITHUB_SECRET?.length ?? 0,
        AUTH_GOOGLE_ID: !!process.env.AUTH_GOOGLE_ID,
        AUTH_GOOGLE_SECRET: !!process.env.AUTH_GOOGLE_SECRET,
        OAUTH_ENCRYPTION_KEY: isEncryptionConfigured("OAUTH_ENCRYPTION_KEY"),
        AUTH_OIDC_ISSUER: !!process.env.AUTH_OIDC_ISSUER,
        NODE_ENV: process.env.NODE_ENV,
      },
    };

    // Test adapter methods if DB is up
    if (dbStatus === "ok") {
      try {
        const userCount = await prisma.user.count();
        const accountCount = await prisma.account.count();
        const accounts = await prisma.account.findMany({
          select: { provider: true, providerAccountId: true, tokensEncrypted: true },
          take: 5,
        });
        authDebug.db = {
          userCount,
          accountCount,
          accounts: accounts.map((a) => ({
            provider: a.provider,
            pid: a.providerAccountId.slice(0, 6) + "...",
            encrypted: a.tokensEncrypted,
          })),
        };
      } catch (err) {
        authDebug.db = { error: String(err) };
      }

      // Test adapter creation + getUserByAccount
      try {
        const { createEncryptedAdapter } = await import("@/lib/auth-adapter");
        const adapter = createEncryptedAdapter();
        const methods = Object.keys(adapter);
        const testResult = await adapter.getUserByAccount?.({
          provider: "github",
          providerAccountId: "__test_nonexistent__",
        });
        authDebug.adapter = {
          ok: true,
          methodCount: methods.length,
          getUserByAccountResult: testResult ?? "null (expected)",
        };
      } catch (err) {
        authDebug.adapter = { ok: false, error: String(err), stack: err instanceof Error ? err.stack : undefined };
      }
    }
  }

  return NextResponse.json(
    {
      status,
      version: process.env.npm_package_version ?? "0.1.0",
      replicaId: REPLICA_ID,
      db: dbStatus,
      dbReadReplica: process.env.DATABASE_READ_URL ? "configured" : "not-configured",
      replicationLagMs,
      redis: redisStatus,
      ecc: {
        enabled: ecc.enabled,
        skills: ecc.skillCount,
        mcp: ecc.mcpUrl ? "configured" : "not-configured",
      },
      timestamp,
      ...(authDebug ? { authDebug } : {}),
    },
    { status: statusCode }
  );
}
