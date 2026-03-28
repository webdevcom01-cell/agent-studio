"use client";

import { memo } from "react";
import { type NodeProps } from "@xyflow/react";
import { GitBranch } from "lucide-react";
import { BaseNode } from "./base-node";

interface ABVariant {
  id: string;
  weight: number;
}

function ABTestNodeComponent({ data, selected }: NodeProps) {
  const variants = Array.isArray(data.variants)
    ? (data.variants as ABVariant[])
    : [];

  return (
    <BaseNode
      icon={<GitBranch className="size-4" />}
      label={(data.label as string) || "A/B Test"}
      color="pink"
      selected={selected}
    >
      {variants.length > 0 ? (
        <p className="truncate">
          {variants.map((v) => `${v.id}:${v.weight}%`).join(" / ")}
        </p>
      ) : (
        <p className="italic">No variants configured</p>
      )}
    </BaseNode>
  );
}

export const ABTestNode = memo(ABTestNodeComponent);
