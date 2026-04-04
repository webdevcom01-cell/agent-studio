/**
 * AST-Grep Client — Phase F2
 *
 * Thin wrapper around @ast-grep/napi with:
 * - Dynamic import + graceful fallback (returns null when native addon unavailable)
 * - Language detection from file extension
 * - Structured match results typed without exposing napi internals
 *
 * NOTE: @ast-grep/napi is a Rust native addon. It may be unavailable on some
 * platforms.  All code paths that touch the module are behind dynamic import
 * and wrapped in try/catch so the rest of the app continues to work.
 */

import { logger } from "@/lib/logger";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AstGrepLanguage =
  | "typescript"
  | "javascript"
  | "tsx"
  | "jsx"
  | "python"
  | "rust"
  | "go"
  | "java"
  | "c"
  | "cpp";

export interface AstGrepMatch {
  /** The matched source text. */
  text: string;
  /** 0-based start line. */
  startLine: number;
  /** 0-based end line. */
  endLine: number;
  /** 0-based start column. */
  startCol: number;
  /** 0-based end column. */
  endCol: number;
  /** Named capture groups from the pattern (e.g. $FUNC_NAME). */
  captures: Record<string, string>;
}

export interface AstGrepResult {
  /** Whether @ast-grep/napi was available. */
  available: boolean;
  /** Matches found. Empty array if pattern matched nothing or addon unavailable. */
  matches: AstGrepMatch[];
  /** Error message when the pattern itself is invalid. */
  error?: string;
}

// Minimal duck-typed interface for the napi module — avoids static dependency.
interface NapiModule {
  parse: (lang: unknown, source: string) => NapiRoot;
  Lang: Record<string, unknown>;
}
interface NapiRoot {
  root: () => NapiNode;
}
interface NapiNode {
  findAll: (rule: { rule: { pattern: string } }) => NapiMatch[];
}
interface NapiMatch {
  text: () => string;
  range: () => {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
  getEnv: () => Record<string, { text: () => string }> | null;
}

// ─── Language detection ───────────────────────────────────────────────────────

const EXT_TO_LANG: Record<string, AstGrepLanguage> = {
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  jsx: "jsx",
  py: "python",
  rs: "rust",
  go: "go",
  java: "java",
  c: "c",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
};

/**
 * Detect language from file extension or explicit hint.
 * Returns null when language is unknown.
 */
export function detectLanguage(
  filePathOrExt: string,
): AstGrepLanguage | null {
  const ext = filePathOrExt.includes(".")
    ? filePathOrExt.split(".").pop()?.toLowerCase() ?? ""
    : filePathOrExt.toLowerCase();
  return EXT_TO_LANG[ext] ?? null;
}

// ─── Main search function ─────────────────────────────────────────────────────

const LANG_KEY_MAP: Partial<Record<AstGrepLanguage, string>> = {
  typescript: "TypeScript",
  tsx: "Tsx",
  javascript: "JavaScript",
  jsx: "JavaScript", // napi has no separate Jsx
  python: "Python",
  rust: "Rust",
  go: "Go",
  java: "Java",
  c: "C",
  cpp: "Cpp",
};

/**
 * Run an AST-grep structural pattern search over source code.
 *
 * Returns `{ available: false, matches: [] }` when @ast-grep/napi is not
 * installed (e.g. local dev without native addon).  Callers should degrade
 * gracefully — surfacing the "addon unavailable" state to the user.
 *
 * @param source  Source code as a string.
 * @param pattern AST-grep structural pattern (e.g. `console.log($ARG)`).
 * @param lang    Target language. Use `detectLanguage()` to infer from path.
 */
export async function astGrepSearch(
  source: string,
  pattern: string,
  lang: AstGrepLanguage,
): Promise<AstGrepResult> {
  // Dynamic import — avoids breaking the bundle when native addon is absent.
  let napi: NapiModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    napi = (await import("@ast-grep/napi")) as unknown as NapiModule;
  } catch {
    logger.warn("@ast-grep/napi unavailable — AST search disabled", { lang });
    return { available: false, matches: [] };
  }

  try {
    const langKey = LANG_KEY_MAP[lang];
    if (!langKey) {
      return {
        available: true,
        matches: [],
        error: `Unsupported language: ${lang}`,
      };
    }

    const napiLang = napi.Lang[langKey];
    if (napiLang === undefined) {
      return {
        available: true,
        matches: [],
        error: `Language not found in napi.Lang: ${langKey}`,
      };
    }

    const root = napi.parse(napiLang, source);
    const rawMatches = root.root().findAll({ rule: { pattern } });

    const matches: AstGrepMatch[] = rawMatches.map((m: NapiMatch) => {
      const range = m.range();
      const captures: Record<string, string> = {};

      const env = m.getEnv();
      if (env) {
        for (const [key, node] of Object.entries(env)) {
          if (node && typeof node.text === "function") {
            captures[key] = node.text();
          }
        }
      }

      return {
        text: m.text(),
        startLine: range.start.line,
        endLine: range.end.line,
        startCol: range.start.column,
        endCol: range.end.column,
        captures,
      };
    });

    return { available: true, matches };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.warn("ast-grep pattern error", { pattern, lang, error: errorMsg });
    return { available: true, matches: [], error: errorMsg };
  }
}
