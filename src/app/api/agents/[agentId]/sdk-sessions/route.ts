import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAgentOwner, isAuthError } from "@/lib/api/auth-guard";
import { logger } from "@/lib/logger";
import {
  listSdkSessions,
  createSdkSession,
} from "@/lib/sdk-sessions/persistence";

// ---------------------------------------------------------------------------
// GET /api/agents/[agentId]/sdk-sessions — List SDK sessions
// ---------------------------------------------------------------------------

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;
  const authResult = await requireAgentOwner(agentId);
  if (isAuthError(authResult)) return authResult;

  try {
    const url = new URL(req.url);
    const status = url.searchParams.get("status") as
      | "ACTIVE"
      | "COMPLETED"
      | "ABANDONED"
      | null;
    const limit = Math.min(
      parseInt(url.searchParams.get("limit") ?? "20", 10),
      100
    );
    const offset = parseInt(url.searchParams.get("offset") ?? "0", 10);

    const result = await listSdkSessions(agentId, {
      status: status ?? undefined,
      limit,
      offset,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    logger.error("Failed to list SDK sessions", { agentId, error });
    return NextResponse.json(
      { success: false, error: "Failed to list sessions" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/agents/[agentId]/sdk-sessions — Create a new SDK session
// ---------------------------------------------------------------------------

const CreateSessionSchema = z.object({
  title: z.string().max(200).optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant", "system"]),
        content: z.string(),
      })
    )
    .optional(),
  metadata: z.record(z.unknown()).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;
  const authResult = await requireAgentOwner(agentId);
  if (isAuthError(authResult)) return authResult;
  const { userId } = authResult;

  try {
    const body: unknown = await req.json();
    const parsed = CreateSessionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.message },
        { status: 422 }
      );
    }

    const session = await createSdkSession({
      agentId,
      userId,
      title: parsed.data.title,
      messages: parsed.data.messages,
      metadata: parsed.data.metadata,
    });

    return NextResponse.json({ success: true, data: session }, { status: 201 });
  } catch (error) {
    logger.error("Failed to create SDK session", { agentId, error });
    return NextResponse.json(
      { success: false, error: "Failed to create session" },
      { status: 500 }
    );
  }
}
