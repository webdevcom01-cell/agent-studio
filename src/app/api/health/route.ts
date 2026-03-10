import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

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

  const status = dbStatus === "ok" ? "healthy" : "degraded";
  const statusCode = dbStatus === "ok" ? 200 : 503;

  return NextResponse.json(
    {
      status,
      version: process.env.npm_package_version ?? "0.1.0",
      db: dbStatus,
      timestamp,
    },
    { status: statusCode }
  );
}
