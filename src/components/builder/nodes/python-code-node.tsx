"use client";

import { memo } from "react";
import { type NodeProps } from "@xyflow/react";
import { Code2 } from "lucide-react";
import { BaseNode } from "./base-node";

function PythonCodeNodeComponent({ data, selected }: NodeProps) {
  const code = (data.code as string) || "";

  return (
    <BaseNode
      icon={<Code2 className="size-4" />}
      label={(data.label as string) || "Python Code"}
      color="yellow"
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

export const PythonCodeNode = memo(PythonCodeNodeComponent);
