"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Shuffle } from "lucide-react";
import { cn } from "@/lib/utils";

const FORMAT_LABELS: Record<string, string> = {
  json_to_text: "JSON → Text",
  text_to_json: "Text → JSON",
  csv_to_json: "CSV → JSON",
  json_to_csv: "JSON → CSV",
  template: "Template",
  uppercase: "Uppercase",
  lowercase: "Lowercase",
  trim: "Trim",
  split: "Split",
  join: "Join",
};

export function FormatTransformNode({ data, selected }: NodeProps) {
  const format = String(data.format || "template");

  return (
    <div
      className={cn(
        "min-w-[180px] rounded-lg border bg-card p-3 shadow-sm transition-shadow",
        selected && "ring-2 ring-primary"
      )}
    >
      <Handle type="target" position={Position.Top} />

      <div className="flex items-center gap-2 mb-2">
        <div className="flex size-7 items-center justify-center rounded-md bg-muted/20 text-muted-foreground">
          <Shuffle className="size-4" />
        </div>
        <span className="text-sm font-medium">{String(data.label || "Format Transform")}</span>
      </div>

      <div className="space-y-1 text-xs text-muted-foreground">
        <p>
          Format: <span className="text-foreground">{FORMAT_LABELS[format] ?? format}</span>
        </p>
      </div>

      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
