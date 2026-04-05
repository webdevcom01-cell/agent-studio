"use client";

import { Handle, Position } from "@xyflow/react";
import { FileSearch } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FlowNode } from "@/types";

interface LspQueryNodeProps {
  data: FlowNode["data"];
  selected?: boolean;
}

const LANG_BADGE_COLOR: Record<string, string> = {
  typescript: "bg-muted/20 text-muted-foreground",
  javascript: "bg-muted/20 text-muted-foreground",
  python: "bg-muted/20 text-foreground/60",
};

const OP_BADGE_COLOR: Record<string, string> = {
  hover: "bg-muted/20 text-foreground/70",
  definition: "bg-muted/20 text-muted-foreground",
  completion: "bg-muted/20 text-muted-foreground",
  diagnostics: "bg-muted/10 text-destructive",
};

export function LspQueryNode({ data, selected }: LspQueryNodeProps) {
  const language = (data.language as string) || "typescript";
  const operation = (data.operation as string) || "hover";
  const label = (data.label as string) || "LSP Query";

  const langClass = LANG_BADGE_COLOR[language] ?? "bg-muted text-foreground/80";
  const opClass = OP_BADGE_COLOR[operation] ?? "bg-muted text-foreground/80";

  return (
    <div
      className={cn(
        "rounded-lg border bg-card min-w-[180px] max-w-[240px] shadow-md",
        selected ? "border-primary" : "border-border",
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/20 rounded-t-lg">
        <FileSearch className="w-4 h-4 text-muted-foreground shrink-0" />
        <span className="text-xs font-semibold text-foreground/90 truncate">{label}</span>
      </div>

      {/* Body */}
      <div className="px-3 py-2 space-y-1.5">
        <div className="flex gap-1.5 flex-wrap">
          <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded", langClass)}>
            {language}
          </span>
          <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded", opClass)}>
            {operation}
          </span>
        </div>
        {typeof data.outputVariable === "string" && data.outputVariable && (
          <p className="text-[10px] text-muted-foreground/60 truncate">
            → <span className="text-muted-foreground">{data.outputVariable}</span>
          </p>
        )}
      </div>

      <Handle type="target" position={Position.Left} className="!bg-foreground/60" />
      <Handle type="source" position={Position.Right} className="!bg-foreground/60" />
    </div>
  );
}
