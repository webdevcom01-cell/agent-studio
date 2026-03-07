import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
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
