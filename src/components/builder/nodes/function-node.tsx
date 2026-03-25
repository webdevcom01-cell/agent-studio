"use client";

import { memo } from "react";
import { type NodeProps } from "@xyflow/react";
import { Code } from "lucide-react";
import { BaseNode } from "./base-node";

function FunctionNodeComponent({ data, selected }: NodeProps) {
  const code = (data.code as string) || "";

  return (
    <BaseNode
      icon={<Code className="size-4" />}
      label={(data.label as string) || "Function"}
      color="orange"
      selected={selected}
    >
      {code ? (
        <p className="line-clamp-2 font-mono">{code}</p>
      ) : (
        <p className="italic">No code set</p>
      )}
    </BaseNode>
  );
}

export const FunctionNode = memo(FunctionNodeComponent);
