"use client";

import { memo } from "react";
import { type NodeProps } from "@xyflow/react";
import { Combine } from "lucide-react";
import { BaseNode } from "./base-node";

const STRATEGY_LABELS: Record<string, string> = {
  wait_all: "Wait All",
  wait_first: "Wait First",
  wait_n: "Wait N",
  custom: "Custom",
};

function AggregateNodeComponent({ data, selected }: NodeProps) {
  const strategy = (data.strategy as string) || "wait_all";
  const waitN = (data.waitN as number) ?? 1;

  return (
    <BaseNode
      icon={<Combine className="size-4" />}
      label={(data.label as string) || "Aggregate"}
      color="sky"
      selected={selected}
    >
      <p className="truncate">
        <span className="font-semibold">{STRATEGY_LABELS[strategy] ?? strategy}</span>
        {strategy === "wait_n" && (
          <span className="text-muted-foreground"> (N={waitN})</span>
        )}
      </p>
    </BaseNode>
  );
}

export const AggregateNode = memo(AggregateNodeComponent);
