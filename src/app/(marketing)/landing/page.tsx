import Link from "next/link";
import { Bot, Workflow, Database, Shield, Zap, Globe } from "lucide-react";

const FEATURES = [
  { icon: Workflow, title: "Visual Flow Editor", description: "Drag-and-drop builder with 55+ node types" },
  { icon: Database, title: "Enterprise RAG", description: "5 chunking strategies, hybrid search, pgvector" },
  { icon: Bot, title: "Multi-Agent Orchestration", description: "Agent-to-agent communication via A2A protocol" },
  { icon: Shield, title: "Built-in Safety", description: "Guardrails, PII detection, injection blocking" },
  { icon: Zap, title: "MCP Integration", description: "Connect any tool server via Model Context Protocol" },
  { icon: Globe, title: "Embeddable Widget", description: "Drop-in chat for any website with one script tag" },
];

const PLANS = [
  { name: "Free", price: "$0", features: ["3 agents", "1,000 messages/mo", "Community support"] },
  { name: "Pro", price: "$29/mo", features: ["Unlimited agents", "100K messages/mo", "Priority support", "Custom domain"], highlighted: true },
  { name: "Team", price: "$99/mo", features: ["Everything in Pro", "5 team members", "SSO", "Audit logs", "SLA"] },
];

export default function LandingPage(): React.ReactElement {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Hero */}
      <header className="border-b">
        <div className="container mx-auto max-w-6xl flex items-center justify-between px-4 py-4">
          <h1 className="text-xl font-bold">Agent Studio</h1>
          <div className="flex gap-3">
            <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Log in
            </Link>
            <Link href="/login" className="text-sm bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 transition-colors">
              Get started free
            </Link>
          </div>
        </div>
      </header>

      <section className="container mx-auto max-w-4xl text-center py-24 px-4">
        <h2 className="text-4xl font-bold tracking-tight mb-6">
          Build production AI agents visually
        </h2>
        <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
          Drag-and-drop flow editor. Enterprise RAG pipeline. Multi-agent orchestration.
          Deploy to production in minutes, not months.
        </p>
        <div className="flex gap-4 justify-center">
          <Link href="/login" className="bg-primary text-primary-foreground px-6 py-3 rounded-md text-sm font-medium hover:bg-primary/90 transition-colors">
            Start building free
          </Link>
          <Link href="/templates" className="border px-6 py-3 rounded-md text-sm font-medium hover:bg-muted transition-colors">
            Browse templates
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="border-t py-20">
        <div className="container mx-auto max-w-5xl px-4">
          <h3 className="text-2xl font-bold text-center mb-12">Everything you need</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {FEATURES.map((f) => (
              <div key={f.title} className="space-y-3">
                <f.icon className="size-8 text-primary" />
                <h4 className="font-semibold">{f.title}</h4>
                <p className="text-sm text-muted-foreground">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="border-t py-20">
        <div className="container mx-auto max-w-5xl px-4">
          <h3 className="text-2xl font-bold text-center mb-4">Simple pricing</h3>
          <p className="text-center text-muted-foreground mb-12">Start free. Scale as you grow.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className={`rounded-xl border p-6 ${
                  plan.highlighted ? "border-primary ring-1 ring-primary" : ""
                }`}
              >
                <h4 className="font-semibold text-lg">{plan.name}</h4>
                <p className="text-3xl font-bold my-3">{plan.price}</p>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  {plan.features.map((f) => (
                    <li key={f}>&#10003; {f}</li>
                  ))}
                </ul>
                <Link
                  href="/login"
                  className={`block text-center mt-6 py-2 rounded-md text-sm font-medium transition-colors ${
                    plan.highlighted
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : "border hover:bg-muted"
                  }`}
                >
                  {plan.name === "Free" ? "Get started" : "Coming soon"}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="container mx-auto max-w-5xl px-4 flex items-center justify-between text-sm text-muted-foreground">
          <p>Agent Studio Contributors. Apache License 2.0.</p>
          <div className="flex gap-4">
            <Link href="/docs" className="hover:text-foreground">Docs</Link>
            <a href="https://github.com/webdevcom01-cell/agent-studio" className="hover:text-foreground">GitHub</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
