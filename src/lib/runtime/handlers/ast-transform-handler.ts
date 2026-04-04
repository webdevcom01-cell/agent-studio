/**
 * ast_transform handler — Phase F2
 *
 * Structural AST search + optional refactor using @ast-grep/napi.
 *
 * Config:
 *   node.data.source      {string}  Source code (or variable reference via {{var}})
 *   node.data.pattern     {string}  AST-grep structural pattern
 *   node.data.language    {string}  Language hint ("typescript" | "python" | …)
 *                                   Defaults to "typescript"
 *   node.data.replacement {string}  Optional replacement template (uses $CAP syntax)
 *   node.data.outputVariable {string} Variable to store AstTransformOutput
 *
 * Output shape stored in outputVariable:
 * {
 *   available: boolean      — false when native addon not installed
 *   matches: AstGrepMatch[] — structural matches found
 *   transformed: string     — source with replacements applied (or original)
 *   error?: string          — set when pattern is syntactically invalid
 * }
 */

import type { NodeHandler } from "../types";
import { resolveTemplate } from "../template";
import { logger } from "@/lib/logger";
import {
  astGrepSearch,
  detectLanguage,
  type AstGrepLanguage,
} from "@/lib/ast/ast-grep-client";

const DEFAULT_OUTPUT_VARIABLE = "ast_result";

export const astTransformHandler: NodeHandler = async (node, context) => {
  const sourceTemplate = (node.data.source as string) ?? "";
  const pattern = (node.data.pattern as string) ?? "";
  const langHint =
    (node.data.language as string) ??
    detectLanguage("ts") ??
    "typescript";
  const replacement = (node.data.replacement as string) ?? "";
  const outputVariable =
    (node.data.outputVariable as string) || DEFAULT_OUTPUT_VARIABLE;

  // Resolve {{variable}} references in source and pattern
  const source = resolveTemplate(sourceTemplate, context.variables);
  const resolvedPattern = resolveTemplate(pattern, context.variables);

  if (!resolvedPattern.trim()) {
    return {
      messages: [
        {
          role: "assistant",
          content: "AST Transform: no pattern provided — skipping.",
        },
      ],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: {
        ...context.variables,
        [outputVariable]: {
          available: true,
          matches: [],
          transformed: source,
        },
      },
    };
  }

  const lang = (langHint as AstGrepLanguage) ?? "typescript";

  try {
    const result = await astGrepSearch(source, resolvedPattern, lang);

    // Apply replacement if provided and addon is available
    let transformed = source;
    if (replacement && result.available && result.matches.length > 0 && !result.error) {
      // Simple string replacement using the match positions in reverse order
      // (reverse to preserve offsets while mutating)
      const lines = source.split("\n");
      let lineArray = [...lines];

      // Build character-offset based replacement
      // For now: replace the matched text with the replacement template,
      // substituting $CAPTURE_NAME tokens
      for (const match of [...result.matches].reverse()) {
        let replacedText = replacement;
        for (const [capKey, capVal] of Object.entries(match.captures)) {
          replacedText = replacedText.replaceAll(`$${capKey}`, capVal);
        }

        // Replace the matched text on the single-line case (most common)
        if (match.startLine === match.endLine) {
          const line = lineArray[match.startLine];
          if (line !== undefined) {
            lineArray[match.startLine] =
              line.slice(0, match.startCol) +
              replacedText +
              line.slice(match.endCol);
          }
        } else {
          // Multi-line replacement: replace from startLine:startCol to endLine:endCol
          const firstLine = lineArray[match.startLine];
          const lastLine = lineArray[match.endLine];
          if (firstLine !== undefined && lastLine !== undefined) {
            const before = firstLine.slice(0, match.startCol);
            const after = lastLine.slice(match.endCol);
            lineArray = [
              ...lineArray.slice(0, match.startLine),
              before + replacedText + after,
              ...lineArray.slice(match.endLine + 1),
            ];
          }
        }
      }
      transformed = lineArray.join("\n");
    }

    const output = {
      available: result.available,
      matches: result.matches,
      transformed,
      error: result.error,
    };

    const matchCount = result.matches.length;
    const summary = result.available
      ? `Found ${matchCount} match${matchCount === 1 ? "" : "es"}${replacement ? `, applied transformations` : ""}.`
      : "AST search unavailable (native addon not installed).";

    logger.info("ast_transform node executed", {
      agentId: context.agentId,
      lang,
      matchCount,
      available: result.available,
    });

    return {
      messages: [{ role: "assistant", content: summary }],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: {
        ...context.variables,
        [outputVariable]: output,
      },
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error("ast_transform handler error", { agentId: context.agentId, error });
    return {
      messages: [{ role: "assistant", content: `AST Transform error: ${errorMsg}` }],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: {
        ...context.variables,
        [outputVariable]: {
          available: false,
          matches: [],
          transformed: source,
          error: errorMsg,
        },
      },
    };
  }
};
