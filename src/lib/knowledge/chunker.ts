import { get_encoding, type Tiktoken } from "tiktoken";

let _encoder: Tiktoken | null = null;
function getEncoder(): Tiktoken {
  if (!_encoder) _encoder = get_encoding("cl100k_base");
  return _encoder;
}

// ── Types ────────────────────────────────────────────────────────────────

export type ChunkingStrategy =
  | { type: "fixed"; chunkSize: number; overlap: number }
  | { type: "recursive"; chunkSize: number; overlap: number; separators?: string[] }
  | { type: "markdown"; chunkSize: number; preserveHeaders: boolean }
  | { type: "code"; language: "python" | "typescript" | "javascript" | "auto" }
  | { type: "sentence"; chunkSize: number; overlap: number };

export const DEFAULT_STRATEGY: ChunkingStrategy = {
  type: "recursive",
  chunkSize: 512,
  overlap: 100,
};

export interface ChunkMetadata {
  sourceName?: string;
  sourceType?: string;
  pageNumber?: number;
  sectionHeader?: string;
  sheetName?: string;
  slideNumber?: number;
}

// ── Token counting ───────────────────────────────────────────────────────

export function countTokens(text: string): number {
  return getEncoder().encode(text).length;
}

/** @deprecated Use countTokens() instead. Kept for backward compatibility. */
export function estimateTokens(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.ceil(words / 0.75);
}

// ── Legacy chunker (backward compatible) ─────────────────────────────────

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

    if (countTokens(combined) <= maxTokens) {
      currentChunk = combined;
    } else if (!currentChunk) {
      const sentences = paragraph.match(/[^.!?]+[.!?]+\s*/g) || [paragraph];
      for (const sentence of sentences) {
        const sentenceCombined = currentChunk
          ? `${currentChunk} ${sentence.trim()}`
          : sentence.trim();

        if (countTokens(sentenceCombined) <= maxTokens) {
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

    if (countTokens(combined) <= maxTokens * 1.3) {
      overlappedChunks.push(combined);
    } else {
      overlappedChunks.push(chunks[i]);
    }
  }

  return overlappedChunks;
}

// ── Recursive Character Chunker ──────────────────────────────────────────

const DEFAULT_SEPARATORS = ["\n\n", "\n", ". ", " ", ""];

export function chunkRecursive(
  text: string,
  config: { chunkSize: number; overlap: number; separators?: string[] }
): string[] {
  const { chunkSize, overlap, separators = DEFAULT_SEPARATORS } = config;

  if (!text.trim()) return [];
  if (countTokens(text) <= chunkSize) return [text.trim()];

  const rawChunks = splitRecursive(text, chunkSize, separators, 0);
  return addOverlap(rawChunks, overlap);
}

function splitRecursive(
  text: string,
  chunkSize: number,
  separators: string[],
  depth: number
): string[] {
  if (countTokens(text) <= chunkSize) return [text.trim()].filter(Boolean);
  if (depth >= separators.length) {
    // Hard cut by tokens as last resort
    return hardSplitByTokens(text, chunkSize);
  }

  const sep = separators[depth];
  const parts = sep === "" ? [...text] : text.split(sep);
  const chunks: string[] = [];
  let buffer = "";

  for (const part of parts) {
    const candidate = buffer ? `${buffer}${sep}${part}` : part;

    if (countTokens(candidate) <= chunkSize) {
      buffer = candidate;
    } else {
      if (buffer) chunks.push(buffer.trim());

      if (countTokens(part) > chunkSize) {
        chunks.push(...splitRecursive(part, chunkSize, separators, depth + 1));
        buffer = "";
      } else {
        buffer = part;
      }
    }
  }

  if (buffer.trim()) chunks.push(buffer.trim());
  return chunks.filter(Boolean);
}

function hardSplitByTokens(text: string, chunkSize: number): string[] {
  const encoder = getEncoder();
  const tokens = encoder.encode(text);
  const chunks: string[] = [];

  for (let i = 0; i < tokens.length; i += chunkSize) {
    const slice = tokens.slice(i, i + chunkSize);
    const decoded = new TextDecoder().decode(encoder.decode(slice));
    if (decoded.trim()) chunks.push(decoded.trim());
  }

  return chunks;
}

function addOverlap(chunks: string[], overlapTokens: number): string[] {
  if (chunks.length <= 1 || overlapTokens === 0) return chunks;

  const result: string[] = [chunks[0]];
  const encoder = getEncoder();

  for (let i = 1; i < chunks.length; i++) {
    const prevTokens = encoder.encode(chunks[i - 1]);
    const overlapSlice = prevTokens.slice(-overlapTokens);
    const overlapText = new TextDecoder().decode(encoder.decode(overlapSlice));
    result.push(`${overlapText.trim()} ${chunks[i]}`.trim());
  }

  return result;
}

// ── Markdown Chunker ─────────────────────────────────────────────────────

const HEADING_RE = /^(#{1,6})\s+(.+)$/;

export function chunkMarkdown(
  text: string,
  config: { chunkSize: number; preserveHeaders: boolean }
): string[] {
  const { chunkSize, preserveHeaders } = config;

  if (!text.trim()) return [];
  if (countTokens(text) <= chunkSize) return [text.trim()];

  const lines = text.split("\n");
  const chunks: string[] = [];
  let currentChunk = "";
  let lastHeader = "";

  for (const line of lines) {
    const headingMatch = line.match(HEADING_RE);
    if (headingMatch) {
      lastHeader = line;
    }

    const candidate = currentChunk ? `${currentChunk}\n${line}` : line;

    if (countTokens(candidate) <= chunkSize) {
      currentChunk = candidate;
    } else {
      if (currentChunk.trim()) chunks.push(currentChunk.trim());

      if (preserveHeaders && lastHeader && !line.match(HEADING_RE)) {
        currentChunk = `${lastHeader}\n${line}`;
      } else {
        currentChunk = line;
      }
    }
  }

  if (currentChunk.trim()) chunks.push(currentChunk.trim());
  return chunks;
}

// ── Code Chunker ─────────────────────────────────────────────────────────

interface CodeBlock {
  header: string;
  body: string;
}

const CODE_PATTERNS: Record<string, RegExp[]> = {
  python: [
    /^(class\s+\w+.*?:)\s*$/,
    /^(def\s+\w+.*?:)\s*$/,
    /^(async\s+def\s+\w+.*?:)\s*$/,
  ],
  typescript: [
    /^(export\s+(?:default\s+)?(?:class|interface|type|enum)\s+\w+.*?)\s*\{?\s*$/,
    /^(export\s+(?:default\s+)?(?:async\s+)?function\s+\w+.*?)\s*\{?\s*$/,
    /^((?:const|let)\s+\w+\s*=\s*(?:async\s+)?\(.*?\)\s*(?:=>|:\s*\w+\s*=>))/,
  ],
  javascript: [
    /^((?:export\s+)?(?:default\s+)?(?:class|function)\s+\w+.*?)\s*\{?\s*$/,
    /^((?:export\s+)?(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?\(.*?\)\s*=>)/,
    /^(module\.exports\s*=)/,
  ],
};

function detectLanguage(text: string): "python" | "typescript" | "javascript" {
  if (text.includes("def ") && text.includes(":") && !text.includes("{")) return "python";
  if (text.includes(": string") || text.includes("interface ") || text.includes("<T>")) return "typescript";
  return "javascript";
}

export function chunkCode(
  text: string,
  config: { language: "python" | "typescript" | "javascript" | "auto" }
): string[] {
  if (!text.trim()) return [];

  const lang = config.language === "auto" ? detectLanguage(text) : config.language;
  const patterns = CODE_PATTERNS[lang] ?? CODE_PATTERNS.javascript;
  const lines = text.split("\n");
  const blocks: CodeBlock[] = [];
  let currentBlock: CodeBlock = { header: "", body: "" };

  for (const line of lines) {
    const isBlockStart = patterns.some((p) => p.test(line.trim()));

    if (isBlockStart && currentBlock.body.trim()) {
      blocks.push({ ...currentBlock });
      currentBlock = { header: line, body: line };
    } else {
      currentBlock.body += (currentBlock.body ? "\n" : "") + line;
      if (!currentBlock.header && isBlockStart) {
        currentBlock.header = line;
      }
    }
  }

  if (currentBlock.body.trim()) blocks.push(currentBlock);

  return blocks.map((b) => b.body.trim()).filter(Boolean);
}

// ── Sentence Chunker ─────────────────────────────────────────────────────

const SENTENCE_RE = /[^.!?]+[.!?]+(?:\s+|$)/g;

export function chunkSentences(
  text: string,
  config: { chunkSize: number; overlap: number }
): string[] {
  const { chunkSize, overlap } = config;

  if (!text.trim()) return [];
  if (countTokens(text) <= chunkSize) return [text.trim()];

  const sentences = text.match(SENTENCE_RE) ?? [text];
  const rawChunks: string[] = [];
  let buffer = "";

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    const candidate = buffer ? `${buffer} ${trimmed}` : trimmed;

    if (countTokens(candidate) <= chunkSize) {
      buffer = candidate;
    } else {
      if (buffer) rawChunks.push(buffer.trim());
      buffer = trimmed;
    }
  }

  if (buffer.trim()) rawChunks.push(buffer.trim());
  return addOverlap(rawChunks, overlap);
}

// ── Strategy dispatcher ──────────────────────────────────────────────────

// ── Header Injection ─────────────────────────────────────────────────────

export function buildChunkHeader(meta: ChunkMetadata): string {
  const parts: string[] = [];
  if (meta.sourceName) parts.push(`[Source: ${meta.sourceName}]`);
  if (meta.sourceType) parts.push(`[Type: ${meta.sourceType}]`);
  if (meta.pageNumber !== undefined) parts.push(`[Page: ${meta.pageNumber}]`);
  if (meta.sectionHeader) parts.push(`[Section: ${meta.sectionHeader}]`);
  if (meta.sheetName) parts.push(`[Sheet: ${meta.sheetName}]`);
  if (meta.slideNumber !== undefined) parts.push(`[Slide: ${meta.slideNumber}]`);
  return parts.join(" ");
}

export function injectHeaders(chunks: string[], metadata: ChunkMetadata): string[] {
  const header = buildChunkHeader(metadata);
  if (!header) return chunks;
  return chunks.map((chunk) => `${header}\n\n${chunk}`);
}

// ── Strategy dispatcher ──────────────────────────────────────────────────

export function chunkByStrategy(
  text: string,
  strategy: ChunkingStrategy,
  metadata?: ChunkMetadata
): string[] {
  let chunks: string[];
  switch (strategy.type) {
    case "fixed":
      chunks = chunkText(text, {
        maxTokens: strategy.chunkSize,
        overlapPercent: strategy.overlap / strategy.chunkSize,
      });
      break;
    case "recursive":
      chunks = chunkRecursive(text, strategy);
      break;
    case "markdown":
      chunks = chunkMarkdown(text, strategy);
      break;
    case "code":
      chunks = chunkCode(text, strategy);
      break;
    case "sentence":
      chunks = chunkSentences(text, strategy);
      break;
    default:
      chunks = chunkText(text);
  }
  return metadata ? injectHeaders(chunks, metadata) : chunks;
}
