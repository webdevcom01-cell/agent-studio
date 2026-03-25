import type { NodeHandler } from "../types";
import { resolveTemplate } from "../template";
import { callMCPTool } from "@/lib/mcp/client";

interface BrowserStep {
  action: string;
  url?: string;
  selector?: string;
  text?: string;
  description?: string;
  timeout?: number;
  value?: string;
  filename?: string;
}

const ACTION_TO_TOOL: Record<string, string> = {
  navigate: "browser_navigate",
  click: "browser_click",
  type: "browser_type",
  snapshot: "browser_snapshot",
  screenshot: "browser_screenshot",
  wait: "browser_wait",
  select: "browser_select_option",
  save_pdf: "browser_pdf_save",
};

const MAX_RESULT_LENGTH = 10_000;

function buildToolArgs(
  step: BrowserStep,
  variables: Record<string, unknown>,
): Record<string, unknown> {
  const args: Record<string, unknown> = {};

  switch (step.action) {
    case "navigate":
      args.url = resolveTemplate(step.url ?? "", variables);
      break;
    case "click":
      if (step.selector) args.ref = resolveTemplate(step.selector, variables);
      if (step.description) args.element = resolveTemplate(step.description, variables);
      break;
    case "type":
      if (step.selector) args.ref = resolveTemplate(step.selector, variables);
      args.text = resolveTemplate(step.text ?? "", variables);
      break;
    case "snapshot":
      break;
    case "screenshot":
      break;
    case "wait":
      args.time = step.timeout ?? 1000;
      break;
    case "select":
      if (step.selector) args.ref = resolveTemplate(step.selector, variables);
      args.values = [resolveTemplate(step.value ?? "", variables)];
      break;
    case "save_pdf":
      if (step.filename) args.filename = resolveTemplate(step.filename, variables);
      break;
  }

  return args;
}

export const browserActionHandler: NodeHandler = async (node, context) => {
  const mcpServerId = node.data.mcpServerId as string | undefined;
  const actions = (node.data.actions as BrowserStep[]) ?? [];
  const outputVariable = (node.data.outputVariable as string) || "browser_result";

  if (!mcpServerId) {
    return {
      messages: [
        { role: "assistant", content: "Browser Action node has no MCP server configured." },
      ],
      nextNodeId: null,
      waitForInput: false,
    };
  }

  if (actions.length === 0) {
    return {
      messages: [
        { role: "assistant", content: "Browser Action node has no actions configured." },
      ],
      nextNodeId: null,
      waitForInput: false,
    };
  }

  const results: unknown[] = [];

  try {
    for (const step of actions) {
      const toolName = ACTION_TO_TOOL[step.action];
      if (!toolName) {
        results.push({ action: step.action, error: `Unknown action: ${step.action}` });
        continue;
      }

      const args = buildToolArgs(step, context.variables);
      const result = await callMCPTool(mcpServerId, toolName, args);
      results.push({ action: step.action, result });
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
