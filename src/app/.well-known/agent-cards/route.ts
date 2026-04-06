import { NextRequest, NextResponse } from "next/server";
import { listPublicAgentCards } from "@/lib/a2a/card-generator";
import { logger } from "@/lib/logger";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const baseUrl = new URL(req.url).origin;
    const cards = await listPublicAgentCards(baseUrl);

    return NextResponse.json(
      { agents: cards, count: cards.length },
      {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=60",
        },
      },
    );
  } catch (err) {
    logger.error("Failed to list public agent cards", err, {});
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
