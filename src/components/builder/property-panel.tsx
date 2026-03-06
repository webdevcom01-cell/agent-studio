"use client";

import { type Node } from "@xyflow/react";
import { Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface PropertyPanelProps {
  node: Node;
  onUpdateData: (nodeId: string, data: Record<string, unknown>) => void;
  onDeleteNode: (nodeId: string) => void;
  onClose: () => void;
}

export function PropertyPanel({
  node,
  onUpdateData,
  onDeleteNode,
  onClose,
}: PropertyPanelProps) {
  const data = node.data as Record<string, unknown>;

  function update(key: string, value: unknown) {
    onUpdateData(node.id, { [key]: value });
  }

  return (
    <div className="flex w-80 flex-col border-l bg-background">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h3 className="text-sm font-semibold">Properties</h3>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={onClose}
        >
          <X className="size-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="space-y-2">
          <Label>Label</Label>
          <Input
            value={(data.label as string) ?? ""}
            onChange={(e) => update("label", e.target.value)}
          />
        </div>

        {node.type === "message" && (
          <div className="space-y-2">
            <Label>Message</Label>
            <Textarea
              value={(data.message as string) ?? ""}
              onChange={(e) => update("message", e.target.value)}
              rows={4}
            />
          </div>
        )}

        {node.type === "ai_response" && (
          <>
            <div className="space-y-2">
              <Label>System Prompt</Label>
              <Textarea
                value={(data.prompt as string) ?? ""}
                onChange={(e) => update("prompt", e.target.value)}
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <Label>Model</Label>
              <Input
                value={(data.model as string) ?? "deepseek-chat"}
                onChange={(e) => update("model", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Max Tokens</Label>
              <Input
                type="number"
                value={(data.maxTokens as number) ?? 500}
                onChange={(e) => update("maxTokens", parseInt(e.target.value) || 500)}
              />
            </div>
            <div className="space-y-2">
              <Label>Output Variable</Label>
              <Input
                value={(data.outputVariable as string) ?? ""}
                onChange={(e) => update("outputVariable", e.target.value)}
                placeholder="e.g. ai_response"
              />
            </div>
          </>
        )}

        {node.type === "capture" && (
          <>
            <div className="space-y-2">
              <Label>Variable Name</Label>
              <Input
                value={(data.variableName as string) ?? ""}
                onChange={(e) => update("variableName", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Prompt</Label>
              <Textarea
                value={(data.prompt as string) ?? ""}
                onChange={(e) => update("prompt", e.target.value)}
                rows={3}
              />
            </div>
          </>
        )}

        {node.type === "kb_search" && (
          <>
            <div className="space-y-2">
              <Label>Query Variable</Label>
              <Input
                value={(data.queryVariable as string) ?? "last_message"}
                onChange={(e) => update("queryVariable", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Top K Results</Label>
              <Input
                type="number"
                value={(data.topK as number) ?? 5}
                onChange={(e) => update("topK", parseInt(e.target.value) || 5)}
              />
            </div>
          </>
        )}

        {node.type === "end" && (
          <div className="space-y-2">
            <Label>End Message</Label>
            <Textarea
              value={(data.endMessage as string) ?? ""}
              onChange={(e) => update("endMessage", e.target.value)}
              rows={2}
              placeholder="Optional goodbye message"
            />
          </div>
        )}
      </div>

      <div className="border-t p-4">
        <Button
          variant="destructive"
          size="sm"
          className="w-full"
          onClick={() => onDeleteNode(node.id)}
        >
          <Trash2 className="mr-2 size-4" />
          Delete Node
        </Button>
      </div>
    </div>
  );
}
