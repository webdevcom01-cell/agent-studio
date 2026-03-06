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

const colorMap: Record<string, { bg: string; border: string; text: string }> = {
  blue: {
    bg: "bg-blue-50 dark:bg-blue-950/30",
    border: "border-blue-200 dark:border-blue-800",
    text: "text-blue-700 dark:text-blue-300",
  },
  purple: {
    bg: "bg-purple-50 dark:bg-purple-950/30",
    border: "border-purple-200 dark:border-purple-800",
    text: "text-purple-700 dark:text-purple-300",
  },
  green: {
    bg: "bg-green-50 dark:bg-green-950/30",
    border: "border-green-200 dark:border-green-800",
    text: "text-green-700 dark:text-green-300",
  },
  amber: {
    bg: "bg-amber-50 dark:bg-amber-950/30",
    border: "border-amber-200 dark:border-amber-800",
    text: "text-amber-700 dark:text-amber-300",
  },
  teal: {
    bg: "bg-teal-50 dark:bg-teal-950/30",
    border: "border-teal-200 dark:border-teal-800",
    text: "text-teal-700 dark:text-teal-300",
  },
  red: {
    bg: "bg-red-50 dark:bg-red-950/30",
    border: "border-red-200 dark:border-red-800",
    text: "text-red-700 dark:text-red-300",
  },
  violet: {
    bg: "bg-violet-50 dark:bg-violet-950/30",
    border: "border-violet-200 dark:border-violet-800",
    text: "text-violet-700 dark:text-violet-300",
  },
  orange: {
    bg: "bg-orange-50 dark:bg-orange-950/30",
    border: "border-orange-200 dark:border-orange-800",
    text: "text-orange-700 dark:text-orange-300",
  },
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
  const colors = colorMap[color] ?? colorMap.blue;

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
