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
};

export function getHandler(nodeType: string): NodeHandler | null {
  return handlers[nodeType] ?? null;
}
