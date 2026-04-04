/**
 * LSP integration types — Phase F1
 *
 * Minimal type definitions for the LSP client.  No external package dependency;
 * shapes mirror the Language Server Protocol 3.17 specification.
 */

// ─── Config ───────────────────────────────────────────────────────────────────

export type LspLanguage = "typescript" | "javascript" | "python";

export type LspOperation =
  | "hover"
  | "definition"
  | "completion"
  | "diagnostics";

// ─── LSP protocol primitives ──────────────────────────────────────────────────

export interface LspPosition {
  /** 0-based line. */
  line: number;
  /** 0-based character offset. */
  character: number;
}

export interface LspRange {
  start: LspPosition;
  end: LspPosition;
}

export interface LspLocation {
  uri: string;
  range: LspRange;
}

// ─── Per-operation result shapes ──────────────────────────────────────────────

export interface LspHoverResult {
  contents: string;
  range?: LspRange;
}

export interface LspDefinitionResult {
  locations: LspLocation[];
}

export interface LspCompletionItem {
  label: string;
  kind?: number;
  detail?: string;
  documentation?: string;
  insertText?: string;
}

export interface LspCompletionResult {
  items: LspCompletionItem[];
  isIncomplete: boolean;
}

export interface LspDiagnostic {
  range: LspRange;
  severity: 1 | 2 | 3 | 4; // 1=Error, 2=Warning, 3=Info, 4=Hint
  message: string;
  source?: string;
  code?: string | number;
}

export interface LspDiagnosticsResult {
  diagnostics: LspDiagnostic[];
}

export type LspOperationResult =
  | LspHoverResult
  | LspDefinitionResult
  | LspCompletionResult
  | LspDiagnosticsResult;

// ─── Unified handler output ───────────────────────────────────────────────────

export interface LspQueryOutput {
  /** Whether the LSP server was reachable. */
  available: boolean;
  /** Which operation was performed. */
  operation: LspOperation;
  /** Result data — shape depends on operation. */
  result: LspOperationResult | null;
  /** Error message if the operation failed. */
  error?: string;
}

// ─── Internal server config ───────────────────────────────────────────────────

export interface LspServerConfig {
  language: LspLanguage;
  /** Command to launch the language server, e.g. "typescript-language-server" */
  command: string;
  /** Command-line args, e.g. ["--stdio"] */
  args: string[];
}

export const LSP_SERVER_CONFIGS: Record<LspLanguage, LspServerConfig> = {
  typescript: {
    language: "typescript",
    command: "typescript-language-server",
    args: ["--stdio"],
  },
  javascript: {
    language: "javascript",
    command: "typescript-language-server",
    args: ["--stdio"],
  },
  python: {
    language: "python",
    command: "pyright-langserver",
    args: ["--stdio"],
  },
};

export const LSP_LANGUAGE_ID: Record<LspLanguage, string> = {
  typescript: "typescript",
  javascript: "javascript",
  python: "python",
};
