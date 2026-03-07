"use client";

import { useCallback, useMemo, useState, useRef } from "react";
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
import { Button } from "@/components/ui/button";
import { Save } from "lucide-react";
import type { FlowContent, FlowNode } from "@/types";

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
};

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
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  nodesRef.current = nodes;
  edgesRef.current = edges;

  const markChanged = useCallback(() => setHasChanges(true), []);

  const onConnect = useCallback(
    (connection: Connection) => {
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
    [setEdges, markChanged]
  );

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      setSelectedNodeId(node.id);
    },
    []
  );

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  const addNode = useCallback(
    (type: string, data: Record<string, unknown>) => {
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
    [setNodes, markChanged]
  );

  const updateNodeData = useCallback(
    (nodeId: string, data: Record<string, unknown>) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n
        )
      );
      markChanged();
    },
    [setNodes, markChanged]
  );

  const deleteNode = useCallback(
    (nodeId: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== nodeId));
      setEdges((eds) =>
        eds.filter((e) => e.source !== nodeId && e.target !== nodeId)
      );
      setSelectedNodeId(null);
      markChanged();
    },
    [setNodes, setEdges, markChanged]
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

      await fetch(`/api/agents/${agentId}/flow`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });

      setHasChanges(false);
    } catch (error) {
      console.error("Save failed:", error);
    } finally {
      setIsSaving(false);
    }
  }, [agentId, initialContent.variables]);

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId]
  );

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold">{agentName}</h2>
          <NodePicker onAddNode={addNode} />
        </div>
        <Button
          size="sm"
          onClick={handleSave}
          disabled={isSaving || !hasChanges}
        >
          <Save className="mr-1.5 size-4" />
          {isSaving ? "Saving..." : "Save"}
        </Button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="relative flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
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
            onPaneClick={onPaneClick}
            nodeTypes={NODE_TYPES}
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
        </div>

        {selectedNode && (
          <PropertyPanel
            node={selectedNode}
            allNodes={nodes}
            onUpdateData={updateNodeData}
            onDeleteNode={deleteNode}
            onClose={() => setSelectedNodeId(null)}
          />
        )}
      </div>
    </div>
  );
}
