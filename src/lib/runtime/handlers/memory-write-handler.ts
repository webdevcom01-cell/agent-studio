import type { NodeHandler } from "../types";
import { resolveTemplate } from "../template";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

const MAX_MEMORIES_PER_AGENT = 1000;

export const memoryWriteHandler: NodeHandler = async (node, context) => {
  const keyTemplate = (node.data.key as string) ?? "";
  const valueTemplate = (node.data.value as string) ?? "";
  const category = (node.data.category as string) ?? "general";
  const importance = Math.min(1, Math.max(0, Number(node.data.importance) || 0.5));
  const generateEmbedding = (node.data.generateEmbedding as boolean) ?? false;

  if (!keyTemplate.trim()) {
    return {
      messages: [
        {
          role: "assistant",
          content: "Memory write failed: no key specified.",
        },
      ],
      nextNodeId: null,
      waitForInput: false,
    };
  }

  const key = resolveTemplate(keyTemplate, context.variables);
  const resolvedValue = resolveTemplate(valueTemplate, context.variables);

  // Parse value as JSON if possible, otherwise store as string
  let storedValue: unknown;
  try {
    storedValue = JSON.parse(resolvedValue);
  } catch {
    storedValue = resolvedValue;
  }

  try {
    // Check memory limit
    const memoryCount = await prisma.agentMemory.count({
      where: { agentId: context.agentId },
    });

    if (memoryCount >= MAX_MEMORIES_PER_AGENT) {
      // Delete oldest least-accessed memory to make room
      const oldest = await prisma.agentMemory.findFirst({
        where: { agentId: context.agentId },
        orderBy: [{ importance: "asc" }, { accessedAt: "asc" }],
        select: { id: true },
      });

      if (oldest) {
        await prisma.agentMemory.delete({ where: { id: oldest.id } });
      }
    }

    // Apply merge strategy
    const mergeStrategy = (node.data.mergeStrategy as string) ?? "replace";
    const maxLength = (node.data.maxLength as number) ?? 0;

    if (mergeStrategy !== "replace") {
      const existing = await prisma.agentMemory.findUnique({
        where: { agentId_key: { agentId: context.agentId, key } },
        select: { value: true },
      });

      const existingValue = existing?.value as unknown;
      storedValue = applyMerge(mergeStrategy, existingValue, storedValue, maxLength);

      logger.info("Memory merge applied", {
        agentId: context.agentId,
        key,
        strategy: mergeStrategy,
      });
    }

    // Generate embedding if requested
    let embeddingData: number[] | undefined;
    if (generateEmbedding) {
      try {
        const { getEmbeddingModel } = await import("@/lib/ai");
        const { embed } = await import("ai");
        const embeddingModel = getEmbeddingModel();

        const embeddingText = typeof storedValue === "string"
          ? storedValue
          : JSON.stringify(storedValue);

        const { embedding } = await embed({
          model: embeddingModel,
          value: embeddingText,
        });

        embeddingData = embedding;
      } catch (embError) {
        logger.warn("Failed to generate embedding for memory", {
          agentId: context.agentId,
          key,
          error: embError instanceof Error ? embError.message : String(embError),
        });
        // Continue without embedding — non-critical
      }
    }

    // Upsert memory
    if (embeddingData) {
      // Use raw SQL for vector field
      const vectorStr = `[${embeddingData.join(",")}]`;
      await prisma.$executeRawUnsafe(
        `INSERT INTO "AgentMemory" (id, "agentId", key, value, category, importance, embedding, "accessCount", "createdAt", "updatedAt", "accessedAt")
         VALUES (gen_random_uuid(), $1, $2, $3::jsonb, $4, $5, $6::vector, 0, NOW(), NOW(), NOW())
         ON CONFLICT ("agentId", key) DO UPDATE SET
           value = $3::jsonb,
           category = $4,
           importance = $5,
           embedding = $6::vector,
           "updatedAt" = NOW()`,
        context.agentId,
        key,
        JSON.stringify(storedValue),
        category,
        importance,
        vectorStr
      );
    } else {
      await prisma.agentMemory.upsert({
        where: {
          agentId_key: {
            agentId: context.agentId,
            key,
          },
        },
        create: {
          agentId: context.agentId,
          key,
          value: storedValue as object,
          category,
          importance,
        },
        update: {
          value: storedValue as object,
          category,
          importance,
        },
      });
    }

    logger.info("Memory written", {
      agentId: context.agentId,
      key,
      category,
      hasEmbedding: !!embeddingData,
    });

    return {
      messages: [],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: {
        __last_memory_write: { key, category, success: true },
      },
    };
  } catch (error) {
    logger.error("Memory write failed", error, {
      agentId: context.agentId,
      key,
    });

    return {
      messages: [
        {
          role: "assistant",
          content: "I had trouble saving that to memory, but I'll continue.",
        },
      ],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: {
        __last_memory_write: { key, category, success: false },
      },
    };
  }
};

function applyMerge(
  strategy: string,
  existing: unknown,
  incoming: unknown,
  maxLength: number,
): unknown {
  switch (strategy) {
    case "merge_object": {
      if (isPlainObject(existing) && isPlainObject(incoming)) {
        return { ...(existing as Record<string, unknown>), ...(incoming as Record<string, unknown>) };
      }
      return incoming;
    }

    case "deep_merge": {
      if (isPlainObject(existing) && isPlainObject(incoming)) {
        return deepMerge(existing as Record<string, unknown>, incoming as Record<string, unknown>);
      }
      return incoming;
    }

    case "append_array": {
      const existingArr = Array.isArray(existing)
        ? existing
        : existing != null
          ? [existing]
          : [];
      const incomingArr = Array.isArray(incoming) ? incoming : [incoming];
      const merged = [...existingArr, ...incomingArr];
      if (maxLength > 0 && merged.length > maxLength) {
        return merged.slice(-maxLength);
      }
      return merged;
    }

    case "increment": {
      const existingNum = typeof existing === "number" ? existing : 0;
      const incomingNum = typeof incoming === "number" ? incoming : Number(incoming) || 0;
      return existingNum + incomingNum;
    }

    default:
      return incoming;
  }
}

function isPlainObject(val: unknown): boolean {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (isPlainObject(target[key]) && isPlainObject(source[key])) {
      result[key] = deepMerge(
        target[key] as Record<string, unknown>,
        source[key] as Record<string, unknown>,
      );
    } else {
      result[key] = source[key];
    }
  }
  return result;
}
