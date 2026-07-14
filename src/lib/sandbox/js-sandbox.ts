/**
 * F7-1: JavaScript execution for the code_interpreter node.
 *
 * SECURITY: Node's `vm` module is NOT a security boundary (per official docs);
 * `this.constructor.constructor("return process")()` trivially escapes it.
 * code_interpreter runs generated / low-trust code, so execution is routed
 * through the E2B isolated cloud sandbox (the org's sanctioned sandbox —
 * E2B_API_KEY is provisioned in prod).
 *
 * FAIL-CLOSED: if E2B is not configured, execution is REFUSED with a clear
 * error. There is NO `vm` fallback — an unconfigured sandbox must never
 * silently downgrade to an in-process interpreter.
 */

import { Sandbox } from "@e2b/code-interpreter";
import { logger } from "@/lib/logger";

export interface JSSandboxResult {
  stdout: string;
  stderr: string;
  result: unknown;
  executionTimeMs: number;
  error: string | null;
}

const DEFAULT_TIMEOUT_MS = 30_000;

function isE2BConfigured(): boolean {
  return Boolean(process.env.E2B_API_KEY);
}

/**
 * Execute JavaScript in an isolated E2B sandbox. Fail-closed if E2B is unset.
 * `variables` are injected as `const <name> = <json>;` prelude so existing
 * code_interpreter flows keep the same variable access, without exposing any
 * host object to the guest.
 */
export async function executeJS(
  code: string,
  variables: Record<string, unknown> = {},
  options: { timeoutMs?: number; memoryMb?: number } = {},
): Promise<JSSandboxResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const start = Date.now();

  if (!isE2BConfigured()) {
    const error =
      "Code execution refused: E2B sandbox is not configured (E2B_API_KEY unset). " +
      "The in-process `vm` fallback is disabled for security (fail-closed).";
    logger.error("js-sandbox: E2B not configured — refusing execution (fail-closed)");
    return { stdout: "", stderr: error, result: null, executionTimeMs: Date.now() - start, error };
  }

  let prelude = "";
  try {
    prelude = Object.entries(variables)
      .map(([k, v]) => `const ${k} = ${JSON.stringify(v ?? null)};`)
      .join("\n");
  } catch {
    prelude = ""; // non-serializable variable — skip injection rather than fail
  }

  let sandbox: Sandbox | null = null;
  try {
    sandbox = await Sandbox.create({ apiKey: process.env.E2B_API_KEY });
    const execution = await sandbox.runCode(`${prelude}\n${code}`, {
      language: "js",
      timeoutMs,
    });

    const stdout = execution.logs.stdout.join("");
    const stderr = execution.logs.stderr.join("");
    const mainResult = execution.results.find((r) => r.isMainResult) ?? execution.results[0];

    if (execution.error) {
      const msg = `${execution.error.name}: ${execution.error.value}`;
      return { stdout, stderr: stderr || msg, result: null, executionTimeMs: Date.now() - start, error: msg };
    }

    return {
      stdout,
      stderr,
      result: mainResult?.text ?? null,
      executionTimeMs: Date.now() - start,
      error: null,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.warn("js-sandbox: E2B execution failed", { error: errorMsg });
    return { stdout: "", stderr: errorMsg, result: null, executionTimeMs: Date.now() - start, error: errorMsg };
  } finally {
    if (sandbox) {
      try {
        await sandbox.kill();
      } catch {
        // ignore cleanup errors
      }
    }
  }
}
