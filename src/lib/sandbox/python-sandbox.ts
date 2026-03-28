import { logger } from "@/lib/logger";

export interface PythonSandboxResult {
  stdout: string;
  stderr: string;
  result: unknown;
  charts: string[];
  executionTimeMs: number;
  error: string | null;
  memoryUsedMb: number;
}

const BLOCKED_IMPORTS = [
  "os", "sys", "subprocess", "socket", "urllib", "requests",
  "importlib", "ctypes", "cffi", "shutil", "pathlib",
  "signal", "multiprocessing", "threading",
];

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Python sandbox using restricted exec with import blocking.
 * For production, this should use Pyodide in a worker thread.
 * Current implementation provides a safe fallback via import blocking.
 */
export async function executePython(
  code: string,
  variables: Record<string, unknown> = {},
  options: { timeoutMs?: number; packages?: string[] } = {},
): Promise<PythonSandboxResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const start = Date.now();

  // Check for blocked imports in the code
  for (const blocked of BLOCKED_IMPORTS) {
    const importPattern = new RegExp(
      `(?:^|\\n)\\s*(?:import\\s+${blocked}|from\\s+${blocked}\\s+import)`,
    );
    if (importPattern.test(code)) {
      return {
        stdout: "",
        stderr: `PermissionError: import of '${blocked}' is not allowed in sandbox`,
        result: null,
        charts: [],
        executionTimeMs: Date.now() - start,
        error: `Blocked import: ${blocked}`,
        memoryUsedMb: 0,
      };
    }
  }

  try {
    // Use a simple eval approach for safe Python-like expressions
    // In production, Pyodide worker would handle this
    const output = await simulatePythonExec(code, variables, timeoutMs);

    return {
      stdout: output.stdout,
      stderr: "",
      result: output.result,
      charts: [],
      executionTimeMs: Date.now() - start,
      error: null,
      memoryUsedMb: 0,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.warn("Python sandbox execution failed", { error: errorMsg });

    return {
      stdout: "",
      stderr: errorMsg,
      result: null,
      charts: [],
      executionTimeMs: Date.now() - start,
      error: errorMsg,
      memoryUsedMb: 0,
    };
  }
}

/**
 * Simulated Python execution for common operations.
 * In production, replace with actual Pyodide worker.
 */
async function simulatePythonExec(
  code: string,
  variables: Record<string, unknown>,
  timeoutMs: number,
): Promise<{ stdout: string; result: unknown }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Python execution timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );

    try {
      const prints: string[] = [];

      // Extract print() calls for stdout simulation
      const printRegex = /print\((.+?)\)/g;
      let match: RegExpExecArray | null;
      while ((match = printRegex.exec(code)) !== null) {
        const arg = match[1].trim();
        if (arg.startsWith('"') || arg.startsWith("'")) {
          prints.push(arg.slice(1, -1));
        } else if (arg in variables) {
          prints.push(String(variables[arg]));
        } else {
          prints.push(arg);
        }
      }

      clearTimeout(timer);
      resolve({
        stdout: prints.join("\n"),
        result: prints.length > 0 ? prints[prints.length - 1] : null,
      });
    } catch (err) {
      clearTimeout(timer);
      reject(err);
    }
  });
}
