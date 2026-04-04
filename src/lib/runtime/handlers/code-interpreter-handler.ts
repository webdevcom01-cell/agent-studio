import type { NodeHandler } from "../types";
import { resolveTemplate } from "../template";
import { executeJS } from "@/lib/sandbox/js-sandbox";
import { executePython } from "@/lib/sandbox/python-sandbox";
import { astGrepSearch, detectLanguage, type AstGrepLanguage } from "@/lib/ast/ast-grep-client";
import { logger } from "@/lib/logger";

const DEFAULT_OUTPUT_VARIABLE = "code_result";
const MAX_TIMEOUT_SECONDS = 120;

type CodeInterpreterMode = "eval" | "ast_match" | "ast_replace";

/**
 * code_interpreter — Secure sandbox execution for Python and JavaScript,
 * with optional AST-grep pattern matching and replacement (Phase F2.3).
 *
 * mode:
 *   "eval"        — (default) Run code in sandboxed VM
 *   "ast_match"   — Structural pattern search using AST-grep
 *   "ast_replace" — Pattern search + replacement using AST-grep
 */
export const codeInterpreterHandler: NodeHandler = async (node, context) => {
  const mode: CodeInterpreterMode =
    (node.data.mode as string) === "ast_match"
      ? "ast_match"
      : (node.data.mode as string) === "ast_replace"
        ? "ast_replace"
        : "eval";
  const language = (node.data.language as string) ?? "python";
  const codeTemplate = (node.data.code as string) ?? "";
  const timeout = Math.min(
    (node.data.timeout as number) ?? 30,
    MAX_TIMEOUT_SECONDS,
  );
  const packages = (node.data.packages as string) ?? "";
  const outputVariable =
    (node.data.outputVariable as string) || DEFAULT_OUTPUT_VARIABLE;
  const captureOutput = (node.data.captureOutput as boolean) ?? true;

  const code = resolveTemplate(codeTemplate, context.variables);

  if (!code) {
    return {
      messages: [
        { role: "assistant", content: "Code Interpreter has no code to execute." },
      ],
      nextNodeId: null,
      waitForInput: false,
    };
  }

  // ── AST mode (F2.3) ──────────────────────────────────────────────────────
  if (mode === "ast_match" || mode === "ast_replace") {
    return handleAstMode(node, context, mode, code, language, outputVariable);
  }

  const timeoutMs = timeout * 1000;
  const memoryMb = Number(process.env.CODE_INTERPRETER_MEMORY_MB ?? "512");

  try {
    if (language === "javascript") {
      const result = await executeJS(code, context.variables, {
        timeoutMs,
        memoryMb,
      });

      return {
        messages: [],
        nextNodeId: null,
        waitForInput: false,
        updatedVariables: {
          ...context.variables,
          [outputVariable]: {
            stdout: captureOutput ? result.stdout : "",
            stderr: result.stderr,
            result: result.result,
            charts: [],
            executionTimeMs: result.executionTimeMs,
            error: result.error,
            memoryUsedMb: 0,
          },
        },
      };
    }

    // Python
    const packageList = packages
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);

    const result = await executePython(code, context.variables, {
      timeoutMs,
      packages: packageList,
    });

    return {
      messages: [],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: {
        ...context.variables,
        [outputVariable]: {
          stdout: captureOutput ? result.stdout : "",
          stderr: result.stderr,
          result: result.result,
          charts: result.charts,
          executionTimeMs: result.executionTimeMs,
          error: result.error,
          memoryUsedMb: result.memoryUsedMb,
        },
      },
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      messages: [],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: {
        ...context.variables,
        [outputVariable]: `[Error: ${errorMsg}]`,
      },
    };
  }
};

// ─── AST-grep mode helper (F2.3) ────────────────────────────────────────────

async function handleAstMode(
  node: Parameters<NodeHandler>[0],
  context: Parameters<NodeHandler>[1],
  mode: "ast_match" | "ast_replace",
  source: string,
  language: string,
  outputVariable: string,
): ReturnType<NodeHandler> {
  const pattern = resolveTemplate(
    (node.data.pattern as string) ?? "",
    context.variables,
  );
  const replacement = resolveTemplate(
    (node.data.replacement as string) ?? "",
    context.variables,
  );

  if (!pattern.trim()) {
    return {
      messages: [
        { role: "assistant", content: "Code Interpreter (AST mode): no pattern provided." },
      ],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: {
        ...context.variables,
        [outputVariable]: { available: true, matches: [], transformed: source },
      },
    };
  }

  try {
    const lang = (detectLanguage(language) ?? "typescript") as AstGrepLanguage;
    const result = await astGrepSearch(source, pattern, lang);

    // Apply replacement in ast_replace mode
    let transformed = source;
    if (mode === "ast_replace" && replacement && result.available && result.matches.length > 0 && !result.error) {
      const lines = [...source.split("\n")];
      for (const match of [...result.matches].reverse()) {
        let replacedText = replacement;
        for (const [capKey, capVal] of Object.entries(match.captures)) {
          replacedText = replacedText.replaceAll(`$${capKey}`, capVal);
        }
        if (match.startLine === match.endLine) {
          const line = lines[match.startLine];
          if (line !== undefined) {
            lines[match.startLine] =
              line.slice(0, match.startCol) + replacedText + line.slice(match.endCol);
          }
        }
      }
      transformed = lines.join("\n");
    }

    const matchCount = result.matches.length;
    const summary = result.available
      ? `AST ${mode}: ${matchCount} match${matchCount === 1 ? "" : "es"}${mode === "ast_replace" && replacement ? ", replacements applied" : ""}.`
      : "AST search unavailable (native addon not installed).";

    logger.info("code_interpreter AST mode", {
      agentId: context.agentId,
      mode,
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
        [outputVariable]: {
          available: result.available,
          matches: result.matches,
          transformed,
          error: result.error,
        },
      },
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error("code_interpreter AST mode error", { error: errorMsg });
    return {
      messages: [{ role: "assistant", content: `AST error: ${errorMsg}` }],
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
}
