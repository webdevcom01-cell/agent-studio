"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ArrowRight, Bot, CheckCircle2, Database, MessageSquare, Sparkles } from "lucide-react";

const STEPS = [
  {
    title: "Name your first agent",
    description: "Give your AI agent a name and a short description of what it does.",
    icon: Bot,
  },
  {
    title: "Choose a template",
    description: "Start from a template or build from scratch.",
    icon: Sparkles,
  },
  {
    title: "Add knowledge",
    description: "Paste a URL or some text to give your agent context.",
    icon: Database,
  },
  {
    title: "Chat with your agent",
    description: "Test it out! Send a message and see how it responds.",
    icon: MessageSquare,
  },
];

const TEMPLATES = [
  { id: "customer-support", name: "Customer Support", description: "Answer FAQ and route tickets" },
  { id: "research-assistant", name: "Research Assistant", description: "Search the web and summarize findings" },
  { id: "code-reviewer", name: "Code Reviewer", description: "Review PRs for quality and security" },
  { id: "blank", name: "Start from scratch", description: "Empty agent — build your own flow" },
];

export default function OnboardingPage(): React.ReactElement {
  const router = useRouter();
  const { update } = useSession();

  const [step, setStep] = useState(0);
  const [agentName, setAgentName] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [agentId, setAgentId] = useState<string | null>(null);
  const [knowledgeUrl, setKnowledgeUrl] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isAddingKnowledge, setIsAddingKnowledge] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);

  async function handleCreate(): Promise<void> {
    setIsCreating(true);
    try {
      const template = TEMPLATES.find((t) => t.id === selectedTemplate);

      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: agentName || "My First Agent",
          description: template?.description ?? "",
          systemPrompt:
            selectedTemplate === "blank"
              ? ""
              : `You are a ${template?.name ?? "helpful assistant"}. ${template?.description ?? ""}`,
        }),
      });

      const data = (await res.json()) as { success: boolean; data?: { id: string } };

      if (data.success && data.data?.id) {
        setAgentId(data.data.id);
        setStep(2);
      }
    } finally {
      setIsCreating(false);
    }
  }

  async function handleAddKnowledge(): Promise<void> {
    if (!agentId || !knowledgeUrl.trim()) {
      setStep(3);
      return;
    }

    setIsAddingKnowledge(true);
    try {
      await fetch(`/api/agents/${agentId}/knowledge/sources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: knowledgeUrl,
          type: "URL",
          url: knowledgeUrl,
        }),
      });
    } finally {
      setIsAddingKnowledge(false);
      setStep(3);
    }
  }

  async function handleFinish(): Promise<void> {
    if (!agentId) return;
    setIsFinishing(true);
    try {
      await fetch("/api/user/complete-onboarding", { method: "POST" });
      await update();
      router.push(`/builder/${agentId}`);
    } catch {
      router.push(`/builder/${agentId}`);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-xl">
        {/* Progress indicator */}
        <div className="flex gap-2 mb-8 justify-center">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 w-12 rounded-full transition-colors ${
                i <= step ? "bg-primary" : "bg-muted"
              }`}
            />
          ))}
        </div>

        <Card>
          <CardContent className="p-8">
            {step === 0 && (
              <div className="space-y-6">
                <div className="text-center">
                  <Bot className="size-12 mx-auto mb-4 text-primary" />
                  <h1 className="text-2xl font-bold mb-2">Create your first agent</h1>
                  <p className="text-muted-foreground">It takes less than 5 minutes</p>
                </div>
                <div className="space-y-2">
                  <Input
                    value={agentName}
                    onChange={(e) => setAgentName(e.target.value)}
                    placeholder="e.g. Customer Support Bot"
                    className="text-lg h-12"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && agentName.trim()) setStep(1);
                    }}
                  />
                </div>
                <Button
                  className="w-full h-11"
                  onClick={() => setStep(1)}
                  disabled={!agentName.trim()}
                >
                  Continue <ArrowRight className="ml-2 size-4" />
                </Button>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-6">
                <div className="text-center">
                  <Sparkles className="size-12 mx-auto mb-4 text-primary" />
                  <h1 className="text-2xl font-bold mb-2">Choose a starting point</h1>
                  <p className="text-muted-foreground">You can customize everything later</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {TEMPLATES.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setSelectedTemplate(t.id)}
                      className={`p-4 rounded-lg border text-left transition-colors ${
                        selectedTemplate === t.id
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-muted-foreground/30"
                      }`}
                    >
                      <p className="font-medium text-sm">{t.name}</p>
                      <p className="text-xs text-muted-foreground mt-1">{t.description}</p>
                    </button>
                  ))}
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setStep(0)} className="flex-1">
                    Back
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={handleCreate}
                    disabled={!selectedTemplate || isCreating}
                  >
                    {isCreating ? "Creating..." : "Create Agent"}
                    <ArrowRight className="ml-2 size-4" />
                  </Button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-6">
                <div className="text-center">
                  <Database className="size-12 mx-auto mb-4 text-primary" />
                  <h1 className="text-2xl font-bold mb-2">Add knowledge</h1>
                  <p className="text-muted-foreground">
                    Give your agent a URL to learn from. You can add more later.
                  </p>
                </div>
                <Input
                  value={knowledgeUrl}
                  onChange={(e) => setKnowledgeUrl(e.target.value)}
                  placeholder="https://your-website.com/docs"
                  className="h-12"
                  type="url"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && knowledgeUrl.trim()) handleAddKnowledge();
                  }}
                />
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setStep(3)}
                    className="flex-1"
                    disabled={isAddingKnowledge}
                  >
                    Skip
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={handleAddKnowledge}
                    disabled={!knowledgeUrl.trim() || isAddingKnowledge}
                  >
                    {isAddingKnowledge ? "Adding..." : "Add & Continue"}
                    <ArrowRight className="ml-2 size-4" />
                  </Button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-6">
                <div className="text-center">
                  <div className="relative inline-flex mb-4">
                    <MessageSquare className="size-12 text-primary" />
                    <CheckCircle2 className="size-5 text-green-500 absolute -bottom-1 -right-1 bg-background rounded-full" />
                  </div>
                  <h1 className="text-2xl font-bold mb-2">Your agent is ready!</h1>
                  <p className="text-muted-foreground">
                    <span className="text-foreground font-medium">{agentName || "Your agent"}</span>
                    {" "}has been created and is ready to use.
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
                    Agent
                  </p>
                  <p className="font-semibold text-foreground">{agentName || "My First Agent"}</p>
                  {knowledgeUrl && (
                    <>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium pt-1">
                        Knowledge source
                      </p>
                      <p className="text-sm text-muted-foreground truncate">{knowledgeUrl}</p>
                    </>
                  )}
                </div>
                <Button
                  className="w-full h-11"
                  onClick={handleFinish}
                  disabled={isFinishing}
                >
                  {isFinishing ? "Opening..." : "Open in Builder"}
                  <ArrowRight className="ml-2 size-4" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
