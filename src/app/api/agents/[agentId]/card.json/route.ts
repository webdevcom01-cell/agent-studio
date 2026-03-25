import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

interface RouteParams {
  params: Promise<{ agentId: string }>;
}

interface A2ACardV03 {
  "@context": string;
  "@type": string;
  name: string;
  description: string;
  url: string;
  version: string;
  capabilities: {
    streaming: boolean;
    pushNotifications: boolean;
  };
  skills: {
    id: string;
    name: string;
    description: string;
    inputModes: string[];
    outputModes: string[];
  }[];
  authentication: {
    schemes: string[];
  };
}

export async function GET(
  req: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { agentId } = await params;

    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      select: {
        id: true,
        name: true,
        description: true,
        isPublic: true,
        tags: true,
        category: true,
      },
    });

    if (!agent) {
      return NextResponse.json(
        { error: "Agent not found" },
        { status: 404 }
      );
    }

    if (!agent.isPublic) {
      return NextResponse.json(
        { error: "Agent card not available" },
        { status: 403 }
      );
    }

    const baseUrl = new URL(req.url).origin;

    const card: A2ACardV03 = {
      "@context": "https://schema.org",
      "@type": "SoftwareAgent",
      name: agent.name,
      description: agent.description ?? "",
      url: `${baseUrl}/api/agents/${agent.id}/a2a`,
      version: "0.3",
      capabilities: {
        streaming: true,
        pushNotifications: false,
      },
      skills: [
        {
          id: "chat",
          name: `Chat with ${agent.name}`,
          description: agent.description ?? `Interact with ${agent.name}`,
          inputModes: ["text"],
          outputModes: ["text"],
        },
      ],
      authentication: {
        schemes: ["none"],
      },
    };

    return NextResponse.json(card, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (err) {
    logger.error("Failed to generate A2A card", err, {});
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
