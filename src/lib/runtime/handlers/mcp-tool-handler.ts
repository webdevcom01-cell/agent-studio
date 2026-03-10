import type { NodeHandler } from "../types";
import { resolveTemplate } from "../template";
import { callMCPTool } from "@/lib/mcp/client";

export const mcpToolHandler: NodeHandler = async (node, context) => {
  const mcpServerId = node.data.mcpServerId as string | undefined;
  const toolName = node.data.toolName as string | undefined;
  const inputMapping = (node.data.inputMapping as Record<string, string>) ?? {};
  const outputVariable = (node.data.outputVariable as string) ?? "mcp_result";

  if (!mcpServerId || !toolName) {
    return {
      messages: [
        {
          role: "assistant",
          content: "MCP Tool node is not configured (missing server or tool name).",
        },
      ],
      nextNodeId: null,
      waitForInput: false,
    };
  }

  const resolvedArgs: Record<string, unknown> = {};
  for (const [param, template] of Object.entries(inputMapping)) {
    resolvedArgs[param] = resolveTemplate(template, context.variables);
  }

  const MAX_RESULT_LENGTH = 10_000;

  try {
    const result = await callMCPTool(mcpServerId, toolName, resolvedArgs);

    const sanitized = typeof result === "string"
      ? result.slice(0, MAX_RESULT_LENGTH)
      : JSON.stringify(result).slice(0, MAX_RESULT_LENGTH);

    return {
      messages: [],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: {
        ...context.variables,
        [outputVariable]: sanitized,
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
