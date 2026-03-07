"use client";

import { memo } from "react";
import { type NodeProps } from "@xyflow/react";
import { Tags } from "lucide-react";
import { BaseNode } from "./base-node";

function AIClassifyNodeComponent({ data, selected }: NodeProps) {
  const categories = (data.categories as string[]) ?? [];

  const outputHandles = [
    ...categories.map((c) => ({ id: c, label: c })),
    { id: "else", label: "Else" },
  ];

  return (
    <BaseNode
      icon={<Tags className="size-4" />}
      label={(data.label as string) || "AI Classify"}
      color="violet"
      selected={selected}
      outputHandles={outputHandles}
    >
      {categories.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {categories.map((c) => (
            <span
              key={c}
              className="rounded bg-violet-100 px-1.5 py-0.5 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300"
            >
              {c}
            </span>
          ))}
        </div>
      ) : (
        <p className="italic">No categories set</p>
      )}
    </BaseNode>
  );
}

export const AIClassifyNode = memo(AIClassifyNodeComponent);
