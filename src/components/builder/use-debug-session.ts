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

// ---------------------------------------------------------------------------
// Variable Watch types (Phase 7)
// ---------------------------------------------------------------------------

export type VariableChangeType = "new" | "modified" | "deleted";

export interface VariableDiffEntry {
  key: string;
  previousValue?: unknown;
  currentValue?: unknown;
  change: VariableChangeType;
}

export type VariableDiff = VariableDiffEntry[];

export interface DebugSessionState {
  isDebugMode: boolean;
  isRunning: boolean;
  nodeStates: Map<string, NodeDebugState>;
  edgeStates: Map<string, EdgeDebugState>;
  selectedNodeId: string | null;
  flowSummary: DebugFlowSummary | null;
  testInput: string;
  conversationId: string | undefined;
  /** ID of the trace record that was auto-saved for the current/last run */
  savedTraceId: string | undefined;
  // ── Phase 6: Breakpoints ─────────────────────────────────────────────────
  /** Set of nodeIds where execution should pause */
  breakpoints: Set<string>;
  /** Whether the flow is currently paused at a breakpoint */
  isPaused: boolean;
  /** The nodeId the flow is currently paused at */
  pausedAtNodeId: string | null;
  /** Stable session ID used for pause/resume coordination with the API */
  debugSessionId: string | undefined;
  // ── Phase 7: Variable Watch ───────────────────────────────────────────────
  /** Latest runtime variables snapshot (updated on each debug_node_start) */
  currentVariables: Record<string, unknown>;
  /** Diff from the previous node's variables — drives diff highlighting */
  variableDiff: VariableDiff;
  /** User edits made while paused (not yet sent to engine) */
  pendingVariableEdits: Record<string, unknown>;
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
  savedTraceId: undefined,
  breakpoints: new Set(),
  isPaused: false,
  pausedAtNodeId: null,
  debugSessionId: undefined,
  currentVariables: {},
  variableDiff: [],
  pendingVariableEdits: {},
};

export function useDebugSession(agentId: string) {
  const [state, setState] = useState<DebugSessionState>(initialState);
  const abortRef = useRef<AbortController | null>(null);
  // Mutable ref to accumulate tool calls per node during streaming
  const pendingToolCalls = useRef<Map<string, ToolCallTrace[]>>(new Map());
  // Server-side start timestamps from debug_node_start (keyed by nodeId)
  const pendingNodeStartMs = useRef<Map<string, number>>(new Map());
  // Snapshot refs — kept in sync with state for use inside async callbacks
  const nodeStatesRef = useRef<Map<string, NodeDebugState>>(new Map());
  const edgeStatesRef = useRef<Map<string, EdgeDebugState>>(new Map());
  const flowSummaryRef = useRef<DebugFlowSummary | null>(null);
  const testInputRef = useRef<string>("");

  // -------------------------------------------------------------------------
  // Auto-save the completed trace to the API (fire-and-forget)
  // -------------------------------------------------------------------------
  const saveTrace = useCallback(
    async (status: "COMPLETED" | "FAILED", conversationId?: string) => {
      const nodeTraces: Record<string, unknown> = {};
      nodeStatesRef.current.forEach((v, k) => {
        nodeTraces[k] = v;
      });

      const edgeTraces: Record<string, unknown> = {};
      edgeStatesRef.current.forEach((v, k) => {
        edgeTraces[k] = v;
      });

      const summary = flowSummaryRef.current;

      try {
        const res = await fetch(`/api/agents/${agentId}/traces`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId,
            testInput: testInputRef.current,
            status,
            totalDurationMs: summary?.totalDurationMs,
            nodesExecuted: summary?.nodesExecuted,
            nodesFailed: summary?.nodesFailed,
            executionPath: summary?.executionPath ?? [],
            nodeTraces,
            edgeTraces,
            flowSummary: summary ?? undefined,
          }),
        });
        if (res.ok) {
          const json = await res.json();
          if (json.success && json.data?.id) {
            setState((prev) => ({ ...prev, savedTraceId: json.data.id as string }));
          }
        }
      } catch {
        // Fire-and-forget — never let save errors disrupt the UI
      }
    },
    [agentId]
  );

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
    pendingNodeStartMs.current.clear();
  }, []);

  const stopRun = useCallback(() => {
    abortRef.current?.abort();
    setState((prev) => ({ ...prev, isRunning: false, isPaused: false, pausedAtNodeId: null }));
  }, []);

  /** Toggle a breakpoint on/off for a given nodeId */
  const toggleBreakpoint = useCallback((nodeId: string) => {
    setState((prev) => {
      const next = new Set(prev.breakpoints);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return { ...prev, breakpoints: next };
    });
  }, []);

  /** Send a continue/step/stop command to the paused debug session */
  const sendControl = useCallback(
    async (action: "continue" | "step" | "stop", currentAgentId: string, sessionId: string) => {
      if (action === "stop") {
        abortRef.current?.abort();
        setState((prev) => ({ ...prev, isRunning: false, isPaused: false, pausedAtNodeId: null, pendingVariableEdits: {} }));
        return;
      }

      // Flush pending variable edits BEFORE sending resume command
      // (engine reads overrides between waitForDebugResume() and emitting debug_resumed)
      let hasPendingEdits = false;
      setState((prev) => {
        hasPendingEdits = Object.keys(prev.pendingVariableEdits).length > 0;
        return prev;
      });

      if (hasPendingEdits) {
        try {
          // Read pending edits from current state synchronously via ref pattern
          // We capture it here since setState callback runs async
          const currentState = { pendingVariableEdits: {} as Record<string, unknown> };
          setState((prev) => {
            currentState.pendingVariableEdits = prev.pendingVariableEdits;
            return prev;
          });
          // Small delay to let setState flush the read
          await new Promise<void>((resolve) => setTimeout(resolve, 0));

          if (Object.keys(currentState.pendingVariableEdits).length > 0) {
            await fetch(
              `/api/agents/${currentAgentId}/debug/${sessionId}/variables`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ variables: currentState.pendingVariableEdits }),
              }
            );
          }
        } catch {
          // Ignore — best-effort
        }
      }

      // Optimistically clear paused state
      setState((prev) => ({ ...prev, isPaused: false, pausedAtNodeId: null, pendingVariableEdits: {} }));

      try {
        await fetch(
          `/api/agents/${currentAgentId}/debug/${sessionId}/control`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action }),
          }
        );
      } catch {
        // Ignore — if the engine has already moved on, that's fine
      }
    },
    []
  );

  /** Set a local variable edit (only committed when user continues/steps) */
  const editVariable = useCallback((key: string, value: unknown) => {
    setState((prev) => ({
      ...prev,
      pendingVariableEdits: { ...prev.pendingVariableEdits, [key]: value },
    }));
  }, []);

  /** Discard all pending variable edits without sending */
  const resetVariableEdits = useCallback(() => {
    setState((prev) => ({ ...prev, pendingVariableEdits: {} }));
  }, []);

  const runDebug = useCallback(async () => {
    if (!state.testInput.trim() || state.isRunning) return;

    // Generate a fresh debug session ID for this run
    const sessionId = `dbg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Snapshot test input for use in saveTrace (avoids stale closure)
    testInputRef.current = state.testInput;

    // Clear previous results
    pendingToolCalls.current.clear();
    pendingNodeStartMs.current.clear();
    nodeStatesRef.current = new Map();
    edgeStatesRef.current = new Map();
    flowSummaryRef.current = null;
    setState((prev) => ({
      ...prev,
      isRunning: true,
      isPaused: false,
      pausedAtNodeId: null,
      debugSessionId: sessionId,
      nodeStates: new Map(),
      edgeStates: new Map(),
      flowSummary: null,
      selectedNodeId: null,
      currentVariables: {},
      variableDiff: [],
      pendingVariableEdits: {},
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
          debugSessionId: sessionId,
          breakpoints: Array.from(state.breakpoints),
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
              // Store server-provided start timestamp for timeline accuracy
              pendingNodeStartMs.current.set(chunk.nodeId, chunk.timestamp);
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

                // Compute variable diff (Phase 7)
                const newVars = chunk.variables ?? {};
                const prevVars = prev.currentVariables;
                const diff: VariableDiff = [];

                // Check for new + modified keys
                for (const [k, v] of Object.entries(newVars)) {
                  if (!(k in prevVars)) {
                    diff.push({ key: k, currentValue: v, change: "new" });
                  } else if (JSON.stringify(prevVars[k]) !== JSON.stringify(v)) {
                    diff.push({ key: k, previousValue: prevVars[k], currentValue: v, change: "modified" });
                  }
                }
                // Check for deleted keys
                for (const k of Object.keys(prevVars)) {
                  if (!(k in newVars)) {
                    diff.push({ key: k, previousValue: prevVars[k], change: "deleted" });
                  }
                }

                return {
                  ...prev,
                  nodeStates: next,
                  currentVariables: newVars,
                  variableDiff: diff,
                  // Clear pending edits when a new node starts (they've been applied or discarded)
                  pendingVariableEdits: {},
                };
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

                // Use server-provided start time; fall back to end-time minus duration
                const serverStartMs =
                  pendingNodeStartMs.current.get(chunk.nodeId) ??
                  Date.now() - chunk.durationMs;
                pendingNodeStartMs.current.delete(chunk.nodeId);

                const execution: NodeExecution = {
                  iteration: existing.executions.length + 1,
                  status: chunk.status,
                  durationMs: chunk.durationMs,
                  output: chunk.output,
                  error: chunk.error,
                  timestamp: serverStartMs, // ← server start time (used by timeline)
                  toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
                };

                const updatedState: NodeDebugState = {
                  ...existing,
                  executions: [...existing.executions, execution],
                  aggregateStatus: chunk.status,
                  totalDurationMs: existing.totalDurationMs + chunk.durationMs,
                };
                next.set(chunk.nodeId, updatedState);
                // Keep ref in sync for saveTrace
                nodeStatesRef.current = next;
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
                // Keep ref in sync for saveTrace
                edgeStatesRef.current = next;
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

            case "debug_breakpoint_hit": {
              // Mark the node as "waiting" status
              setState((prev) => {
                const next = new Map(prev.nodeStates);
                const existing = next.get(chunk.nodeId);
                if (existing) {
                  next.set(chunk.nodeId, { ...existing, aggregateStatus: "waiting" });
                }
                nodeStatesRef.current = next;
                return {
                  ...prev,
                  nodeStates: next,
                  isPaused: true,
                  pausedAtNodeId: chunk.nodeId,
                  selectedNodeId: chunk.nodeId,
                };
              });
              break;
            }

            case "debug_resumed": {
              // Clear paused state; node will go back to running
              setState((prev) => ({
                ...prev,
                isPaused: false,
                pausedAtNodeId: null,
              }));
              break;
            }

            case "debug_variables_updated": {
              // Engine applied variable overrides — update the watch panel immediately
              const newVars = chunk.variables ?? {};
              setState((prev) => {
                const prevVars = prev.currentVariables;
                const diff: VariableDiff = [];
                for (const [k, v] of Object.entries(newVars)) {
                  if (!(k in prevVars)) {
                    diff.push({ key: k, currentValue: v, change: "new" });
                  } else if (JSON.stringify(prevVars[k]) !== JSON.stringify(v)) {
                    diff.push({ key: k, previousValue: prevVars[k], currentValue: v, change: "modified" });
                  }
                }
                for (const k of Object.keys(prevVars)) {
                  if (!(k in newVars)) {
                    diff.push({ key: k, previousValue: prevVars[k], change: "deleted" });
                  }
                }
                return {
                  ...prev,
                  currentVariables: newVars,
                  variableDiff: diff,
                  pendingVariableEdits: {},
                };
              });
              break;
            }

            case "debug_flow_summary": {
              const summary: DebugFlowSummary = {
                totalDurationMs: chunk.totalDurationMs,
                nodesExecuted: chunk.nodesExecuted,
                nodesFailed: chunk.nodesFailed,
                executionPath: chunk.executionPath,
                otelTraceId: chunk.otelTraceId,
              };
              // Keep ref in sync for saveTrace
              flowSummaryRef.current = summary;
              setState((prev) => ({ ...prev, flowSummary: summary }));
              break;
            }

            case "done": {
              setState((prev) => ({
                ...prev,
                isRunning: false,
                conversationId: chunk.conversationId,
              }));
              // Auto-save the completed trace (fire-and-forget)
              void saveTrace("COMPLETED", chunk.conversationId);
              break;
            }

            case "error": {
              setState((prev) => ({ ...prev, isRunning: false }));
              // Auto-save failed trace
              void saveTrace("FAILED");
              break;
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setState((prev) => ({ ...prev, isRunning: false }));
        void saveTrace("FAILED");
      }
    } finally {
      setState((prev) => ({ ...prev, isRunning: false }));
    }
  }, [agentId, saveTrace, state.testInput, state.isRunning, state.conversationId]);

  return {
    state,
    toggleDebugMode,
    setTestInput,
    selectNode,
    clearSession,
    stopRun,
    runDebug,
    toggleBreakpoint,
    sendControl,
    editVariable,
    resetVariableEdits,
  };
}
