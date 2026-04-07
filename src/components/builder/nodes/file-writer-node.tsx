"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { FileCode2 } from "lucide-react";
import { cn } from "@/lib/utils";

function FileWriterNodeComponent({ data, selected }: NodeProps) {
  const inputVar = (data.inputVariable as string) || "codeOutput";
  const targetDir = (data.targetDir as string) || "";

  return (
    <div
      className={cn(
        "min-w-[180px] rounded-lg border bg-card p-3 shadow-sm transition-shadow",
        selected && "ring-2 ring-primary",
      )}
    >
      <Handle type="target" position={Position.Top} />

      <div className="flex items-center gap-2 mb-2">
        <div className="flex size-7 items-center justify-center rounded-md bg-muted/20 text-muted-foreground">
          <FileCode2 className="size-4" />
        </div>
        <span className="text-sm font-medium">
          {String(data.label || "File Writer")}
        </span>
      </div>

      <div className="space-y-1 text-xs text-muted-foreground">
        <p>
          Input:{" "}
          <span className="font-mono text-foreground/60">{"{{" + inputVar + "}}"}</span>
        </p>
        {targetDir && (
          <p className="truncate" title={targetDir}>
            Dir:{" "}
            <span className="font-mono text-foreground/60 text-[10px]">{targetDir}</span>
          </p>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

export const FileWriterNode = memo(FileWriterNodeComponent);
