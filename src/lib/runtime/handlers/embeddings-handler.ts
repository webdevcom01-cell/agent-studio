import type { NodeHandler } from "../types";
import { resolveTemplate } from "../template";
import {
  generateEmbedding,
  generateEmbeddings,
} from "@/lib/knowledge/embeddings";

const DEFAULT_OUTPUT_VARIABLE = "embedding_result";

/**
 * embeddings — Exposes generateEmbedding() as a flow node.
 * Supports single text or batch (newline-separated) embedding generation.
 */
export const embeddingsHandler: NodeHandler = async (node, context) => {
  const inputText = resolveTemplate(
    (node.data.inputText as string) ?? "",
    context.variables,
  );
  const outputVariable =
    (node.data.outputVariable as string) || DEFAULT_OUTPUT_VARIABLE;
  const modelId = (node.data.embeddingModel as string) || undefined;
  const mode = (node.data.mode as string) ?? "single";

  if (!inputText) {
    return {
      messages: [
        {
          role: "assistant",
          content: "Embeddings node has no input text configured.",
        },
      ],
      nextNodeId: null,
      waitForInput: false,
    };
  }

  try {
    if (mode === "batch") {
      const texts = inputText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

      if (texts.length === 0) {
        return {
          messages: [],
          nextNodeId: null,
          waitForInput: false,
          updatedVariables: {
            ...context.variables,
            [outputVariable]: [],
            [`${outputVariable}_count`]: 0,
          },
        };
      }

      const embeddings = await generateEmbeddings(texts, modelId);

      return {
        messages: [],
        nextNodeId: null,
        waitForInput: false,
        updatedVariables: {
          ...context.variables,
          [outputVariable]: embeddings,
          [`${outputVariable}_count`]: embeddings.length,
          [`${outputVariable}_dimensions`]: embeddings[0]?.length ?? 0,
        },
      };
    }

    // Single mode
    const embedding = await generateEmbedding(inputText, modelId);

    return {
      messages: [],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: {
        ...context.variables,
        [outputVariable]: embedding,
        [`${outputVariable}_dimensions`]: embedding.length,
      },
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      messages: [],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: {
        ...context.variables,
        [outputVariable]: `[Error: ${errorMsg}]`,
      },
    };
  }
};
