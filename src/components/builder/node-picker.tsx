"use client";

import { useState } from "react";
import {
  MessageSquare,
  Sparkles,
  GitBranch,
  TextCursorInput,
  CircleStop,
  Database,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

interface NodeDefinition {
  type: string;
  label: string;
  description: string;
  icon: LucideIcon;
  color: string;
  category: string;
  defaultData: Record<string, unknown>;
}

const NODE_DEFINITIONS: NodeDefinition[] = [
  {
    type: "message",
    label: "Message",
    description: "Send a text message",
    icon: MessageSquare,
    color: "blue",
    category: "Content",
    defaultData: { label: "Message", message: "" },
  },
  {
    type: "ai_response",
    label: "AI Response",
    description: "Generate AI response",
    icon: Sparkles,
    color: "violet",
    category: "AI",
    defaultData: { label: "AI Response", prompt: "", model: "deepseek-chat" },
  },
  {
    type: "capture",
    label: "Capture Input",
    description: "Capture user input into a variable",
    icon: TextCursorInput,
    color: "green",
    category: "Logic",
    defaultData: { label: "Capture", variableName: "", prompt: "" },
  },
  {
    type: "condition",
    label: "Condition",
    description: "Branch based on conditions",
    icon: GitBranch,
    color: "amber",
    category: "Logic",
    defaultData: { label: "Condition", branches: [] },
  },
  {
    type: "kb_search",
    label: "KB Search",
    description: "Search knowledge base",
    icon: Database,
    color: "teal",
    category: "AI",
    defaultData: { label: "KB Search", queryVariable: "last_message", topK: 5 },
  },
  {
    type: "end",
    label: "End",
    description: "End the conversation",
    icon: CircleStop,
    color: "red",
    category: "Flow",
    defaultData: { label: "End", endMessage: "" },
  },
];

const colorMap: Record<string, string> = {
  blue: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  purple: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  green: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  teal: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",
  red: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  violet: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
};

interface NodePickerProps {
  onAddNode: (type: string, data: Record<string, unknown>) => void;
}

export function NodePicker({ onAddNode }: NodePickerProps) {
  const [open, setOpen] = useState(false);

  function handleAdd(node: NodeDefinition) {
    onAddNode(node.type, { ...node.defaultData });
    setOpen(false);
  }

  const categories = [...new Set(NODE_DEFINITIONS.map((n) => n.category))];

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1.5 size-4" />
          Add Node
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-72" align="start">
        {categories.map((category, ci) => {
          const nodes = NODE_DEFINITIONS.filter((n) => n.category === category);
          return (
            <div key={category}>
              {ci > 0 && <DropdownMenuSeparator />}
              <DropdownMenuLabel className="text-xs uppercase tracking-wider">
                {category}
              </DropdownMenuLabel>
              {nodes.map((node) => {
                const Icon = node.icon;
                return (
                  <button
                    key={node.type}
                    className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-accent transition-colors"
                    onClick={() => handleAdd(node)}
                  >
                    <div
                      className={cn(
                        "flex size-8 items-center justify-center rounded-md",
                        colorMap[node.color]
                      )}
                    >
                      <Icon className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{node.label}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {node.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
