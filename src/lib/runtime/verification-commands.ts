import { join, resolve } from "node:path";
import { logger } from "@/lib/logger";

/**
 * Shared verification command validation and execution.
 *
 * Extracted from reflexive-loop-handler.ts (A3.2) for reuse by
 * both `reflexive_loop` and `verification` node handlers.
 *
 * Security model:
 * - `execFile` (not `exec`) — no shell interpretation
 * - Command prefix whitelist — only known build/test/lint tools
 * - Shell metacharacter blocking — prevents injection via `&&`, `|`, `;`, etc.
 * - Per-command timeout: 60s
 * - CI=true + FORCE_COLOR=0 env to suppress interactive prompts
 */

/**
 * Whitelist of allowed command prefixes for verification commands.
 * Only common build/test/lint tools are permitted.
 */
export const ALLOWED_COMMAND_PREFIXES = /^(npm|npx|yarn|pnpm|python|pytest|tsc|eslint|jest|vitest|cargo|go|make|dotnet|ruby|bundle|mix|gradle|mvn)\b/;

/**
 * Shell metacharacters that indicate command chaining/injection.
 * These are blocked to prevent abuse via verification commands.
 */
export const SHELL_METACHARACTERS = /[;&|`$(){}<>!#]/;

/**
 * Validate and sanitize a verification command.
 * Returns null if the command is not allowed.
 */
export function validateCommand(command: string): string | null {
  const trimmed = command.trim();
  if (!trimmed) return null;

  // Block shell metacharacters (prevents && rm -rf, pipes, subshells, etc.)
  if (SHELL_METACHARACTERS.test(trimmed)) {
    logger.warn("Verification command blocked: shell metacharacters detected", {
      command: trimmed,
    });
    return null;
  }

  // Must start with a whitelisted command
  if (!ALLOWED_COMMAND_PREFIXES.test(trimmed)) {
    logger.warn("Verification command blocked: not in whitelist", {
      command: trimmed,
    });
    return null;
  }

  return trimmed;
}

export interface CommandResult {
  command: string;
  passed: boolean;
  output: string;
  durationMs: number;
}

/**
 * Run verification commands using child_process.execFile for safety.
 * Returns per-command results + overall pass/fail + combined output string.
 *
 * Uses execFile (not exec) to avoid shell interpretation.
 * Each command gets a 60s timeout.
 */
export async function runVerificationCommands(
  commands: string[],
  agentId: string,
  timeoutMs = 60_000,
  cwd?: string,
  maxBufferBytes = 1024 * 512,
): Promise<{ allPassed: boolean; output: string; results: CommandResult[] }> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);
  // Resolve to an absolute path so PATH entries built from it are always absolute.
  const effectiveCwd = resolve(cwd ?? process.cwd());

  const outputLines: string[] = [];
  const results: CommandResult[] = [];
  let allPassed = true;

  for (const raw of commands) {
    const startMs = Date.now();
    const validated = validateCommand(raw);
    if (!validated) {
      outputLines.push(`⛔ BLOCKED: "${raw}" — command not allowed`);
      results.push({ command: raw, passed: false, output: "Command not allowed", durationMs: Date.now() - startMs });
      allPassed = false;
      continue;
    }

    // Split command into executable + args for execFile
    const parts = validated.split(/\s+/);
    const cmd = parts[0];
    const args = parts.slice(1);

    try {
      const { stdout, stderr } = await execFileAsync(cmd, args, {
        timeout: timeoutMs,
        maxBuffer: maxBufferBytes,
        env: {
          ...process.env,
          CI: "true",
          FORCE_COLOR: "0",
          NODE_OPTIONS: [process.env.NODE_OPTIONS, "--max-old-space-size=512"]
            .filter(Boolean)
            .join(" "),
          // Extend PATH so local node_modules/.bin binaries (vitest, tsc, eslint, etc.)
          // are resolved by execFile. Required on Railway: the runtime PATH does not
          // include project node_modules/.bin, so bare commands like `vitest` get ENOENT
          // without this. Include both the effective CWD dir and the Railway app root.
          PATH: [
            join(effectiveCwd, "node_modules", ".bin"),
            "/app/node_modules/.bin",
            process.env.PATH ?? "",
          ].filter(Boolean).join(":"),
        },
        cwd: effectiveCwd,
      });

      const output = (stdout + (stderr ? `\nstderr: ${stderr}` : "")).trim();
      const truncated = output.slice(0, 2000);
      outputLines.push(`✅ ${validated}\n${truncated}`);
      results.push({ command: validated, passed: true, output: truncated, durationMs: Date.now() - startMs });

      logger.info("Verification command passed", {
        agentId,
        command: validated,
      });
    } catch (error: unknown) {
      allPassed = false;
      const errMsg =
        error instanceof Error ? error.message : String(error);
      const truncated = errMsg.slice(0, 2000);
      outputLines.push(`❌ ${validated}\n${truncated}`);
      results.push({ command: validated, passed: false, output: truncated, durationMs: Date.now() - startMs });

      logger.warn("Verification command failed", {
        agentId,
        command: validated,
        error: errMsg.slice(0, 500),
      });
    }
  }

  return { allPassed, output: outputLines.join("\n\n"), results };
}
