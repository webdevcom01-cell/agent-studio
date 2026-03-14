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
  GlobeLock,
  Webhook,
  Monitor,
  Code,
  Tags,
  FileOutput,
  FileText,
  Plug,
  ArrowRightLeft,
  UserCheck,
  Repeat,
  GitFork,
  HardDriveUpload,
  HardDriveDownload,
  ClipboardCheck,
  Timer,
  Mail,
  Bell,
  Shuffle,
  Route,
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
    type: "loop",
    label: "Loop",
    description: "Repeat a subflow N times or until condition",
    icon: Repeat,
    color: "orange",
    category: "Flow Control",
    defaultData: {
      label: "Loop",
      mode: "count",
      maxIterations: 10,
      conditionVariable: "",
      conditionOperator: "equals",
      conditionValue: "",
      loopVariable: "loop_index",
    },
  },
  {
    type: "parallel",
    label: "Parallel",
    description: "Execute branches simultaneously",
    icon: GitFork,
    color: "teal",
    category: "Flow Control",
    defaultData: {
      label: "Parallel",
      branches: [],
      mergeStrategy: "all",
      timeoutSeconds: 30,
    },
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
    type: "web_fetch",
    label: "Web Fetch",
    description: "Fetch and extract content from a URL",
    icon: GlobeLock,
    color: "cyan",
    category: "Integrations",
    defaultData: {
      label: "Web Fetch",
      url: "",
      provider: "jina",
      outputVariable: "web_content",
      maxLength: 10000,
    },
  },
  {
    type: "browser_action",
    label: "Browser Action",
    description: "Automate browser: navigate, click, type, extract",
    icon: Monitor,
    color: "indigo",
    category: "Integrations",
    defaultData: {
      label: "Browser Action",
      mcpServerId: "",
      actions: [{ action: "navigate", url: "" }],
      outputVariable: "browser_result",
    },
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
  {
    type: "memory_write",
    label: "Memory Write",
    description: "Save data to agent memory",
    icon: HardDriveUpload,
    color: "emerald",
    category: "Memory",
    defaultData: {
      label: "Memory Write",
      key: "",
      value: "",
      category: "general",
      importance: 0.5,
      generateEmbedding: false,
    },
  },
  {
    type: "memory_read",
    label: "Memory Read",
    description: "Retrieve data from agent memory",
    icon: HardDriveDownload,
    color: "cyan",
    category: "Memory",
    defaultData: {
      label: "Memory Read",
      mode: "key",
      key: "",
      category: "",
      searchQuery: "",
      outputVariable: "memory_result",
      topK: 5,
    },
  },
  {
    type: "evaluator",
    label: "Evaluator",
    description: "AI-powered content evaluation with scoring",
    icon: ClipboardCheck,
    color: "violet",
    category: "AI",
    defaultData: {
      label: "Evaluator",
      inputVariable: "",
      outputVariable: "eval_result",
      model: "",
      criteria: [{ name: "Quality", description: "Overall quality of the content", weight: 1 }],
      passingScore: 7,
    },
  },
  {
    type: "schedule_trigger",
    label: "Schedule Trigger",
    description: "Start flow on a schedule or manually",
    icon: Timer,
    color: "rose",
    category: "Triggers",
    defaultData: {
      label: "Schedule Trigger",
      scheduleType: "manual",
      cronExpression: "",
      intervalMinutes: 60,
      timezone: "UTC",
      outputVariable: "trigger_info",
    },
  },
  {
    type: "email_send",
    label: "Email Send",
    description: "Send an email via webhook",
    icon: Mail,
    color: "sky",
    category: "Actions",
    defaultData: {
      label: "Email Send",
      to: "",
      subject: "",
      body: "",
      fromName: "Agent Studio",
      replyTo: "",
      webhookUrl: "",
      isHtml: false,
      outputVariable: "email_result",
    },
  },
  {
    type: "notification",
    label: "Notification",
    description: "Send a notification via channel",
    icon: Bell,
    color: "amber",
    category: "Actions",
    defaultData: {
      label: "Notification",
      channel: "log",
      title: "",
      message: "",
      level: "info",
      webhookUrl: "",
      outputVariable: "notification_result",
    },
  },
  {
    type: "format_transform",
    label: "Format Transform",
    description: "Transform data between formats",
    icon: Shuffle,
    color: "indigo",
    category: "Logic",
    defaultData: {
      label: "Format Transform",
      format: "template",
      inputVariable: "",
      inputValue: "",
      template: "",
      separator: ",",
      outputVariable: "transform_result",
    },
  },
  {
    type: "switch",
    label: "Switch",
    description: "Multi-way branching on variable value",
    icon: Route,
    color: "fuchsia",
    category: "Flow Control",
    defaultData: {
      label: "Switch",
      variable: "",
      operator: "equals",
      cases: [{ value: "", label: "" }],
      outputVariable: "switch_result",
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
  emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  cyan: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300",
  rose: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
  sky: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
  indigo: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
  fuchsia: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-300",
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
        <Button size="sm" data-testid="node-picker">
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
