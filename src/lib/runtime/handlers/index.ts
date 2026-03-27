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
import { loopHandler } from "./loop-handler";
import { parallelHandler } from "./parallel-handler";
import { memoryWriteHandler } from "./memory-write-handler";
import { memoryReadHandler } from "./memory-read-handler";
import { evaluatorHandler } from "./evaluator-handler";
import { scheduleTriggerHandler } from "./schedule-trigger-handler";
import { webhookTriggerHandler } from "./webhook-trigger-handler";
import { emailSendHandler } from "./email-send-handler";
import { notificationHandler } from "./notification-handler";
import { formatTransformHandler } from "./format-transform-handler";
import { switchHandler } from "./switch-handler";
import { webFetchHandler } from "./web-fetch-handler";
import { browserActionHandler } from "./browser-action-handler";
import { desktopAppHandler } from "./desktop-app-handler";
import { learnHandler } from "./learn-handler";
import { pythonCodeHandler } from "./python-code-handler";

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
  loop: loopHandler,
  parallel: parallelHandler,
  memory_write: memoryWriteHandler,
  memory_read: memoryReadHandler,
  evaluator: evaluatorHandler,
  schedule_trigger: scheduleTriggerHandler,
  webhook_trigger: webhookTriggerHandler,
  email_send: emailSendHandler,
  notification: notificationHandler,
  format_transform: formatTransformHandler,
  switch: switchHandler,
  web_fetch: webFetchHandler,
  browser_action: browserActionHandler,
  desktop_app: desktopAppHandler,
  learn: learnHandler,
  python_code: pythonCodeHandler,
};

export function getHandler(nodeType: string): NodeHandler | null {
  return handlers[nodeType] ?? null;
}
