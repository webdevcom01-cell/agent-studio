"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";

export function NotificationNode({ data, selected }: NodeProps) {
  const channel = (data.channel as string) || "log";
  const level = (data.level as string) || "info";

  const channelLabels: Record<string, string> = {
    log: "Log",
    in_app: "In-App",
    webhook: "Webhook",
  };

  const levelColors: Record<string, string> = {
    info: "text-muted-foreground",
    success: "text-foreground/60",
    warning: "text-muted-foreground",
    error: "text-destructive",
  };

  return (
    <div
      className={cn(
        "min-w-[180px] rounded-lg border bg-card p-3 shadow-sm transition-shadow",
        selected && "ring-2 ring-primary"
      )}
    >
      <Handle type="target" position={Position.Top} />

      <div className="flex items-center gap-2 mb-2">
        <div className="flex size-7 items-center justify-center rounded-md bg-muted/20 text-foreground dark:bg-muted/20 dark:text-muted-foreground">
          <Bell className="size-4" />
        </div>
        <span className="text-sm font-medium">{(data.label as string) || "Notification"}</span>
      </div>

      <div className="space-y-1 text-xs text-muted-foreground">
        <p>
          Channel: <span className="text-foreground">{channelLabels[channel] ?? channel}</span>
        </p>
        <p>
          Level: <span className={levelColors[level] ?? "text-foreground"}>{level}</span>
        </p>
      </div>

      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
