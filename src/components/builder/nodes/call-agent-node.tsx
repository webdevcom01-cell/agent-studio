"use client";

import { memo } from "react";
import { type NodeProps } from "@xyflow/react";
import { ArrowRightLeft, Layers } from "lucide-react";
import { BaseNode } from "./base-node";

interface ParallelTarget {
  agentId: string;
  agentName?: string;
  outputVariable: string;
}

function CallAgentNodeComponent({ data, selected }: NodeProps) {
  const targetAgentName = (data.targetAgentName as string) || "";
  const outputVariable = (data.outputVariable as string) || "";
  const allowParallel = (data.allowParallel as boolean) || false;
  const parallelTargets = (data.parallelTargets as ParallelTarget[]) || [];

  return (
    <BaseNode
      icon={
        allowParallel ? (
          <Layers className="size-4" />
        ) : (
          <ArrowRightLeft className="size-4" />
        )
      }
      label={(data.label as string) || "Call Agent"}
      color="orange"
      selected={selected}
    >
      {allowParallel && parallelTargets.length > 0 ? (
        <p className="truncate">
          <span className="font-semibold">
            {parallelTargets.length} agents in parallel
          </span>
        </p>
      ) : targetAgentName ? (
        <p className="truncate">
          <span className="font-semibold">{targetAgentName}</span>
        </p>
      ) : (
        <p className="italic">No agent selected</p>
      )}
      {!allowParallel && outputVariable && (
        <p className="mt-0.5 font-mono text-[10px]">
          → {outputVariable}
        </p>
      )}
    </BaseNode>
  );
}

export const CallAgentNode = memo(CallAgentNodeComponent);
