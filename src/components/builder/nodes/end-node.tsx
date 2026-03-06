"use client";

import { memo } from "react";
import { type NodeProps } from "@xyflow/react";
import { CircleStop } from "lucide-react";
import { BaseNode } from "./base-node";

function EndNodeComponent({ data, selected }: NodeProps) {
  return (
    <BaseNode
      icon={<CircleStop className="size-4" />}
      label={(data.label as string) || "End"}
      color="red"
      selected={selected}
      hasOutput={false}
    >
      <p>{(data.endMessage as string) || "End conversation"}</p>
    </BaseNode>
  );
}

export const EndNode = memo(EndNodeComponent);
