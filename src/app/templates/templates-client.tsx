"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  TemplateGallery,
  type AgentTemplate,
} from "@/components/templates/template-gallery";

interface TemplatesPageClientProps {
  templates: AgentTemplate[];
  categories: string[];
}

export function TemplatesPageClient({
  templates,
  categories,
}: TemplatesPageClientProps): React.JSX.Element {
  const router = useRouter();

  async function handleSelect(template: AgentTemplate): Promise<void> {
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: template.name,
          description: template.description,
          systemPrompt: template.systemPrompt,
        }),
      });
      const json = await res.json();
      if (json.success) {
        router.push(`/builder/${json.data.id}`);
      } else {
        toast.error(json.error || "Failed to create agent");
      }
    } catch {
      toast.error("Failed to create agent");
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/90 backdrop-blur-sm">
        <div className="mx-auto max-w-5xl px-6 h-14 flex items-center gap-4">
          <Button variant="ghost" size="icon-sm" asChild>
            <Link href="/">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <span className="text-sm font-medium">Agent Templates</span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-light tracking-tight text-foreground">
            Choose a Template
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Start with a pre-built agent or{" "}
            <Link href="/" className="underline underline-offset-2 hover:text-foreground">
              create a blank one
            </Link>
          </p>
        </div>

        <TemplateGallery
          templates={templates}
          categories={categories}
          onSelect={handleSelect}
        />
      </main>
    </div>
  );
}
