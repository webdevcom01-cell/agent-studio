/**
 * GDPR Data Export — generates a JSON archive of all user data.
 *
 * Returns a structured object that can be serialized to ZIP.
 * Rate limited: once per 24 hours per user.
 */

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export interface ExportData {
  user: Record<string, unknown>;
  agents: Record<string, unknown>[];
  conversations: Record<string, unknown>[];
  knowledgeSources: Record<string, unknown>[];
  evalSuites: Record<string, unknown>[];
  exportedAt: string;
}


export async function generateUserExport(userId: string): Promise<ExportData> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
      createdAt: true,
    },
  });

  const agents = await prisma.agent.findMany({
    where: { userId },
    include: {
      flow: { select: { content: true } },
    },
  });

  const agentIds = agents.map((a) => a.id);

  const conversations = await prisma.conversation.findMany({
    where: { agentId: { in: agentIds } },
    include: {
      messages: {
        select: { role: true, content: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 1000,
  });

  const kbSources = await prisma.kBSource.findMany({
    where: { knowledgeBase: { agentId: { in: agentIds } } },
    select: { id: true, type: true, status: true },
  });

  const evalSuites = await prisma.evalSuite.findMany({
    where: { agentId: { in: agentIds } },
    include: {
      testCases: { select: { label: true, input: true, assertions: true } },
    },
  });

  logger.info("User data export generated", {
    userId,
    agentCount: agents.length,
    conversationCount: conversations.length,
  });

  return {
    user: user as unknown as Record<string, unknown>,
    agents: agents.map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description,
      systemPrompt: a.systemPrompt,
      model: a.model,
      category: a.category,
      tags: a.tags,
      flow: a.flow?.content,
      createdAt: a.createdAt,
    })),
    conversations: conversations.map((c) => ({
      id: c.id,
      agentId: c.agentId,
      status: c.status,
      messages: c.messages,
      createdAt: c.createdAt,
    })),
    knowledgeSources: kbSources,
    evalSuites: evalSuites.map((s) => ({
      id: s.id,
      name: s.name,
      agentId: s.agentId,
      testCases: s.testCases,
    })),
    exportedAt: new Date().toISOString(),
  };
}

