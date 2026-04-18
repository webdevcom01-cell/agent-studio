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
 *
 * Two entry points:
 *   - executeRealTestsFromFiles(files, workDir, agentId)
 *       Called when files are already structured (generateObject path).
 *       No markdown parsing needed — maximum reliability.
 *   - executeRealTests(aiOutput, workDir, agentId)
 *       Called with raw AI text (generateText fallback path).
 *       Parses markdown code blocks, then delegates to executeRealTestsFromFiles.
 */

import { mkdirSync, writeFileSync, existsSync, rmSync, readdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join, dirname, relative, resolve } from "node:path";
import { logger } from "@/lib/logger";
import { runVerificationCommands } from "@/lib/runtime/verification-commands";

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
 * Inspect the first line of a code block for an inline path comment.
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
 *
 * Security: resolves each path and confirms it stays inside workDir,
 * blocking both "../../../etc/passwd" traversal and absolute-path injection.
 */
export function writeToWorkspace(files: ParsedFile[], workDir: string): string[] {
  const written: string[] = [];
  // Resolve workDir once so path traversal checks are against a canonical path
  const resolvedWorkDir = resolve(workDir);

  for (const file of files) {
    try {
      // Resolve the full path and confirm it stays inside workDir.
      const absPath = resolve(join(resolvedWorkDir, file.path));
      if (!absPath.startsWith(resolvedWorkDir + "/") && absPath !== resolvedWorkDir) {
        logger.warn("code-extractor: blocked path traversal attempt", {
          filePath: file.path,
          resolvedPath: absPath,
          workDir: resolvedWorkDir,
        });
        continue;
      }

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
// Real compilation + test execution — shared core
// ---------------------------------------------------------------------------

const GENERATED_SUBDIR = "workspace";

/**
 * Core execution pipeline — accepts already-parsed ParsedFile[].
 *
 * Preferred entry point when the orchestrator calls generateObject() and has
 * structured file data — avoids round-tripping through markdown serialization.
 *
 * Steps:
 *   1. Clean and recreate {workDir}/workspace/
 *   2. Write files to disk (with path traversal guard)
 *   3. tsc --noEmit on TS files (90s timeout)
 *   4. vitest run on test files (3min timeout)
 *   5. Return combined output + pass/fail flags for the feedback loop
 *
 * Never throws — all errors are caught and reflected in the return value.
 */
export async function executeRealTestsFromFiles(
  files: ParsedFile[],
  workDir: string,
  agentId: string,
): Promise<WorkspaceExecResult> {
  if (files.length === 0) {
    return {
      filesWritten: 0,
      writtenPaths: [],
      testOutput: "No files provided — skipping real execution.",
      typecheckPassed: true,
      testsPassed: true,
    };
  }

  // ── Ensure workspace is clean before writing ────────────────────────────
  // Remove stale files from previous pipeline runs so the typecheck and
  // test runner only see what the current run produced.
  const genDir = join(workDir, GENERATED_SUBDIR);
  try {
    if (existsSync(genDir)) {
      rmSync(genDir, { recursive: true, force: true });
    }
  } catch (cleanErr) {
    logger.warn("code-extractor: workspace cleanup failed — stale files may persist", {
      agentId,
      genDir,
      error: cleanErr instanceof Error ? cleanErr.message : String(cleanErr),
    });
  }
  mkdirSync(genDir, { recursive: true });

  // ── Write files ─────────────────────────────────────────────────────────
  const writtenPaths = writeToWorkspace(files, genDir);

  logger.info("code-extractor: files written to workspace", {
    agentId,
    genDir,
    filesWritten: writtenPaths.length,
    files: writtenPaths.map((p) => relative(genDir, p)),
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
  // Written to /app/ so tsc resolves node_modules from /app/node_modules/
  // and @/* path aliases resolve against /app/tsconfig.json.
  const APP_TSCONFIG = "/app/tsconfig.json";
  const tsconfigPath = existsSync(APP_TSCONFIG)
    ? "/app/tsconfig.sdlc-generated.json"
    : join(workDir, "tsconfig.sdlc-generated.json");

  const tsconfigContent = JSON.stringify(
    {
      extends: existsSync(APP_TSCONFIG) ? APP_TSCONFIG : "./tsconfig.json",
      compilerOptions: { noEmit: true, skipLibCheck: true, allowJs: true },
      include: [`${genDir}/**/*`],
    },
    null,
    2,
  );

  try {
    await writeFile(tsconfigPath, tsconfigContent, "utf-8");
  } catch {
    logger.warn("code-extractor: failed to write tsconfig", { agentId });
  }

  // ── Typecheck ───────────────────────────────────────────────────────────
  const tsFiles = writtenPaths.filter(
    (p) => p.endsWith(".ts") || p.endsWith(".tsx") || p.endsWith(".mts"),
  );

  let typecheckOutput = "";
  let typecheckPassed = true;

  if (tsFiles.length > 0) {
    const tscCommand = existsSync(tsconfigPath)
      ? `tsc --project ${tsconfigPath} --pretty false`
      : `tsc --noEmit --skipLibCheck --allowJs --pretty false ${tsFiles.join(" ")}`;

    const { results } = await runVerificationCommands(
      [tscCommand],
      agentId,
      90_000,
      genDir,
      1024 * 1024 * 5,
    );

    typecheckOutput = results[0]?.output ?? "";
    typecheckPassed = results[0]?.passed ?? true;

    logger.info("code-extractor: typecheck complete", {
      agentId,
      passed: typecheckPassed,
      errorLines: typecheckOutput.split("\n").filter((l) => l.includes("error TS")).length,
    });
  }

  try {
    rmSync(tsconfigPath);
  } catch {
    // Non-critical cleanup — ignore errors
  }

  // ── Test runner ─────────────────────────────────────────────────────────
  const testFiles = writtenPaths.filter(
    (p) => p.includes(".test.") || p.includes(".spec.") || p.includes("__tests__"),
  );

  let testRunOutput = "";
  let testsPassed = true;

  if (testFiles.length > 0) {
    const { results } = await runVerificationCommands(
      [`vitest run ${testFiles.join(" ")}`],
      agentId,
      180_000,
      genDir,
      1024 * 1024 * 5,
    );

    testRunOutput = results[0]?.output ?? "";
    testsPassed = results[0]?.passed ?? true;

    logger.info("code-extractor: test run complete", {
      agentId,
      passed: testsPassed,
      outputLength: testRunOutput.length,
    });
  }

  // ── Combine output for feedback loop ────────────────────────────────────
  const outputSections: string[] = [
    `Files written: ${writtenPaths.length} (${writtenPaths.map((p) => relative(genDir, p)).join(", ")})`,
  ];

  if (typecheckOutput) {
    const label = typecheckPassed
      ? "✅ TypeScript typecheck PASSED"
      : "❌ TypeScript typecheck FAILED";
    outputSections.push(`## ${label}\n\`\`\`\n${typecheckOutput}\n\`\`\``);
  } else if (tsFiles.length > 0) {
    outputSections.push("## ✅ TypeScript typecheck PASSED (no output)");
  }

  if (testRunOutput) {
    const label = testsPassed ? "✅ Tests PASSED" : "❌ Tests FAILED";
    outputSections.push(`## ${label}\n\`\`\`\n${testRunOutput}\n\`\`\``);
  } else if (testFiles.length > 0) {
    outputSections.push("## ✅ Tests PASSED (no output)");
  }

  if (tsFiles.length === 0 && testFiles.length === 0) {
    outputSections.push(
      "No TypeScript or test files generated — skipping compilation and test execution.",
    );
  }

  return {
    filesWritten: writtenPaths.length,
    writtenPaths,
    testOutput: outputSections.join("\n\n"),
    typecheckPassed,
    testsPassed,
  };
}

/**
 * Markdown-text entry point — parses code blocks from raw AI output,
 * then delegates to executeRealTestsFromFiles.
 *
 * Use when the AI output is raw markdown text (generateText fallback path).
 * Never throws — errors are caught and returned as testOutput strings.
 */
export async function executeRealTests(
  aiOutput: string,
  workDir: string,
  agentId: string,
): Promise<WorkspaceExecResult> {
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

  return executeRealTestsFromFiles(parsed, workDir, agentId);
}

/**
 * Re-run tsc + vitest on files already present in the workspace, without
 * writing any new files. Used after SEARCH/REPLACE patches are applied
 * in-place — re-writing files would overwrite the patches.
 *
 * Never throws — all errors are reflected in the return value.
 */
export async function runWorkspaceTests(
  workDir: string,
  agentId: string,
): Promise<WorkspaceExecResult> {
  const genDir = join(workDir, GENERATED_SUBDIR);

  if (!existsSync(genDir)) {
    logger.info("runWorkspaceTests: workspace directory absent — skipping", { agentId, genDir });
    return {
      filesWritten: 0,
      writtenPaths: [],
      testOutput: "Workspace directory does not exist — skipping re-test after patch.",
      typecheckPassed: true,
      testsPassed: true,
    };
  }

  // Collect all files in genDir recursively
  const allFiles: string[] = [];
  function walkDir(dir: string): void {
    try {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walkDir(full);
        else allFiles.push(full);
      }
    } catch {
      // Skip unreadable subdirectories
    }
  }
  walkDir(genDir);

  if (allFiles.length === 0) {
    logger.info("runWorkspaceTests: workspace empty — skipping", { agentId, genDir });
    return {
      filesWritten: 0,
      writtenPaths: [],
      testOutput: "Workspace is empty — skipping re-test after patch.",
      typecheckPassed: true,
      testsPassed: true,
    };
  }

  const tsFiles = allFiles.filter(
    (p) => p.endsWith(".ts") || p.endsWith(".tsx") || p.endsWith(".mts"),
  );
  const testFiles = allFiles.filter(
    (p) => p.includes(".test.") || p.includes(".spec.") || p.includes("__tests__"),
  );

  // ── Typecheck ───────────────────────────────────────────────────────────
  let typecheckOutput = "";
  let typecheckPassed = true;

  if (tsFiles.length > 0) {
    const APP_TSCONFIG = "/app/tsconfig.json";
    const tsconfigPath = existsSync(APP_TSCONFIG)
      ? "/app/tsconfig.sdlc-generated.json"
      : join(workDir, "tsconfig.sdlc-generated.json");

    const tsconfigContent = JSON.stringify(
      {
        extends: existsSync(APP_TSCONFIG) ? APP_TSCONFIG : "./tsconfig.json",
        compilerOptions: { noEmit: true, skipLibCheck: true, allowJs: true },
        include: [`${genDir}/**/*`],
      },
      null,
      2,
    );

    try {
      await writeFile(tsconfigPath, tsconfigContent, "utf-8");
    } catch {
      logger.warn("runWorkspaceTests: failed to write tsconfig", { agentId });
    }

    const tscCommand = existsSync(tsconfigPath)
      ? `tsc --project ${tsconfigPath} --pretty false`
      : `tsc --noEmit --skipLibCheck --allowJs --pretty false ${tsFiles.join(" ")}`;

    try {
      const { results } = await runVerificationCommands(
        [tscCommand],
        agentId,
        90_000,
        genDir,
        1024 * 1024 * 5,
      );
      typecheckOutput = results[0]?.output ?? "";
      typecheckPassed = results[0]?.passed ?? true;
    } catch (tscErr) {
      logger.warn("runWorkspaceTests: tsc command failed unexpectedly", {
        agentId,
        error: tscErr instanceof Error ? tscErr.message : String(tscErr),
      });
      typecheckPassed = false;
      typecheckOutput = `tsc failed: ${tscErr instanceof Error ? tscErr.message : String(tscErr)}`;
    }

    try { rmSync(tsconfigPath); } catch { /* non-critical cleanup */ }

    logger.info("runWorkspaceTests: typecheck complete", {
      agentId, passed: typecheckPassed,
    });
  }

  // ── Test runner ─────────────────────────────────────────────────────────
  let testRunOutput = "";
  let testsPassed = true;

  if (testFiles.length > 0) {
    try {
      const { results } = await runVerificationCommands(
        [`vitest run ${testFiles.join(" ")}`],
        agentId,
        180_000,
        genDir,
        1024 * 1024 * 5,
      );
      testRunOutput = results[0]?.output ?? "";
      testsPassed = results[0]?.passed ?? true;
    } catch (vitestErr) {
      logger.warn("runWorkspaceTests: vitest command failed unexpectedly", {
        agentId,
        error: vitestErr instanceof Error ? vitestErr.message : String(vitestErr),
      });
      testsPassed = false;
      testRunOutput = `vitest failed: ${vitestErr instanceof Error ? vitestErr.message : String(vitestErr)}`;
    }

    logger.info("runWorkspaceTests: test run complete", {
      agentId, passed: testsPassed,
    });
  }

  // ── Combine output ───────────────────────────────────────────────────────
  const outputSections: string[] = [
    `Re-tested ${allFiles.length} existing workspace files after SEARCH/REPLACE patch (no new writes).`,
  ];

  if (typecheckOutput) {
    const label = typecheckPassed ? "✅ TypeScript typecheck PASSED" : "❌ TypeScript typecheck FAILED";
    outputSections.push(`## ${label}\n\`\`\`\n${typecheckOutput}\n\`\`\``);
  } else if (tsFiles.length > 0) {
    outputSections.push("## ✅ TypeScript typecheck PASSED (no output)");
  }

  if (testRunOutput) {
    const label = testsPassed ? "✅ Tests PASSED" : "❌ Tests FAILED";
    outputSections.push(`## ${label}\n\`\`\`\n${testRunOutput}\n\`\`\``);
  } else if (testFiles.length > 0) {
    outputSections.push("## ✅ Tests PASSED (no output)");
  }

  return {
    filesWritten: 0, // no new files written — patches were applied in-place
    writtenPaths: allFiles,
    testOutput: outputSections.join("\n\n"),
    typecheckPassed,
    testsPassed,
  };
}
