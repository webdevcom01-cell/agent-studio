"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
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
  Code2,
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
  AppWindow,
  Lightbulb,
  Plus,
  Search,
  Zap,
  Brain,
  BookOpen,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// ---------------------------------------------------------------------------
// Node definition types
// ---------------------------------------------------------------------------

interface NodeDefinition {
  type: string;
  label: string;
  description: string;
  usageExample: string;
  icon: LucideIcon;
  color: string;
  category: CategoryId;
  defaultData: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Category definitions — 7 categories, ordered by typical flow building order
// ---------------------------------------------------------------------------

type CategoryId =
  | "triggers"
  | "ai"
  | "knowledge"
  | "logic"
  | "integrations"
  | "messaging"
  | "utilities";

interface CategoryDefinition {
  id: CategoryId;
  label: string;
  icon: LucideIcon;
  color: string;
}

const CATEGORIES: CategoryDefinition[] = [
  { id: "triggers", label: "Triggers", icon: Zap, color: "text-orange-400" },
  { id: "ai", label: "AI", icon: Brain, color: "text-violet-400" },
  {
    id: "knowledge",
    label: "Knowledge & Memory",
    icon: BookOpen,
    color: "text-teal-400",
  },
  { id: "logic", label: "Logic", icon: GitBranch, color: "text-amber-400" },
  {
    id: "integrations",
    label: "Integrations",
    icon: Plug,
    color: "text-blue-400",
  },
  {
    id: "messaging",
    label: "Messaging",
    icon: MessageSquare,
    color: "text-green-400",
  },
  {
    id: "utilities",
    label: "Utilities",
    icon: Settings,
    color: "text-zinc-400",
  },
];

// ---------------------------------------------------------------------------
// Node color map
// ---------------------------------------------------------------------------

const colorMap: Record<string, string> = {
  blue: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  purple:
    "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  green:
    "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  amber:
    "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  teal: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",
  red: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  violet:
    "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  orange:
    "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  emerald:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  cyan: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300",
  rose: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
  sky: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
  indigo:
    "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
  fuchsia:
    "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-300",
  zinc: "bg-zinc-100 text-zinc-700 dark:bg-zinc-900/30 dark:text-zinc-300",
};

// ---------------------------------------------------------------------------
// 34 Node definitions — reorganized into 7 categories
// ---------------------------------------------------------------------------

const NODE_DEFINITIONS: NodeDefinition[] = [
  // ── Triggers ──────────────────────────────────────────────────────────
  {
    type: "schedule_trigger",
    label: "Schedule Trigger",
    description: "Start flow on a schedule or manually",
    usageExample:
      "Run a daily report flow at 8am, or trigger a cleanup task every hour",
    icon: Timer,
    color: "rose",
    category: "triggers",
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
    type: "webhook_trigger",
    label: "Webhook Trigger",
    description: "Start flow from an external HTTP webhook",
    usageExample:
      "Receive GitHub push events, Stripe payment webhooks, or Slack commands",
    icon: Webhook,
    color: "violet",
    category: "triggers",
    defaultData: {
      label: "Webhook Trigger",
      outputVariable: "webhook_payload",
      eventTypeVariable: "",
    },
  },

  // ── AI ────────────────────────────────────────────────────────────────
  {
    type: "ai_response",
    label: "AI Response",
    description: "Generate AI response with streaming",
    usageExample:
      "Use after kb_search to generate a grounded answer with retrieved context",
    icon: Sparkles,
    color: "violet",
    category: "ai",
    defaultData: { label: "AI Response", prompt: "", model: "deepseek-chat" },
  },
  {
    type: "ai_classify",
    label: "AI Classify",
    description: "Classify text into categories",
    usageExample:
      "Route support tickets to the right team based on intent: billing, technical, general",
    icon: Tags,
    color: "violet",
    category: "ai",
    defaultData: {
      label: "AI Classify",
      categories: [],
      inputVariable: "",
      model: "deepseek-chat",
    },
  },
  {
    type: "ai_extract",
    label: "AI Extract",
    description: "Extract structured data from text",
    usageExample:
      "Pull name, email, and company from a free-form message into structured fields",
    icon: FileOutput,
    color: "violet",
    category: "ai",
    defaultData: {
      label: "AI Extract",
      fields: [],
      model: "deepseek-chat",
    },
  },
  {
    type: "ai_summarize",
    label: "AI Summarize",
    description: "Summarize the conversation",
    usageExample:
      "Condense a long support thread into a 2-sentence summary for handoff",
    icon: FileText,
    color: "violet",
    category: "ai",
    defaultData: {
      label: "AI Summarize",
      outputVariable: "summary",
      maxLength: 200,
      model: "deepseek-chat",
    },
  },
  {
    type: "evaluator",
    label: "Evaluator",
    description: "AI-powered content evaluation with scoring",
    usageExample:
      "Score generated content on quality, relevance, and tone before sending to user",
    icon: ClipboardCheck,
    color: "violet",
    category: "ai",
    defaultData: {
      label: "Evaluator",
      inputVariable: "",
      outputVariable: "eval_result",
      model: "",
      criteria: [
        {
          name: "Quality",
          description: "Overall quality of the content",
          weight: 1,
        },
      ],
      passingScore: 7,
    },
  },

  // ── Knowledge & Memory ────────────────────────────────────────────────
  {
    type: "kb_search",
    label: "KB Search",
    description: "Search knowledge base with hybrid retrieval",
    usageExample:
      "Find relevant documentation chunks before generating an AI response",
    icon: Database,
    color: "teal",
    category: "knowledge",
    defaultData: {
      label: "KB Search",
      queryVariable: "last_message",
      topK: 7,
    },
  },
  {
    type: "memory_write",
    label: "Memory Write",
    description: "Save data to agent persistent memory",
    usageExample:
      "Remember user preferences, past interactions, or extracted facts across conversations",
    icon: HardDriveUpload,
    color: "emerald",
    category: "knowledge",
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
    usageExample:
      "Look up a user's name or past preferences to personalize responses",
    icon: HardDriveDownload,
    color: "cyan",
    category: "knowledge",
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

  // ── Logic ─────────────────────────────────────────────────────────────
  {
    type: "condition",
    label: "Condition",
    description: "Branch based on conditions",
    usageExample:
      "Route conversation based on user intent, variable value, or API response status",
    icon: GitBranch,
    color: "amber",
    category: "logic",
    defaultData: { label: "Condition", branches: [] },
  },
  {
    type: "switch",
    label: "Switch",
    description: "Multi-way branching on variable value",
    usageExample:
      "Handle multiple language selections: English, Spanish, French, each with different paths",
    icon: Route,
    color: "fuchsia",
    category: "logic",
    defaultData: {
      label: "Switch",
      variable: "",
      operator: "equals",
      cases: [{ value: "", label: "" }],
      outputVariable: "switch_result",
    },
  },
  {
    type: "loop",
    label: "Loop",
    description: "Repeat a subflow N times or until condition",
    usageExample:
      "Retry an API call up to 3 times on failure, or iterate over a list of items",
    icon: Repeat,
    color: "orange",
    category: "logic",
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
    usageExample:
      "Run code review, security check, and doc generation at the same time",
    icon: GitFork,
    color: "teal",
    category: "logic",
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
    description: "Jump to another node",
    usageExample:
      "Return to a previous step to create a conversation loop or retry flow",
    icon: CornerDownRight,
    color: "amber",
    category: "logic",
    defaultData: { label: "Goto", targetNodeId: "" },
  },
  {
    type: "set_variable",
    label: "Set Variable",
    description: "Set a variable value",
    usageExample:
      "Store an intermediate calculation, counter, or flag for later use in the flow",
    icon: Variable,
    color: "green",
    category: "logic",
    defaultData: { label: "Set Variable", variableName: "", value: "" },
  },
  {
    type: "format_transform",
    label: "Format Transform",
    description: "Transform data between formats",
    usageExample:
      "Convert JSON to CSV, apply a template, or reshape data for the next node",
    icon: Shuffle,
    color: "indigo",
    category: "logic",
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
    type: "function",
    label: "Function",
    description: "Execute custom JavaScript code",
    usageExample:
      "Parse a date, calculate a score, or run custom business logic in a sandboxed environment",
    icon: Code,
    color: "orange",
    category: "logic",
    defaultData: { label: "Function", code: "", outputVariable: "" },
  },
  {
    type: "python_code",
    label: "Python Code",
    description: "Execute Python code with numpy, pandas, and matplotlib",
    usageExample:
      "Run data analysis, generate charts, or process flow variables with real Python",
    icon: Code2,
    color: "yellow",
    category: "logic",
    defaultData: { label: "Python Code", code: "", outputVariable: "" },
  },

  // ── Integrations ──────────────────────────────────────────────────────
  {
    type: "mcp_tool",
    label: "MCP Tool",
    description: "Call a tool from an MCP server",
    usageExample:
      "Call Tavily search, GitHub API, or any connected MCP server tool",
    icon: Plug,
    color: "teal",
    category: "integrations",
    defaultData: {
      label: "MCP Tool",
      mcpServerId: "",
      toolName: "",
      inputMapping: {},
      outputVariable: "",
    },
  },
  {
    type: "api_call",
    label: "API Call",
    description: "Make an HTTP request",
    usageExample:
      "Fetch data from a REST API, send a POST request, or check an external service status",
    icon: Globe,
    color: "orange",
    category: "integrations",
    defaultData: {
      label: "API Call",
      method: "GET",
      url: "",
      headers: {},
      body: "",
      outputVariable: "",
    },
  },
  {
    type: "web_fetch",
    label: "Web Fetch",
    description: "Fetch and extract content from a URL",
    usageExample:
      "Scrape a webpage, extract article text, or pull data from a public URL",
    icon: GlobeLock,
    color: "cyan",
    category: "integrations",
    defaultData: {
      label: "Web Fetch",
      url: "",
      provider: "jina",
      outputVariable: "web_content",
      maxLength: 10000,
    },
  },
  {
    type: "webhook",
    label: "Webhook",
    description: "Send data to a webhook URL",
    usageExample:
      "Push results to Slack, Zapier, Make, or any webhook-compatible service",
    icon: Webhook,
    color: "orange",
    category: "integrations",
    defaultData: {
      label: "Webhook",
      method: "POST",
      url: "",
      headers: {},
      body: "",
      outputVariable: "",
    },
  },
  {
    type: "browser_action",
    label: "Browser Action",
    description: "Automate browser: navigate, click, type, extract",
    usageExample:
      "Navigate to a page, fill out a form, click a button, or extract page content",
    icon: Monitor,
    color: "indigo",
    category: "integrations",
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
    usageExample:
      "Delegate a specialized task to a Security Reviewer or Code Analyst agent",
    icon: ArrowRightLeft,
    color: "orange",
    category: "integrations",
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
    type: "desktop_app",
    label: "Desktop App",
    description: "Control desktop apps via CLI bridge",
    usageExample:
      "Interact with local desktop applications through a CLI MCP bridge",
    icon: AppWindow,
    color: "emerald",
    category: "integrations",
    defaultData: {
      label: "Desktop App",
      mcpServerId: "",
      appId: "",
      actions: [],
      outputVariable: "desktop_result",
      sessionMode: "new",
    },
  },

  // ── Messaging ─────────────────────────────────────────────────────────
  {
    type: "message",
    label: "Message",
    description: "Send a text message to the user",
    usageExample:
      "Display a greeting, instruction, or formatted response to the user",
    icon: MessageSquare,
    color: "blue",
    category: "messaging",
    defaultData: { label: "Message", message: "" },
  },
  {
    type: "button",
    label: "Button",
    description: "Show buttons for user selection",
    usageExample:
      "Present options like 'Yes / No' or a menu of choices for the user to click",
    icon: MousePointerClick,
    color: "blue",
    category: "messaging",
    defaultData: {
      label: "Button",
      message: "",
      buttons: [],
      variableName: "",
    },
  },
  {
    type: "capture",
    label: "Capture Input",
    description: "Capture user input into a variable",
    usageExample:
      "Ask for the user's name, email, or any free-text input and save it to a variable",
    icon: TextCursorInput,
    color: "green",
    category: "messaging",
    defaultData: { label: "Capture", variableName: "", prompt: "" },
  },
  {
    type: "email_send",
    label: "Email Send",
    description: "Send an email via webhook",
    usageExample:
      "Send a confirmation email, report summary, or notification to a recipient",
    icon: Mail,
    color: "sky",
    category: "messaging",
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
    usageExample:
      "Log an event, send an in-app alert, or push to an external webhook channel",
    icon: Bell,
    color: "amber",
    category: "messaging",
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
    type: "human_approval",
    label: "Human Approval",
    description: "Pause flow and wait for human review",
    usageExample:
      "Require manager sign-off before sending an email or executing a critical action",
    icon: UserCheck,
    color: "amber",
    category: "messaging",
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

  // ── Utilities ─────────────────────────────────────────────────────────
  {
    type: "wait",
    label: "Wait",
    description: "Pause flow for a duration",
    usageExample:
      "Add a delay between steps, e.g. wait 5 seconds before retrying an API call",
    icon: Clock,
    color: "amber",
    category: "utilities",
    defaultData: { label: "Wait", duration: 1 },
  },
  {
    type: "end",
    label: "End",
    description: "End the conversation",
    usageExample:
      "Terminate the flow with an optional goodbye message or status summary",
    icon: CircleStop,
    color: "red",
    category: "utilities",
    defaultData: { label: "End", endMessage: "" },
  },
  {
    type: "learn",
    label: "Learn",
    description: "Extract and reinforce patterns as instincts",
    usageExample:
      "Capture a recurring pattern from agent executions and evolve it into a reusable skill",
    icon: Lightbulb,
    color: "fuchsia",
    category: "utilities",
    defaultData: {
      label: "Learn Pattern",
      patternName: "",
      patternDescription: "",
      outputVariable: "learn_result",
    },
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface NodePickerProps {
  onAddNode: (type: string, data: Record<string, unknown>) => void;
}

export function NodePicker({ onAddNode }: NodePickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<CategoryId>("triggers");
  const [activeIndex, setActiveIndex] = useState(0);

  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Compute nodes for display: either filtered by search or by active category
  const displayedNodes = useMemo(() => {
    if (search.trim()) {
      const q = search.toLowerCase();
      return NODE_DEFINITIONS.filter(
        (n) =>
          n.label.toLowerCase().includes(q) ||
          n.description.toLowerCase().includes(q) ||
          n.type.toLowerCase().includes(q)
      );
    }
    return NODE_DEFINITIONS.filter((n) => n.category === activeCategory);
  }, [search, activeCategory]);

  // Category counts for the sidebar badges
  const categoryCounts = useMemo(() => {
    const counts = new Map<CategoryId, number>();
    for (const cat of CATEGORIES) {
      counts.set(
        cat.id,
        NODE_DEFINITIONS.filter((n) => n.category === cat.id).length
      );
    }
    return counts;
  }, []);

  // Reset active index when displayed nodes change
  useEffect(() => {
    setActiveIndex(0);
  }, [displayedNodes.length, activeCategory, search]);

  // Focus search on open
  useEffect(() => {
    if (open) {
      // Small delay to let popover mount
      const timer = setTimeout(() => searchRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    } else {
      setSearch("");
      setActiveCategory("triggers");
      setActiveIndex(0);
    }
  }, [open]);

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return;
    const active = listRef.current.querySelector(
      `[data-index="${activeIndex}"]`
    );
    if (active && typeof active.scrollIntoView === "function") {
      active.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex]);

  const handleAdd = useCallback(
    (node: NodeDefinition) => {
      onAddNode(node.type, { ...node.defaultData });
      setOpen(false);
    },
    [onAddNode]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown": {
          e.preventDefault();
          setActiveIndex((i) => Math.min(i + 1, displayedNodes.length - 1));
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          setActiveIndex((i) => Math.max(i - 1, 0));
          break;
        }
        case "ArrowRight": {
          // Only switch categories when not searching
          if (!search.trim()) {
            e.preventDefault();
            const idx = CATEGORIES.findIndex((c) => c.id === activeCategory);
            if (idx < CATEGORIES.length - 1) {
              setActiveCategory(CATEGORIES[idx + 1].id);
            }
          }
          break;
        }
        case "ArrowLeft": {
          if (!search.trim()) {
            e.preventDefault();
            const idx = CATEGORIES.findIndex((c) => c.id === activeCategory);
            if (idx > 0) {
              setActiveCategory(CATEGORIES[idx - 1].id);
            }
          }
          break;
        }
        case "Enter": {
          e.preventDefault();
          const node = displayedNodes[activeIndex];
          if (node) {
            handleAdd(node);
          }
          break;
        }
        case "Escape": {
          e.preventDefault();
          setOpen(false);
          break;
        }
      }
    },
    [displayedNodes, activeIndex, activeCategory, search, handleAdd]
  );

  const isSearching = search.trim().length > 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" data-testid="node-picker">
          <Plus className="mr-1.5 size-4" />
          Add Node
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[480px] p-0 max-h-[70vh] flex flex-col"
        align="start"
        sideOffset={8}
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div className="border-b px-3 py-2.5">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
            <Input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search nodes..."
              className="pl-8 h-8 text-sm"
              role="combobox"
              aria-expanded={open}
              aria-controls="node-picker-list"
              aria-activedescendant={
                displayedNodes[activeIndex]
                  ? `node-option-${displayedNodes[activeIndex].type}`
                  : undefined
              }
              data-testid="node-picker-search"
            />
            {isSearching && (
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                {displayedNodes.length} found
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Category sidebar */}
          {!isSearching && (
            <nav
              className="w-[160px] border-r py-1.5 flex flex-col gap-0.5 overflow-y-auto shrink-0"
              aria-label="Node categories"
            >
              {CATEGORIES.map((cat) => {
                const CatIcon = cat.icon;
                const isActive = cat.id === activeCategory;
                return (
                  <button
                    key={cat.id}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors rounded-md mx-1",
                      isActive
                        ? "bg-accent text-accent-foreground font-medium"
                        : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                    )}
                    onClick={() => setActiveCategory(cat.id)}
                    data-testid={`category-${cat.id}`}
                  >
                    <CatIcon className={cn("size-4 shrink-0", cat.color)} />
                    <span className="truncate flex-1">{cat.label}</span>
                    <span
                      className={cn(
                        "text-xs tabular-nums",
                        isActive
                          ? "text-accent-foreground/70"
                          : "text-muted-foreground/60"
                      )}
                    >
                      {categoryCounts.get(cat.id) ?? 0}
                    </span>
                  </button>
                );
              })}
            </nav>
          )}

          {/* Node list */}
          <div
            ref={listRef}
            id="node-picker-list"
            role="listbox"
            aria-label="Available nodes"
            className={cn(
              "flex-1 overflow-y-auto py-1.5",
              isSearching && "w-full"
            )}
          >
            {isSearching && displayedNodes.length > 0 && (
              <div className="px-3 pb-1.5">
                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                  Search results
                </span>
              </div>
            )}

            {displayedNodes.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
                <Search className="size-8 text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">
                  No nodes match &ldquo;{search}&rdquo;
                </p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  Try a different search term
                </p>
              </div>
            )}

            <TooltipProvider delayDuration={400}>
              {displayedNodes.map((node, idx) => {
                const Icon = node.icon;
                const isActive = idx === activeIndex;
                return (
                  <Tooltip key={node.type}>
                    <TooltipTrigger asChild>
                      <button
                        id={`node-option-${node.type}`}
                        role="option"
                        aria-selected={isActive}
                        data-index={idx}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors mx-0",
                          isActive
                            ? "bg-accent text-accent-foreground"
                            : "hover:bg-accent/50"
                        )}
                        onClick={() => handleAdd(node)}
                        onMouseEnter={() => setActiveIndex(idx)}
                      >
                        <div
                          className={cn(
                            "flex size-8 items-center justify-center rounded-md shrink-0",
                            colorMap[node.color]
                          )}
                        >
                          <Icon className="size-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium leading-tight">
                            {node.label}
                          </p>
                          <p className="text-xs text-muted-foreground leading-tight mt-0.5 line-clamp-1">
                            {node.description}
                          </p>
                        </div>
                        {isSearching && (
                          <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wider shrink-0">
                            {
                              CATEGORIES.find((c) => c.id === node.category)
                                ?.label
                            }
                          </span>
                        )}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent
                      side="right"
                      sideOffset={12}
                      className="max-w-[220px] bg-popover text-popover-foreground border shadow-md px-3 py-2"
                    >
                      <p className="text-xs font-medium mb-1">Example</p>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {node.usageExample}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </TooltipProvider>
          </div>
        </div>

        {/* Footer with keyboard hints */}
        <div className="border-t px-3 py-1.5 flex items-center gap-3 text-[10px] text-muted-foreground/60">
          <span>
            <kbd className="rounded border px-1 py-0.5 font-mono">
              &uarr;&darr;
            </kbd>{" "}
            navigate
          </span>
          {!isSearching && (
            <span>
              <kbd className="rounded border px-1 py-0.5 font-mono">
                &larr;&rarr;
              </kbd>{" "}
              categories
            </span>
          )}
          <span>
            <kbd className="rounded border px-1 py-0.5 font-mono">
              &crarr;
            </kbd>{" "}
            add
          </span>
          <span>
            <kbd className="rounded border px-1 py-0.5 font-mono">esc</kbd>{" "}
            close
          </span>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Export for tests
export { NODE_DEFINITIONS, CATEGORIES, type NodeDefinition, type CategoryId };
