"use client";

import { memo } from "react";
import { type NodeProps } from "@xyflow/react";
import { Clock } from "lucide-react";
import { BaseNode } from "./base-node";

function WaitNodeComponent({ data, selected }: NodeProps) {
  const duration = (data.duration as number) ?? 1;

  return (
    <BaseNode
      icon={<Clock className="size-4" />}
      label={(data.label as string) || "Wait"}
      color="amber"
      selected={selected}
    >
      <p>{duration}s delay</p>
    </BaseNode>
  );
}

export const WaitNode = memo(WaitNodeComponent);
