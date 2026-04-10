"use client";

import { memo } from "react";
import { type NodeProps } from "@xyflow/react";
import { Bot, RefreshCw, Wrench } from "lucide-react";
import { BaseNode } from "./base-node";

function ClaudeAgentSdkNodeComponent({ data, selected }: NodeProps) {
  const task = (data.task as string) || "";
  const outputVariable = (data.outputVariable as string) || "";
  const enableSessionResume = (data.enableSessionResume as boolean) ?? false;
  const enableSubAgents = (data.enableSubAgents as boolean) ?? false;
  const model = (data.model as string) || "claude-sonnet-4-6";
  const modelLabel = model.split("/").pop() ?? model;

  const preview = task.length > 60 ? task.slice(0, 57) + "…" : task;

  return (
    <BaseNode
      icon={<Bot className="size-4" />}
      label={(data.label as string) || "Claude Agent SDK"}
      color="violet"
      selected={selected}
    >
      {preview ? (
        <p className="truncate text-[11px]">{preview}</p>
      ) : (
        <p className="text-[11px] italic">No task configured</p>
      )}
      <div className="mt-1 flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
        <span className="truncate">{modelLabel}</span>
        {enableSubAgents && <Wrench className="size-2.5 shrink-0" />}
        {enableSessionResume && <RefreshCw className="size-2.5 shrink-0" />}
        {outputVariable && (
          <span className="truncate">→ {outputVariable}</span>
        )}
      </div>
    </BaseNode>
  );
}

export const ClaudeAgentSdkNode = memo(ClaudeAgentSdkNodeComponent);
