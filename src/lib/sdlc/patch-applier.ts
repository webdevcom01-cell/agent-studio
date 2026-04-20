import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, isAbsolute, resolve } from "node:path";
import { logger } from "@/lib/logger";

export interface PatchBlock {
  filePath: string | null;
  searchFor: string;
  replaceWith: string;
}

export interface PatchApplicationResult {
  applied: number;
  failed: number;
  errors: string[];
}

export function parseSearchReplaceBlocks(text: string): PatchBlock[] {
  const blocks: PatchBlock[] = [];
  const BLOCK_RE = /<<<<<<< SEARCH\r?\n([\s\S]*?)\r?\n=======\r?\n([\s\S]*?)\r?\n>>>>>>> REPLACE/g;
  const FILE_RE = /^(?:File|file|PATH|path):\s*(.+)$/m;

  let match: RegExpExecArray | null;
  while ((match = BLOCK_RE.exec(text)) !== null) {
    const searchFor = match[1].trim();
    const replaceWith = match[2].trim();

    const preceding = text.slice(Math.max(0, match.index - 500), match.index);
    // Find the LAST File: annotation before this block (not the first one)
    let filePath: string | null = null;
    const fileReCopy = new RegExp(FILE_RE.source, "gm");
    let fileMatch: RegExpExecArray | null;
    while ((fileMatch = fileReCopy.exec(preceding)) !== null) {
      filePath = fileMatch[1].trim();
    }

    blocks.push({ filePath, searchFor, replaceWith });
  }
  return blocks;
}

/**
 * Resolve an AI-provided relative file path to a safe absolute path.
 *
 * Safety rules:
 *  1. Absolute paths from AI input are ALWAYS rejected — they can reference
 *     arbitrary filesystem locations regardless of workDir.
 *  2. All resolved paths must be fully contained inside one of the two
 *     allowed roots (workDir or srcRoot) — path traversal via `..` is blocked
 *     by comparing `resolve()`'d paths with the allowed root prefixes.
 *
 * Returns `null` when the path fails validation; the caller emits an error.
 */
function resolveFilePath(filePath: string, workDir: string): string | null {
  // Rule 1: reject absolute paths from AI input
  if (isAbsolute(filePath)) return null;

  const srcRoot = existsSync("/app/src") ? "/app/src" : join(process.cwd(), "src");
  const resolvedWorkDir = resolve(workDir);
  const resolvedSrcRoot = resolve(srcRoot);

  // Rule 2a: "src/…" files are resolved relative to srcRoot's parent
  if (filePath.startsWith("src/")) {
    const candidate = resolve(srcRoot, "..", filePath);
    const isInsideSrc = candidate === resolvedSrcRoot || candidate.startsWith(resolvedSrcRoot + "/");
    if (isInsideSrc && existsSync(candidate)) return candidate;
  }

  // Rule 2b: everything else must land inside workDir
  const candidate = resolve(workDir, filePath);
  const isInsideWorkDir =
    candidate === resolvedWorkDir || candidate.startsWith(resolvedWorkDir + "/");
  if (!isInsideWorkDir) return null;

  return candidate;
}

export async function applyPatchToWorkspace(
  blocks: PatchBlock[],
  workDir: string,
  fallbackFilePath?: string,
): Promise<PatchApplicationResult> {
  let applied = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const block of blocks) {
    const rawPath = block.filePath ?? fallbackFilePath;
    if (!rawPath) {
      failed++;
      errors.push("No file path for block");
      continue;
    }
    const filePath = resolveFilePath(rawPath, workDir);
    if (!filePath) {
      failed++;
      errors.push(
        `Rejected unsafe path "${rawPath}": must be relative and within the workspace`,
      );
      logger.warn("applyPatchToWorkspace: rejected unsafe path", { rawPath, workDir });
      continue;
    }
    try {
      const content = readFileSync(filePath, "utf-8");
      if (!content.includes(block.searchFor)) {
        failed++;
        errors.push(`SEARCH not found in ${filePath}`);
        continue;
      }
      const updated = content.replace(block.searchFor, block.replaceWith);
      writeFileSync(filePath, updated, "utf-8");
      applied++;
    } catch (err) {
      failed++;
      errors.push(`Failed to patch ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
      logger.warn("applyPatchToWorkspace error", { filePath, error: err });
    }
  }

  return { applied, failed, errors };
}
