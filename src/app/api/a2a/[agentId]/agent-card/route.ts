import { NextRequest, NextResponse } from "next/server";
import { generateAgentCardV03 } from "@/lib/a2a/card-generator";
import { logger } from "@/lib/logger";

interface RouteParams {
  params: Promise<{ agentId: string }>;
}

export async function GET(
  req: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    const { agentId } = await params;
    const baseUrl = new URL(req.url).origin;
    const card = await generateAgentCardV03(agentId, baseUrl);

    return NextResponse.json(card, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";

    if (message === "Agent not found") {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }
    if (message === "Agent card not public") {
      return NextResponse.json({ error: "Agent card not available" }, { status: 403 });
    }

    logger.error("Failed to generate A2A v0.3 agent card", err, {});
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
