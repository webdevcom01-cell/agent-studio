import { logger } from "@/lib/logger";

export interface JSSandboxResult {
  stdout: string;
  stderr: string;
  result: unknown;
  executionTimeMs: number;
  error: string | null;
}

const BLOCKED_GLOBALS = [
  "process", "require", "module", "exports", "__filename", "__dirname",
  "fetch", "XMLHttpRequest", "WebSocket", "eval", "Function",
  "setTimeout", "setInterval", "setImmediate",
  "Deno", "Bun",
];

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MEMORY_MB = 128;

export async function executeJS(
  code: string,
  variables: Record<string, unknown> = {},
  options: { timeoutMs?: number; memoryMb?: number } = {},
): Promise<JSSandboxResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const memoryMb = options.memoryMb ?? DEFAULT_MEMORY_MB;
  const start = Date.now();

  try {
    const ivm = await import("isolated-vm");
    const isolate = new ivm.Isolate({ memoryLimit: memoryMb });
    const context = await isolate.createContext();

    const jail = context.global;
    await jail.set("global", jail.derefInto());

    // Block dangerous globals
    for (const name of BLOCKED_GLOBALS) {
      await jail.set(name, undefined);
    }

    // Inject variables
    for (const [key, value] of Object.entries(variables)) {
      const serialized = typeof value === "string" ? value : JSON.stringify(value);
      await jail.set(key, serialized);
    }

    // Capture console output
    const logs: string[] = [];
    const consoleRef = new ivm.Reference((msg: string) => {
      logs.push(String(msg));
    });
    await jail.set("__log", consoleRef);

    const wrappedCode = `
      const console = { log: (...args) => __log.applySync(undefined, [args.join(' ')]) };
      ${code}
    `;

    const script = await isolate.compileScript(wrappedCode);
    const result = await script.run(context, { timeout: timeoutMs });

    isolate.dispose();

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
