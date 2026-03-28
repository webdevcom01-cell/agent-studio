import type { NodeHandler } from "../types";
import { resolveTemplate } from "../template";
import { executeJS } from "@/lib/sandbox/js-sandbox";
import { executePython } from "@/lib/sandbox/python-sandbox";

const DEFAULT_OUTPUT_VARIABLE = "code_result";
const MAX_TIMEOUT_SECONDS = 120;

/**
 * code_interpreter — Secure sandbox execution for Python and JavaScript.
 * Blocks OS, network, and filesystem access.
 */
export const codeInterpreterHandler: NodeHandler = async (node, context) => {
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
