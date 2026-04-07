import type { NodeHandler } from "../types";
import { runVerificationCommands } from "../verification-commands";
import { logger } from "@/lib/logger";

const DEFAULT_TIMEOUT_MS = 300_000;

export const processRunnerHandler: NodeHandler = async (node, context) => {
  const command = (node.data.command as string) || "";
  const workingDir = (node.data.workingDir as string) || process.cwd();
  const timeoutMs = typeof node.data.timeoutMs === "number" ? node.data.timeoutMs : DEFAULT_TIMEOUT_MS;
  const outputVariable = (node.data.outputVariable as string) || "processResult";

  try {
    if (!command.trim()) {
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
      [command],
      context.agentId,
      timeoutMs,
    );

    const durationMs = Date.now() - startMs;
    const cmdResult = results[0];

    if (!cmdResult) {
      const result = {
        success: false,
        command,
        stdout: "",
        stderr: "Command was blocked by security whitelist",
        exitCode: 1,
        durationMs,
      };
      return {
        messages: [{ role: "assistant", content: `Process runner: command blocked — "${command}"` }],
        nextNodeId: "failed",
        waitForInput: false,
        updatedVariables: { [outputVariable]: result },
      };
    }

    const result = {
      success: cmdResult.passed,
      command,
      stdout: cmdResult.output,
      stderr: "",
      exitCode: cmdResult.passed ? 0 : 1,
      durationMs,
    };

    logger.info("process-runner completed", {
      nodeId: node.id,
      agentId: context.agentId,
      command,
      workingDir,
      success: result.success,
      durationMs,
    });

    return {
      messages: [
        {
          role: "assistant",
          content: cmdResult.passed
            ? `Process runner: "${command}" passed in ${durationMs}ms`
            : `Process runner: "${command}" failed\n${cmdResult.output.slice(0, 1000)}`,
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
          command,
          stdout: "",
          stderr: error instanceof Error ? error.message : String(error),
          exitCode: 1,
          durationMs: 0,
        },
      },
    };
  }
};
