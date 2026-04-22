import { existsSync, symlinkSync } from "fs";
import { join } from "path";
import type { NodeHandler } from "../types";
import { runVerificationCommands } from "../verification-commands";
import { resolveTemplate } from "../template";
import { logger } from "@/lib/logger";

const DEFAULT_TIMEOUT_MS = 300_000;
// Fallback writable workspace used by file-writer when /app is read-only (Railway)
const SDLC_TMP = "/tmp/sdlc";

/**
 * Set up /tmp/sdlc as a self-contained workspace by symlinking the app's
 * src/ and node_modules/ so that test files there can resolve imports correctly.
 * Called only when at least one arg was remapped to /tmp/sdlc.
 */
function ensureSdlcWorkspace(): void {
  const links: Array<[string, string]> = [
    ["/app/src", join(SDLC_TMP, "src")],
    ["/app/node_modules", join(SDLC_TMP, "node_modules")],
    ["/app/tsconfig.json", join(SDLC_TMP, "tsconfig.json")],
  ];
  for (const [target, linkPath] of links) {
    if (!existsSync(linkPath) && existsSync(target)) {
      try {
        symlinkSync(target, linkPath);
        logger.info("process-runner: created symlink for sdlc workspace", { target, linkPath });
      } catch (e) {
        logger.warn("process-runner: could not create symlink", { target, linkPath, error: String(e) });
      }
    }
  }
}

/**
 * For each resolved arg that looks like a relative file path, check if the file
 * exists at the original location. If not, try the /tmp/sdlc fallback directory
 * (where file-writer puts files when /app is read-only on Railway/Docker).
 * Returns the remapped args and a flag indicating whether any were remapped.
 */
function resolveArgPaths(args: string[]): { resolved: string[]; anyRemapped: boolean } {
  let anyRemapped = false;
  const resolved = args.map((arg) => {
    // Only attempt to remap relative paths that look like TS/JS files
    if (arg.startsWith("-") || arg.startsWith("/") || !arg.match(/\.(ts|js|tsx|jsx|mts|mjs)$/)) {
      return arg;
    }
    if (!existsSync(arg)) {
      const tmpVariant = join(SDLC_TMP, arg);
      if (existsSync(tmpVariant)) {
        logger.info("process-runner: remapping arg to /tmp/sdlc fallback", { original: arg, resolved: tmpVariant });
        anyRemapped = true;
        // Return the relative path (strip /tmp/sdlc/ prefix) so vitest root works
        return arg;
      }
    }
    return arg;
  });
  return { resolved, anyRemapped };
}

export const processRunnerHandler: NodeHandler = async (node, context) => {
  // Resolve templates in command and args array
  const rawCommand = (node.data.command as string) || "";
  const rawArgs = Array.isArray(node.data.args) ? (node.data.args as string[]) : [];
  const rawWorkingDir = (node.data.cwd as string) || (node.data.workingDir as string) || process.cwd();
  // Resolve template vars in cwd so paths like /tmp/sdlc-{{taskSummary}}-{{runId}}
  // expand to the concrete run directory — matches the expansion that
  // file-writer now performs on targetDir so both handlers share the same path.
  const workingDir = resolveTemplate(rawWorkingDir, context.variables);
  const timeoutMs = typeof node.data.timeoutMs === "number" ? node.data.timeoutMs : DEFAULT_TIMEOUT_MS;
  const outputVariable = (node.data.outputVariable as string) || "processResult";

  // Resolve templates so {{testFilePath}} etc. get substituted before execution
  const resolvedCommand = resolveTemplate(rawCommand, context.variables);
  const templateResolvedArgs = rawArgs.map((arg) => resolveTemplate(arg, context.variables));
  // Remap relative file paths to /tmp/sdlc when the original location is unwritable
  const { resolved: resolvedArgs, anyRemapped } = resolveArgPaths(templateResolvedArgs);

  // When any arg was remapped to /tmp/sdlc, run the command from /tmp/sdlc so
  // vitest can find the test files and relative imports resolve correctly.
  let effectiveCwd = workingDir;
  if (anyRemapped) {
    ensureSdlcWorkspace();
    effectiveCwd = SDLC_TMP;
    logger.info("process-runner: using /tmp/sdlc as cwd for remapped test files", {
      nodeId: node.id,
      agentId: context.agentId,
    });
  }

  // Build the full command string (runVerificationCommands splits by whitespace internally)
  const fullCommand = resolvedArgs.length > 0
    ? `${resolvedCommand} ${resolvedArgs.join(" ")}`
    : resolvedCommand;

  const displayCommand = fullCommand;

  try {
    if (!resolvedCommand.trim()) {
      const result = {
        success: false,
        command: "",
        stdout: "",
        stderr: "No command configured on process_runner node",
        exitCode: 1,
        durationMs: 0,
      };
      return {
        messages: [{ role: "assistant", content: "Process runner: no command configured." }],
        nextNodeId: "failed",
        waitForInput: false,
        updatedVariables: { [outputVariable]: result },
      };
    }

    const startMs = Date.now();

    const { results } = await runVerificationCommands(
      [fullCommand],
      context.agentId,
      timeoutMs,
      effectiveCwd,
    );

    const durationMs = Date.now() - startMs;
    const cmdResult = results[0];

    if (!cmdResult) {
      const result = {
        success: false,
        command: displayCommand,
        stdout: "",
        stderr: "Command was blocked by security whitelist",
        exitCode: 1,
        durationMs,
      };
      return {
        messages: [{ role: "assistant", content: `Process runner: command blocked — "${displayCommand}"` }],
        nextNodeId: "failed",
        waitForInput: false,
        updatedVariables: { [outputVariable]: result },
      };
    }

    const result = {
      success: cmdResult.passed,
      command: displayCommand,
      stdout: cmdResult.output,
      stderr: "",
      exitCode: cmdResult.passed ? 0 : 1,
      durationMs,
    };

    logger.info("process-runner completed", {
      nodeId: node.id,
      agentId: context.agentId,
      command: displayCommand,
      workingDir,
      success: result.success,
      durationMs,
    });

    return {
      messages: [
        {
          role: "assistant",
          content: cmdResult.passed
            ? `Process runner: "${displayCommand}" passed in ${durationMs}ms`
            : `Process runner: "${displayCommand}" failed\n${cmdResult.output.slice(0, 1000)}`,
        },
      ],
      nextNodeId: cmdResult.passed ? "passed" : "failed",
      waitForInput: false,
      updatedVariables: { [outputVariable]: result },
    };
  } catch (error) {
    logger.error("process-runner-handler error", { nodeId: node.id, error });
    return {
      messages: [{ role: "assistant", content: "An error occurred in process_runner node." }],
      nextNodeId: "failed",
      waitForInput: false,
      updatedVariables: {
        [outputVariable]: {
          success: false,
          command: displayCommand,
          stdout: "",
          stderr: error instanceof Error ? error.message : String(error),
          exitCode: 1,
          durationMs: 0,
        },
      },
    };
  }
};
