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
  typescript: "bg-blue-900/60 text-blue-300",
  javascript: "bg-yellow-900/60 text-yellow-300",
  python: "bg-green-900/60 text-green-300",
};

const OP_BADGE_COLOR: Record<string, string> = {
  hover: "bg-sky-900/60 text-sky-300",
  definition: "bg-violet-900/60 text-violet-300",
  completion: "bg-orange-900/60 text-orange-300",
  diagnostics: "bg-red-900/60 text-red-300",
};

export function LspQueryNode({ data, selected }: LspQueryNodeProps) {
  const language = (data.language as string) || "typescript";
  const operation = (data.operation as string) || "hover";
  const label = (data.label as string) || "LSP Query";

  const langClass = LANG_BADGE_COLOR[language] ?? "bg-zinc-700 text-zinc-300";
  const opClass = OP_BADGE_COLOR[operation] ?? "bg-zinc-700 text-zinc-300";

  return (
    <div
      className={cn(
        "rounded-lg border bg-zinc-900 min-w-[180px] max-w-[240px] shadow-md",
        selected ? "border-cyan-500" : "border-zinc-700",
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-700 bg-cyan-950/40 rounded-t-lg">
        <FileSearch className="w-4 h-4 text-cyan-400 shrink-0" />
        <span className="text-xs font-semibold text-zinc-200 truncate">{label}</span>
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
          <p className="text-[10px] text-zinc-500 truncate">
            → <span className="text-zinc-400">{data.outputVariable}</span>
          </p>
        )}
      </div>

      <Handle type="target" position={Position.Left} className="!bg-cyan-500" />
      <Handle type="source" position={Position.Right} className="!bg-cyan-500" />
    </div>
  );
}
