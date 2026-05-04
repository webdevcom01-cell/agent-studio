import { prisma } from "@/lib/prisma";
import type { AgentPermissionGrant } from "@/generated/prisma";

export async function getAgentAncestors(agentId: string, maxDepth = 10): Promise<string[]> {
  const ancestors: string[] = [];
  let currentId = agentId;

  for (let depth = 0; depth < maxDepth; depth++) {
    const agent = await prisma.agent.findUnique({
      where: { id: currentId },
      select: { parentAgentId: true },
    });

    if (!agent?.parentAgentId) break;

    ancestors.push(agent.parentAgentId);
    currentId = agent.parentAgentId;
  }

  return ancestors;
}

export async function getAgentDescendants(agentId: string, maxDepth = 10): Promise<string[]> {
  const descendants: string[] = [];
  const queue: Array<{ id: string; depth: number }> = [{ id: agentId, depth: 0 }];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || current.depth >= maxDepth) continue;

    const children = await prisma.agent.findMany({
      where: { parentAgentId: current.id },
      select: { id: true },
    });

    for (const child of children) {
      descendants.push(child.id);
      queue.push({ id: child.id, depth: current.depth + 1 });
    }
  }

  return descendants;
}

export async function checkA2APermission(
  agentId: string,
  permission: string,
  scope?: string,
): Promise<{ allowed: boolean; grantedBy?: string }> {
  const ancestors = await getAgentAncestors(agentId);

  if (ancestors.length === 0) return { allowed: false };

  const scopeCondition = scope
    ? { OR: [{ scope: null as string | null }, { scope }] }
    : { scope: null as string | null };

  const grant = await prisma.agentPermissionGrant.findFirst({
    where: {
      granteeAgentId: agentId,
      grantorAgentId: { in: ancestors },
      permission,
      AND: [
        scopeCondition,
        { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      ],
    },
    select: { grantorAgentId: true },
  });

  if (grant) return { allowed: true, grantedBy: grant.grantorAgentId };
  return { allowed: false };
}

export async function grantPermission(
  grantorAgentId: string,
  granteeAgentId: string,
  organizationId: string,
  permission: string,
  scope?: string,
  expiresAt?: Date,
): Promise<AgentPermissionGrant> {
  const ancestors = await getAgentAncestors(granteeAgentId);

  if (!ancestors.includes(grantorAgentId)) {
    throw new Error("Grantor must be an ancestor of grantee to delegate permissions");
  }

  return prisma.agentPermissionGrant.create({
    data: {
      grantorAgentId,
      granteeAgentId,
      organizationId,
      permission,
      scope: scope ?? null,
      expiresAt: expiresAt ?? null,
    },
  });
}
