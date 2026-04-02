"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ArrowRight, Bot, Database, MessageSquare, Sparkles } from "lucide-react";

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
  const [step, setStep] = useState(0);
  const [agentName, setAgentName] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [isCreating, setIsCreating] = useState(false);

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
          systemPrompt: selectedTemplate === "blank"
            ? ""
            : `You are a ${template?.name ?? "helpful assistant"}. ${template?.description ?? ""}`,
        }),
      });

      const data = (await res.json()) as { success: boolean; data?: { id: string } };

      if (data.success && data.data?.id) {
        router.push(`/builder/${data.data.id}`);
      } else {
        router.push("/");
      }
    } catch {
      router.push("/");
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
                    onClick={() => handleCreate()}
                    disabled={!selectedTemplate || isCreating}
                  >
                    {isCreating ? "Creating..." : "Create Agent"}
                    <ArrowRight className="ml-2 size-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
