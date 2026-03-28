"use client";

import { memo } from "react";
import { type NodeProps } from "@xyflow/react";
import { RefreshCcw } from "lucide-react";
import { BaseNode } from "./base-node";

function RetryNodeComponent({ data, selected }: NodeProps) {
  const maxRetries = (data.maxRetries as number) ?? 3;
  const targetNodeId = (data.targetNodeId as string) || "";

  return (
    <BaseNode
      icon={<RefreshCcw className="size-4" />}
      label={(data.label as string) || "Retry"}
      color="amber"
      selected={selected}
    >
      <p className="truncate">
        {targetNodeId ? (
          <>
            Target: <span className="font-mono">{targetNodeId}</span> ({maxRetries} retries)
          </>
        ) : (
          <span className="italic">No target node set</span>
        )}
      </p>
    </BaseNode>
  );
}

export const RetryNode = memo(RetryNodeComponent);
