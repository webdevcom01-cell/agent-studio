"use client";

import { memo } from "react";
import { type NodeProps } from "@xyflow/react";
import { AppWindow } from "lucide-react";
import { BaseNode } from "./base-node";

interface DesktopAction {
  command: string;
  appId?: string;
}

function DesktopAppNodeComponent({ data, selected }: NodeProps) {
  const appId = (data.appId as string) || "";
  const actions = (data.actions as DesktopAction[]) ?? [];

  return (
    <BaseNode
      icon={<AppWindow className="size-4" />}
      label={(data.label as string) || "Desktop App"}
      color="emerald"
      selected={selected}
    >
      {appId && (
        <p className="font-semibold capitalize">{appId.replace(/-/g, " ")}</p>
      )}
      {actions.length > 0 ? (
        <div className="space-y-0.5">
          {actions.slice(0, 3).map((action, i) => (
            <p key={i} className="truncate">
              <span className="font-mono">{action.command}</span>
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

export const DesktopAppNode = memo(DesktopAppNodeComponent);
