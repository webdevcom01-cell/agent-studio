"use client";

import { memo } from "react";
import { type NodeProps } from "@xyflow/react";
import { GitBranch } from "lucide-react";
import { BaseNode } from "./base-node";

interface ConditionBranch {
  id: string;
  variable: string;
  operator: string;
  value: string;
}

function ConditionNodeComponent({ data, selected }: NodeProps) {
  const branches = (data.branches as ConditionBranch[]) ?? [];

  const outputHandles = [
    ...branches.map((b) => ({ id: b.id, label: b.variable })),
    { id: "else", label: "Else" },
  ];

  return (
    <BaseNode
      icon={<GitBranch className="size-4" />}
      label={(data.label as string) || "Condition"}
      color="amber"
      selected={selected}
      outputHandles={outputHandles}
    >
      {branches.length > 0 ? (
        <div className="space-y-0.5">
          {branches.map((b) => (
            <p key={b.id} className="truncate">
              <code className="font-mono">{b.variable}</code>{" "}
              <span className="text-muted-foreground">{b.operator}</span>{" "}
              <code className="font-mono">{b.value}</code>
            </p>
          ))}
        </div>
      ) : (
        <p className="italic">No conditions set</p>
      )}
    </BaseNode>
  );
}

export const ConditionNode = memo(ConditionNodeComponent);
