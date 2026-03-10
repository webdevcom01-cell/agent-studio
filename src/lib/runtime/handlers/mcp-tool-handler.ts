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

  try {
    const result = await callMCPTool(mcpServerId, toolName, resolvedArgs);

    // Store result in variables for downstream nodes (e.g. AI Response)
    // No visible message — the AI Response node will use the variable
    return {
      messages: [],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: {
        ...context.variables,
        [outputVariable]: result,
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
