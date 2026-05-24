import { prisma } from "@/lib/prisma";
import { withOrgContext } from "@/lib/db/rls-middleware";
import { Prisma } from "@/generated/prisma";

export async function getContext(
  agentId: string,
  organizationId?: string | null,
): Promise<Record<string, unknown>> {
  const items = await withOrgContext(prisma, organizationId ?? null, (tx) =>
    tx.heartbeatContext.findMany({
      where: {
        agentId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { key: true, value: true },
    })
  );

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

  await withOrgContext(prisma, organizationId, (tx) =>
    tx.heartbeatContext.upsert({
      where: { agentId_key: { agentId, key } },
      update: { value: jsonValue, expiresAt, ttlSeconds: ttlSeconds ?? null },
      create: { agentId, organizationId, key, value: jsonValue, ttlSeconds: ttlSeconds ?? null, expiresAt },
    })
  );
}

export async function deleteContext(
  agentId: string,
  key: string,
  organizationId?: string | null,
): Promise<void> {
  await withOrgContext(prisma, organizationId ?? null, (tx) =>
    tx.heartbeatContext.deleteMany({ where: { agentId, key } })
  );
}

export async function pruneContext(
  agentId: string,
  organizationId?: string | null,
): Promise<number> {
  const result = await withOrgContext(prisma, organizationId ?? null, (tx) =>
    tx.heartbeatContext.deleteMany({
      where: { agentId, expiresAt: { lt: new Date() } },
    })
  );
  return result.count;
}

export async function buildContextPrompt(
  agentId: string,
  organizationId?: string | null,
): Promise<string> {
  const context = await getContext(agentId, organizationId);
  const keys = Object.keys(context);

  if (keys.length === 0) return "";

  const lines = keys.map((key) => `${key}: ${JSON.stringify(context[key])}`);

  return ["--- Agent Memory (from previous heartbeat runs) ---", ...lines, "---"].join("\n");
}

/**
 * Batch helper for the BullMQ heartbeat worker hot path.
 * Prune expired items, read active items, and build the context prompt in a
 * single withOrgContext transaction — one SET call instead of three.
 */
export async function processContextForRun(
  agentId: string,
  organizationId: string | null,
): Promise<{ snapshot: Record<string, unknown>; prompt: string }> {
  return withOrgContext(prisma, organizationId, async (tx) => {
    await tx.heartbeatContext.deleteMany({
      where: { agentId, expiresAt: { lt: new Date() } },
    });

    const items = await tx.heartbeatContext.findMany({
      where: { agentId, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      select: { key: true, value: true },
    });

    const snapshot = Object.fromEntries(items.map((i) => [i.key, i.value]));
    const keys = Object.keys(snapshot);
    const prompt =
      keys.length === 0
        ? ""
        : [
            "--- Agent Memory (from previous heartbeat runs) ---",
            ...keys.map((k) => `${k}: ${JSON.stringify(snapshot[k])}`),
            "---",
          ].join("\n");

    return { snapshot, prompt };
  });
}
