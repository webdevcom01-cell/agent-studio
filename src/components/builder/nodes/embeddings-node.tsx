"use client";

import { memo } from "react";
import { type NodeProps } from "@xyflow/react";
import { Binary } from "lucide-react";
import { BaseNode } from "./base-node";

function EmbeddingsNodeComponent({ data, selected }: NodeProps) {
  const mode = (data.mode as string) || "single";

  return (
    <BaseNode
      icon={<Binary className="size-4" />}
      label={(data.label as string) || "Embeddings"}
      color="indigo"
      selected={selected}
    >
      <p className="truncate">
        Mode: <span className="font-semibold">{mode === "batch" ? "Batch" : "Single"}</span>
      </p>
    </BaseNode>
  );
}

export const EmbeddingsNode = memo(EmbeddingsNodeComponent);
