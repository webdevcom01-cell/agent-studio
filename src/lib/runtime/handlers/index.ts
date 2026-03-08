import type { NodeHandler } from "../types";
import { messageHandler } from "./message-handler";
import { buttonHandler } from "./button-handler";
import { captureHandler } from "./capture-handler";
import { conditionHandler } from "./condition-handler";
import { setVariableHandler } from "./set-variable-handler";
import { endHandler } from "./end-handler";
import { gotoHandler } from "./goto-handler";
import { waitHandler } from "./wait-handler";
import { aiResponseHandler } from "./ai-response-handler";
import { aiClassifyHandler } from "./ai-classify-handler";
import { aiExtractHandler } from "./ai-extract-handler";
import { aiSummarizeHandler } from "./ai-summarize-handler";
import { apiCallHandler } from "./api-call-handler";
import { functionHandler } from "./function-handler";
import { kbSearchHandler } from "./kb-search-handler";
import { webhookHandler } from "./webhook-handler";
import { mcpToolHandler } from "./mcp-tool-handler";
import { callAgentHandler } from "./call-agent-handler";
import { humanApprovalHandler } from "./human-approval-handler";

const handlers: Record<string, NodeHandler> = {
  message: messageHandler,
  button: buttonHandler,
  capture: captureHandler,
  condition: conditionHandler,
  set_variable: setVariableHandler,
  end: endHandler,
  goto: gotoHandler,
  wait: waitHandler,
  ai_response: aiResponseHandler,
  ai_classify: aiClassifyHandler,
  ai_extract: aiExtractHandler,
  ai_summarize: aiSummarizeHandler,
  api_call: apiCallHandler,
  function: functionHandler,
  kb_search: kbSearchHandler,
  webhook: webhookHandler,
  mcp_tool: mcpToolHandler,
  call_agent: callAgentHandler,
  human_approval: humanApprovalHandler,
};

export function getHandler(nodeType: string): NodeHandler | null {
  return handlers[nodeType] ?? null;
}
