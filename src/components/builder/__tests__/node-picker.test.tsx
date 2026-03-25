// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Mock Radix UI dropdown — render content directly for testing
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children, open }: { children: React.ReactNode; open: boolean }) => (
    <div data-testid="dropdown" data-open={open}>{children}</div>
  ),
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dropdown-content">{children}</div>
  ),
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dropdown-trigger">{children}</div>
  ),
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dropdown-label">{children}</div>
  ),
  DropdownMenuSeparator: () => <hr data-testid="dropdown-separator" />,
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

// Mock all lucide icons as simple spans with the icon name
vi.mock("lucide-react", () => {
  const icons = [
    "MessageSquare", "Sparkles", "GitBranch", "TextCursorInput", "CircleStop",
    "Database", "CornerDownRight", "Variable", "Clock", "MousePointerClick",
    "Globe", "Webhook", "Code", "Tags", "FileOutput", "FileText", "Plug",
    "ArrowRightLeft", "UserCheck", "Repeat", "GitFork", "HardDriveUpload",
    "HardDriveDownload", "ClipboardCheck", "Timer", "Mail", "Bell", "Shuffle",
    "Route", "Plus", "GlobeLock", "Monitor", "AppWindow", "Lightbulb",
  ];
  const mocks: Record<string, unknown> = {};
  for (const name of icons) {
    mocks[name] = ({ className }: { className?: string }) => (
      <span data-testid={`icon-${name}`} className={className} />
    );
  }
  return mocks;
});

import { NodePicker } from "../node-picker";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("NodePicker", () => {
  it("renders Add Node button", () => {
    render(<NodePicker onAddNode={vi.fn()} />);
    expect(screen.getByText("Add Node")).toBeDefined();
  });

  it("renders all node types from new sprints", () => {
    render(<NodePicker onAddNode={vi.fn()} />);

    // Sprint 1-2 nodes
    expect(screen.getByText("Loop")).toBeDefined();
    expect(screen.getByText("Parallel")).toBeDefined();
    expect(screen.getByText("Memory Write")).toBeDefined();
    expect(screen.getByText("Memory Read")).toBeDefined();

    // Sprint 3-4 nodes
    expect(screen.getByText("Evaluator")).toBeDefined();
    expect(screen.getByText("Schedule Trigger")).toBeDefined();
    expect(screen.getByText("Email Send")).toBeDefined();
    expect(screen.getByText("Notification")).toBeDefined();

    // Sprint 5 nodes
    expect(screen.getByText("Format Transform")).toBeDefined();
    expect(screen.getByText("Switch")).toBeDefined();
  });

  it("renders all original node types", () => {
    render(<NodePicker onAddNode={vi.fn()} />);

    expect(screen.getByText("Message")).toBeDefined();
    expect(screen.getByText("AI Response")).toBeDefined();
    expect(screen.getByText("Condition")).toBeDefined();
    expect(screen.getByText("End")).toBeDefined();
    expect(screen.getByText("API Call")).toBeDefined();
    expect(screen.getByText("MCP Tool")).toBeDefined();
  });

  it("renders category labels", () => {
    render(<NodePicker onAddNode={vi.fn()} />);

    const labels = screen.getAllByTestId("dropdown-label");
    const labelTexts = labels.map((l) => l.textContent);

    expect(labelTexts).toContain("Content");
    expect(labelTexts).toContain("AI");
    expect(labelTexts).toContain("Logic");
    expect(labelTexts).toContain("Flow Control");
    expect(labelTexts).toContain("Integrations");
    expect(labelTexts).toContain("Memory");
    expect(labelTexts).toContain("Actions");
    expect(labelTexts).toContain("Triggers");
  });

  it("renders descriptions for new nodes", () => {
    render(<NodePicker onAddNode={vi.fn()} />);

    expect(screen.getByText("Transform data between formats")).toBeDefined();
    expect(screen.getByText("Multi-way branching on variable value")).toBeDefined();
    expect(screen.getByText("Execute branches simultaneously")).toBeDefined();
    expect(screen.getByText("Repeat a subflow N times or until condition")).toBeDefined();
  });

  it("calls onAddNode with correct type and data when node clicked", () => {
    const onAddNode = vi.fn();
    render(<NodePicker onAddNode={onAddNode} />);

    // Click Format Transform node
    fireEvent.click(screen.getByText("Format Transform"));

    expect(onAddNode).toHaveBeenCalledWith("format_transform", expect.objectContaining({
      label: "Format Transform",
      format: "template",
      outputVariable: "transform_result",
    }));
  });

  it("calls onAddNode with switch node data", () => {
    const onAddNode = vi.fn();
    render(<NodePicker onAddNode={onAddNode} />);

    fireEvent.click(screen.getByText("Switch"));

    expect(onAddNode).toHaveBeenCalledWith("switch", expect.objectContaining({
      label: "Switch",
      operator: "equals",
      outputVariable: "switch_result",
    }));
  });

  it("calls onAddNode with loop node data", () => {
    const onAddNode = vi.fn();
    render(<NodePicker onAddNode={onAddNode} />);

    fireEvent.click(screen.getByText("Loop"));

    expect(onAddNode).toHaveBeenCalledWith("loop", expect.objectContaining({
      label: "Loop",
      mode: "count",
      maxIterations: 10,
    }));
  });

  it("calls onAddNode with evaluator node data", () => {
    const onAddNode = vi.fn();
    render(<NodePicker onAddNode={onAddNode} />);

    fireEvent.click(screen.getByText("Evaluator"));

    expect(onAddNode).toHaveBeenCalledWith("evaluator", expect.objectContaining({
      label: "Evaluator",
      passingScore: 7,
    }));
  });

  it("has correct total number of node definitions (33)", () => {
    render(<NodePicker onAddNode={vi.fn()} />);

    const allButtons = screen.getAllByRole("button");
    // Total nodes = 34 defined in NODE_DEFINITIONS
    // + 1 for "Add Node" trigger button = 35 buttons total
    expect(allButtons.length).toBe(35);
  });
});
