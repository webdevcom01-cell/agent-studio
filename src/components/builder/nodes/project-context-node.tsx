"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { BookMarked } from "lucide-react";
import { cn } from "@/lib/utils";

function ProjectContextNodeComponent({ data, selected }: NodeProps) {
  const files = Array.isArray(data.contextFiles) ? (data.contextFiles as string[]) : [];
  const examples = Array.isArray(data.exampleFiles) ? (data.exampleFiles as string[]) : [];
  const totalFiles = files.length + examples.length;

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
          <BookMarked className="size-4" />
        </div>
        <span className="text-sm font-medium">
          {String(data.label || "Project Context")}
        </span>
      </div>

      <div className="space-y-1 text-xs text-muted-foreground">
        {totalFiles > 0 ? (
          <>
            <p>
              Files:{" "}
              <span className="text-foreground">{files.length}</span>
              {examples.length > 0 && (
                <span className="text-foreground/60"> + {examples.length} examples</span>
              )}
            </p>
            <div className="flex flex-wrap gap-1 mt-1">
              {files.slice(0, 2).map((f, i) => (
                <span
                  key={i}
                  className="rounded bg-muted/20 px-1 py-0.5 text-[10px] text-foreground/60 font-mono"
                >
                  {f.split("/").pop()}
                </span>
              ))}
              {totalFiles > 2 && (
                <span className="text-[10px] text-muted-foreground">
                  +{totalFiles - 2} more
                </span>
              )}
            </div>
          </>
        ) : (
          <p className="text-muted-foreground/50">No files configured</p>
        )}
        {data.outputVariable ? (
          <p className="text-[10px]">
            → <span className="font-mono text-foreground/60">{String(data.outputVariable)}</span>
          </p>
        ) : null}
      </div>

      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

export const ProjectContextNode = memo(ProjectContextNodeComponent);
