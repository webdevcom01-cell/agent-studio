"use client";

import { memo } from "react";
import { type NodeProps } from "@xyflow/react";
import { Database } from "lucide-react";
import { BaseNode } from "./base-node";

function KBSearchNodeComponent({ data, selected }: NodeProps) {
  const queryVar = (data.queryVariable as string) || "last_message";
  const topK = (data.topK as number) ?? 5;

  return (
    <BaseNode
      icon={<Database className="size-4" />}
      label={(data.label as string) || "KB Search"}
      color="teal"
      selected={selected}
    >
      <div className="space-y-0.5">
        <p>
          Query: <span className="font-mono">{`{{${queryVar}}}`}</span>
        </p>
        <p className="text-[10px] text-muted-foreground">
          Top {topK} results
        </p>
      </div>
    </BaseNode>
  );
}

export const KBSearchNode = memo(KBSearchNodeComponent);
