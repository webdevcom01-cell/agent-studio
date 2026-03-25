import vm from "node:vm";
import { logger } from "@/lib/logger";
import type { NodeHandler } from "../types";

const BLOCKED_PATTERNS = [
  /\bglobalThis\b/, /\bglobal\b/, /\bprocess\b/, /\b__dirname\b/, /\b__filename\b/,
  /\brequire\b/, /\bimport\b/, /\bmodule\b/, /\bexports\b/,
  /\beval\b/, /\bFunction\b/, /\b__proto__\b/, /\bconstructor\b/, /\.prototype\b/,
  /\bfetch\b/, /\bXMLHttpRequest\b/, /\bWebSocket\b/,
  /\bchild_process\b/, /\bfs\b/, /\bnet\b/,
];

const MAX_CODE_LENGTH = 10_000;
const VM_TIMEOUT_MS = 5_000;

function validateCode(code: string): string | null {
  if (code.length > MAX_CODE_LENGTH) {
    return `Code exceeds maximum length of ${MAX_CODE_LENGTH} characters.`;
  }
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(code)) {
      return `Code contains a blocked keyword: ${pattern.source}`;
    }
  }
  return null;
}

function createSandboxContext(variables: Record<string, unknown>): vm.Context {
  const sandbox = {
    variables: JSON.parse(JSON.stringify(variables)),
    String,
    Number,
    Boolean,
    Array,
    Object,
    Date,
    Math,
    JSON,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    undefined,
    NaN,
    Infinity,
    RegExp,
    Map,
    Set,
    Error,
  };

  return vm.createContext(sandbox, {
    codeGeneration: { strings: false, wasm: false },
  });
}

export const functionHandler: NodeHandler = async (node, context) => {
  const code = (node.data.code as string) ?? "";
  const outputVariable = (node.data.outputVariable as string) ?? "";

  if (!code.trim()) {
    return { messages: [], nextNodeId: null, waitForInput: false };
  }

  const validationError = validateCode(code);
  if (validationError) {
    return {
      messages: [{ role: "assistant", content: "Function blocked due to policy restriction." }],
      nextNodeId: null,
      waitForInput: false,
    };
  }

  try {
    const sandboxContext = createSandboxContext(context.variables);

    const wrappedCode = `"use strict"; (function() { ${code} })();`;
    const script = new vm.Script(wrappedCode, { filename: "user-function.js" });

    const result: unknown = script.runInContext(sandboxContext, {
      timeout: VM_TIMEOUT_MS,
    });

    return {
      messages: [],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: outputVariable ? { [outputVariable]: result } : undefined,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const isTimeout = errorMsg.includes("Script execution timed out");
    const content = isTimeout
      ? "Function execution timed out."
      : "Error executing function.";

    logger.error("Function execution failed", error, { agentId: context.agentId });
    return {
      messages: [{ role: "assistant", content }],
      nextNodeId: null,
      waitForInput: false,
    };
  }
};
