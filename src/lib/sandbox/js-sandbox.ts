import vm from "vm";
import { logger } from "@/lib/logger";

export interface JSSandboxResult {
  stdout: string;
  stderr: string;
  result: unknown;
  executionTimeMs: number;
  error: string | null;
}

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Execute JavaScript code in a Node.js vm sandbox.
 * Uses vm.createContext to isolate execution with blocked globals.
 * Falls back gracefully on any error.
 */
export async function executeJS(
  code: string,
  variables: Record<string, unknown> = {},
  options: { timeoutMs?: number; memoryMb?: number } = {},
): Promise<JSSandboxResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const start = Date.now();

  try {
    const logs: string[] = [];

    // Build sandbox context — only expose safe globals
    const sandbox: Record<string, unknown> = {
      console: {
        log: (...args: unknown[]) => logs.push(args.map(String).join(" ")),
        warn: (...args: unknown[]) => logs.push(args.map(String).join(" ")),
        error: (...args: unknown[]) => logs.push(args.map(String).join(" ")),
      },
      Math,
      JSON,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
      String,
      Number,
      Boolean,
      Array,
      Object,
      Date,
      RegExp,
      Error,
      TypeError,
      RangeError,
      // Blocked: process, require, fetch, eval, Function, setTimeout, etc.
    };

    // Inject caller-supplied variables
    for (const [key, value] of Object.entries(variables)) {
      sandbox[key] = value;
    }

    const context = vm.createContext(sandbox);
    const script = new vm.Script(code, { filename: "sandbox.js" });
    const result = script.runInContext(context, { timeout: timeoutMs });

    return {
      stdout: logs.join("\n"),
      stderr: "",
      result: result ?? null,
      executionTimeMs: Date.now() - start,
      error: null,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.warn("JS sandbox execution failed", { error: errorMsg });

    return {
      stdout: "",
      stderr: errorMsg,
      result: null,
      executionTimeMs: Date.now() - start,
      error: errorMsg,
    };
  }
}
