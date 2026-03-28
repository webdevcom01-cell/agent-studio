import type { NodeHandler } from "../types";
import { resolveTemplate } from "../template";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

const MAX_RESULTS = 50;

export const memoryReadHandler: NodeHandler = async (node, context) => {
  const mode = (node.data.mode as string) ?? "key"; // key | category | search
  const keyTemplate = (node.data.key as string) ?? "";
  const category = (node.data.category as string) ?? "";
  const searchQuery = (node.data.searchQuery as string) ?? "";
  const outputVariable = (node.data.outputVariable as string) ?? "memory_result";
  const topK = Math.min(MAX_RESULTS, Math.max(1, Number(node.data.topK) || 5));

  try {
    if (mode === "key") {
      // Read a single memory by key
      if (!keyTemplate.trim()) {
        return {
          messages: [
            {
              role: "assistant",
              content: "Memory read failed: no key specified.",
            },
          ],
          nextNodeId: null,
          waitForInput: false,
        };
      }

      const key = resolveTemplate(keyTemplate, context.variables);

      const memory = await prisma.agentMemory.findUnique({
        where: {
          agentId_key: {
            agentId: context.agentId,
            key,
          },
        },
      });

      if (memory) {
        // Update access tracking
        await prisma.agentMemory.update({
          where: { id: memory.id },
          data: {
            accessCount: { increment: 1 },
            accessedAt: new Date(),
          },
        });

        return {
          messages: [],
          nextNodeId: null,
          waitForInput: false,
          updatedVariables: {
            [outputVariable]: memory.value,
            __last_memory_read: {
              mode: "key",
              key,
              found: true,
              category: memory.category,
            },
          },
        };
      }

      return {
        messages: [],
        nextNodeId: null,
        waitForInput: false,
        updatedVariables: {
          [outputVariable]: null,
          __last_memory_read: {
            mode: "key",
            key,
            found: false,
          },
        },
      };
    }

    if (mode === "category") {
      // Read all memories in a category
      const resolvedCategory = category.trim()
        ? resolveTemplate(category, context.variables)
        : "general";

      const memories = await prisma.agentMemory.findMany({
        where: {
          agentId: context.agentId,
          category: resolvedCategory,
        },
        orderBy: { importance: "desc" },
        take: topK,
      });

      // Update access tracking for all retrieved memories
      if (memories.length > 0) {
        await prisma.agentMemory.updateMany({
          where: {
            id: { in: memories.map((m) => m.id) },
          },
          data: {
            accessCount: { increment: 1 },
            accessedAt: new Date(),
          },
        });
      }

      const result = memories.map((m) => ({
        key: m.key,
        value: m.value,
        category: m.category,
        importance: m.importance,
      }));

      return {
        messages: [],
        nextNodeId: null,
        waitForInput: false,
        updatedVariables: {
          [outputVariable]: result,
          __last_memory_read: {
            mode: "category",
            category: resolvedCategory,
            count: memories.length,
          },
        },
      };
    }

    if (mode === "search") {
      // Semantic search using embeddings
      const resolvedQuery = searchQuery.trim()
        ? resolveTemplate(searchQuery, context.variables)
        : "";

      if (!resolvedQuery) {
        return {
          messages: [
            {
              role: "assistant",
              content: "Memory search failed: no search query specified.",
            },
          ],
          nextNodeId: null,
          waitForInput: false,
        };
      }

      try {
        const { getEmbeddingModel } = await import("@/lib/ai");
        const { embed } = await import("ai");
        const embeddingModel = getEmbeddingModel();

        const { embedding } = await embed({
          model: embeddingModel,
          value: resolvedQuery,
        });

        const vectorStr = `[${embedding.join(",")}]`;

        // Set HNSW ef_search for memory lookups (short lookups, speed-optimized)
        await prisma.$executeRawUnsafe(`SET LOCAL hnsw.ef_search = 40`);

        // Cosine similarity search (accelerated by HNSW index)
        const memories = await prisma.$queryRawUnsafe<
          Array<{
            id: string;
            key: string;
            value: unknown;
            category: string;
            importance: number;
            similarity: number;
          }>
        >(
          `SELECT id, key, value, category, importance,
                  1 - (embedding <=> $1::vector) as similarity
           FROM "AgentMemory"
           WHERE "agentId" = $2
             AND embedding IS NOT NULL
           ORDER BY embedding <=> $1::vector
           LIMIT $3`,
          vectorStr,
          context.agentId,
          topK
        );

        // Update access tracking
        if (memories.length > 0) {
          await prisma.agentMemory.updateMany({
            where: {
              id: { in: memories.map((m) => m.id) },
            },
            data: {
              accessCount: { increment: 1 },
              accessedAt: new Date(),
            },
          });
        }

        const result = memories.map((m) => ({
          key: m.key,
          value: m.value,
          category: m.category,
          importance: m.importance,
          similarity: Number(m.similarity),
        }));

        return {
          messages: [],
          nextNodeId: null,
          waitForInput: false,
          updatedVariables: {
            [outputVariable]: result,
            __last_memory_read: {
              mode: "search",
              query: resolvedQuery,
              count: memories.length,
            },
          },
        };
      } catch (searchError) {
        logger.warn("Semantic memory search failed, falling back to text search", {
          agentId: context.agentId,
          error: searchError instanceof Error ? searchError.message : String(searchError),
        });

        // Fallback: simple text search on keys
        const memories = await prisma.agentMemory.findMany({
          where: {
            agentId: context.agentId,
            key: { contains: resolvedQuery, mode: "insensitive" },
          },
          orderBy: { importance: "desc" },
          take: topK,
        });

        const result = memories.map((m) => ({
          key: m.key,
          value: m.value,
          category: m.category,
          importance: m.importance,
        }));

        return {
          messages: [],
          nextNodeId: null,
          waitForInput: false,
          updatedVariables: {
            [outputVariable]: result,
            __last_memory_read: {
              mode: "search",
              query: resolvedQuery,
              count: memories.length,
              fallback: true,
            },
          },
        };
      }
    }

    // Unknown mode
    return {
      messages: [
        {
          role: "assistant",
          content: `Memory read failed: unknown mode "${mode}".`,
        },
      ],
      nextNodeId: null,
      waitForInput: false,
    };
  } catch (error) {
    logger.error("Memory read failed", error, {
      agentId: context.agentId,
      mode,
    });

    return {
      messages: [
        {
          role: "assistant",
          content: "I had trouble reading from memory, but I'll continue.",
        },
      ],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: {
        [outputVariable]: null,
        __last_memory_read: { mode, success: false },
      },
    };
  }
};
