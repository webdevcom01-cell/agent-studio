"use client";

import React, { useCallback, useEffect, useMemo, useState, useRef, useReducer } from "react";
import { toast } from "sonner";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Connection,
  type Node,
  type Edge,
  type NodeTypes,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { PropertyPanel } from "./property-panel";
import { NodePicker } from "./node-picker";
import { useDebugSession } from "./use-debug-session";
import { DebugToggleButton, DebugToolbar } from "./debug-toolbar";
import { DebugContext, buildDebugNodeTypes, type DebugContextValue } from "./debug-node-overlay";
import { DebugPanel } from "./debug-panel";
import { DebugTimeline } from "./debug-timeline";
import { TraceHistoryPanel } from "./trace-history";
import { DebugVariableWatchPanel } from "./debug-variable-watch";
import { MessageNode } from "./nodes/message-node";
import { CaptureNode } from "./nodes/capture-node";
import { ConditionNode } from "./nodes/condition-node";
import { EndNode } from "./nodes/end-node";
import { AIResponseNode } from "./nodes/ai-response-node";
import { KBSearchNode } from "./nodes/kb-search-node";
import { GotoNode } from "./nodes/goto-node";
import { SetVariableNode } from "./nodes/set-variable-node";
import { WaitNode } from "./nodes/wait-node";
import { ButtonNode } from "./nodes/button-node";
import { ApiCallNode } from "./nodes/api-call-node";
import { WebhookNode } from "./nodes/webhook-node";
import { FunctionNode } from "./nodes/function-node";
import { AIClassifyNode } from "./nodes/ai-classify-node";
import { AIExtractNode } from "./nodes/ai-extract-node";
import { AISummarizeNode } from "./nodes/ai-summarize-node";
import { MCPToolNode } from "./nodes/mcp-tool-node";
import { CallAgentNode } from "./nodes/call-agent-node";
import { HumanApprovalNode } from "./nodes/human-approval-node";
import { LoopNode } from "./nodes/loop-node";
import { ParallelNode } from "./nodes/parallel-node";
import { MemoryWriteNode } from "./nodes/memory-write-node";
import { MemoryReadNode } from "./nodes/memory-read-node";
import { EvaluatorNode } from "./nodes/evaluator-node";
import { ScheduleTriggerNode } from "./nodes/schedule-trigger-node";
import { WebhookTriggerNode } from "./nodes/webhook-trigger-node";
import { EmailSendNode } from "./nodes/email-send-node";
import { NotificationNode } from "./nodes/notification-node";
import { FormatTransformNode } from "./nodes/format-transform-node";
import { SwitchNode } from "./nodes/switch-node";
import { WebFetchNode } from "./nodes/web-fetch-node";
import { BrowserActionNode } from "./nodes/browser-action-node";
import { DesktopAppNode } from "./nodes/desktop-app-node";
import { LearnNode } from "./nodes/learn-node";
import { PythonCodeNode } from "./nodes/python-code-node";
import { StructuredOutputNode } from "./nodes/structured-output-node";
import { CacheNode } from "./nodes/cache-node";
import { EmbeddingsNode } from "./nodes/embeddings-node";
import { RetryNode } from "./nodes/retry-node";
import { ABTestNode } from "./nodes/ab-test-node";
import { SemanticRouterNode } from "./nodes/semantic-router-node";
import { CostMonitorNode } from "./nodes/cost-monitor-node";
import { AggregateNode } from "./nodes/aggregate-node";
import { WebSearchNode } from "./nodes/web-search-node";
import { MultimodalInputNode } from "./nodes/multimodal-input-node";
import { ImageGenerationNode } from "./nodes/image-generation-node";
import { SpeechAudioNode } from "./nodes/speech-audio-node";
import { DatabaseQueryNode } from "./nodes/database-query-node";
import { FileOperationsNode } from "./nodes/file-operations-node";
import { MCPTaskRunnerNode } from "./nodes/mcp-task-runner-node";
import { GuardrailsNode } from "./nodes/guardrails-node";
import { CodeInterpreterNode } from "./nodes/code-interpreter-node";
import { TrajectoryEvaluatorNode } from "./nodes/trajectory-evaluator-node";
import { PlanAndExecuteNode } from "./nodes/plan-and-execute-node";
import { ReflexiveLoopNode } from "./nodes/reflexive-loop-node";
import { SwarmNode } from "./nodes/swarm-node";
import { VerificationNode } from "./nodes/verification-node";
import { AstTransformNode } from "./nodes/ast-transform-node";
import { LspQueryNode } from "./nodes/lsp-query-node";
import { ProjectContextNode } from "./nodes/project-context-node";
import { SandboxVerifyNode } from "./nodes/sandbox-verify-node";
import { FileWriterNode } from "./nodes/file-writer-node";
import { ProcessRunnerNode } from "./nodes/process-runner-node";
import { GitNodeNode } from "./nodes/git-node-node";
import { DeployTriggerNode } from "./nodes/deploy-trigger-node";
import { FlowErrorBoundary } from "./flow-error-boundary";
import { VersionPanel } from "./version-panel";
import { DeployDialog } from "./deploy-dialog";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Save, Plug, X, Clock, Rocket, Circle, Undo2, Redo2, Search, BarChart2, History, Variable, ArrowLeft, Database, FlaskConical, Webhook, MessageSquare } from "lucide-react";
import { Input } from "@/components/ui/input";
import { AgentMCPSelector } from "@/components/mcp/agent-mcp-selector";
import type { FlowContent, FlowNode } from "@/types";
import type { NodeTypes as ReactFlowNodeTypes } from "@xyflow/react";
import { cn } from "@/lib/utils";

interface FlowBuilderProps {
  agentId: string;
  agentName: string;
  initialContent: FlowContent;
}

const NODE_TYPES: NodeTypes = {
  message: MessageNode,
  capture: CaptureNode,
  condition: ConditionNode,
  end: EndNode,
  ai_response: AIResponseNode,
  kb_search: KBSearchNode,
  goto: GotoNode,
  set_variable: SetVariableNode,
  wait: WaitNode,
  button: ButtonNode,
  api_call: ApiCallNode,
  webhook: WebhookNode,
  function: FunctionNode,
  ai_classify: AIClassifyNode,
  ai_extract: AIExtractNode,
  ai_summarize: AISummarizeNode,
  mcp_tool: MCPToolNode,
  call_agent: CallAgentNode,
  human_approval: HumanApprovalNode,
  loop: LoopNode,
  parallel: ParallelNode,
  memory_write: MemoryWriteNode,
  memory_read: MemoryReadNode,
  evaluator: EvaluatorNode,
  schedule_trigger: ScheduleTriggerNode,
  webhook_trigger: WebhookTriggerNode,
  email_send: EmailSendNode,
  notification: NotificationNode,
  format_transform: FormatTransformNode,
  switch: SwitchNode,
  web_fetch: WebFetchNode,
  browser_action: BrowserActionNode,
  desktop_app: DesktopAppNode,
  learn: LearnNode,
  python_code: PythonCodeNode,
  structured_output: StructuredOutputNode,
  cache: CacheNode,
  embeddings: EmbeddingsNode,
  retry: RetryNode,
  ab_test: ABTestNode,
  semantic_router: SemanticRouterNode,
  cost_monitor: CostMonitorNode,
  aggregate: AggregateNode,
  web_search: WebSearchNode,
  multimodal_input: MultimodalInputNode,
  image_generation: ImageGenerationNode,
  speech_audio: SpeechAudioNode,
  database_query: DatabaseQueryNode,
  file_operations: FileOperationsNode,
  mcp_task_runner: MCPTaskRunnerNode,
  guardrails: GuardrailsNode,
  code_interpreter: CodeInterpreterNode,
  trajectory_evaluator: TrajectoryEvaluatorNode,
  plan_and_execute: PlanAndExecuteNode,
  reflexive_loop: ReflexiveLoopNode,
  swarm: SwarmNode,
  verification: VerificationNode,
  ast_transform: AstTransformNode,
  lsp_query: LspQueryNode,
  project_context: ProjectContextNode,
  sandbox_verify: SandboxVerifyNode,
  file_writer: FileWriterNode,
  process_runner: ProcessRunnerNode,
  git_node: GitNodeNode,
  deploy_trigger: DeployTriggerNode,
};

// Debug-wrapped versions of all node types (stable reference, created once)
const DEBUG_NODE_TYPES: ReactFlowNodeTypes = buildDebugNodeTypes(
  NODE_TYPES as Record<string, React.ComponentType<{ id: string }>>
) as ReactFlowNodeTypes;

// ---------------------------------------------------------------------------
// History types for undo/redo
// ---------------------------------------------------------------------------
interface HistoryEntry {
  nodes: Node[];
  edges: Edge[];
}

type HistoryAction =
  | { type: "PUSH"; entry: HistoryEntry }
  | { type: "UNDO" }
  | { type: "REDO" };

interface HistoryState {
  past: HistoryEntry[];
  future: HistoryEntry[];
}

const MAX_HISTORY = 30;

function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  switch (action.type) {
    case "PUSH": {
      const past = [...state.past, action.entry].slice(-MAX_HISTORY);
      return { past, future: [] };
    }
    case "UNDO": {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      return {
        past: state.past.slice(0, -1),
        future: [previous, ...state.future],
      };
    }
    case "REDO": {
      if (state.future.length === 0) return state;
      const next = state.future[0];
      return {
        past: [...state.past, next],
        future: state.future.slice(1),
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Relative time helper
// ---------------------------------------------------------------------------
function relativeTime(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export function FlowBuilder(props: FlowBuilderProps) {
  return (
    <ReactFlowProvider>
      <FlowBuilderCanvas {...props} />
    </ReactFlowProvider>
  );
}

function FlowBuilderCanvas({
  agentId,
  agentName,
  initialContent,
}: FlowBuilderProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(
    (initialContent.nodes ?? []) as Node[]
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    (initialContent.edges ?? []) as Edge[]
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [showMCPPanel, setShowMCPPanel] = useState(false);
  const [showVersionPanel, setShowVersionPanel] = useState(false);
  const [showDeployDialog, setShowDeployDialog] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [lastSavedVersionId, setLastSavedVersionId] = useState<string | null>(
    null
  );
  const [deployedVersion, setDeployedVersion] = useState<number | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [saveTimeLabel, setSaveTimeLabel] = useState<string>("");
  // Optimistic lock token — updated on every successful GET and PUT
  const [lockVersion, setLockVersion] = useState<number | null>(null);

  // Debug session
  const debugSession = useDebugSession(agentId);
  const [showTimeline, setShowTimeline] = useState(false);
  const [showTraceHistory, setShowTraceHistory] = useState(false);
  const [showVariableWatch, setShowVariableWatch] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // Undo/redo history
  const [history, dispatchHistory] = useReducer(historyReducer, {
    past: [],
    future: [],
  });
  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  useEffect(() => {
    fetch(`/api/agents/${agentId}/flow`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          if (json.data?.activeVersion) {
            setDeployedVersion(json.data.activeVersion.version);
            setLastSavedVersionId(json.data.activeVersion.id);
          }
          // Capture the optimistic lock token for conflict detection on save
          if (typeof json.data?.lockVersion === "number") {
            setLockVersion(json.data.lockVersion);
          }
        }
      })
      .catch(() => {});
  }, [agentId]);

  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  nodesRef.current = nodes;
  edgesRef.current = edges;

  const markChanged = useCallback(() => setHasChanges(true), []);

  // Update relative time label every 30s
  useEffect(() => {
    if (!lastSavedAt) return;
    setSaveTimeLabel(relativeTime(lastSavedAt));
    const interval = setInterval(() => {
      setSaveTimeLabel(relativeTime(lastSavedAt));
    }, 30_000);
    return () => clearInterval(interval);
  }, [lastSavedAt]);

  // Ctrl+S shortcut
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (hasChanges && !isSaving) {
          handleSave();
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
      if (
        ((e.ctrlKey || e.metaKey) && e.key === "y") ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "z")
      ) {
        e.preventDefault();
        handleRedo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        setShowSearch((v) => !v);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasChanges, isSaving, canUndo, canRedo]);

  // Focus search input when opened
  useEffect(() => {
    if (showSearch) {
      setTimeout(() => searchRef.current?.focus(), 50);
    } else {
      setSearchQuery("");
    }
  }, [showSearch]);

  // Push current state to history before a structural change
  const pushHistory = useCallback(() => {
    dispatchHistory({
      type: "PUSH",
      entry: {
        nodes: nodesRef.current.map((n) => ({ ...n })),
        edges: edgesRef.current.map((e) => ({ ...e })),
      },
    });
  }, []);

  const handleUndo = useCallback(() => {
    if (!canUndo) return;
    const entry = history.past[history.past.length - 1];
    dispatchHistory({ type: "UNDO" });
    setNodes(entry.nodes);
    setEdges(entry.edges);
    setHasChanges(true);
  }, [canUndo, history.past, setNodes, setEdges]);

  const handleRedo = useCallback(() => {
    if (!canRedo) return;
    const entry = history.future[0];
    dispatchHistory({ type: "REDO" });
    setNodes(entry.nodes);
    setEdges(entry.edges);
    setHasChanges(true);
  }, [canRedo, history.future, setNodes, setEdges]);

  const onConnect = useCallback(
    (connection: Connection) => {
      pushHistory();
      const edgeId = `e-${connection.source}-${connection.sourceHandle ?? "default"}-${connection.target}`;
      setEdges((eds) => [
        ...eds,
        {
          id: edgeId,
          source: connection.source,
          target: connection.target,
          sourceHandle: connection.sourceHandle,
        },
      ]);
      markChanged();
    },
    [setEdges, markChanged, pushHistory]
  );

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      setSelectedNodeId(node.id);
      setShowMCPPanel(false);
      // In debug mode, also select node for the debug panel
      debugSession.selectNode(node.id);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [debugSession.selectNode]
  );

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  /** Right-click on a node in debug mode → toggle breakpoint */
  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      if (!debugSession.state.isDebugMode) return;
      event.preventDefault();
      debugSession.toggleBreakpoint(node.id);
    },
    [debugSession.state.isDebugMode, debugSession.toggleBreakpoint]
  );

  const addNode = useCallback(
    (type: string, data: Record<string, unknown>) => {
      pushHistory();
      const id = `${type}-${Date.now()}`;
      const newNode: Node = {
        id,
        type,
        position: { x: 250, y: (nodesRef.current.length + 1) * 150 },
        data,
      };
      setNodes((nds) => [...nds, newNode]);
      markChanged();
    },
    [setNodes, markChanged, pushHistory]
  );

  const updateNodeData = useCallback(
    (nodeId: string, data: Record<string, unknown>) => {
      pushHistory();
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n
        )
      );
      markChanged();
    },
    [setNodes, markChanged, pushHistory]
  );

  const deleteNode = useCallback(
    (nodeId: string) => {
      pushHistory();
      setNodes((nds) => nds.filter((n) => n.id !== nodeId));
      setEdges((eds) =>
        eds.filter((e) => e.source !== nodeId && e.target !== nodeId)
      );
      setSelectedNodeId(null);
      markChanged();
    },
    [setNodes, setEdges, markChanged, pushHistory]
  );

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      const content: FlowContent = {
        nodes: nodesRef.current.map((n) => ({
          id: n.id,
          type: n.type as FlowNode["type"],
          position: n.position,
          data: n.data as Record<string, unknown>,
        })),
        edges: edgesRef.current.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: e.sourceHandle ?? undefined,
        })),
        variables: initialContent.variables ?? [],
      };

      // Include lockVersion for optimistic conflict detection.
      // Old clients / embed widget callers that omit it are still accepted by the server.
      const body: Record<string, unknown> = { content };
      if (lockVersion !== null) {
        body.clientLockVersion = lockVersion;
      }

      const res = await fetch(`/api/agents/${agentId}/flow`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.status === 409) {
        // Another session saved this flow while we had it open.
        // Don't overwrite — surface a friendly message instead.
        toast.error(
          "Flow was modified in another session. Reload the page to continue editing.",
          { duration: 8000 }
        );
        return;
      }

      const json = await res.json();

      if (json.success) {
        if (json.data?.latestVersion?.id) {
          setLastSavedVersionId(json.data.latestVersion.id);
        }
        // Update our local lock token so the next auto-save uses the new value
        if (typeof json.data?.lockVersion === "number") {
          setLockVersion(json.data.lockVersion);
        }
        setHasChanges(false);
        setLastSavedAt(new Date());
      }
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        // eslint-disable-next-line no-console
        console.error("Save failed:", error);
      }
    } finally {
      setIsSaving(false);
    }
  }, [agentId, initialContent.variables, lockVersion]);

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId]
  );

  // Debug: compute highlighted edges when debug mode is active
  const debugEdges = useMemo(() => {
    const { isDebugMode, edgeStates } = debugSession.state;
    if (!isDebugMode || edgeStates.size === 0) return edges;
    return edges.map((edge) => {
      const key = `${edge.source}->${edge.target}`;
      if (edgeStates.get(key)?.taken) {
        return {
          ...edge,
          animated: true,
          style: { stroke: "hsl(var(--primary))", strokeWidth: 2 },
        };
      }
      return edge;
    });
  }, [edges, debugSession.state]);

  // Filtered nodes for search
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return nodes.filter((n) => {
      const label = (n.data?.label as string | undefined) ?? n.type ?? "";
      return label.toLowerCase().includes(q) || n.id.toLowerCase().includes(q);
    });
  }, [nodes, searchQuery]);

  return (
    <div className="flex h-full w-full flex-col">
      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex h-[52px] shrink-0 items-center gap-1 border-b border-border px-3">

        {/* Left: back + agent name + add node */}
        <Button variant="ghost" size="icon-sm" asChild aria-label="Back to dashboard">
          <Link href="/"><ArrowLeft className="size-3.5" /></Link>
        </Button>

        <span className="mx-1 text-sm font-medium tracking-tight text-foreground">
          {agentName}
        </span>

        <NodePicker onAddNode={addNode} />

        <div className="mx-1 h-4 w-px bg-border" />

        {/* Undo / Redo */}
        <Button size="icon-sm" variant="ghost" onClick={handleUndo} disabled={!canUndo} title="Undo (⌘Z)" aria-label="Undo">
          <Undo2 className="size-3.5" />
        </Button>
        <Button size="icon-sm" variant="ghost" onClick={handleRedo} disabled={!canRedo} title="Redo (⌘Y)" aria-label="Redo">
          <Redo2 className="size-3.5" />
        </Button>

        {/* Node search */}
        <Button
          size="icon-sm"
          variant={showSearch ? "secondary" : "ghost"}
          onClick={() => setShowSearch((v) => !v)}
          title="Search nodes (⌘F)"
          aria-label="Search nodes"
        >
          <Search className="size-3.5" />
        </Button>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Agent links */}
        <Button size="icon-sm" variant="ghost" asChild title="Knowledge Base" aria-label="Knowledge Base">
          <Link href={`/knowledge/${agentId}`}><Database className="size-3.5" /></Link>
        </Button>
        <Button size="icon-sm" variant="ghost" asChild title="Evals" aria-label="Evals">
          <Link href={`/evals/${agentId}`}><FlaskConical className="size-3.5" /></Link>
        </Button>
        <Button size="icon-sm" variant="ghost" asChild title="Webhooks" aria-label="Webhooks">
          <Link href={`/webhooks/${agentId}`}><Webhook className="size-3.5" /></Link>
        </Button>

        <div className="mx-1 h-4 w-px bg-border" />

        {/* Save status */}
        <button
          className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted"
          onClick={() => {
            setShowVersionPanel(true);
            setSelectedNodeId(null);
            setShowMCPPanel(false);
          }}
        >
          {hasChanges ? (
            <>
              <Circle className="size-2 fill-muted-foreground text-muted-foreground" />
              <span>Unsaved</span>
            </>
          ) : deployedVersion ? (
            <>
              <Circle className="size-2 fill-foreground/60 text-foreground/60" />
              <span>v{deployedVersion}</span>
            </>
          ) : (
            <>
              <Circle className="size-2 fill-muted-foreground/40 text-muted-foreground/40" />
              <span>Draft</span>
            </>
          )}
        </button>

        {lastSavedAt && !hasChanges && (
          <span className="hidden text-xs text-muted-foreground/40 sm:inline">
            {saveTimeLabel}
          </span>
        )}

        <div className="mx-1 h-4 w-px bg-border" />

        {/* Panel toggles */}
        <Button
          size="icon-sm"
          variant={showVersionPanel ? "secondary" : "ghost"}
          onClick={() => {
            setShowVersionPanel(!showVersionPanel);
            if (!showVersionPanel) { setSelectedNodeId(null); setShowMCPPanel(false); }
          }}
          title="Version History"
          aria-label="Version History"
        >
          <Clock className="size-3.5" />
        </Button>

        <Button
          size="icon-sm"
          variant={showMCPPanel ? "secondary" : "ghost"}
          onClick={() => {
            setShowMCPPanel(!showMCPPanel);
            if (!showMCPPanel) { setSelectedNodeId(null); setShowVersionPanel(false); }
          }}
          title="MCP Tools"
          aria-label="MCP Tools"
        >
          <Plug className="size-3.5" />
        </Button>

        <DebugToggleButton
          isDebugMode={debugSession.state.isDebugMode}
          onToggle={() => {
            debugSession.toggleDebugMode();
            if (!debugSession.state.isDebugMode) {
              setShowTimeline(true);
              setShowVariableWatch(true);
            }
          }}
        />

        {debugSession.state.isDebugMode && (
          <>
            <Button
              size="icon-sm"
              variant={showTimeline ? "secondary" : "ghost"}
              onClick={() => setShowTimeline((v) => !v)}
              title="Execution Timeline"
              aria-label="Execution Timeline"
            >
              <BarChart2 className="size-3.5" />
            </Button>
            <Button
              size="icon-sm"
              variant={showTraceHistory ? "secondary" : "ghost"}
              onClick={() => setShowTraceHistory((v) => !v)}
              title="Trace History"
              aria-label="Trace History"
            >
              <History className="size-3.5" />
            </Button>
            <Button
              size="icon-sm"
              variant={showVariableWatch ? "secondary" : "ghost"}
              onClick={() => setShowVariableWatch((v) => !v)}
              title="Variable Watch"
              aria-label="Variable Watch"
            >
              <Variable className="size-3.5" />
            </Button>
          </>
        )}

        <div className="mx-1 h-4 w-px bg-border" />

        {/* Primary actions */}
        <Button size="sm" variant="outline" asChild className="gap-1.5">
          <Link href={`/chat/${agentId}`}>
            <MessageSquare className="size-3.5" />
            Test
          </Link>
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => { if (lastSavedVersionId) setShowDeployDialog(true); }}
          disabled={!lastSavedVersionId}
          className="gap-1.5"
        >
          <Rocket className="size-3.5" />
          Deploy
        </Button>
        <Button
          size="sm"
          onClick={handleSave}
          disabled={isSaving || !hasChanges}
          title="Save (⌘S)"
          className="gap-1.5"
        >
          <Save className="size-3.5" />
          {isSaving ? "Saving…" : "Save"}
        </Button>
      </div>

      {/* Debug toolbar — shown when debug mode is active */}
      {debugSession.state.isDebugMode && (
        <DebugToolbar
          state={debugSession.state}
          onSetTestInput={debugSession.setTestInput}
          onRun={debugSession.runDebug}
          onStop={debugSession.stopRun}
          onClear={debugSession.clearSession}
          onContinue={() => {
            const { debugSessionId } = debugSession.state;
            if (debugSessionId) {
              void debugSession.sendControl("continue", agentId, debugSessionId);
            }
          }}
          onStep={() => {
            const { debugSessionId } = debugSession.state;
            if (debugSessionId) {
              void debugSession.sendControl("step", agentId, debugSessionId);
            }
          }}
        />
      )}

      {/* Node search bar */}
      {showSearch && (
        <div className="border-b px-4 py-2 bg-muted/30">
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
            <Input
              ref={searchRef}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search nodes…"
              className="pl-8 h-8 text-sm"
            />
            {searchQuery && (
              <button
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setSearchQuery("")}
                aria-label="Clear search"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
          {searchQuery && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {searchResults.length === 0 ? (
                <span className="text-xs text-muted-foreground">No nodes match</span>
              ) : (
                searchResults.map((n) => (
                  <button
                    key={n.id}
                    className="inline-flex items-center gap-1.5 rounded border bg-background px-2 py-0.5 text-xs hover:bg-muted transition-colors"
                    onClick={() => {
                      setSelectedNodeId(n.id);
                      setShowSearch(false);
                    }}
                  >
                    <span className="text-muted-foreground">{n.type}</span>
                    <span>{(n.data?.label as string | undefined) ?? n.id}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Trace History sidebar — left panel, only in debug mode */}
        {debugSession.state.isDebugMode && showTraceHistory && (
          <TraceHistoryPanel
            agentId={agentId}
            activeTraceId={debugSession.state.savedTraceId}
            onReplay={(_traceId, testInput) => {
              debugSession.setTestInput(testInput);
              setShowTraceHistory(false);
            }}
            onClose={() => setShowTraceHistory(false)}
          />
        )}

        <div className="relative flex-1" data-testid="flow-canvas">
          <FlowErrorBoundary>
          <DebugContext.Provider value={{
            nodeStates: debugSession.state.nodeStates,
            breakpoints: debugSession.state.breakpoints,
            pausedAtNodeId: debugSession.state.pausedAtNodeId,
          } satisfies DebugContextValue}>
          <ReactFlow
            nodes={nodes}
            edges={debugSession.state.isDebugMode ? debugEdges : edges}
            onNodesChange={(changes) => {
              onNodesChange(changes);
              markChanged();
            }}
            onEdgesChange={(changes) => {
              onEdgesChange(changes);
              markChanged();
            }}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onNodeContextMenu={onNodeContextMenu}
            onPaneClick={onPaneClick}
            nodeTypes={debugSession.state.isDebugMode ? DEBUG_NODE_TYPES : NODE_TYPES}
            fitView
            deleteKeyCode="Delete"
            className="builder-canvas"
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
            <Controls />
            <MiniMap
              nodeStrokeWidth={3}
              className="!bg-background !border-border"
            />
          </ReactFlow>
          </DebugContext.Provider>
          </FlowErrorBoundary>

          {/* Execution Timeline — absolute bottom overlay on canvas */}
          {debugSession.state.isDebugMode && showTimeline && (
            <DebugTimeline
              nodeStates={debugSession.state.nodeStates}
              flowSummary={debugSession.state.flowSummary}
              selectedNodeId={selectedNodeId}
              onSelectNode={(nodeId) => {
                setSelectedNodeId(nodeId);
                debugSession.selectNode(nodeId);
                setShowMCPPanel(false);
                setShowVersionPanel(false);
              }}
              onClose={() => setShowTimeline(false)}
            />
          )}
        </div>

        {selectedNode && debugSession.state.isDebugMode && debugSession.state.nodeStates.get(selectedNode.id) ? (
          /* Debug mode + executed node → show Debug Panel */
          <DebugPanel
            nodeState={debugSession.state.nodeStates.get(selectedNode.id)!}
            nodeName={(selectedNode.data?.label as string | undefined) ?? selectedNode.id}
            onClose={() => {
              setSelectedNodeId(null);
              debugSession.selectNode(null);
            }}
          />
        ) : selectedNode ? (
          /* Normal mode (or debug mode but node not yet executed) → Property Panel */
          <PropertyPanel
            node={selectedNode}
            allNodes={nodes}
            agentId={agentId}
            onUpdateData={updateNodeData}
            onDeleteNode={deleteNode}
            onClose={() => setSelectedNodeId(null)}
          />
        ) : null}

        {showVersionPanel && !selectedNode && (
          <VersionPanel
            agentId={agentId}
            onClose={() => setShowVersionPanel(false)}
            onVersionRestored={() => {
              window.location.reload();
            }}
          />
        )}

        {showMCPPanel && !selectedNode && !showVersionPanel && (
          <div className="flex w-80 flex-col border-l bg-background">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h3 className="text-sm font-semibold flex items-center gap-1.5">
                <Plug className="size-4 text-muted-foreground" />
                MCP Tools
              </h3>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label="Close MCP panel"
                onClick={() => setShowMCPPanel(false)}
              >
                <X className="size-4" aria-hidden="true" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <AgentMCPSelector agentId={agentId} />
            </div>
          </div>
        )}

        {/* Variable Watch panel — debug mode only, shown on the right */}
        {debugSession.state.isDebugMode && showVariableWatch && !selectedNode && !showVersionPanel && !showMCPPanel && (
          <DebugVariableWatchPanel
            currentVariables={debugSession.state.currentVariables}
            variableDiff={debugSession.state.variableDiff}
            pendingEdits={debugSession.state.pendingVariableEdits}
            isPaused={debugSession.state.isPaused}
            onEditVariable={debugSession.editVariable}
            onResetEdits={debugSession.resetVariableEdits}
            onClose={() => setShowVariableWatch(false)}
          />
        )}
      </div>

      {showDeployDialog && lastSavedVersionId && (
        <DeployDialog
          agentId={agentId}
          versionId={lastSavedVersionId}
          onClose={() => setShowDeployDialog(false)}
          onDeployed={() => {
            setShowDeployDialog(false);
          }}
        />
      )}
    </div>
  );
}
