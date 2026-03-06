"use client";

import { memo } from "react";
import { type NodeProps } from "@xyflow/react";
import { Sparkles } from "lucide-react";
import { BaseNode } from "./base-node";

function AIResponseNodeComponent({ data, selected }: NodeProps) {
  return (
    <BaseNode
      icon={<Sparkles className="size-4" />}
      label={(data.label as string) || "AI Response"}
      color="violet"
      selected={selected}
    >
      {data.prompt ? (
        <p className="line-clamp-2">{String(data.prompt)}</p>
      ) : null}
      {data.model ? (
        <p className="mt-0.5 text-[10px] text-muted-foreground">
          Model: {String(data.model)}
        </p>
      ) : null}
    </BaseNode>
  );
}

export const AIResponseNode = memo(AIResponseNodeComponent);
