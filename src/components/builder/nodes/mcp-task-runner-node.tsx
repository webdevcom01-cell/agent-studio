"use client";

import { memo } from "react";
import { type NodeProps } from "@xyflow/react";
import { PlayCircle } from "lucide-react";
import { BaseNode } from "./base-node";

function MCPTaskRunnerNodeComponent({ data, selected }: NodeProps) {
  const taskName = (data.taskName as string) || "";
  const retryOnFailure = (data.retryOnFailure as boolean) ?? true;

  return (
    <BaseNode
      icon={<PlayCircle className="size-4" />}
      label={(data.label as string) || "MCP Task Runner"}
      color="violet"
      selected={selected}
    >
      {taskName ? (
        <p className="truncate">
          <span className="font-mono">{taskName}</span>
          {retryOnFailure && (
            <span className="text-muted-foreground"> (retry)</span>
          )}
        </p>
      ) : (
        <p className="italic">No task configured</p>
      )}
    </BaseNode>
  );
}

export const MCPTaskRunnerNode = memo(MCPTaskRunnerNodeComponent);
