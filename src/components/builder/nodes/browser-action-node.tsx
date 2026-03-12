"use client";

import { memo } from "react";
import { type NodeProps } from "@xyflow/react";
import { Monitor } from "lucide-react";
import { BaseNode } from "./base-node";

interface BrowserStep {
  action: string;
  url?: string;
}

function BrowserActionNodeComponent({ data, selected }: NodeProps) {
  const actions = (data.actions as BrowserStep[]) ?? [];

  return (
    <BaseNode
      icon={<Monitor className="size-4" />}
      label={(data.label as string) || "Browser Action"}
      color="indigo"
      selected={selected}
    >
      {actions.length > 0 ? (
        <div className="space-y-0.5">
          {actions.slice(0, 3).map((step, i) => (
            <p key={i} className="truncate">
              <span className="font-semibold capitalize">{step.action}</span>
              {step.url && <span className="ml-1 font-mono">{step.url}</span>}
            </p>
          ))}
          {actions.length > 3 && (
            <p className="text-muted-foreground">+{actions.length - 3} more</p>
          )}
        </div>
      ) : (
        <p className="italic">No actions configured</p>
      )}
    </BaseNode>
  );
}

export const BrowserActionNode = memo(BrowserActionNodeComponent);
