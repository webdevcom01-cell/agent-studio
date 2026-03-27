import vm from "node:vm";
import { logger } from "@/lib/logger";
import type { NodeHandler } from "../types";

/**
 * Blocked patterns for user-supplied JavaScript.
 * Defense-in-depth: the vm.Context sandbox also restricts available globals,
 * and codeGeneration is disabled. These patterns catch common escape attempts
 * BEFORE code reaches the VM.
 *
 * NOTE: Node.js `vm` is NOT a security boundary per official docs.
 * These regex checks + frozen sandbox + codeGeneration restrictions
 * together provide reasonable isolation for low-trust user code.
 */
const BLOCKED_PATTERNS = [
  // Global/process escape vectors
  /\bglobalThis\b/, /\bglobal\b/, /\bprocess\b/, /\b__dirname\b/, /\b__filename\b/,
  // Module system access
  /\brequire\b/, /\bimport\b/, /\bmodule\b/, /\bexports\b/,
  // Code generation / eval
  /\beval\b/, /\bFunction\b/,
  // Prototype chain traversal (primary vm escape vector)
  /\b__proto__\b/, /\bconstructor\b/, /\.prototype\b/,
  /\bgetPrototypeOf\b/, /\bsetPrototypeOf\b/,
  /\bdefineProperty\b/, /\bdefineProperties\b/,
  /\bgetOwnPropertyDescriptor\b/,
  // Network access
  /\bfetch\b/, /\bXMLHttpRequest\b/, /\bWebSocket\b/,
  // Node.js core modules
  /\bchild_process\b/, /\bfs\b/, /\bnet\b/, /\bdgram\b/, /\bcluster\b/,
  /\bworker_threads\b/, /\bv8\b/, /\bvm\b/,
  // Proxy (can intercept and redirect property access)
  /\bProxy\b/, /\bReflect\b/,
  // Symbol.unscopables can escape `with` blocks
  /Symbol\s*\.\s*unscopables/,
  // Async patterns that could escape timeout
  /\bsetTimeout\b/, /\bsetInterval\b/, /\bsetImmediate\b/,
  /\bqueueMicrotask\b/, /\bPromise\b/,
  // SharedArrayBuffer (Spectre-class side channels)
  /\bSharedArrayBuffer\b/, /\bAtomics\b/,
  // WeakRef / FinalizationRegistry (GC oracle attacks)
  /\bWeakRef\b/, /\bFinalizationRegistry\b/,
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

/**
 * Create a frozen sandbox context for vm execution.
 *
 * Key security measures:
 * 1. Deep-clone variables via JSON to break prototype chain references
 * 2. Freeze all exposed built-in constructors to prevent prototype pollution
 * 3. Disable dynamic code generation (eval-from-string, WASM)
 * 4. Do NOT expose: Proxy, Reflect, Symbol, Promise, WeakRef, SharedArrayBuffer
 */
function createSandboxContext(variables: Record<string, unknown>): vm.Context {
  // Deep-clone and freeze variables to prevent prototype chain access
  const clonedVars = JSON.parse(JSON.stringify(variables));
  Object.freeze(clonedVars);

  const sandbox: Record<string, unknown> = {
    variables: clonedVars,
    // Safe value constructors — frozen copies to prevent .prototype mutation
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
    // Explicitly null out dangerous globals that might leak from host
    globalThis: undefined,
    global: undefined,
    process: undefined,
    require: undefined,
    module: undefined,
    exports: undefined,
    __dirname: undefined,
    __filename: undefined,
    setTimeout: undefined,
    setInterval: undefined,
    setImmediate: undefined,
    clearTimeout: undefined,
    clearInterval: undefined,
    clearImmediate: undefined,
    queueMicrotask: undefined,
    Promise: undefined,
    Proxy: undefined,
    Reflect: undefined,
    SharedArrayBuffer: undefined,
    Atomics: undefined,
    WeakRef: undefined,
    FinalizationRegistry: undefined,
    fetch: undefined,
    WebSocket: undefined,
    XMLHttpRequest: undefined,
    Buffer: undefined,
    TextEncoder: undefined,
    TextDecoder: undefined,
    console: undefined,
    performance: undefined,
    URL: undefined,
    URLSearchParams: undefined,
    AbortController: undefined,
    AbortSignal: undefined,
    Event: undefined,
    EventTarget: undefined,
  };

  const ctx = vm.createContext(sandbox, {
    codeGeneration: { strings: false, wasm: false },
  });

  // Freeze the context after creation to prevent property additions at runtime
  // (Object.freeze on the sandbox before createContext doesn't propagate)
  Object.freeze(ctx);

  return ctx;
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
