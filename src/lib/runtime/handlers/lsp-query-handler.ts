/**
 * lsp_query handler — Phase F1
 *
 * Runs a Language Server Protocol operation on a source code snippet:
 *   hover        — type information + documentation at a position
 *   definition   — symbol definition locations
 *   completion   — completion items at a position
 *   diagnostics  — syntax / type errors in the file
 *
 * Config (node.data):
 *   operation       {string}  "hover" | "definition" | "completion" | "diagnostics"
 *   source          {string}  Source code (or {{variable}} reference)
 *   language        {string}  "typescript" | "javascript" | "python" (default: "typescript")
 *   line            {number}  0-based line for position-based operations (default: 0)
 *   character       {number}  0-based character offset (default: 0)
 *   outputVariable  {string}  Variable to store LspQueryOutput (default: "lsp_result")
 *
 * Output shape (stored in outputVariable):
 * {
 *   available: boolean         — false when LSP server binary not found
 *   operation: LspOperation
 *   result: LspOperationResult | null
 *   error?: string
 * }
 *
 * Non-fatal when LSP server unavailable — handler never throws.
 */

import type { NodeHandler } from "../types";
import { resolveTemplate } from "../template";
import { logger } from "@/lib/logger";
import { acquireLspClient } from "@/lib/lsp/pool";
import type { LspLanguage, LspOperation, LspQueryOutput } from "@/lib/lsp/types";

const DEFAULT_OUTPUT_VARIABLE = "lsp_result";
const VALID_OPERATIONS = new Set<string>(["hover", "definition", "completion", "diagnostics"]);
const VALID_LANGUAGES = new Set<string>(["typescript", "javascript", "python"]);

export const lspQueryHandler: NodeHandler = async (node, context) => {
  const operationRaw = (node.data.operation as string) ?? "hover";
  const sourceTemplate = (node.data.source as string) ?? "";
  const languageRaw = (node.data.language as string) ?? "typescript";
  const line = typeof node.data.line === "number" ? node.data.line : 0;
  const character = typeof node.data.character === "number" ? node.data.character : 0;
  const outputVariable =
    (node.data.outputVariable as string) || DEFAULT_OUTPUT_VARIABLE;

  // Validate operation
  const operation: LspOperation = VALID_OPERATIONS.has(operationRaw)
    ? (operationRaw as LspOperation)
    : "hover";

  // Validate language
  const language: LspLanguage = VALID_LANGUAGES.has(languageRaw)
    ? (languageRaw as LspLanguage)
    : "typescript";

  // Resolve {{variable}} in source
  const source = resolveTemplate(sourceTemplate, context.variables);

  if (!source.trim()) {
    const output: LspQueryOutput = {
      available: true,
      operation,
      result: null,
      error: "No source provided",
    };
    return {
      messages: [{ role: "assistant", content: "LSP Query: no source provided — skipping." }],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: { ...context.variables, [outputVariable]: output },
    };
  }

  try {
    const client = await acquireLspClient(language);
    const result = await client.executeOperation(operation, source, language, line, character);

    const summary = buildSummary(operation, result);

    logger.info("lsp_query node executed", {
      agentId: context.agentId,
      operation,
      language,
      line,
      character,
    });

    const output: LspQueryOutput = { available: true, operation, result };

    return {
      messages: [{ role: "assistant", content: summary }],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: { ...context.variables, [outputVariable]: output },
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const isUnavailable =
      errorMsg.includes("ENOENT") ||
      errorMsg.includes("not found") ||
      errorMsg.includes("timed out");

    logger.warn("lsp_query handler error", {
      agentId: context.agentId,
      operation,
      language,
      error: errorMsg,
    });

    const output: LspQueryOutput = {
      available: !isUnavailable,
      operation,
      result: null,
      error: errorMsg,
    };

    return {
      messages: [
        {
          role: "assistant",
          content: isUnavailable
            ? `LSP server unavailable for ${language}: ${errorMsg}`
            : `LSP Query error: ${errorMsg}`,
        },
      ],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: { ...context.variables, [outputVariable]: output },
    };
  }
};

// ─── Summary helpers ──────────────────────────────────────────────────────────

function buildSummary(
  operation: LspOperation,
  result: import("@/lib/lsp/types").LspOperationResult,
): string {
  switch (operation) {
    case "hover": {
      const r = result as import("@/lib/lsp/types").LspHoverResult;
      return r.contents
        ? `Hover: ${r.contents.slice(0, 120)}${r.contents.length > 120 ? "…" : ""}`
        : "Hover: no information";
    }
    case "definition": {
      const r = result as import("@/lib/lsp/types").LspDefinitionResult;
      return `Definition: ${r.locations.length} location${r.locations.length === 1 ? "" : "s"} found`;
    }
    case "completion": {
      const r = result as import("@/lib/lsp/types").LspCompletionResult;
      return `Completion: ${r.items.length} item${r.items.length === 1 ? "" : "s"}${r.isIncomplete ? " (incomplete)" : ""}`;
    }
    case "diagnostics": {
      const r = result as import("@/lib/lsp/types").LspDiagnosticsResult;
      const errors = r.diagnostics.filter((d) => d.severity === 1).length;
      const warnings = r.diagnostics.filter((d) => d.severity === 2).length;
      return `Diagnostics: ${errors} error${errors === 1 ? "" : "s"}, ${warnings} warning${warnings === 1 ? "" : "s"}`;
    }
    default:
      return "LSP Query complete";
  }
}
