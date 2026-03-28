"use client";

import { memo } from "react";
import { type NodeProps } from "@xyflow/react";
import { Route } from "lucide-react";
import { BaseNode } from "./base-node";

function TrajectoryEvaluatorNodeComponent({ data, selected }: NodeProps) {
  const idealSteps = (data.idealStepCount as number) ?? 0;

  return (
    <BaseNode
      icon={<Route className="size-4" />}
      label={(data.label as string) || "Trajectory Eval"}
      color="fuchsia"
      selected={selected}
    >
      <p className="truncate">
        {idealSteps > 0 ? (
          <>Ideal: <span className="font-semibold">{idealSteps} steps</span></>
        ) : (
          <span className="italic">No ideal count set</span>
        )}
      </p>
    </BaseNode>
  );
}

export const TrajectoryEvaluatorNode = memo(TrajectoryEvaluatorNodeComponent);
