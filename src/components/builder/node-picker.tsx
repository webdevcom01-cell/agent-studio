"use client";

import { useState } from "react";
import {
  MessageSquare,
  Sparkles,
  GitBranch,
  TextCursorInput,
  CircleStop,
  Database,
  CornerDownRight,
  Variable,
  Clock,
  MousePointerClick,
  Globe,
  Webhook,
  Code,
  Tags,
  FileOutput,
  FileText,
  Plug,
  ArrowRightLeft,
  UserCheck,
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
    type: "button",
    label: "Button",
    description: "Show buttons for user selection",
    icon: MousePointerClick,
    color: "blue",
    category: "Content",
    defaultData: { label: "Button", message: "", buttons: [], variableName: "" },
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
    type: "ai_classify",
    label: "AI Classify",
    description: "Classify text into categories",
    icon: Tags,
    color: "violet",
    category: "AI",
    defaultData: { label: "AI Classify", categories: [], inputVariable: "", model: "deepseek-chat" },
  },
  {
    type: "ai_extract",
    label: "AI Extract",
    description: "Extract structured data from conversation",
    icon: FileOutput,
    color: "violet",
    category: "AI",
    defaultData: { label: "AI Extract", fields: [], model: "deepseek-chat" },
  },
  {
    type: "ai_summarize",
    label: "AI Summarize",
    description: "Summarize the conversation",
    icon: FileText,
    color: "violet",
    category: "AI",
    defaultData: { label: "AI Summarize", outputVariable: "summary", maxLength: 200, model: "deepseek-chat" },
  },
  {
    type: "kb_search",
    label: "KB Search",
    description: "Search knowledge base",
    icon: Database,
    color: "teal",
    category: "AI",
    defaultData: { label: "KB Search", queryVariable: "last_message", topK: 7 },
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
    type: "set_variable",
    label: "Set Variable",
    description: "Set a variable value",
    icon: Variable,
    color: "green",
    category: "Logic",
    defaultData: { label: "Set Variable", variableName: "", value: "" },
  },
  {
    type: "goto",
    label: "Goto",
    description: "Jump to another node (for loops)",
    icon: CornerDownRight,
    color: "amber",
    category: "Flow Control",
    defaultData: { label: "Goto", targetNodeId: "" },
  },
  {
    type: "wait",
    label: "Wait",
    description: "Pause flow for a duration",
    icon: Clock,
    color: "amber",
    category: "Flow Control",
    defaultData: { label: "Wait", duration: 1 },
  },
  {
    type: "end",
    label: "End",
    description: "End the conversation",
    icon: CircleStop,
    color: "red",
    category: "Flow Control",
    defaultData: { label: "End", endMessage: "" },
  },
  {
    type: "api_call",
    label: "API Call",
    description: "Make an HTTP request",
    icon: Globe,
    color: "orange",
    category: "Integrations",
    defaultData: { label: "API Call", method: "GET", url: "", headers: {}, body: "", outputVariable: "" },
  },
  {
    type: "webhook",
    label: "Webhook",
    description: "Send data to a webhook URL",
    icon: Webhook,
    color: "orange",
    category: "Integrations",
    defaultData: { label: "Webhook", method: "POST", url: "", headers: {}, body: "", outputVariable: "" },
  },
  {
    type: "function",
    label: "Function",
    description: "Execute custom JavaScript code",
    icon: Code,
    color: "orange",
    category: "Integrations",
    defaultData: { label: "Function", code: "", outputVariable: "" },
  },
  {
    type: "mcp_tool",
    label: "MCP Tool",
    description: "Call a tool from an MCP server",
    icon: Plug,
    color: "teal",
    category: "Integrations",
    defaultData: { label: "MCP Tool", mcpServerId: "", toolName: "", inputMapping: {}, outputVariable: "" },
  },
  {
    type: "call_agent",
    label: "Call Agent",
    description: "Call another agent as a sub-agent",
    icon: ArrowRightLeft,
    color: "orange",
    category: "Integrations",
    defaultData: {
      label: "Call Agent",
      targetAgentId: "",
      targetAgentName: "",
      inputMapping: [],
      outputVariable: "agent_result",
      timeoutSeconds: 30,
      onError: "continue",
    },
  },
  {
    type: "human_approval",
    label: "Human Approval",
    description: "Pause flow and wait for human review",
    icon: UserCheck,
    color: "amber",
    category: "Control",
    defaultData: {
      label: "Human Approval",
      prompt: "",
      inputVariable: "",
      outputVariable: "approval_result",
      timeoutMinutes: 60,
      onTimeout: "continue",
      defaultValue: "",
    },
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
  orange: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
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
