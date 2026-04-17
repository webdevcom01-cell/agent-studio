/**
 * code-extractor.ts
 *
 * Bridges the gap between "AI text output" and "real files on disk".
 *
 * The SDLC pipeline produces code as markdown text (```typescript ... ```).
 * This module:
 *   1. Parses those code blocks into {path, content} pairs — handling every
 *      format an LLM might use to denote a file path
 *   2. Writes the files to /tmp/sdlc/workspace/ (the writable SDLC workspace)
 *   3. Runs the real TypeScript compiler + Vitest on the written files
 *   4. Returns the raw stdout/stderr for the feedback loop
 *
 * This makes the feedback loop work on actual compiler errors and real test
 * failures instead of AI-simulated output.
 *
 * Supported file-path annotation formats:
 *   • ### src/lib/foo.ts          (markdown heading before block)
 *   • **src/lib/foo.ts**          (bold before block)
 *   • File: src/lib/foo.ts        (label before block)
 *   • // src/lib/foo.ts           (comment as first line inside block)
 *   • // filepath: src/lib/foo.ts (explicit filepath annotation)
 *   • # filepath: src/lib/foo.ts  (Python/shell style)
 */

import { mkdirSync, writeFileSync, existsSync, writeFile } from "node:fs";
import { join, dirname, extname } from "node:path";
import { promisify } from "node:util";
import { logger } from "@/lib/logger";
import { runVerificationCommands } from "@/lib/runtime/verification-commands";

const writeFileAsync = promisify(writeFile);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParsedFile {
  /** Relative path as annotated by the AI (e.g. "src/lib/foo.ts") */
  path: string;
  /** Cleaned source content (path-comment stripped) */
  content: string;
  /** Language identifier from the opening fence */
  language: string;
}

export interface WorkspaceExecResult {
  /** How many files were successfully written */
  filesWritten: number;
  /** Absolute paths of written files */
  writtenPaths: string[];
  /** Combined typecheck + test output — feed directly into feedback loop */
  testOutput: string;
  /** true if tsc had no errors (or no TS files were generated) */
  typecheckPassed: boolean;
  /** true if vitest had no failures (or no test files were generated) */
  testsPassed: boolean;
}

// ---------------------------------------------------------------------------
// File-path detection patterns (applied to lines preceding the code block)
// ---------------------------------------------------------------------------

/** Extensions we recognise as source files worth writing */
const SOURCE_EXT = /\.(ts|tsx|js|jsx|mts|mjs|cjs|py|json|yaml|yml|md|sh|toml|env)$/i;

const BEFORE_BLOCK_PATTERNS: RegExp[] = [
  // ### path or ## `path`
  /^#{1,4}\s+[`]?([\w./-]+)[`]?\s*$/,
  // **path** or **`path`**
  /^\*\*[`]?([\w./-]+)[`]?\*\*\s*$/,
  // File: path  |  Path: path  |  Create path
  /^(?:File|Path|Create|Update|Write|Edit|Modified?|Output):\s*[`]?([\w./-]+)[`]?\s*$/i,
  // `path`  (backtick-only line before block)
  /^[`]([\w./-]+)[`]\s*$/,
];

// ---------------------------------------------------------------------------
// Core parsing
// ---------------------------------------------------------------------------

/**
 * Try to extract a source file path from a single line of text preceding a block.
 * Returns null if the line doesn't look like a path annotation.
 */
function matchPathLine(line: string): string | null {
  const t = line.trim();
  for (const re of BEFORE_BLOCK_PATTERNS) {
    const m = t.match(re);
    if (m?.[1] && SOURCE_EXT.test(m[1])) return m[1];
  }
  return null;
}

/**
 * Inspect the first 3 lines of a code block for an inline path comment.
 *
 *   // src/lib/foo.ts
 *   // filepath: src/lib/foo.ts
 *   # filepath: src/lib/foo.ts
 */
function extractInlinePathComment(content: string): { path: string; cleanContent: string } | null {
  const lines = content.split("\n");
  const first = lines[0].trim();

  const inlinePatterns: RegExp[] = [
    // // filepath: src/lib/foo.ts  or  # filepath: src/lib/foo.ts
    /^(?:\/\/|#)\s*filepath:\s*([\w./-]+)\s*$/,
    // // src/lib/foo.ts  — path-only comment
    /^(?:\/\/|#)\s*([\w./-]+\.(?:ts|tsx|js|jsx|mts|py|json|yaml|yml|md))\s*$/,
  ];

  for (const re of inlinePatterns) {
    const m = first.match(re);
    if (m?.[1]) {
      return {
        path: m[1],
        cleanContent: lines.slice(1).join("\n").trim(),
      };
    }
  }
  return null;
}

/**
 * Map a language identifier to a file extension fallback.
 */
function langToExt(lang: string): string {
  const map: Record<string, string> = {
    typescript: ".ts",
    ts: ".ts",
    tsx: ".tsx",
    javascript: ".js",
    js: ".js",
    jsx: ".jsx",
    python: ".py",
    py: ".py",
    json: ".json",
    yaml: ".yaml",
    yml: ".yml",
    markdown: ".md",
    md: ".md",
    toml: ".toml",
    sh: ".sh",
    bash: ".sh",
    shell: ".sh",
  };
  return map[lang.toLowerCase()] ?? ".txt";
}

/** Language identifiers that should NOT be treated as source files */
const SKIP_LANGS = new Set([
  "sh", "bash", "shell", "zsh", "fish",
  "console", "terminal", "output", "text", "plaintext",
  "diff", "patch", "log", "ansi",
]);

/**
 * Parse all fenced code blocks in an AI markdown output.
 * Returns one ParsedFile per unique file path found.
 * When the same path appears multiple times, the last version wins.
 */
export function parseCodeBlocks(aiOutput: string): ParsedFile[] {
  const byPath = new Map<string, ParsedFile>();
  let counter = 0;

  // Match every fenced code block: ```lang\ncontents\n```
  const FENCE_RE = /```(\w*)\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;

  while ((m = FENCE_RE.exec(aiOutput)) !== null) {
    const lang = m[1].toLowerCase();
    const rawContent = m[2];
    const blockStart = m.index;

    // Skip output/shell blocks — they are logs, not source files
    if (SKIP_LANGS.has(lang) && lang !== "") continue;

    // Skip suspiciously short blocks (inline snippets, not whole files)
    if (rawContent.trim().length < 15) continue;

    // ── Strategy 1: inline path comment as first line of block ────────────
    const inline = extractInlinePathComment(rawContent);
    if (inline) {
      byPath.set(inline.path, { path: inline.path, content: inline.cleanContent, language: lang });
      continue;
    }

    // ── Strategy 2: look at lines immediately preceding the code block ────
    const textBefore = aiOutput.slice(Math.max(0, blockStart - 300), blockStart);
    const linesBefore = textBefore.split("\n").filter((l) => l.trim()).slice(-4);

    let detectedPath: string | null = null;
    for (let i = linesBefore.length - 1; i >= 0; i--) {
      detectedPath = matchPathLine(linesBefore[i]);
      if (detectedPath) break;
    }

    if (detectedPath) {
      byPath.set(detectedPath, { path: detectedPath, content: rawContent.trim(), language: lang });
      continue;
    }

    // ── Strategy 3: generated fallback name ──────────────────────────────
    // Only create fallback names for real code languages
    if (lang && !SKIP_LANGS.has(lang)) {
      counter++;
      const fallbackPath = `generated-${counter}${langToExt(lang)}`;
      byPath.set(fallbackPath, { path: fallbackPath, content: rawContent.trim(), language: lang });
    }
  }

  return [...byPath.values()];
}

// ---------------------------------------------------------------------------
// File writing
// ---------------------------------------------------------------------------

/**
 * Write ParsedFile[] to disk under workDir.
 * Silently skips files that fail (logs a warning instead).
 * Returns absolute paths of successfully written files.
 */
export function writeToWorkspace(files: ParsedFile[], workDir: string): string[] {
  const written: string[] = [];

  for (const file of files) {
    try {
      const absPath = join(workDir, file.path);
      mkdirSync(dirname(absPath), { recursive: true });
      writeFileSync(absPath, file.content, "utf-8");
      written.push(absPath);
    } catch (err) {
      logger.warn("code-extractor: failed to write file", {
        path: file.path,
        workDir,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return written;
}

// ---------------------------------------------------------------------------
// Real compilation + test execution
// ---------------------------------------------------------------------------

/** Workspace subdirectory for generated files */
const GENERATED_SUBDIR = "workspace";

/**
 * Full pipeline:
 *   1. Parse AI markdown output → extract code blocks
 *   2. Write files to {workDir}/workspace/
 *   3. Run tsc --noEmit on TypeScript files
 *   4. Run vitest run on test files (if any)
 *   5. Return real stdout/stderr combined
 *
 * Never throws — errors are caught and returned as testOutput strings.
 */
export async function executeRealTests(
  aiOutput: string,
  workDir: string,
  agentId: string,
): Promise<WorkspaceExecResult> {
  // ── Parse code blocks ───────────────────────────────────────────────────
  const parsed = parseCodeBlocks(aiOutput);

  if (parsed.length === 0) {
    logger.info("code-extractor: no code blocks found in AI output", { agentId });
    return {
      filesWritten: 0,
      writtenPaths: [],
      testOutput: "No code blocks extracted from implementation output — skipping real execution.",
      typecheckPassed: true,
      testsPassed: true,
    };
  }

  // ── Ensure workspace exists ─────────────────────────────────────────────
  const genDir = join(workDir, GENERATED_SUBDIR);
  mkdirSync(genDir, { recursive: true });

  // ── Write files ─────────────────────────────────────────────────────────
  const writtenPaths = writeToWorkspace(parsed, genDir);

  logger.info("code-extractor: files written to workspace", {
    agentId,
    genDir,
    filesWritten: writtenPaths.length,
    files: writtenPaths.map((p) => p.replace(genDir + "/", "")),
  });

  if (writtenPaths.length === 0) {
    return {
      filesWritten: 0,
      writtenPaths: [],
      testOutput: "Files could not be written to workspace (permission error?).",
      typecheckPassed: true,
      testsPassed: true,
    };
  }

  // ── Create a minimal tsconfig for type checking the generated files ─────
  // We extend the project's tsconfig so path aliases (@/) resolve correctly.
  const tsconfigPath = join(workDir, "tsconfig.generated.json");
  const tsconfigContent = JSON.stringify(
    {
      extends: existsSync("/app/tsconfig.json") ? "/app/tsconfig.json" : "./tsconfig.json",
      compilerOptions: {
        noEmit: true,
        skipLibCheck: true,
        allowJs: true,
      },
      include: [genDir + "/**/*"],
    },
    null,
    2,
  );

  try {
    await writeFileAsync(tsconfigPath, tsconfigContent, "utf-8");
  } catch {
    // tsconfig write failed — fall back to per-file tsc invocation
  }

  // ── Typecheck ───────────────────────────────────────────────────────────
  const tsFiles = writtenPaths.filter((p) =>
    p.endsWith(".ts") || p.endsWith(".tsx") || p.endsWith(".mts"),
  );

  let typecheckOutput = "";
  let typecheckPassed = true;

  if (tsFiles.length > 0) {
    // Use the generated tsconfig if it was created, otherwise use file-by-file
    const tscCommand = existsSync(tsconfigPath)
      ? `tsc --project ${tsconfigPath}`
      : `tsc --noEmit --skipLibCheck --allowJs ${tsFiles.join(" ")}`;

    const { results } = await runVerificationCommands(
      [tscCommand],
      agentId,
      90_000, // 90 seconds — some projects are large
      genDir,
    );

    typecheckOutput = results[0]?.output ?? "";
    typecheckPassed = results[0]?.passed ?? true;

    logger.info("code-extractor: typecheck complete", {
      agentId,
      passed: typecheckPassed,
      errorLines: typecheckOutput.split("\n").filter((l) => l.includes("error TS")).length,
    });
  }

  // ── Test runner ─────────────────────────────────────────────────────────
  const testFiles = writtenPaths.filter(
    (p) => p.includes(".test.") || p.includes(".spec.") || p.includes("__tests__"),
  );

  let testOutput = "";
  let testsPassed = true;

  if (testFiles.length > 0) {
    const vitestCommand = `vitest run ${testFiles.join(" ")}`;

    const { results } = await runVerificationCommands(
      [vitestCommand],
      agentId,
      180_000, // 3 minutes for tests
      genDir,
    );

    testOutput = results[0]?.output ?? "";
    testsPassed = results[0]?.passed ?? true;

    logger.info("code-extractor: test run complete", {
      agentId,
      passed: testsPassed,
      outputLength: testOutput.length,
    });
  }

  // ── Combine output for feedback loop ────────────────────────────────────
  const outputSections: string[] = [
    `Files written: ${writtenPaths.length} (${writtenPaths.map((p) => p.replace(genDir + "/", "")).join(", ")})`,
  ];

  if (typecheckOutput) {
    const label = typecheckPassed ? "✅ TypeScript typecheck PASSED" : "❌ TypeScript typecheck FAILED";
    outputSections.push(`## ${label}\n\`\`\`\n${typecheckOutput}\n\`\`\``);
  } else if (tsFiles.length > 0) {
    outputSections.push("## ✅ TypeScript typecheck PASSED (no output)");
  }

  if (testOutput) {
    const label = testsPassed ? "✅ Tests PASSED" : "❌ Tests FAILED";
    outputSections.push(`## ${label}\n\`\`\`\n${testOutput}\n\`\`\``);
  } else if (testFiles.length > 0) {
    outputSections.push("## ✅ Tests PASSED (no output)");
  }

  if (tsFiles.length === 0 && testFiles.length === 0) {
    outputSections.push("No TypeScript or test files generated — skipping compilation and test execution.");
  }

  return {
    filesWritten: writtenPaths.length,
    writtenPaths,
    testOutput: outputSections.join("\n\n"),
    typecheckPassed,
    testsPassed,
  };
}
