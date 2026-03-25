import type { NodeHandler } from "../types";
import { resolveTemplate } from "../template";
import { callMCPTool } from "@/lib/mcp/client";

interface DesktopAction {
  appId: string;
  capabilityId: string;
  command: string;
  parameters: Record<string, string>;
}

const MAX_RESULT_LENGTH = 10_000;

function resolveParameters(
  params: Record<string, string>,
  variables: Record<string, unknown>,
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  for (const [key, template] of Object.entries(params)) {
    resolved[key] = resolveTemplate(template, variables);
  }
  return resolved;
}

function buildToolName(appId: string, command: string): string {
  return `${appId}_${command}`;
}

export const desktopAppHandler: NodeHandler = async (node, context) => {
  const mcpServerId = node.data.mcpServerId as string | undefined;
  const appId = node.data.appId as string | undefined;
  const actions = (node.data.actions as DesktopAction[]) ?? [];
  const outputVariable = (node.data.outputVariable as string) || "desktop_result";
  const sessionMode = (node.data.sessionMode as string) || "new";

  if (!mcpServerId) {
    return {
      messages: [
        { role: "assistant", content: "Desktop App node has no CLI bridge server configured." },
      ],
      nextNodeId: null,
      waitForInput: false,
    };
  }

  if (!appId) {
    return {
      messages: [
        { role: "assistant", content: "Desktop App node has no application selected." },
      ],
      nextNodeId: null,
      waitForInput: false,
    };
  }

  if (actions.length === 0) {
    return {
      messages: [
        { role: "assistant", content: "Desktop App node has no actions configured." },
      ],
      nextNodeId: null,
      waitForInput: false,
    };
  }

  const results: unknown[] = [];

  try {
    const sessionArgs: Record<string, unknown> = {};
    if (sessionMode === "continue") {
      sessionArgs._session = "continue";
    }

    for (const action of actions) {
      const toolName = buildToolName(action.appId || appId, action.command);
      const resolvedParams = resolveParameters(action.parameters, context.variables);
      const args = { ...resolvedParams, ...sessionArgs };

      const result = await callMCPTool(mcpServerId, toolName, args);
      results.push({ command: action.command, result });
    }

    const lastResult = results[results.length - 1];
    const serialized = JSON.stringify(lastResult).slice(0, MAX_RESULT_LENGTH);

    return {
      messages: [],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: {
        ...context.variables,
        [outputVariable]: serialized,
        [`${outputVariable}_all`]: JSON.stringify(results).slice(0, MAX_RESULT_LENGTH),
      },
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    return {
      messages: [],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: {
        ...context.variables,
        [outputVariable]: `[Error: ${errorMsg}]`,
      },
    };
  }
};
