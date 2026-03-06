export function estimateTokens(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.ceil(words / 0.75);
}

interface ChunkOptions {
  maxTokens?: number;
  overlapPercent?: number;
}

export function chunkText(text: string, options?: ChunkOptions): string[] {
  const maxTokens = options?.maxTokens ?? 400;
  const overlapPercent = options?.overlapPercent ?? 0.2;

  if (!text.trim()) return [];

  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim());
  const chunks: string[] = [];
  let currentChunk = "";

  for (const paragraph of paragraphs) {
    const combined = currentChunk ? `${currentChunk}\n\n${paragraph}` : paragraph;

    if (estimateTokens(combined) <= maxTokens) {
      currentChunk = combined;
    } else if (!currentChunk) {
      const sentences = paragraph.match(/[^.!?]+[.!?]+\s*/g) || [paragraph];
      for (const sentence of sentences) {
        const sentenceCombined = currentChunk
          ? `${currentChunk} ${sentence.trim()}`
          : sentence.trim();

        if (estimateTokens(sentenceCombined) <= maxTokens) {
          currentChunk = sentenceCombined;
        } else {
          if (currentChunk) chunks.push(currentChunk.trim());
          currentChunk = sentence.trim();
        }
      }
    } else {
      chunks.push(currentChunk.trim());
      currentChunk = paragraph;
    }
  }

  if (currentChunk.trim()) chunks.push(currentChunk.trim());
  if (chunks.length <= 1) return chunks;

  const overlapTokens = Math.floor(maxTokens * overlapPercent);
  const overlappedChunks: string[] = [chunks[0]];

  for (let i = 1; i < chunks.length; i++) {
    const prevWords = chunks[i - 1].split(/\s+/);
    const overlapWordCount = Math.floor(overlapTokens * 0.75);
    const overlapText = prevWords.slice(-overlapWordCount).join(" ");
    const combined = `${overlapText} ${chunks[i]}`.trim();

    if (estimateTokens(combined) <= maxTokens * 1.3) {
      overlappedChunks.push(combined);
    } else {
      overlappedChunks.push(chunks[i]);
    }
  }

  return overlappedChunks;
}
