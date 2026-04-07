import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { NodeHandler } from "../types";
import { logger } from "@/lib/logger";

const execFileAsync = promisify(execFile);
const GIT_TIMEOUT_MS = 60_000;

type GitOperation = "checkout_branch" | "add" | "commit" | "push";

export const gitNodeHandler: NodeHandler = async (node, context) => {
  const workingDir = (node.data.workingDir as string) || process.cwd();
  const branch = interpolateVariables(
    (node.data.branch as string) || `feat/autonomous-${Date.now()}`,
    context.variables,
  );
  const commitMessage = interpolateVariables(
    (node.data.commitMessage as string) || "chore: autonomous pipeline commit",
    context.variables,
  );
  const operations: GitOperation[] = Array.isArray(node.data.operations)
    ? (node.data.operations as GitOperation[])
    : ["checkout_branch", "add", "commit", "push"];
  const outputVariable = (node.data.outputVariable as string) || "gitResult";

  const gitEnv = buildGitEnv();

  try {
    let commitHash: string | undefined;

    for (const op of operations) {
      switch (op) {
        case "checkout_branch":
          await runGit(["checkout", "-B", branch], workingDir, gitEnv);
          break;
        case "add":
          await runGit(["add", "-A"], workingDir, gitEnv);
          break;
        case "commit": {
          const { stdout } = await runGit(
            ["commit", "-m", commitMessage],
            workingDir,
            gitEnv,
          );
          const hashMatch = /\[([a-f0-9]{7,40})\]/.exec(stdout) ?? /\b([a-f0-9]{7,40})\b/.exec(stdout);
          if (hashMatch) commitHash = hashMatch[1];
          break;
        }
        case "push":
          await runGit(["push", "origin", branch], workingDir, gitEnv);
          break;
      }
    }

    const pushed = operations.includes("push");
    const result = {
      branch,
      commitHash,
      pushed,
      success: true,
      message: `Branch "${branch}" — operations: ${operations.join(", ")}`,
    };

    logger.info("git-node completed", {
      nodeId: node.id,
      agentId: context.agentId,
      branch,
      operations,
    });

    return {
      messages: [{ role: "assistant", content: result.message }],
      nextNodeId: (node.data.nextNodeId as string) ?? null,
      waitForInput: false,
      updatedVariables: { [outputVariable]: result },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("git-node-handler error", { nodeId: node.id, error });

    const result = {
      branch,
      commitHash: undefined,
      pushed: false,
      success: false,
      message: `Git operation failed: ${message.slice(0, 500)}`,
    };

    return {
      messages: [{ role: "assistant", content: `Git node failed: ${message.slice(0, 500)}` }],
      nextNodeId: (node.data.onErrorNodeId as string) ?? null,
      waitForInput: false,
      updatedVariables: { [outputVariable]: result },
    };
  }
};

async function runGit(
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync("git", args, {
    cwd,
    env,
    timeout: GIT_TIMEOUT_MS,
    maxBuffer: 1024 * 256,
  });
}

function buildGitEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    GIT_TERMINAL_PROMPT: "0",
  };
  if (process.env.GIT_TOKEN) {
    env.GIT_ASKPASS = "echo";
  }
  return env;
}

function interpolateVariables(template: string, variables: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const val = variables[key];
    return val !== undefined && val !== null ? String(val) : `{{${key}}}`;
  });
}
