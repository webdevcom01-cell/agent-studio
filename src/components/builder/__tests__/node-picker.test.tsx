// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Mock Radix Popover — render content directly for testing
vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="popover">{children}</div>
  ),
  PopoverTrigger: ({
    children,
    asChild: _asChild,
  }: {
    children: React.ReactNode;
    asChild?: boolean;
  }) => <div data-testid="popover-trigger">{children}</div>,
  PopoverContent: ({
    children,
    onKeyDown,
  }: {
    children: React.ReactNode;
    className?: string;
    align?: string;
    sideOffset?: number;
    onKeyDown?: (e: React.KeyboardEvent) => void;
  }) => (
    <div data-testid="popover-content" onKeyDown={onKeyDown}>
      {children}
    </div>
  ),
}));

// Mock Tooltip — render children directly, no portal
vi.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({
    children,
    asChild: _asChild,
  }: {
    children: React.ReactNode;
    asChild?: boolean;
  }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="tooltip-content" className="hidden">
      {children}
    </div>
  ),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    ...props
  }: {
    children: React.ReactNode;
    size?: string;
  }) => <button {...props}>{children}</button>,
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} />
  ),
}));

// Mock all lucide icons as simple spans with the icon name
vi.mock("lucide-react", () => {
  const icons = [
    "MessageSquare",
    "Sparkles",
    "GitBranch",
    "TextCursorInput",
    "CircleStop",
    "Database",
    "CornerDownRight",
    "Variable",
    "Clock",
    "MousePointerClick",
    "Globe",
    "GlobeLock",
    "Webhook",
    "Code",
    "Code2",
    "Tags",
    "FileOutput",
    "FileText",
    "Plug",
    "ArrowRightLeft",
    "UserCheck",
    "Repeat",
    "GitFork",
    "HardDriveUpload",
    "HardDriveDownload",
    "ClipboardCheck",
    "Timer",
    "Mail",
    "Bell",
    "Shuffle",
    "Route",
    "Plus",
    "Search",
    "Monitor",
    "AppWindow",
    "Lightbulb",
    "Zap",
    "Brain",
    "BookOpen",
    "Settings",
    "FileJson",
    "Binary",
    "RefreshCcw",
    "Compass",
    "Boxes",
    "DollarSign",
    "Combine",
    "ImageIcon",
    "ImagePlus",
    "Volume2",
    "FolderOpen",
    "PlayCircle",
    "ShieldCheck",
    "Terminal",
    "CircleCheckBig",
    "Braces",
    "FileSearch",
    "BookMarked",
  ];
  const mocks: Record<string, unknown> = {};
  for (const name of icons) {
    mocks[name] = ({ className }: { className?: string }) => (
      <span data-testid={`icon-${name}`} className={className} />
    );
  }
  return mocks;
});

import { NodePicker, NODE_DEFINITIONS, CATEGORIES } from "../node-picker";
import type { CategoryId } from "../node-picker";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("NodePicker", () => {
  // ── Basic rendering ───────────────────────────────────────────────────

  it("renders Add Node button", () => {
    render(<NodePicker onAddNode={vi.fn()} />);
    expect(screen.getByText("Add Node")).toBeDefined();
  });

  it("preserves data-testid for E2E tests", () => {
    render(<NodePicker onAddNode={vi.fn()} />);
    expect(screen.getByTestId("node-picker")).toBeDefined();
  });

  it("renders search input", () => {
    render(<NodePicker onAddNode={vi.fn()} />);
    expect(screen.getByTestId("node-picker-search")).toBeDefined();
  });

  // ── Node definitions completeness ─────────────────────────────────────

  it("has exactly 61 node definitions", () => {
    expect(NODE_DEFINITIONS.length).toBe(61);
  });

  it("every node has a usageExample", () => {
    for (const node of NODE_DEFINITIONS) {
      expect(node.usageExample.length).toBeGreaterThan(10);
    }
  });

  it("every node type is unique", () => {
    const types = NODE_DEFINITIONS.map((n) => n.type);
    expect(new Set(types).size).toBe(types.length);
  });

  it("every node has a valid category", () => {
    const validCategories = CATEGORIES.map((c) => c.id);
    for (const node of NODE_DEFINITIONS) {
      expect(validCategories).toContain(node.category);
    }
  });

  // ── Categories ────────────────────────────────────────────────────────

  it("has exactly 7 categories", () => {
    expect(CATEGORIES.length).toBe(7);
  });

  it("renders all 7 category buttons", () => {
    render(<NodePicker onAddNode={vi.fn()} />);
    for (const cat of CATEGORIES) {
      expect(screen.getByTestId(`category-${cat.id}`)).toBeDefined();
    }
  });

  it("renders category labels", () => {
    render(<NodePicker onAddNode={vi.fn()} />);
    expect(screen.getByText("Triggers")).toBeDefined();
    expect(screen.getByText("AI")).toBeDefined();
    expect(screen.getByText("Knowledge & Memory")).toBeDefined();
    expect(screen.getByText("Logic")).toBeDefined();
    expect(screen.getByText("Integrations")).toBeDefined();
    expect(screen.getByText("Messaging")).toBeDefined();
    expect(screen.getByText("Utilities")).toBeDefined();
  });

  it("has correct node counts per category", () => {
    const counts: Record<CategoryId, number> = {
      triggers: 0,
      ai: 0,
      knowledge: 0,
      logic: 0,
      integrations: 0,
      messaging: 0,
      utilities: 0,
    };
    for (const node of NODE_DEFINITIONS) {
      counts[node.category]++;
    }
    expect(counts.triggers).toBe(2);
    expect(counts.ai).toBe(14);
    expect(counts.knowledge).toBe(3);
    expect(counts.logic).toBe(13);
    expect(counts.integrations).toBe(11);
    expect(counts.messaging).toBe(6);
    expect(counts.utilities).toBe(12);
  });

  // ── Node rendering per category ───────────────────────────────────────

  it("renders trigger category nodes by default", () => {
    render(<NodePicker onAddNode={vi.fn()} />);
    // Triggers is the default active category
    expect(screen.getByText("Schedule Trigger")).toBeDefined();
    expect(screen.getByText("Webhook Trigger")).toBeDefined();
  });

  it("switches to AI category when clicked", () => {
    render(<NodePicker onAddNode={vi.fn()} />);
    fireEvent.click(screen.getByTestId("category-ai"));
    expect(screen.getByText("AI Response")).toBeDefined();
    expect(screen.getByText("AI Classify")).toBeDefined();
    expect(screen.getByText("AI Extract")).toBeDefined();
    expect(screen.getByText("AI Summarize")).toBeDefined();
    expect(screen.getByText("Evaluator")).toBeDefined();
  });

  it("switches to Logic category and shows all 8 nodes", () => {
    render(<NodePicker onAddNode={vi.fn()} />);
    fireEvent.click(screen.getByTestId("category-logic"));
    expect(screen.getByText("Condition")).toBeDefined();
    expect(screen.getByText("Switch")).toBeDefined();
    expect(screen.getByText("Loop")).toBeDefined();
    expect(screen.getByText("Parallel")).toBeDefined();
    expect(screen.getByText("Goto")).toBeDefined();
    expect(screen.getByText("Set Variable")).toBeDefined();
    expect(screen.getByText("Format Transform")).toBeDefined();
    expect(screen.getByText("Function")).toBeDefined();
  });

  it("switches to Messaging category", () => {
    render(<NodePicker onAddNode={vi.fn()} />);
    fireEvent.click(screen.getByTestId("category-messaging"));
    expect(screen.getByText("Message")).toBeDefined();
    expect(screen.getByText("Button")).toBeDefined();
    expect(screen.getByText("Capture Input")).toBeDefined();
    expect(screen.getByText("Email Send")).toBeDefined();
    expect(screen.getByText("Notification")).toBeDefined();
    expect(screen.getByText("Human Approval")).toBeDefined();
  });

  // ── Search ────────────────────────────────────────────────────────────

  it("filters nodes by search query (name)", () => {
    render(<NodePicker onAddNode={vi.fn()} />);
    const searchInput = screen.getByTestId("node-picker-search");
    fireEvent.change(searchInput, { target: { value: "loop" } });
    expect(screen.getByText("Loop")).toBeDefined();
    // Other nodes should not be visible
    expect(screen.queryByText("Message")).toBeNull();
  });

  it("filters nodes by search query (description)", () => {
    render(<NodePicker onAddNode={vi.fn()} />);
    const searchInput = screen.getByTestId("node-picker-search");
    fireEvent.change(searchInput, { target: { value: "webhook" } });
    // Should find both webhook-related nodes
    expect(screen.getByText("Webhook Trigger")).toBeDefined();
    expect(screen.getByText("Webhook")).toBeDefined();
  });

  it("shows empty state when no nodes match search", () => {
    render(<NodePicker onAddNode={vi.fn()} />);
    const searchInput = screen.getByTestId("node-picker-search");
    fireEvent.change(searchInput, { target: { value: "xyznonexistent" } });
    expect(screen.getByText(/No nodes match/)).toBeDefined();
  });

  it("shows result count badge when searching", () => {
    render(<NodePicker onAddNode={vi.fn()} />);
    const searchInput = screen.getByTestId("node-picker-search");
    fireEvent.change(searchInput, { target: { value: "ai" } });
    // Should show "X found" badge
    expect(screen.getByText(/found/)).toBeDefined();
  });

  // ── Node click → onAddNode ────────────────────────────────────────────

  it("calls onAddNode with correct type and data when node clicked", () => {
    const onAddNode = vi.fn();
    render(<NodePicker onAddNode={onAddNode} />);

    // Click Schedule Trigger (visible by default in Triggers category)
    fireEvent.click(screen.getByText("Schedule Trigger"));
    expect(onAddNode).toHaveBeenCalledWith(
      "schedule_trigger",
      expect.objectContaining({
        label: "Schedule Trigger",
        scheduleType: "manual",
        outputVariable: "trigger_info",
      })
    );
  });

  it("calls onAddNode with format_transform data", () => {
    const onAddNode = vi.fn();
    render(<NodePicker onAddNode={onAddNode} />);

    fireEvent.click(screen.getByTestId("category-logic"));
    fireEvent.click(screen.getByText("Format Transform"));
    expect(onAddNode).toHaveBeenCalledWith(
      "format_transform",
      expect.objectContaining({
        label: "Format Transform",
        format: "template",
        outputVariable: "transform_result",
      })
    );
  });

  it("calls onAddNode with switch node data", () => {
    const onAddNode = vi.fn();
    render(<NodePicker onAddNode={onAddNode} />);

    fireEvent.click(screen.getByTestId("category-logic"));
    fireEvent.click(screen.getByText("Switch"));
    expect(onAddNode).toHaveBeenCalledWith(
      "switch",
      expect.objectContaining({
        label: "Switch",
        operator: "equals",
        outputVariable: "switch_result",
      })
    );
  });

  it("calls onAddNode with loop node data", () => {
    const onAddNode = vi.fn();
    render(<NodePicker onAddNode={onAddNode} />);

    fireEvent.click(screen.getByTestId("category-logic"));
    fireEvent.click(screen.getByText("Loop"));
    expect(onAddNode).toHaveBeenCalledWith(
      "loop",
      expect.objectContaining({
        label: "Loop",
        mode: "count",
        maxIterations: 10,
      })
    );
  });

  it("calls onAddNode with evaluator node data", () => {
    const onAddNode = vi.fn();
    render(<NodePicker onAddNode={onAddNode} />);

    fireEvent.click(screen.getByTestId("category-ai"));
    fireEvent.click(screen.getByText("Evaluator"));
    expect(onAddNode).toHaveBeenCalledWith(
      "evaluator",
      expect.objectContaining({
        label: "Evaluator",
        passingScore: 7,
      })
    );
  });

  it("calls onAddNode from search results", () => {
    const onAddNode = vi.fn();
    render(<NodePicker onAddNode={onAddNode} />);

    const searchInput = screen.getByTestId("node-picker-search");
    fireEvent.change(searchInput, { target: { value: "memory write" } });
    fireEvent.click(screen.getByText("Memory Write"));
    expect(onAddNode).toHaveBeenCalledWith(
      "memory_write",
      expect.objectContaining({
        label: "Memory Write",
        category: "general",
      })
    );
  });

  // ── Descriptions ──────────────────────────────────────────────────────

  it("renders descriptions for nodes", () => {
    render(<NodePicker onAddNode={vi.fn()} />);
    // Triggers category is default — check descriptions there
    expect(
      screen.getByText("Start flow on a schedule or manually")
    ).toBeDefined();
    expect(
      screen.getByText("Start flow from an external HTTP webhook")
    ).toBeDefined();
  });

  // ── ARIA attributes ───────────────────────────────────────────────────

  it("has correct ARIA roles on node list", () => {
    render(<NodePicker onAddNode={vi.fn()} />);
    const listbox = screen.getByRole("listbox");
    expect(listbox).toBeDefined();
  });

  it("has role=option on each node item", () => {
    render(<NodePicker onAddNode={vi.fn()} />);
    const options = screen.getAllByRole("option");
    // Should have 2 options (trigger category nodes visible by default)
    expect(options.length).toBe(2);
  });

  it("has combobox role on search input", () => {
    render(<NodePicker onAddNode={vi.fn()} />);
    const combobox = screen.getByRole("combobox");
    expect(combobox).toBeDefined();
  });

  // ── Category node assignments (regression tests) ──────────────────────

  it("has capture in messaging category", () => {
    const capture = NODE_DEFINITIONS.find((n) => n.type === "capture");
    expect(capture?.category).toBe("messaging");
  });

  it("has function in logic category", () => {
    const fn = NODE_DEFINITIONS.find((n) => n.type === "function");
    expect(fn?.category).toBe("logic");
  });

  it("has button in messaging category", () => {
    const button = NODE_DEFINITIONS.find((n) => n.type === "button");
    expect(button?.category).toBe("messaging");
  });

  it("has kb_search in knowledge category", () => {
    const kbSearch = NODE_DEFINITIONS.find((n) => n.type === "kb_search");
    expect(kbSearch?.category).toBe("knowledge");
  });

  it("has learn in utilities category", () => {
    const learn = NODE_DEFINITIONS.find((n) => n.type === "learn");
    expect(learn?.category).toBe("utilities");
  });

  // ── Keyboard hints footer ─────────────────────────────────────────────

  it("renders keyboard hints", () => {
    render(<NodePicker onAddNode={vi.fn()} />);
    expect(screen.getByText("navigate")).toBeDefined();
    expect(screen.getByText("add")).toBeDefined();
    expect(screen.getByText("close")).toBeDefined();
  });
});
