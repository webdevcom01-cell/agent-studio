"use client";

import { memo } from "react";
import { type NodeProps } from "@xyflow/react";
import { DollarSign } from "lucide-react";
import { BaseNode } from "./base-node";

const MODE_LABELS: Record<string, string> = {
  monitor: "Monitor",
  budget: "Budget",
  alert: "Alert",
};

function CostMonitorNodeComponent({ data, selected }: NodeProps) {
  const mode = (data.mode as string) || "monitor";
  const budgetUsd = (data.budgetUsd as number) ?? 1.0;

  return (
    <BaseNode
      icon={<DollarSign className="size-4" />}
      label={(data.label as string) || "Cost Monitor"}
      color="emerald"
      selected={selected}
    >
      <p className="truncate">
        <span className="font-semibold">{MODE_LABELS[mode] ?? mode}</span>
        {mode !== "monitor" && (
          <span className="text-muted-foreground"> ${budgetUsd.toFixed(2)}</span>
        )}
      </p>
    </BaseNode>
  );
}

export const CostMonitorNode = memo(CostMonitorNodeComponent);
