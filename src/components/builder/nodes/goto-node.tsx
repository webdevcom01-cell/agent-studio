"use client";

import { memo } from "react";
import { type NodeProps } from "@xyflow/react";
import { CornerDownRight } from "lucide-react";
import { BaseNode } from "./base-node";

function GotoNodeComponent({ data, selected }: NodeProps) {
  return (
    <BaseNode
      icon={<CornerDownRight className="size-4" />}
      label={(data.label as string) || "Goto"}
      color="amber"
      selected={selected}
    >
      {data.targetNodeId ? (
        <p className="truncate font-mono">{String(data.targetNodeId)}</p>
      ) : (
        <p className="italic">No target set</p>
      )}
    </BaseNode>
  );
}

export const GotoNode = memo(GotoNodeComponent);
