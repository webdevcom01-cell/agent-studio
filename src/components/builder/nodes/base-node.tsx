"use client";

import type { ReactNode } from "react";
import { Handle, Position } from "@xyflow/react";
import { cn } from "@/lib/utils";

interface BaseNodeProps {
  icon: ReactNode;
  label: string;
  color: string;
  selected?: boolean;
  children?: ReactNode;
  hasInput?: boolean;
  hasOutput?: boolean;
  outputHandles?: { id: string; label: string }[];
}

const MONOCHROME_NODE_COLORS = {
  bg: "bg-muted/30",
  border: "border-border",
  text: "text-muted-foreground",
};

const colorMap: Record<string, typeof MONOCHROME_NODE_COLORS> = {
  blue: MONOCHROME_NODE_COLORS,
  purple: MONOCHROME_NODE_COLORS,
  green: MONOCHROME_NODE_COLORS,
  amber: MONOCHROME_NODE_COLORS,
  teal: MONOCHROME_NODE_COLORS,
  red: MONOCHROME_NODE_COLORS,
  violet: MONOCHROME_NODE_COLORS,
  orange: MONOCHROME_NODE_COLORS,
  cyan: MONOCHROME_NODE_COLORS,
  indigo: MONOCHROME_NODE_COLORS,
  emerald: MONOCHROME_NODE_COLORS,
};

export function BaseNode({
  icon,
  label,
  color,
  selected,
  children,
  hasInput = true,
  hasOutput = true,
  outputHandles,
}: BaseNodeProps) {
  const colors = colorMap[color] ?? MONOCHROME_NODE_COLORS;

  return (
    <div
      className={cn(
        "min-w-[200px] max-w-[280px] rounded-lg border bg-background shadow-sm transition-shadow",
        colors.border,
        selected && "ring-2 ring-primary ring-offset-2"
      )}
    >
      {hasInput && (
        <Handle
          type="target"
          position={Position.Top}
          className="!border-border !bg-background"
        />
      )}

      <div className={cn("flex items-center gap-2 rounded-t-lg px-3 py-2", colors.bg)}>
        <span className={cn("flex size-5 items-center justify-center", colors.text)}>
          {icon}
        </span>
        <span className={cn("text-sm font-medium", colors.text)}>{label}</span>
      </div>

      {children && (
        <div className="px-3 py-2 text-xs text-muted-foreground">{children}</div>
      )}

      {outputHandles ? (
        outputHandles.map((h, i) => (
          <Handle
            key={h.id}
            type="source"
            position={Position.Bottom}
            id={h.id}
            className="!border-border !bg-background"
            style={{
              left: `${((i + 1) / (outputHandles.length + 1)) * 100}%`,
            }}
          />
        ))
      ) : hasOutput ? (
        <Handle
          type="source"
          position={Position.Bottom}
          className="!border-border !bg-background"
        />
      ) : null}
    </div>
  );
}
