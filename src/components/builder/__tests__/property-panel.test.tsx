// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Mock Radix UI Select as simple pass-through elements
vi.mock("@/components/ui/select", () => ({
  Select: ({ children, value, onValueChange }: {
    children: React.ReactNode;
    value?: string;
    onValueChange?: (v: string) => void;
  }) => (
    <div data-testid="select" data-value={value}>
      {children}
      {/* Hidden input to allow testing value changes */}
      <input
        data-testid="select-input"
        type="hidden"
        value={value}
        onChange={(e) => onValueChange?.(e.target.value)}
      />
    </div>
  ),
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => (
    <div data-testid={`select-item-${value}`}>{children}</div>
  ),
  SelectLabel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    ...props
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    variant?: string;
    size?: string;
    className?: string;
  }) => (
    <button onClick={onClick} data-variant={props.variant}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/input", () => ({
  Input: ({
    value,
    onChange,
    placeholder,
    type,
    ...props
  }: {
    value?: string | number;
    onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
    placeholder?: string;
    type?: string;
    className?: string;
  }) => (
    <input
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      type={type}
      aria-label={placeholder}
    />
  ),
}));

vi.mock("@/components/ui/textarea", () => ({
  Textarea: ({
    value,
    onChange,
    placeholder,
    rows,
  }: {
    value?: string;
    onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    placeholder?: string;
    rows?: number;
  }) => (
    <textarea
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      rows={rows}
    />
  ),
}));

vi.mock("@/components/ui/label", () => ({
  Label: ({ children }: { children: React.ReactNode }) => <label>{children}</label>,
}));

// Mock only the icons actually imported by property-panel.tsx.
// Child components (Select, Button, ConfirmDialog, etc.) are all mocked,
// so their icon imports never reach lucide-react.
vi.mock("lucide-react", () => {
  const Icon = ({ className }: { className?: string }) => (
    <span className={className} />
  );
  return {
    Trash2: Icon,
    X: Icon,
    Plus: Icon,
    Search: Icon,
    Database: Icon,
    Plug: Icon,
    Zap: Icon,
    Scale: Icon,
    Brain: Icon,
    ChevronDown: Icon,
    Check: Icon,
    AlertTriangle: Icon,
    AppWindow: Icon,
    Paintbrush: Icon,
    Image: Icon,
    PenTool: Icon,
    Music: Icon,
    FileSpreadsheet: Icon,
    Video: Icon,
    Film: Icon,
    Scissors: Icon,
    Phone: Icon,
    Workflow: Icon,
    Bot: Icon,
    Clipboard: Icon,
    ChevronRight: Icon,
  };
});

vi.mock("@/components/ui/confirm-dialog", () => ({
  ConfirmDialog: ({
    open,
    onConfirm,
    children,
  }: {
    open?: boolean;
    onConfirm?: () => void;
    children?: React.ReactNode;
    title?: string;
    description?: string;
    confirmLabel?: string;
    onOpenChange?: (v: boolean) => void;
  }) =>
    open ? (
      <div data-testid="confirm-dialog">
        {children}
        <button onClick={onConfirm}>Confirm</button>
      </div>
    ) : null,
}));

vi.mock("@/lib/models", () => ({
  ALL_MODELS: [
    { id: "deepseek-chat", name: "DeepSeek Chat", provider: "deepseek", tier: "fast" },
  ],
}));

import { PropertyPanel } from "../property-panel";

beforeEach(() => {
  vi.restoreAllMocks();
  // Prevent real HTTP calls from property-panel's useEffect hooks
  // (fetches /api/mcp-servers, /api/agents, etc.)
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: [] }),
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function makeNode(type: string, data: Record<string, unknown> = {}) {
  return {
    id: `node-${type}`,
    type,
    position: { x: 0, y: 0 },
    data: { label: `Test ${type}`, ...data },
  };
}

describe("PropertyPanel", () => {
  const defaultProps = {
    allNodes: [],
    agentId: "agent-1",
    onUpdateData: vi.fn(),
    onDeleteNode: vi.fn(),
    onClose: vi.fn(),
  };

  describe("common properties", () => {
    it("renders Properties header", () => {
      render(
        <PropertyPanel {...defaultProps} node={makeNode("message")} />
      );
      expect(screen.getByText("Properties")).toBeDefined();
    });

    it("renders label input for any node", () => {
      render(
        <PropertyPanel {...defaultProps} node={makeNode("format_transform")} />
      );
      expect(screen.getByText("Label")).toBeDefined();
    });

    it("renders delete button", () => {
      render(
        <PropertyPanel {...defaultProps} node={makeNode("switch")} />
      );
      const deleteBtn = screen.getByText("Delete Node");
      expect(deleteBtn).toBeDefined();
    });

    it("calls onClose when close button clicked", () => {
      const onClose = vi.fn();
      render(
        <PropertyPanel {...defaultProps} onClose={onClose} node={makeNode("message")} />
      );
      // Close button has the X icon
      const closeButtons = screen.getAllByRole("button");
      const closeBtn = closeButtons.find((b) => b.querySelector('[data-testid="icon-X"]'));
      if (closeBtn) {
        fireEvent.click(closeBtn);
        expect(onClose).toHaveBeenCalled();
      }
    });

    it("calls onDeleteNode when delete button clicked", () => {
      const onDeleteNode = vi.fn();
      render(
        <PropertyPanel
          {...defaultProps}
          onDeleteNode={onDeleteNode}
          node={makeNode("switch")}
        />
      );
      // Clicking "Delete Node" opens the ConfirmDialog
      fireEvent.click(screen.getByText("Delete Node"));
      // Confirm the deletion in the mock dialog
      fireEvent.click(screen.getByText("Confirm"));
      expect(onDeleteNode).toHaveBeenCalledWith("node-switch");
    });
  });

  describe("FormatTransformProperties", () => {
    it("renders Transform Format label", () => {
      render(
        <PropertyPanel {...defaultProps} node={makeNode("format_transform")} />
      );
      expect(screen.getByText("Transform Format")).toBeDefined();
    });

    it("renders Input Variable field", () => {
      render(
        <PropertyPanel {...defaultProps} node={makeNode("format_transform")} />
      );
      expect(screen.getByText("Input Variable")).toBeDefined();
    });

    it("renders Direct Input Value field", () => {
      render(
        <PropertyPanel {...defaultProps} node={makeNode("format_transform")} />
      );
      expect(screen.getByText("Direct Input Value")).toBeDefined();
    });

    it("renders Output Variable field", () => {
      render(
        <PropertyPanel {...defaultProps} node={makeNode("format_transform")} />
      );
      expect(screen.getByText("Output Variable")).toBeDefined();
    });

    it("shows Template textarea when format is template", () => {
      render(
        <PropertyPanel
          {...defaultProps}
          node={makeNode("format_transform", { format: "template" })}
        />
      );
      // The Template textarea has a specific placeholder
      expect(screen.getByPlaceholderText("Use {{variable}} syntax — type {{ to see suggestions")).toBeDefined();
    });

    it("shows Separator field when format needs it", () => {
      render(
        <PropertyPanel
          {...defaultProps}
          node={makeNode("format_transform", { format: "csv_to_json" })}
        />
      );
      expect(screen.getByText("Separator")).toBeDefined();
    });

    it("hides Template textarea for non-template formats", () => {
      render(
        <PropertyPanel
          {...defaultProps}
          node={makeNode("format_transform", { format: "uppercase" })}
        />
      );
      // Template textarea should not be present
      expect(screen.queryByPlaceholderText("Use {{variable}} syntax — type {{ to see suggestions")).toBeNull();
    });

    it("hides Separator field for non-separator formats", () => {
      render(
        <PropertyPanel
          {...defaultProps}
          node={makeNode("format_transform", { format: "uppercase" })}
        />
      );
      expect(screen.queryByText("Separator")).toBeNull();
    });

    it("renders all format options", () => {
      render(
        <PropertyPanel {...defaultProps} node={makeNode("format_transform")} />
      );
      // Check select items exist for known formats
      expect(screen.getByTestId("select-item-json_to_text")).toBeDefined();
      expect(screen.getByTestId("select-item-uppercase")).toBeDefined();
      expect(screen.getByTestId("select-item-split")).toBeDefined();
    });

    it("calls onUpdateData when input variable changes", () => {
      const onUpdateData = vi.fn();
      render(
        <PropertyPanel
          {...defaultProps}
          onUpdateData={onUpdateData}
          node={makeNode("format_transform")}
        />
      );
      const inputVarField = screen.getByPlaceholderText("e.g. api_result");
      fireEvent.change(inputVarField, { target: { value: "my_data" } });
      expect(onUpdateData).toHaveBeenCalledWith("node-format_transform", {
        inputVariable: "my_data",
      });
    });
  });

  describe("SwitchProperties", () => {
    it("renders Variable to Match label", () => {
      render(
        <PropertyPanel {...defaultProps} node={makeNode("switch")} />
      );
      expect(screen.getByText("Variable to Match")).toBeDefined();
    });

    it("renders Match Operator label", () => {
      render(
        <PropertyPanel {...defaultProps} node={makeNode("switch")} />
      );
      expect(screen.getByText("Match Operator")).toBeDefined();
    });

    it("renders Cases label", () => {
      render(
        <PropertyPanel {...defaultProps} node={makeNode("switch")} />
      );
      expect(screen.getByText("Cases")).toBeDefined();
    });

    it("renders Output Variable field", () => {
      render(
        <PropertyPanel {...defaultProps} node={makeNode("switch")} />
      );
      expect(screen.getByText("Output Variable")).toBeDefined();
    });

    it("renders default output note", () => {
      render(
        <PropertyPanel {...defaultProps} node={makeNode("switch")} />
      );
      expect(screen.getByText(/default/)).toBeDefined();
    });

    it("renders all operator options", () => {
      render(
        <PropertyPanel {...defaultProps} node={makeNode("switch")} />
      );
      expect(screen.getByTestId("select-item-equals")).toBeDefined();
      expect(screen.getByTestId("select-item-contains")).toBeDefined();
      expect(screen.getByTestId("select-item-regex")).toBeDefined();
      expect(screen.getByTestId("select-item-gt")).toBeDefined();
    });

    it("renders case inputs for existing cases", () => {
      const cases = [
        { value: "yes", label: "Affirmative" },
        { value: "no", label: "Negative" },
      ];
      render(
        <PropertyPanel
          {...defaultProps}
          node={makeNode("switch", { cases })}
        />
      );
      // Should have case value placeholders
      expect(screen.getByPlaceholderText("Case 1 value")).toBeDefined();
      expect(screen.getByPlaceholderText("Case 2 value")).toBeDefined();
    });

    it("calls onUpdateData when variable changes", () => {
      const onUpdateData = vi.fn();
      render(
        <PropertyPanel
          {...defaultProps}
          onUpdateData={onUpdateData}
          node={makeNode("switch")}
        />
      );
      const varField = screen.getByPlaceholderText("e.g. user_choice");
      fireEvent.change(varField, { target: { value: "status" } });
      expect(onUpdateData).toHaveBeenCalledWith("node-switch", {
        variable: "status",
      });
    });

    it("adds a new case when Add button clicked", () => {
      const onUpdateData = vi.fn();
      render(
        <PropertyPanel
          {...defaultProps}
          onUpdateData={onUpdateData}
          node={makeNode("switch", { cases: [] })}
        />
      );
      fireEvent.click(screen.getByText("Add"));
      expect(onUpdateData).toHaveBeenCalledWith("node-switch", {
        cases: [{ value: "", label: "" }],
      });
    });
  });
});
