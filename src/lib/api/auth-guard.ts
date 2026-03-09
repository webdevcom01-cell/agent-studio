import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

interface AuthResult {
  userId: string;
}

interface AgentOwnerResult extends AuthResult {
  agentId: string;
}

const UNAUTHORIZED = NextResponse.json(
  { success: false, error: "Unauthorized" },
  { status: 401 }
);

const FORBIDDEN = NextResponse.json(
  { success: false, error: "Forbidden" },
  { status: 403 }
);

const AGENT_NOT_FOUND = NextResponse.json(
  { success: false, error: "Agent not found" },
  { status: 404 }
);

export async function requireAuth(): Promise<AuthResult | NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return UNAUTHORIZED;
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

  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { userId: true },
  });

  if (!agent) {
    return AGENT_NOT_FOUND;
  }

  if (agent.userId && agent.userId !== authResult.userId) {
    return FORBIDDEN;
  }

  return { userId: authResult.userId, agentId };
}

export function isAuthError(
  result: AuthResult | AgentOwnerResult | NextResponse
): result is NextResponse {
  return result instanceof NextResponse;
}
