import { Bot, Check } from "lucide-react";

const POINTS = [
  "70+ node types, drag-and-drop",
  "Enterprise RAG with pgvector",
  "Multi-agent orchestration (A2A)",
  "Built-in safety & guardrails",
];

export function AuthShell({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div className="flex min-h-screen">
      {/* Brand panel — desktop only */}
      <aside
        className="relative hidden flex-col justify-between lg:flex"
        style={{ width: "46%", background: "#0C0A09", color: "#E8E2DB", padding: "3rem" }}
      >
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center rounded-md" style={{ width: "2rem", height: "2rem", background: "#F2641E", color: "#1A0A02" }}>
            <Bot style={{ width: "1.125rem", height: "1.125rem" }} />
          </span>
          <span className="text-lg font-semibold tracking-tight">Agent Studio</span>
        </div>

        <div>
          <h2 className="text-3xl font-bold tracking-tight" style={{ lineHeight: 1.15, maxWidth: "26rem" }}>
            Build production AI agents visually
          </h2>
          <p className="text-sm" style={{ marginTop: "1rem", color: "#A39A8F", maxWidth: "24rem", lineHeight: 1.7 }}>
            Drag-and-drop flow editor, enterprise RAG, and multi-agent orchestration — deploy in minutes, not months.
          </p>
          <ul style={{ marginTop: "2.25rem", display: "flex", flexDirection: "column", gap: "0.875rem" }}>
            {POINTS.map((p) => (
              <li key={p} className="flex items-center gap-3 text-sm" style={{ color: "#D8CFBF" }}>
                <span className="flex items-center justify-center rounded-full" style={{ width: "1.375rem", height: "1.375rem", background: "#2A1206", color: "#F47C3F", flexShrink: 0 }}>
                  <Check style={{ width: "0.8125rem", height: "0.8125rem" }} />
                </span>
                {p}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs" style={{ color: "#6E665D" }}>Apache 2.0 · Open source · MCP-ready</p>
      </aside>

      {/* Form side */}
      <main className="flex flex-1 items-center justify-center px-4" style={{ paddingTop: "2.5rem", paddingBottom: "2.5rem" }}>
        {children}
      </main>
    </div>
  );
}
