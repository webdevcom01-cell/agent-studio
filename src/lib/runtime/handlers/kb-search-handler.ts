import type { NodeHandler } from "../types";
import { resolveTemplate } from "../template";
import { prisma } from "@/lib/prisma";
import { hybridSearch, computeDynamicTopK, expandChunksWithContext } from "@/lib/knowledge/search";

export const kbSearchHandler: NodeHandler = async (node, context) => {
  const configuredTopK = (node.data.topK as number) ?? 7;
  const queryVariable = (node.data.queryVariable as string) || "last_message";
  const outputVariable = (node.data.outputVariable as string) || "kb_context";

  let query: string;
  if (queryVariable.includes("{{")) {
    query = resolveTemplate(queryVariable, context.variables);
  } else {
    query = String(context.variables[queryVariable] ?? "");
  }

  if (!query.trim()) {
    return {
      messages: [],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: { kb_results: [], [outputVariable]: "" },
    };
  }

  try {
    const kb = await prisma.knowledgeBase.findUnique({
      where: { agentId: context.agentId },
    });

    if (!kb) {
      return {
        messages: [],
        nextNodeId: null,
        waitForInput: false,
        updatedVariables: { kb_results: [], [outputVariable]: "" },
      };
    }

    const topK = computeDynamicTopK(query, configuredTopK);
    const results = await hybridSearch(query, kb.id, { topK });
    const expanded = await expandChunksWithContext(results, 1);
    const kbContext = expanded.map((r) => r.content).join("\n---\n");

    return {
      messages: [],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: {
        kb_results: expanded.map((r) => ({
          content: r.content,
          similarity: r.similarity,
          sourceDocument: r.sourceDocument ?? null,
          relevanceScore: r.relevanceScore ?? r.similarity,
        })),
        [outputVariable]: kbContext,
      },
    };
  } catch (error) {
    console.error("KB Search error:", error);
    return {
      messages: [],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: { kb_results: [], [outputVariable]: "" },
    };
  }
};
