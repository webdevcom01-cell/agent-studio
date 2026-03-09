import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";

const createServerSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  url: z.string().url("Must be a valid URL"),
  transport: z.enum(["STREAMABLE_HTTP", "SSE"]).optional().default("STREAMABLE_HTTP"),
  headers: z.record(z.string()).optional(),
});

export async function GET(): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const servers = await prisma.mCPServer.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        url: true,
        transport: true,
        enabled: true,
        toolsCache: true,
        createdAt: true,
        _count: { select: { agents: true } },
      },
    });

    return NextResponse.json({ success: true, data: servers });
  } catch (err) {
    logger.error("Failed to list MCP servers", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { success: false, error: "Failed to list MCP servers" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const rateResult = checkRateLimit(`create-mcp:${session.user.id}`, 10);
    if (!rateResult.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many requests" },
        { status: 429 }
      );
    }

    const body = await request.json();
    const parsed = createServerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0].message },
        { status: 400 },
      );
    }

    const server = await prisma.mCPServer.create({
      data: {
        name: parsed.data.name,
        url: parsed.data.url,
        transport: parsed.data.transport,
        headers: parsed.data.headers ?? undefined,
        userId: session.user.id,
      },
    });

    return NextResponse.json({ success: true, data: server }, { status: 201 });
  } catch (err) {
    logger.error("Failed to create MCP server", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { success: false, error: "Failed to create MCP server" },
      { status: 500 },
    );
  }
}
