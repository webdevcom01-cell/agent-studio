import { NextRequest, NextResponse } from "next/server";
import { prisma, measureReplicationLag } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { isECCEnabled } from "@/lib/ecc";
import { getRedis, isRedisConfigured } from "@/lib/redis";
import { randomBytes } from "crypto";

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
    },
    { status: statusCode }
  );
}
