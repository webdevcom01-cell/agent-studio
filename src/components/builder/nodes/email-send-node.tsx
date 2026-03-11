"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Mail } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmailSendNode({ data, selected }: NodeProps) {
  const to = (data.to as string) || "—";
  const subject = (data.subject as string) || "";

  return (
    <div
      className={cn(
        "min-w-[180px] rounded-lg border bg-card p-3 shadow-sm transition-shadow",
        selected && "ring-2 ring-primary"
      )}
    >
      <Handle type="target" position={Position.Top} />

      <div className="flex items-center gap-2 mb-2">
        <div className="flex size-7 items-center justify-center rounded-md bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300">
          <Mail className="size-4" />
        </div>
        <span className="text-sm font-medium">{(data.label as string) || "Email Send"}</span>
      </div>

      <div className="space-y-1 text-xs text-muted-foreground">
        <p className="truncate">
          To: <span className="font-mono text-foreground">{to}</span>
        </p>
        {subject && (
          <p className="truncate">
            Subj: <span className="text-foreground">{subject}</span>
          </p>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
