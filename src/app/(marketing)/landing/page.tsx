import Link from "next/link";
import { Bot, Workflow, Database, Shield, Zap, Globe } from "lucide-react";

const FEATURES = [
  { icon: Workflow, title: "Visual Flow Editor", description: "Drag-and-drop builder with 70+ node types" },
  { icon: Database, title: "Enterprise RAG", description: "5 chunking strategies, hybrid search, pgvector" },
  { icon: Bot, title: "Multi-Agent Orchestration", description: "Agent-to-agent communication via A2A protocol" },
  { icon: Shield, title: "Built-in Safety", description: "Guardrails, PII detection, injection blocking" },
  { icon: Zap, title: "MCP Integration", description: "Connect any tool server via Model Context Protocol" },
  { icon: Globe, title: "Embeddable Widget", description: "Drop-in chat for any website with one script tag" },
];

const STATS = [
  { value: "70+", label: "node types" },
  { value: "250", label: "templates" },
  { value: "MCP", label: "ready" },
  { value: "A2A v0.3", label: "agent-to-agent" },
];

const PLANS = [
  { name: "Free", price: "$0", features: ["3 agents", "1,000 messages/mo", "Community support"] },
  { name: "Pro", price: "$29/mo", features: ["Unlimited agents", "100K messages/mo", "Priority support", "Custom domain"], highlighted: true },
  { name: "Team", price: "$99/mo", features: ["Everything in Pro", "5 team members", "SSO", "Audit logs", "SLA"] },
];

const brandSubtle = { background: "hsl(var(--brand-subtle))", color: "hsl(var(--brand-subtle-foreground))" } as const;

export default function LandingPage(): React.ReactElement {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <style>{`
        .lp-btn { transition: transform .18s ease, background-color .18s ease, color .18s ease, border-color .18s ease, box-shadow .18s ease; will-change: transform; }
        .lp-btn:active { transform: translateY(0) !important; box-shadow: none !important; }
        .lp-btn-primary { background: hsl(var(--primary)); color: #fff; }
        .lp-btn-primary:hover { transform: translateY(-2px); background: hsl(var(--primary) / .92); box-shadow: 0 10px 24px -8px hsl(var(--primary) / .55); }
        .lp-btn-outline { background: transparent; color: hsl(var(--foreground)); border: 1px solid hsl(var(--border)); }
        .lp-btn-outline:hover { transform: translateY(-2px); background: hsl(var(--primary)); color: #fff; border-color: hsl(var(--primary)); box-shadow: 0 10px 24px -8px hsl(var(--primary) / .45); }
        .lp-link { transition: color .18s ease; }
      `}</style>
      {/* Header */}
      <header className="border-b border-border">
        <div className="container mx-auto flex max-w-6xl items-center justify-between px-4" style={{ height: "4.25rem" }}>
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center rounded-md bg-primary text-primary-foreground" style={{ width: "1.75rem", height: "1.75rem" }}>
              <Bot style={{ width: "1rem", height: "1rem" }} />
            </span>
            <span className="text-lg font-semibold tracking-tight">Agent Studio</span>
          </div>
          <div className="flex items-center gap-1">
            <Link href="/login" className="lp-link rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
              Log in
            </Link>
            <Link href="/login" className="lp-btn lp-btn-primary rounded-md px-4 py-2 text-sm font-medium">
              Get started free
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="container mx-auto max-w-4xl px-4 text-center" style={{ paddingTop: "clamp(4.5rem, 9vw, 8.5rem)", paddingBottom: "clamp(4.5rem, 9vw, 8.5rem)" }}>
        <span className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium" style={brandSubtle}>
          <span className="rounded-full bg-primary" style={{ width: "0.375rem", height: "0.375rem" }} aria-hidden="true" />
          Visual AI agent builder
        </span>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl" style={{ marginTop: "2rem", lineHeight: 1.1 }}>
          Build production AI agents visually
        </h1>
        <p className="mx-auto max-w-2xl text-lg text-muted-foreground" style={{ marginTop: "1.5rem", lineHeight: 1.7 }}>
          Drag-and-drop flow editor. Enterprise RAG pipeline. Multi-agent orchestration.
          Deploy to production in minutes, not months.
        </p>
        <div className="flex flex-wrap justify-center gap-3" style={{ marginTop: "2.5rem" }}>
          <Link href="/login" className="lp-btn lp-btn-primary rounded-md px-6 py-3 text-sm font-medium">
            Start building free
          </Link>
          <Link href="/templates" className="lp-btn lp-btn-outline rounded-md px-6 py-3 text-sm font-medium">
            Browse templates
          </Link>
        </div>
        <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-center divide-x divide-border" style={{ marginTop: "4rem" }}>
          {STATS.map((s) => (
            <div key={s.label} className="text-center" style={{ paddingLeft: "2rem", paddingRight: "2rem" }}>
              <div className="text-2xl font-bold">{s.value}</div>
              <div className="font-mono text-xs text-muted-foreground" style={{ marginTop: "0.375rem" }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-border" style={{ paddingTop: "clamp(4rem, 8vw, 7rem)", paddingBottom: "clamp(4rem, 8vw, 7rem)" }}>
        <div className="container mx-auto max-w-5xl px-4">
          <h2 className="text-center text-2xl font-bold" style={{ marginBottom: "3.5rem" }}>Everything you need</h2>
          <div className="grid grid-cols-1 md:grid-cols-3" style={{ gap: "1.5rem" }}>
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-xl border border-border bg-card transition-colors hover:bg-accent" style={{ padding: "1.5rem" }}>
                <span className="flex items-center justify-center rounded-lg" style={{ width: "2.5rem", height: "2.5rem", ...brandSubtle }}>
                  <f.icon style={{ width: "1.25rem", height: "1.25rem" }} />
                </span>
                <h3 className="font-semibold" style={{ marginTop: "1rem" }}>{f.title}</h3>
                <p className="text-sm text-muted-foreground" style={{ marginTop: "0.5rem", lineHeight: 1.6 }}>{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="border-t border-border" style={{ paddingTop: "clamp(4rem, 8vw, 7rem)", paddingBottom: "clamp(4rem, 8vw, 7rem)" }}>
        <div className="container mx-auto max-w-5xl px-4">
          <h2 className="text-center text-2xl font-bold" style={{ marginBottom: "0.75rem" }}>Simple pricing</h2>
          <p className="text-center text-muted-foreground" style={{ marginBottom: "3.5rem" }}>Start free. Scale as you grow.</p>
          <div className="grid grid-cols-1 md:grid-cols-3" style={{ gap: "1.5rem" }}>
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className={`rounded-xl border bg-card ${plan.highlighted ? "border-primary ring-1 ring-primary" : "border-border"}`}
                style={{ padding: "1.5rem" }}
              >
                <h3 className="text-lg font-semibold">{plan.name}</h3>
                <p className="text-3xl font-bold" style={{ marginTop: "0.75rem", marginBottom: "0.75rem" }}>{plan.price}</p>
                <ul className="text-sm text-muted-foreground" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <span className="text-primary" aria-hidden="true">&#10003;</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/login"
                  className={`lp-btn block rounded-md py-2 text-center text-sm font-medium ${
                    plan.highlighted ? "lp-btn-primary" : "lp-btn-outline"
                  }`}
                  style={{ marginTop: "1.5rem" }}
                >
                  {plan.name === "Free" ? "Get started" : "Coming soon"}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border" style={{ paddingTop: "2.5rem", paddingBottom: "2.5rem" }}>
        <div className="container mx-auto flex max-w-5xl items-center justify-between px-4 text-sm text-muted-foreground">
          <p>Agent Studio Contributors. Apache License 2.0.</p>
          <div className="flex gap-4">
            <Link href="/docs" className="transition-colors hover:text-foreground">Docs</Link>
            <a href="https://github.com/webdevcom01-cell/agent-studio" className="transition-colors hover:text-foreground">GitHub</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
