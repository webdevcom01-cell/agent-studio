"use client";

import { memo } from "react";
import { type NodeProps } from "@xyflow/react";
import { GitFork } from "lucide-react";
import { BaseNode } from "./base-node";

interface BranchConfig {
  branchId: string;
  label?: string;
  outputVariable: string;
}

function ParallelNodeComponent({ data, selected }: NodeProps) {
  const branches = (data.branches as BranchConfig[]) ?? [];
  const mergeStrategy = (data.mergeStrategy as string) ?? "all";

  const outputHandles = [
    ...branches.map((b) => ({
      id: b.branchId,
      label: b.label || b.branchId,
    })),
    { id: "done", label: "Done" },
    { id: "failed", label: "Failed" },
  ];

  return (
    <BaseNode
      icon={<GitFork className="size-4" />}
      label={(data.label as string) || "Parallel"}
      color="teal"
      selected={selected}
      outputHandles={outputHandles}
    >
      {branches.length > 0 ? (
        <div className="space-y-0.5">
          <p className="text-muted-foreground">
            {branches.length} branch{branches.length !== 1 ? "es" : ""} • merge: {mergeStrategy}
          </p>
          {branches.map((b) => (
            <p key={b.branchId} className="truncate">
              <span className="font-medium">{b.label || b.branchId}</span>
              {b.outputVariable && (
                <span className="text-muted-foreground">
                  {" → "}
                  <code className="font-mono">{b.outputVariable}</code>
                </span>
              )}
            </p>
          ))}
        </div>
      ) : (
        <p className="italic">No branches configured</p>
      )}
    </BaseNode>
  );
}

export const ParallelNode = memo(ParallelNodeComponent);
