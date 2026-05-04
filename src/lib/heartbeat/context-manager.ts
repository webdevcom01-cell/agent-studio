import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma";

export async function getContext(agentId: string): Promise<Record<string, unknown>> {
  const items = await prisma.heartbeatContext.findMany({
    where: {
      agentId,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: { key: true, value: true },
  });

  return Object.fromEntries(items.map((item) => [item.key, item.value]));
}

export async function setContext(
  agentId: string,
  organizationId: string,
  key: string,
  value: unknown,
  ttlSeconds?: number,
): Promise<void> {
  const expiresAt = ttlSeconds ? new Date(Date.now() + ttlSeconds * 1000) : null;
  const jsonValue = value as Prisma.InputJsonValue;

  await prisma.heartbeatContext.upsert({
    where: { agentId_key: { agentId, key } },
    update: { value: jsonValue, expiresAt, ttlSeconds: ttlSeconds ?? null },
    create: { agentId, organizationId, key, value: jsonValue, ttlSeconds: ttlSeconds ?? null, expiresAt },
  });
}

export async function deleteContext(agentId: string, key: string): Promise<void> {
  await prisma.heartbeatContext.deleteMany({ where: { agentId, key } });
}

export async function pruneContext(agentId: string): Promise<number> {
  const result = await prisma.heartbeatContext.deleteMany({
    where: { agentId, expiresAt: { lt: new Date() } },
  });
  return result.count;
}

export async function buildContextPrompt(agentId: string): Promise<string> {
  const context = await getContext(agentId);
  const keys = Object.keys(context);

  if (keys.length === 0) return "";

  const lines = keys.map((key) => `${key}: ${JSON.stringify(context[key])}`);

  return ["--- Agent Memory (from previous heartbeat runs) ---", ...lines, "---"].join("\n");
}
