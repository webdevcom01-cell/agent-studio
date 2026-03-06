import type { NodeHandler } from "../types";
import { resolveTemplate } from "../template";
import { prisma } from "@/lib/prisma";
import { hybridSearch } from "@/lib/knowledge/search";

export const kbSearchHandler: NodeHandler = async (node, context) => {
  const topK = (node.data.topK as number) ?? 5;
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

    const results = await hybridSearch(query, kb.id, { topK });
    const kbContext = results.map((r) => r.content).join("\n---\n");

    return {
      messages: [],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: {
        kb_results: results.map((r) => ({
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
