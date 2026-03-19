import { prisma } from "@/lib/prisma";
import type { AccessLevel } from "@/generated/prisma";

const ACCESS_HIERARCHY: Record<string, number> = {
  READ: 1,
  EXECUTE: 2,
  ADMIN: 3,
};

export async function checkSkillAccess(
  agentId: string,
  skillId: string,
  requiredLevel: AccessLevel
): Promise<boolean> {
  const permission = await prisma.agentSkillPermission.findUnique({
    where: {
      agentId_skillId: { agentId, skillId },
    },
    select: { accessLevel: true },
  });

  if (!permission) return false;

  const grantedRank = ACCESS_HIERARCHY[permission.accessLevel] ?? 0;
  const requiredRank = ACCESS_HIERARCHY[requiredLevel] ?? 0;

  return grantedRank >= requiredRank;
}

export async function grantSkillAccess(
  agentId: string,
  skillId: string,
  level: AccessLevel
): Promise<void> {
  await prisma.agentSkillPermission.upsert({
    where: {
      agentId_skillId: { agentId, skillId },
    },
    create: { agentId, skillId, accessLevel: level },
    update: { accessLevel: level },
  });
}

export async function revokeSkillAccess(
  agentId: string,
  skillId: string
): Promise<void> {
  await prisma.agentSkillPermission.deleteMany({
    where: { agentId, skillId },
  });
}

export async function getAgentSkills(
  agentId: string
): Promise<{ skillId: string; accessLevel: AccessLevel }[]> {
  const permissions = await prisma.agentSkillPermission.findMany({
    where: { agentId },
    select: { skillId: true, accessLevel: true },
  });
  return permissions;
}
