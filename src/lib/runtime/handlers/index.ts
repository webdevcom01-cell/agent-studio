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
import { structuredOutputHandler } from "./structured-output-handler";
import { cacheHandler } from "./cache-handler";
import { embeddingsHandler } from "./embeddings-handler";
import { retryHandler } from "./retry-handler";
import { abTestHandler } from "./ab-test-handler";
import { semanticRouterHandler } from "./semantic-router-handler";
import { costMonitorHandler } from "./cost-monitor-handler";
import { aggregateHandler } from "./aggregate-handler";
import { webSearchHandler } from "./web-search-handler";
import { multimodalInputHandler } from "./multimodal-input-handler";
import { imageGenerationHandler } from "./image-generation-handler";
import { speechAudioHandler } from "./speech-audio-handler";
import { databaseQueryHandler } from "./database-query-handler";
import { fileOperationsHandler } from "./file-operations-handler";
import { mcpTaskRunnerHandler } from "./mcp-task-runner-handler";
import { guardrailsHandler } from "./guardrails-handler";
import { codeInterpreterHandler } from "./code-interpreter-handler";
import { trajectoryEvaluatorHandler } from "./trajectory-evaluator-handler";
import { planAndExecuteHandler } from "./plan-and-execute-handler";
import { reflexiveLoopHandler } from "./reflexive-loop-handler";
import { swarmHandler } from "./swarm-handler";
import { verificationHandler } from "./verification-handler";
import { astTransformHandler } from "./ast-transform-handler";
import { lspQueryHandler } from "./lsp-query-handler";
import { projectContextHandler } from "./project-context-handler";

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
  structured_output: structuredOutputHandler,
  cache: cacheHandler,
  embeddings: embeddingsHandler,
  retry: retryHandler,
  ab_test: abTestHandler,
  semantic_router: semanticRouterHandler,
  cost_monitor: costMonitorHandler,
  aggregate: aggregateHandler,
  web_search: webSearchHandler,
  multimodal_input: multimodalInputHandler,
  image_generation: imageGenerationHandler,
  speech_audio: speechAudioHandler,
  database_query: databaseQueryHandler,
  file_operations: fileOperationsHandler,
  mcp_task_runner: mcpTaskRunnerHandler,
  guardrails: guardrailsHandler,
  code_interpreter: codeInterpreterHandler,
  trajectory_evaluator: trajectoryEvaluatorHandler,
  plan_and_execute: planAndExecuteHandler,
  reflexive_loop: reflexiveLoopHandler,
  swarm: swarmHandler,
  verification: verificationHandler,
  ast_transform: astTransformHandler,
  lsp_query: lspQueryHandler,
  project_context: projectContextHandler,
};

export function getHandler(nodeType: string): NodeHandler | null {
  return handlers[nodeType] ?? null;
}
