import type { NodeHandler } from "../types";
import { logger } from "@/lib/logger";

const DEFAULT_POLL_INTERVAL_MS = 5_000;
const DEFAULT_TIMEOUT_MS = 300_000;

type DeployTarget = "staging" | "production";
type DeployStatus = "READY" | "ERROR" | "BUILDING" | "CANCELED";

interface VercelDeploymentResponse {
  id?: string;
  url?: string;
  error?: { message: string };
}

interface VercelStatusResponse {
  readyState?: string;
  state?: string;
  url?: string;
}

export const deployTriggerHandler: NodeHandler = async (node, context) => {
  const target: DeployTarget =
    node.data.target === "production" ? "production" : "staging";
  const projectId = (node.data.projectId as string) || process.env.VERCEL_PROJECT_ID || "";
  const outputVariable = (node.data.outputVariable as string) || "deployResult";
  const pollIntervalMs =
    typeof node.data.pollIntervalMs === "number"
      ? node.data.pollIntervalMs
      : DEFAULT_POLL_INTERVAL_MS;
  const timeoutMs =
    typeof node.data.timeoutMs === "number" ? node.data.timeoutMs : DEFAULT_TIMEOUT_MS;

  const branchVar = context.variables["gitResult"];
  const branch =
    (node.data.branch as string) ||
    (typeof branchVar === "object" && branchVar !== null
      ? (branchVar as Record<string, unknown>).branch as string
      : undefined) ||
    "main";

  const vercelToken = process.env.VERCEL_TOKEN;

  try {
    if (!vercelToken) {
      const result = buildErrorResult("VERCEL_TOKEN not configured", target);
      return {
        messages: [{ role: "assistant", content: "Deploy trigger: VERCEL_TOKEN not configured." }],
        nextNodeId: "failed",
        waitForInput: false,
        updatedVariables: { [outputVariable]: result },
      };
    }

    if (!projectId) {
      const result = buildErrorResult("projectId not configured", target);
      return {
        messages: [{ role: "assistant", content: "Deploy trigger: projectId not configured." }],
        nextNodeId: "failed",
        waitForInput: false,
        updatedVariables: { [outputVariable]: result },
      };
    }

    const startMs = Date.now();

    const deployRes = await fetch("https://api.vercel.com/v13/deployments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${vercelToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: projectId,
        gitSource: { type: "github", ref: branch },
        ...(target === "production" ? { target: "production" } : {}),
      }),
    });

    const deployData = (await deployRes.json()) as VercelDeploymentResponse;

    if (!deployRes.ok || !deployData.id) {
      const errMsg = deployData.error?.message ?? `HTTP ${deployRes.status}`;
      const result = buildErrorResult(errMsg, target);
      return {
        messages: [{ role: "assistant", content: `Deploy trigger: failed to start deployment — ${errMsg}` }],
        nextNodeId: "failed",
        waitForInput: false,
        updatedVariables: { [outputVariable]: result },
      };
    }

    const deploymentId = deployData.id;
    let deployUrl = deployData.url ? `https://${deployData.url}` : "";
    let finalStatus: DeployStatus = "BUILDING";

    const deadline = startMs + timeoutMs;
    while (Date.now() < deadline) {
      await sleep(pollIntervalMs);

      const statusRes = await fetch(
        `https://api.vercel.com/v13/deployments/${deploymentId}`,
        { headers: { Authorization: `Bearer ${vercelToken}` } },
      );

      if (!statusRes.ok) continue;

      const statusData = (await statusRes.json()) as VercelStatusResponse;
      const state = statusData.readyState ?? statusData.state ?? "";

      if (statusData.url) deployUrl = `https://${statusData.url}`;

      if (state === "READY") {
        finalStatus = "READY";
        break;
      }
      if (state === "ERROR" || state === "CANCELED") {
        finalStatus = state as DeployStatus;
        break;
      }
    }

    if (finalStatus === "BUILDING") {
      finalStatus = "ERROR";
    }

    const durationMs = Date.now() - startMs;
    const result = {
      deploymentId,
      url: deployUrl,
      status: finalStatus,
      target,
      durationMs,
      logs: "",
    };

    logger.info("deploy-trigger completed", {
      nodeId: node.id,
      agentId: context.agentId,
      target,
      status: finalStatus,
      durationMs,
    });

    return {
      messages: [
        {
          role: "assistant",
          content: `Deploy to ${target}: ${finalStatus} in ${durationMs}ms${deployUrl ? ` — ${deployUrl}` : ""}`,
        },
      ],
      nextNodeId: finalStatus === "READY" ? "passed" : "failed",
      waitForInput: false,
      updatedVariables: { [outputVariable]: result },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("deploy-trigger-handler error", { nodeId: node.id, error });

    const result = buildErrorResult(message, target);
    return {
      messages: [{ role: "assistant", content: `Deploy trigger error: ${message.slice(0, 500)}` }],
      nextNodeId: "failed",
      waitForInput: false,
      updatedVariables: { [outputVariable]: result },
    };
  }
};

function buildErrorResult(message: string, target: DeployTarget) {
  return {
    deploymentId: "",
    url: "",
    status: "ERROR" as DeployStatus,
    target,
    durationMs: 0,
    logs: message,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
