"use client";

import { memo } from "react";
import { type NodeProps } from "@xyflow/react";
import { Repeat } from "lucide-react";
import { BaseNode } from "./base-node";

function LoopNodeComponent({ data, selected }: NodeProps) {
  const mode = (data.mode as string) ?? "count";
  const maxIterations = (data.maxIterations as number) ?? 10;
  const conditionVariable = data.conditionVariable as string | undefined;
  const conditionOperator = data.conditionOperator as string | undefined;
  const conditionValue = data.conditionValue as string | undefined;

  const outputHandles = [
    { id: "loop_body", label: "Loop Body" },
    { id: "done", label: "Done" },
  ];

  return (
    <BaseNode
      icon={<Repeat className="size-4" />}
      label={(data.label as string) || "Loop"}
      color="orange"
      selected={selected}
      outputHandles={outputHandles}
    >
      {mode === "count" && (
        <p>
          Repeat <code className="font-mono font-bold">{maxIterations}</code> times
        </p>
      )}
      {mode === "condition" && conditionVariable && (
        <p className="truncate">
          Until <code className="font-mono">{conditionVariable}</code>{" "}
          <span className="text-muted-foreground">{conditionOperator}</span>{" "}
          <code className="font-mono">{conditionValue}</code>
        </p>
      )}
      {mode === "while" && conditionVariable && (
        <p className="truncate">
          While <code className="font-mono">{conditionVariable}</code>{" "}
          <span className="text-muted-foreground">{conditionOperator}</span>{" "}
          <code className="font-mono">{conditionValue}</code>
        </p>
      )}
      {!conditionVariable && mode !== "count" && (
        <p className="italic">No condition set</p>
      )}
    </BaseNode>
  );
}

export const LoopNode = memo(LoopNodeComponent);
