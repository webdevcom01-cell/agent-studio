import { embed, embedMany } from "ai";
import { getEmbeddingModel, getEmbeddingModelById } from "@/lib/ai";

function resolveModel(modelId?: string) {
  return modelId ? getEmbeddingModelById(modelId) : getEmbeddingModel();
}

export async function generateEmbedding(text: string, modelId?: string): Promise<number[]> {
  const { embedding } = await embed({
    model: resolveModel(modelId),
    value: text,
  });
  return embedding;
}

export async function generateEmbeddings(texts: string[], modelId?: string): Promise<number[][]> {
  if (texts.length === 0) return [];

  const model = resolveModel(modelId);
  const BATCH_SIZE = 100;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const { embeddings } = await embedMany({
      model,
      values: batch,
    });
    allEmbeddings.push(...embeddings);
  }

  return allEmbeddings;
}
