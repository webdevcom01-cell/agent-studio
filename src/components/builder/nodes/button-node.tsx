"use client";

import { memo } from "react";
import { type NodeProps } from "@xyflow/react";
import { MousePointerClick } from "lucide-react";
import { BaseNode } from "./base-node";

interface ButtonOption {
  id: string;
  label: string;
  value: string;
}

function ButtonNodeComponent({ data, selected }: NodeProps) {
  const buttons = (data.buttons as ButtonOption[]) ?? [];

  const outputHandles = [
    ...buttons.map((b) => ({ id: b.id, label: b.label })),
    { id: "else", label: "Else" },
  ];

  return (
    <BaseNode
      icon={<MousePointerClick className="size-4" />}
      label={(data.label as string) || "Button"}
      color="blue"
      selected={selected}
      outputHandles={outputHandles}
    >
      {buttons.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {buttons.map((b) => (
            <span
              key={b.id}
              className="rounded bg-blue-100 px-1.5 py-0.5 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
            >
              {b.label}
            </span>
          ))}
        </div>
      ) : (
        <p className="italic">No buttons set</p>
      )}
    </BaseNode>
  );
}

export const ButtonNode = memo(ButtonNodeComponent);
