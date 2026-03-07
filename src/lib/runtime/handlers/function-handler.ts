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
    const sandboxedVars = JSON.parse(JSON.stringify(context.variables));

    const func = new Function(
      "vars", "$String", "$Number", "$Boolean", "$Array", "$Object", "$Date", "$Math", "$JSON",
      "globalThis", "global", "process", "require", "module", "exports",
      "fetch", "XMLHttpRequest", "WebSocket", "setTimeout", "setInterval", "setImmediate", "queueMicrotask", "Buffer",
      `"use strict";
      var variables = vars;
      var String = $String, Number = $Number, Boolean = $Boolean;
      var Array = $Array, Object = $Object, Date = $Date;
      var Math = $Math, JSON = $JSON;
      return (function() { ${code} })();`
    );

    const result = func(
      sandboxedVars,
      String, Number, Boolean, Array, Object, Date, Math, JSON,
      undefined, undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined
    );

    return {
      messages: [],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: outputVariable ? { [outputVariable]: result } : undefined,
    };
  } catch (error) {
    logger.error("Function execution failed", error, { agentId: context.agentId });
    return {
      messages: [{ role: "assistant", content: "Error executing function." }],
      nextNodeId: null,
      waitForInput: false,
    };
  }
};
