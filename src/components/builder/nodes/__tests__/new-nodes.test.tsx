// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock @xyflow/react — Handle renders as a div with data attributes
vi.mock("@xyflow/react", () => ({
  Handle: ({
    type,
    id,
    position,
  }: {
    type: string;
    id?: string;
    position: string;
  }) => <div data-testid={`handle-${type}${id ? `-${id}` : ""}`} data-position={position} />,
  Position: { Top: "top", Bottom: "bottom", Left: "left", Right: "right" },
}));

// Mock lucide-react icons as simple spans
vi.mock("lucide-react", () => ({
  Shuffle: () => <span data-testid="icon-shuffle" />,
  Route: () => <span data-testid="icon-route" />,
  Repeat: () => <span data-testid="icon-repeat" />,
  ClipboardCheck: () => <span data-testid="icon-clipboard-check" />,
  HardDriveUpload: () => <span data-testid="icon-hard-drive-upload" />,
  HardDriveDownload: () => <span data-testid="icon-hard-drive-download" />,
  Bell: () => <span data-testid="icon-bell" />,
  Clock: () => <span data-testid="icon-clock" />,
  Mail: () => <span data-testid="icon-mail" />,
  ShieldCheck: () => <span data-testid="icon-shield-check" />,
  GitFork: () => <span data-testid="icon-git-fork" />,
}));

import { FormatTransformNode } from "../format-transform-node";
import { SwitchNode } from "../switch-node";
import { EvaluatorNode } from "../evaluator-node";
import { MemoryWriteNode } from "../memory-write-node";
import { NotificationNode } from "../notification-node";

beforeEach(() => {
  vi.restoreAllMocks();
});

// ─── FormatTransformNode ─────────────────────────────────────────────────────

describe("FormatTransformNode", () => {
  const baseProps = {
    id: "ft-1",
    type: "format_transform" as const,
    dragging: false,
    zIndex: 0,
    isConnectable: true,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    deletable: true,
    draggable: true,
    selectable: true,
    parentId: undefined,
    sourcePosition: undefined,
    targetPosition: undefined,
  };

  it("renders with default label", () => {
    render(<FormatTransformNode {...baseProps} data={{}} selected={false} />);
    expect(screen.getByText("Format Transform")).toBeDefined();
  });

  it("renders custom label", () => {
    render(
      <FormatTransformNode
        {...baseProps}
        data={{ label: "My Transform" }}
        selected={false}
      />
    );
    expect(screen.getByText("My Transform")).toBeDefined();
  });

  it("shows format label for known formats", () => {
    render(
      <FormatTransformNode
        {...baseProps}
        data={{ format: "json_to_csv" }}
        selected={false}
      />
    );
    expect(screen.getByText("JSON → CSV")).toBeDefined();
  });

  it("shows template format label", () => {
    render(
      <FormatTransformNode
        {...baseProps}
        data={{ format: "template" }}
        selected={false}
      />
    );
    expect(screen.getByText("Template")).toBeDefined();
  });

  it("defaults to template when no format set", () => {
    render(<FormatTransformNode {...baseProps} data={{}} selected={false} />);
    expect(screen.getByText("Template")).toBeDefined();
  });

  it("shows raw format string for unknown formats", () => {
    render(
      <FormatTransformNode
        {...baseProps}
        data={{ format: "custom_format" }}
        selected={false}
      />
    );
    expect(screen.getByText("custom_format")).toBeDefined();
  });

  it("renders shuffle icon", () => {
    render(<FormatTransformNode {...baseProps} data={{}} selected={false} />);
    expect(screen.getByTestId("icon-shuffle")).toBeDefined();
  });

  it("renders input and output handles", () => {
    render(<FormatTransformNode {...baseProps} data={{}} selected={false} />);
    expect(screen.getByTestId("handle-target")).toBeDefined();
    expect(screen.getByTestId("handle-source")).toBeDefined();
  });
});

// ─── SwitchNode ──────────────────────────────────────────────────────────────

describe("SwitchNode", () => {
  const baseProps = {
    id: "sw-1",
    type: "switch" as const,
    dragging: false,
    zIndex: 0,
    isConnectable: true,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    deletable: true,
    draggable: true,
    selectable: true,
    parentId: undefined,
    sourcePosition: undefined,
    targetPosition: undefined,
  };

  it("renders with default label", () => {
    render(<SwitchNode {...baseProps} data={{}} selected={false} />);
    expect(screen.getByText("Switch")).toBeDefined();
  });

  it("renders custom label", () => {
    render(
      <SwitchNode {...baseProps} data={{ label: "Route Decision" }} selected={false} />
    );
    expect(screen.getByText("Route Decision")).toBeDefined();
  });

  it("shows 'No variable set' when variable is empty", () => {
    render(<SwitchNode {...baseProps} data={{}} selected={false} />);
    expect(screen.getByText("No variable set")).toBeDefined();
  });

  it("shows variable name when set", () => {
    render(
      <SwitchNode {...baseProps} data={{ variable: "user_choice" }} selected={false} />
    );
    expect(screen.getByText("user_choice")).toBeDefined();
  });

  it("shows case count with default", () => {
    const cases = [
      { value: "a", label: "Option A" },
      { value: "b", label: "Option B" },
    ];
    render(
      <SwitchNode {...baseProps} data={{ cases, variable: "x" }} selected={false} />
    );
    expect(screen.getByText("2")).toBeDefined();
    expect(screen.getByText(/\+ default/)).toBeDefined();
  });

  it("shows 0 cases when none configured", () => {
    render(
      <SwitchNode {...baseProps} data={{ variable: "x" }} selected={false} />
    );
    expect(screen.getByText("0")).toBeDefined();
  });

  it("renders output handles for each case + default", () => {
    const cases = [
      { value: "a", label: "A" },
      { value: "b", label: "B" },
    ];
    render(
      <SwitchNode {...baseProps} data={{ cases }} selected={false} />
    );
    expect(screen.getByTestId("handle-source-case_0")).toBeDefined();
    expect(screen.getByTestId("handle-source-case_1")).toBeDefined();
    expect(screen.getByTestId("handle-source-default")).toBeDefined();
  });

  it("renders only default handle when no cases", () => {
    render(<SwitchNode {...baseProps} data={{}} selected={false} />);
    expect(screen.getByTestId("handle-source-default")).toBeDefined();
  });

  it("renders route icon", () => {
    render(<SwitchNode {...baseProps} data={{}} selected={false} />);
    expect(screen.getByTestId("icon-route")).toBeDefined();
  });
});

// ─── EvaluatorNode ───────────────────────────────────────────────────────────

describe("EvaluatorNode", () => {
  const baseProps = {
    id: "ev-1",
    type: "evaluator" as const,
    dragging: false,
    zIndex: 0,
    isConnectable: true,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    deletable: true,
    draggable: true,
    selectable: true,
    parentId: undefined,
    sourcePosition: undefined,
    targetPosition: undefined,
  };

  it("renders with default label", () => {
    render(<EvaluatorNode {...baseProps} data={{}} selected={false} />);
    expect(screen.getByText("Evaluator")).toBeDefined();
  });

  it("shows criteria count (singular)", () => {
    const criteria = [{ name: "accuracy", weight: 1 }];
    render(<EvaluatorNode {...baseProps} data={{ criteria }} selected={false} />);
    expect(screen.getByText("1 criterion")).toBeDefined();
  });

  it("shows criteria count (plural)", () => {
    const criteria = [
      { name: "accuracy", weight: 1 },
      { name: "relevance", weight: 0.5 },
    ];
    render(<EvaluatorNode {...baseProps} data={{ criteria }} selected={false} />);
    expect(screen.getByText("2 criteria")).toBeDefined();
  });

  it("shows default passing score of 7", () => {
    render(<EvaluatorNode {...baseProps} data={{}} selected={false} />);
    expect(screen.getByText("≥ 7/10")).toBeDefined();
  });

  it("shows custom passing score", () => {
    render(
      <EvaluatorNode {...baseProps} data={{ passingScore: 9 }} selected={false} />
    );
    expect(screen.getByText("≥ 9/10")).toBeDefined();
  });

  it("renders passed and failed output handles", () => {
    render(<EvaluatorNode {...baseProps} data={{}} selected={false} />);
    expect(screen.getByTestId("handle-source-passed")).toBeDefined();
    expect(screen.getByTestId("handle-source-failed")).toBeDefined();
  });

  it("shows Pass and Fail labels", () => {
    render(<EvaluatorNode {...baseProps} data={{}} selected={false} />);
    expect(screen.getByText("Pass")).toBeDefined();
    expect(screen.getByText("Fail")).toBeDefined();
  });
});

// ─── MemoryWriteNode ─────────────────────────────────────────────────────────

describe("MemoryWriteNode", () => {
  const baseProps = {
    id: "mw-1",
    type: "memory_write" as const,
    dragging: false,
    zIndex: 0,
    isConnectable: true,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    deletable: true,
    draggable: true,
    selectable: true,
    parentId: undefined,
    sourcePosition: undefined,
    targetPosition: undefined,
  };

  it("renders with default label", () => {
    render(<MemoryWriteNode {...baseProps} data={{}} selected={false} />);
    expect(screen.getByText("Memory Write")).toBeDefined();
  });

  it("shows key value", () => {
    render(
      <MemoryWriteNode {...baseProps} data={{ key: "user_pref" }} selected={false} />
    );
    expect(screen.getByText("user_pref")).toBeDefined();
  });

  it("shows dash when no key set", () => {
    render(<MemoryWriteNode {...baseProps} data={{}} selected={false} />);
    expect(screen.getByText("—")).toBeDefined();
  });

  it("shows category", () => {
    render(
      <MemoryWriteNode
        {...baseProps}
        data={{ category: "preferences" }}
        selected={false}
      />
    );
    expect(screen.getByText("preferences")).toBeDefined();
  });

  it("defaults category to general", () => {
    render(<MemoryWriteNode {...baseProps} data={{}} selected={false} />);
    expect(screen.getByText("general")).toBeDefined();
  });

  it("shows embedding indicator when enabled", () => {
    render(
      <MemoryWriteNode
        {...baseProps}
        data={{ generateEmbedding: true }}
        selected={false}
      />
    );
    expect(screen.getByText("+ embedding")).toBeDefined();
  });

  it("hides embedding indicator when disabled", () => {
    render(<MemoryWriteNode {...baseProps} data={{}} selected={false} />);
    expect(screen.queryByText("+ embedding")).toBeNull();
  });
});

// ─── NotificationNode ────────────────────────────────────────────────────────

describe("NotificationNode", () => {
  const baseProps = {
    id: "not-1",
    type: "notification" as const,
    dragging: false,
    zIndex: 0,
    isConnectable: true,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    deletable: true,
    draggable: true,
    selectable: true,
    parentId: undefined,
    sourcePosition: undefined,
    targetPosition: undefined,
  };

  it("renders with default label", () => {
    render(<NotificationNode {...baseProps} data={{}} selected={false} />);
    expect(screen.getByText("Notification")).toBeDefined();
  });

  it("shows channel label", () => {
    render(
      <NotificationNode {...baseProps} data={{ channel: "webhook" }} selected={false} />
    );
    expect(screen.getByText("Webhook")).toBeDefined();
  });

  it("shows In-App channel label", () => {
    render(
      <NotificationNode {...baseProps} data={{ channel: "in_app" }} selected={false} />
    );
    expect(screen.getByText("In-App")).toBeDefined();
  });

  it("defaults channel to Log", () => {
    render(<NotificationNode {...baseProps} data={{}} selected={false} />);
    expect(screen.getByText("Log")).toBeDefined();
  });

  it("shows level", () => {
    render(
      <NotificationNode {...baseProps} data={{ level: "error" }} selected={false} />
    );
    expect(screen.getByText("error")).toBeDefined();
  });

  it("defaults level to info", () => {
    render(<NotificationNode {...baseProps} data={{}} selected={false} />);
    expect(screen.getByText("info")).toBeDefined();
  });

  it("renders bell icon", () => {
    render(<NotificationNode {...baseProps} data={{}} selected={false} />);
    expect(screen.getByTestId("icon-bell")).toBeDefined();
  });
});
