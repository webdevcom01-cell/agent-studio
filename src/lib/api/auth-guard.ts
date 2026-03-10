import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const cuidSchema = z.string().cuid();

interface AuthResult {
  userId: string;
}

interface AgentOwnerResult extends AuthResult {
  agentId: string;
}

function unauthorized(): NextResponse {
  return NextResponse.json(
    { success: false, error: "Unauthorized" },
    { status: 401 }
  );
}

function forbidden(): NextResponse {
  return NextResponse.json(
    { success: false, error: "Forbidden" },
    { status: 403 }
  );
}

function agentNotFound(): NextResponse {
  return NextResponse.json(
    { success: false, error: "Agent not found" },
    { status: 404 }
  );
}

export async function requireAuth(): Promise<AuthResult | NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return unauthorized();
  }
  return { userId: session.user.id };
}

export async function requireAgentOwner(
  agentId: string
): Promise<AgentOwnerResult | NextResponse> {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  if (!cuidSchema.safeParse(agentId).success) {
    return agentNotFound();
  }

  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { userId: true },
  });

  if (!agent) {
    return agentNotFound();
  }

  if (agent.userId && agent.userId !== authResult.userId) {
    return forbidden();
  }

  return { userId: authResult.userId, agentId };
}

export function isAuthError(
  result: AuthResult | AgentOwnerResult | NextResponse
): result is NextResponse {
  return result instanceof NextResponse;
}
