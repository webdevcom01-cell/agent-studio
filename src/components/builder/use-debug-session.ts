"use client";

import { useState, useCallback, useRef } from "react";
import { parseChunk } from "@/lib/runtime/stream-protocol";
import type {
  NodeDebugState,
  NodeExecution,
  NodeDebugStatus,
  DebugFlowSummary,
  ToolCallTrace,
} from "@/lib/runtime/types";

export type { NodeDebugState, NodeDebugStatus };

export interface EdgeDebugState {
  sourceNodeId: string;
  targetNodeId: string;
  taken: boolean;
}

export interface DebugSessionState {
  isDebugMode: boolean;
  isRunning: boolean;
  nodeStates: Map<string, NodeDebugState>;
  edgeStates: Map<string, EdgeDebugState>;
  selectedNodeId: string | null;
  flowSummary: DebugFlowSummary | null;
  testInput: string;
  conversationId: string | undefined;
}

const initialState: DebugSessionState = {
  isDebugMode: false,
  isRunning: false,
  nodeStates: new Map(),
  edgeStates: new Map(),
  selectedNodeId: null,
  flowSummary: null,
  testInput: "",
  conversationId: undefined,
};

export function useDebugSession(agentId: string) {
  const [state, setState] = useState<DebugSessionState>(initialState);
  const abortRef = useRef<AbortController | null>(null);
  // Mutable ref to accumulate tool calls per node during streaming
  const pendingToolCalls = useRef<Map<string, ToolCallTrace[]>>(new Map());

  const toggleDebugMode = useCallback(() => {
    setState((prev) => ({
      ...initialState,
      isDebugMode: !prev.isDebugMode,
      testInput: prev.testInput,
    }));
  }, []);

  const setTestInput = useCallback((value: string) => {
    setState((prev) => ({ ...prev, testInput: value }));
  }, []);

  const selectNode = useCallback((nodeId: string | null) => {
    setState((prev) => ({ ...prev, selectedNodeId: nodeId }));
  }, []);

  const clearSession = useCallback(() => {
    setState((prev) => ({
      ...initialState,
      isDebugMode: prev.isDebugMode,
      testInput: prev.testInput,
    }));
    pendingToolCalls.current.clear();
  }, []);

  const stopRun = useCallback(() => {
    abortRef.current?.abort();
    setState((prev) => ({ ...prev, isRunning: false }));
  }, []);

  const runDebug = useCallback(async () => {
    if (!state.testInput.trim() || state.isRunning) return;

    // Clear previous results
    pendingToolCalls.current.clear();
    setState((prev) => ({
      ...prev,
      isRunning: true,
      nodeStates: new Map(),
      edgeStates: new Map(),
      flowSummary: null,
      selectedNodeId: null,
    }));

    abortRef.current = new AbortController();

    try {
      const response = await fetch(`/api/agents/${agentId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: state.testInput,
          stream: true,
          debug: true,
          conversationId: state.conversationId,
        }),
        signal: abortRef.current.signal,
      });

      if (!response.ok || !response.body) {
        setState((prev) => ({ ...prev, isRunning: false }));
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const chunk = parseChunk(line);
          if (!chunk) continue;

          switch (chunk.type) {
            case "debug_node_start": {
              setState((prev) => {
                const next = new Map(prev.nodeStates);
                const existing = next.get(chunk.nodeId);
                const updatedState: NodeDebugState = existing
                  ? {
                      ...existing,
                      aggregateStatus: "running",
                    }
                  : {
                      nodeId: chunk.nodeId,
                      nodeType: chunk.nodeType,
                      nodeName: chunk.nodeName,
                      executions: [],
                      aggregateStatus: "running",
                      totalDurationMs: 0,
                    };
                next.set(chunk.nodeId, updatedState);
                return { ...prev, nodeStates: next };
              });
              break;
            }

            case "debug_node_end": {
              setState((prev) => {
                const next = new Map(prev.nodeStates);
                const existing = next.get(chunk.nodeId);
                if (!existing) return prev;

                const toolCalls = pendingToolCalls.current.get(chunk.nodeId) ?? [];
                pendingToolCalls.current.delete(chunk.nodeId);

                const execution: NodeExecution = {
                  iteration: existing.executions.length + 1,
                  status: chunk.status,
                  durationMs: chunk.durationMs,
                  output: chunk.output,
                  error: chunk.error,
                  timestamp: Date.now(),
                  toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
                };

                const updatedState: NodeDebugState = {
                  ...existing,
                  executions: [...existing.executions, execution],
                  aggregateStatus: chunk.status,
                  totalDurationMs: existing.totalDurationMs + chunk.durationMs,
                };
                next.set(chunk.nodeId, updatedState);
                return { ...prev, nodeStates: next };
              });
              break;
            }

            case "debug_edge_taken": {
              setState((prev) => {
                const key = `${chunk.sourceNodeId}->${chunk.targetNodeId}`;
                const next = new Map(prev.edgeStates);
                next.set(key, {
                  sourceNodeId: chunk.sourceNodeId,
                  targetNodeId: chunk.targetNodeId,
                  taken: true,
                });
                return { ...prev, edgeStates: next };
              });
              break;
            }

            case "debug_tool_start": {
              // Store pending tool call start
              const existing = pendingToolCalls.current.get(chunk.nodeId) ?? [];
              pendingToolCalls.current.set(chunk.nodeId, [
                ...existing,
                {
                  toolName: chunk.toolName,
                  status: "success" as const,
                  durationMs: 0,
                  input: chunk.input,
                },
              ]);
              break;
            }

            case "debug_tool_end": {
              // Update the last pending tool call for this node
              const calls = pendingToolCalls.current.get(chunk.nodeId) ?? [];
              const lastIdx = calls.findLastIndex((c) => c.toolName === chunk.toolName);
              if (lastIdx >= 0) {
                calls[lastIdx] = {
                  ...calls[lastIdx],
                  status: chunk.status,
                  durationMs: chunk.durationMs,
                  result: chunk.result,
                  error: chunk.error,
                };
                pendingToolCalls.current.set(chunk.nodeId, calls);
              }
              break;
            }

            case "debug_flow_summary": {
              setState((prev) => ({
                ...prev,
                flowSummary: {
                  totalDurationMs: chunk.totalDurationMs,
                  nodesExecuted: chunk.nodesExecuted,
                  nodesFailed: chunk.nodesFailed,
                  executionPath: chunk.executionPath,
                  otelTraceId: chunk.otelTraceId,
                },
              }));
              break;
            }

            case "done": {
              setState((prev) => ({
                ...prev,
                isRunning: false,
                conversationId: chunk.conversationId,
              }));
              break;
            }

            case "error": {
              setState((prev) => ({ ...prev, isRunning: false }));
              break;
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setState((prev) => ({ ...prev, isRunning: false }));
      }
    } finally {
      setState((prev) => ({ ...prev, isRunning: false }));
    }
  }, [agentId, state.testInput, state.isRunning, state.conversationId]);

  return {
    state,
    toggleDebugMode,
    setTestInput,
    selectNode,
    clearSession,
    stopRun,
    runDebug,
  };
}
