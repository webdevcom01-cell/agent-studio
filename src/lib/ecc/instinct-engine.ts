import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

const PROMOTION_THRESHOLD = 0.85;
const MAX_INSTINCTS_PER_EVOLVE = 20;

export interface InstinctSummary {
  id: string;
  name: string;
  description: string;
  confidence: number;
  frequency: number;
  agentId: string;
  promotedToSkillId: string | null;
}

export interface PromotionCandidate {
  instinct: InstinctSummary;
  skillSlug: string;
}

export async function getPromotionCandidates(
  agentId?: string
): Promise<PromotionCandidate[]> {
  const where: Record<string, unknown> = {
    confidence: { gte: PROMOTION_THRESHOLD },
    promotedToSkillId: null,
  };
  if (agentId) {
    where.agentId = agentId;
  }

  const instincts = await prisma.instinct.findMany({
    where,
    orderBy: { confidence: "desc" },
    take: MAX_INSTINCTS_PER_EVOLVE,
    select: {
      id: true,
      name: true,
      description: true,
      confidence: true,
      frequency: true,
      agentId: true,
      promotedToSkillId: true,
    },
  });

  return instincts.map((inst) => ({
    instinct: inst,
    skillSlug: `instinct-${inst.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
  }));
}

export async function promoteInstinctToSkill(
  instinctId: string,
  skillContent: string
): Promise<{ skillId: string }> {
  const instinct = await prisma.instinct.findUniqueOrThrow({
    where: { id: instinctId },
  });

  if (instinct.promotedToSkillId) {
    return { skillId: instinct.promotedToSkillId };
  }

  const slug = `instinct-${instinct.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;

  const skill = await prisma.skill.upsert({
    where: { slug },
    create: {
      slug,
      name: instinct.name,
      description: instinct.description,
      content: skillContent,
      version: "1.0.0",
      category: "learned",
      eccOrigin: false,
      tags: ["instinct", "auto-generated"],
    },
    update: {
      description: instinct.description,
      content: skillContent,
      version: "1.0.0",
    },
  });

  await prisma.instinct.update({
    where: { id: instinctId },
    data: { promotedToSkillId: skill.id },
  });

  logger.info("Instinct promoted to skill", {
    instinctId,
    skillId: skill.id,
    slug,
    confidence: instinct.confidence,
  });

  return { skillId: skill.id };
}

export async function decayStaleInstincts(
  maxAgeDays: number = 30
): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - maxAgeDays);

  const stale = await prisma.instinct.findMany({
    where: {
      updatedAt: { lt: cutoff },
      promotedToSkillId: null,
      confidence: { lt: PROMOTION_THRESHOLD },
    },
    select: { id: true, confidence: true },
  });

  let decayed = 0;
  for (const inst of stale) {
    const newConfidence = Math.max(0, inst.confidence - 0.05);
    await prisma.instinct.update({
      where: { id: inst.id },
      data: { confidence: newConfidence },
    });
    decayed++;
  }

  if (decayed > 0) {
    logger.info("Decayed stale instincts", { count: decayed });
  }

  return decayed;
}
