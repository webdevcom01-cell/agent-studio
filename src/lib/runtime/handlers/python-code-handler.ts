import { logger } from "@/lib/logger";
import { executePython } from "../python-executor";
import type { NodeHandler } from "../types";

const MAX_CODE_LENGTH = 20_000;
const EXECUTION_TIMEOUT_MS = 10_000;

/** Dangerous module patterns blocked in Python code */
const BLOCKED_PATTERNS = [
  /\bimport\s+os\b/,
  /\bfrom\s+os\b/,
  /\bimport\s+subprocess\b/,
  /\bfrom\s+subprocess\b/,
  /\bimport\s+socket\b/,
  /\bfrom\s+socket\b/,
  /\bimport\s+urllib\b/,
  /\bfrom\s+urllib\b/,
  /\bimport\s+requests\b/,
  /\bfrom\s+requests\b/,
  /\bopen\s*\(/,
  /\b__import__\s*\(/,
  /\beval\s*\(/,
  /\bexec\s*\(/,
  /\bcompile\s*\(/,
  /\bgetattr\s*\(\s*__builtins__/,
];

function validatePythonCode(code: string): string | null {
  if (code.length > MAX_CODE_LENGTH) {
    return `Code exceeds maximum length of ${MAX_CODE_LENGTH} characters.`;
  }
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(code)) {
      return `Code contains a blocked pattern: ${pattern.source}`;
    }
  }
  return null;
}

export const pythonCodeHandler: NodeHandler = async (node, context) => {
  const code = (node.data.code as string) ?? "";
  const outputVariable = (node.data.outputVariable as string) ?? "";

  if (!code.trim()) {
    return { messages: [], nextNodeId: null, waitForInput: false };
  }

  const validationError = validatePythonCode(code);
  if (validationError) {
    return {
      messages: [
        {
          role: "assistant",
          content: `⚠️ Python code blocked: ${validationError}`,
        },
      ],
      nextNodeId: null,
      waitForInput: false,
    };
  }

  try {
    const response = await executePython({
      code,
      variables: context.variables,
      timeout: EXECUTION_TIMEOUT_MS,
    });

    if (!response.success) {
      const errorContent = response.error ?? "Unknown Python error";
      logger.error("Python code execution failed", { error: errorContent, agentId: context.agentId });
      return {
        messages: [
          {
            role: "assistant",
            content: `❌ Python error:\n\`\`\`\n${errorContent}\n\`\`\``,
          },
        ],
        nextNodeId: null,
        waitForInput: false,
      };
    }

    const messages = [];

    // Emit stdout output as a message if it exists
    if (response.output.trim()) {
      messages.push({
        role: "assistant" as const,
        content: response.output.trim(),
        metadata: {
          nodeType: "python_code",
          plots: response.plots,
        },
      });
    }

    // Emit plots as a separate message if there are plots and no stdout
    if (response.plots.length > 0 && !response.output.trim()) {
      messages.push({
        role: "assistant" as const,
        content: `[Python generated ${response.plots.length} plot(s)]`,
        metadata: {
          nodeType: "python_code",
          plots: response.plots,
        },
      });
    }

    return {
      messages,
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: outputVariable
        ? { [outputVariable]: response.result }
        : undefined,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const isTimeout = errorMsg.includes("timed out");
    const content = isTimeout
      ? "⏱️ Python execution timed out."
      : "❌ Error executing Python code.";

    logger.error("Python code handler error", error, { agentId: context.agentId });

    return {
      messages: [{ role: "assistant", content }],
      nextNodeId: null,
      waitForInput: false,
    };
  }
};
