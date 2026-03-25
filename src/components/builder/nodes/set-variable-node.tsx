"use client";

import { memo } from "react";
import { type NodeProps } from "@xyflow/react";
import { Variable } from "lucide-react";
import { BaseNode } from "./base-node";

function SetVariableNodeComponent({ data, selected }: NodeProps) {
  const varName = (data.variableName as string) || "";
  const value = (data.value as string) || "";

  return (
    <BaseNode
      icon={<Variable className="size-4" />}
      label={(data.label as string) || "Set Variable"}
      color="green"
      selected={selected}
    >
      {varName ? (
        <p className="truncate">
          <code className="font-mono">{varName}</code> ={" "}
          <code className="font-mono">{value || '""'}</code>
        </p>
      ) : (
        <p className="italic">No variable set</p>
      )}
    </BaseNode>
  );
}

export const SetVariableNode = memo(SetVariableNodeComponent);
