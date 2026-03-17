"use client";

/**
 * AgentWizard — 3-step guided agent creation dialog
 *
 * Step 1 — Choose:    Pick a template or start blank
 * Step 2 — Configure: Name, description, model, system prompt
 * Step 3 — Review:    Summary before creating
 */

import { useState } from "react";
import { Check, Bot, LayoutTemplate, ChevronRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TemplateGallery,
  type AgentTemplate,
} from "@/components/templates/template-gallery";
import { ALL_MODELS } from "@/lib/models";
import templateData from "@/data/agent-templates.json";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WizardResult {
  name: string;
  description: string;
  systemPrompt: string;
  model: string;
  /** Template ID — if set, a starter flow will be applied after agent creation. */
  templateId?: string;
}

interface AgentWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: WizardResult) => Promise<void>;
  isSubmitting?: boolean;
}

type Step = 1 | 2 | 3;

const TIER_LABELS: Record<string, string> = {
  fast: "⚡ Fast",
  balanced: "⚖️ Balanced",
  powerful: "🧠 Powerful",
};

const STEP_LABELS: Record<Step, string> = {
  1: "Choose",
  2: "Configure",
  3: "Review",
};

const DEFAULT_MODEL = "deepseek-chat";
const DEFAULT_SYSTEM_PROMPT = "You are a helpful assistant.";

// ---------------------------------------------------------------------------
// Step indicator
// ---------------------------------------------------------------------------

function StepIndicator({ current }: { current: Step }) {
  const steps: Step[] = [1, 2, 3];
  return (
    <nav aria-label="Wizard steps" className="flex items-center gap-0 mb-6">
      {steps.map((step, idx) => {
        const isDone = step < current;
        const isActive = step === current;
        return (
          <div key={step} className="flex items-center gap-0">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                  isDone
                    ? "bg-primary text-primary-foreground"
                    : isActive
                      ? "bg-primary/20 text-primary ring-2 ring-primary ring-offset-1 ring-offset-background"
                      : "bg-muted text-muted-foreground"
                )}
                aria-current={isActive ? "step" : undefined}
              >
                {isDone ? <Check className="size-3" aria-hidden="true" /> : step}
              </div>
              <span
                className={cn(
                  "text-xs font-medium",
                  isActive ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {STEP_LABELS[step]}
              </span>
            </div>
            {idx < steps.length - 1 && (
              <ChevronRight className="mx-2 size-3.5 text-muted-foreground/40" aria-hidden="true" />
            )}
          </div>
        );
      })}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — Choose template or blank
// ---------------------------------------------------------------------------

interface Step1Props {
  onSelectTemplate: (t: AgentTemplate) => void;
  onSelectBlank: () => void;
}

function Step1Choose({ onSelectTemplate, onSelectBlank }: Step1Props) {
  const [mode, setMode] = useState<"pick" | "browse">("pick");

  if (mode === "browse") {
    return (
      <div className="flex flex-col min-h-0 flex-1 overflow-hidden">
        <button
          onClick={() => setMode("pick")}
          className="mb-3 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 self-start"
        >
          ← Back
        </button>
        <div className="flex-1 min-h-0 overflow-hidden">
          <TemplateGallery
            templates={templateData.templates as AgentTemplate[]}
            categories={templateData.categories}
            onSelect={onSelectTemplate}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Blank */}
      <button
        onClick={onSelectBlank}
        className="group w-full flex items-start gap-4 rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-foreground/30 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted group-hover:bg-muted/80">
          <Bot className="size-5 text-muted-foreground" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Start blank</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Build from scratch with a clean system prompt
          </p>
        </div>
        <ChevronRight className="size-4 text-muted-foreground mt-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden="true" />
      </button>

      {/* Templates */}
      <button
        onClick={() => setMode("browse")}
        className="group w-full flex items-start gap-4 rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-foreground/30 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 group-hover:bg-primary/15">
          <LayoutTemplate className="size-5 text-primary" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">Browse templates</p>
            <Badge variant="secondary" className="text-xs px-1.5 py-0">
              {templateData.templates.length}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            112 pre-built agents across 18 categories — customer support, coding, research&nbsp;&amp;&nbsp;more
          </p>
        </div>
        <ChevronRight className="size-4 text-muted-foreground mt-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden="true" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — Configure
// ---------------------------------------------------------------------------

interface Step2Props {
  template: AgentTemplate | null;
  name: string;
  setName: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  model: string;
  setModel: (v: string) => void;
  systemPrompt: string;
  setSystemPrompt: (v: string) => void;
}

function Step2Configure({
  template,
  name,
  setName,
  description,
  setDescription,
  model,
  setModel,
  systemPrompt,
  setSystemPrompt,
}: Step2Props) {
  const tiers = ["fast", "balanced", "powerful"] as const;

  return (
    <div className="space-y-5">
      {/* Template badge */}
      {template && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
          <span className="text-base leading-none">{template.emoji}</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate">{template.name}</p>
            <p className="text-xs text-muted-foreground truncate">{template.vibe}</p>
          </div>
          <Badge variant="secondary" className="text-xs shrink-0">Template</Badge>
        </div>
      )}

      {/* Name */}
      <div className="space-y-1.5">
        <Label htmlFor="wizard-name" className="text-xs font-medium">
          Name <span className="text-destructive">*</span>
        </Label>
        <Input
          id="wizard-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My Agent"
          className="text-sm"
          autoFocus
        />
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <Label htmlFor="wizard-desc" className="text-xs font-medium text-muted-foreground">
          Description
        </Label>
        <Textarea
          id="wizard-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What does this agent do?"
          rows={2}
          className="text-sm resize-none"
        />
      </div>

      {/* Model */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground">Model</Label>
        <Select value={model} onValueChange={setModel}>
          <SelectTrigger className="text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {tiers.map((tier) => {
              const group = ALL_MODELS.filter((m) => m.tier === tier);
              if (group.length === 0) return null;
              return (
                <SelectGroup key={tier}>
                  <SelectLabel className="text-xs text-muted-foreground">
                    {TIER_LABELS[tier]}
                  </SelectLabel>
                  {group.map((m) => (
                    <SelectItem key={m.id} value={m.id} className="text-xs">
                      {m.name}
                      <span className="ml-1 text-muted-foreground opacity-60">
                        ({m.provider})
                      </span>
                    </SelectItem>
                  ))}
                </SelectGroup>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      {/* System prompt */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="wizard-prompt" className="text-xs font-medium text-muted-foreground">
            System Prompt
          </Label>
          {template && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Sparkles className="size-3" aria-hidden="true" />
              Pre-filled from template
            </span>
          )}
        </div>
        <Textarea
          id="wizard-prompt"
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          placeholder="You are a helpful assistant."
          rows={5}
          className="text-xs font-mono resize-none"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — Review
// ---------------------------------------------------------------------------

interface Step3Props {
  template: AgentTemplate | null;
  name: string;
  description: string;
  model: string;
  systemPrompt: string;
}

function Step3Review({ template, name, description, model, systemPrompt }: Step3Props) {
  const modelMeta = ALL_MODELS.find((m) => m.id === model);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Review your agent configuration before creating.
      </p>

      <dl className="divide-y divide-border rounded-xl border border-border overflow-hidden">
        <div className="flex items-start gap-3 px-4 py-3">
          <dt className="w-28 shrink-0 text-xs text-muted-foreground pt-0.5">Starting point</dt>
          <dd className="flex-1 text-sm">
            {template
              ? <span className="flex items-center gap-1.5">
                  <span>{template.emoji}</span>
                  <span className="font-medium">{template.name}</span>
                </span>
              : <span className="text-muted-foreground">Blank agent</span>
            }
          </dd>
        </div>

        <div className="flex items-start gap-3 px-4 py-3">
          <dt className="w-28 shrink-0 text-xs text-muted-foreground pt-0.5">Name</dt>
          <dd className="flex-1 text-sm font-medium">{name}</dd>
        </div>

        {description && (
          <div className="flex items-start gap-3 px-4 py-3">
            <dt className="w-28 shrink-0 text-xs text-muted-foreground pt-0.5">Description</dt>
            <dd className="flex-1 text-sm text-muted-foreground">{description}</dd>
          </div>
        )}

        <div className="flex items-start gap-3 px-4 py-3">
          <dt className="w-28 shrink-0 text-xs text-muted-foreground pt-0.5">Model</dt>
          <dd className="flex-1">
            <span className="text-sm font-medium">{modelMeta?.name ?? model}</span>
            {modelMeta && (
              <Badge variant="outline" className="ml-2 text-xs py-0">
                {TIER_LABELS[modelMeta.tier]}
              </Badge>
            )}
          </dd>
        </div>

        <div className="flex items-start gap-3 px-4 py-3">
          <dt className="w-28 shrink-0 text-xs text-muted-foreground pt-0.5">System prompt</dt>
          <dd className="flex-1 text-xs font-mono text-muted-foreground line-clamp-3 whitespace-pre-wrap">
            {systemPrompt || "(default)"}
          </dd>
        </div>
      </dl>

      <p className="text-xs text-muted-foreground">
        You can edit all settings in the flow builder after creation.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main wizard
// ---------------------------------------------------------------------------

export function AgentWizard({ open, onOpenChange, onSubmit, isSubmitting = false }: AgentWizardProps) {
  const [step, setStep] = useState<Step>(1);
  const [template, setTemplate] = useState<AgentTemplate | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);

  function reset() {
    setStep(1);
    setTemplate(null);
    setName("");
    setDescription("");
    setModel(DEFAULT_MODEL);
    setSystemPrompt(DEFAULT_SYSTEM_PROMPT);
  }

  function handleOpenChange(o: boolean) {
    if (!o) reset();
    onOpenChange(o);
  }

  function handleSelectTemplate(t: AgentTemplate) {
    setTemplate(t);
    setName(t.name);
    setDescription(t.description ?? "");
    setSystemPrompt(t.systemPrompt ?? DEFAULT_SYSTEM_PROMPT);
    setStep(2);
  }

  function handleSelectBlank() {
    setTemplate(null);
    setName("");
    setDescription("");
    setSystemPrompt(DEFAULT_SYSTEM_PROMPT);
    setStep(2);
  }

  async function handleCreate() {
    await onSubmit({ name, description, model, systemPrompt, templateId: template?.id });
    reset();
  }

  const canAdvance = step === 1
    ? false // step 1 advances via button click
    : step === 2
      ? name.trim().length > 0
      : true;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn(
          "flex flex-col overflow-hidden",
          step === 1
            ? "sm:max-w-lg max-h-[90vh]"
            : step === 2
              ? "sm:max-w-lg max-h-[90vh]"
              : "sm:max-w-md max-h-[90vh]"
        )}
        aria-describedby={undefined}
      >
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-base font-semibold">New Agent</DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <StepIndicator current={step} />

        {/* Step content */}
        <div className={cn("flex-1 overflow-y-auto", step === 1 && "min-h-0 flex flex-col")}>
          {step === 1 && (
            <Step1Choose
              onSelectTemplate={handleSelectTemplate}
              onSelectBlank={handleSelectBlank}
            />
          )}
          {step === 2 && (
            <Step2Configure
              template={template}
              name={name}
              setName={setName}
              description={description}
              setDescription={setDescription}
              model={model}
              setModel={setModel}
              systemPrompt={systemPrompt}
              setSystemPrompt={setSystemPrompt}
            />
          )}
          {step === 3 && (
            <Step3Review
              template={template}
              name={name}
              description={description}
              model={model}
              systemPrompt={systemPrompt}
            />
          )}
        </div>

        {/* Footer navigation */}
        {step > 1 && (
          <div className="flex items-center justify-between gap-2 pt-4 border-t shrink-0 mt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setStep((s) => (s - 1) as Step)}
              disabled={isSubmitting}
            >
              Back
            </Button>

            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>

              {step === 2 ? (
                <Button
                  size="sm"
                  onClick={() => setStep(3)}
                  disabled={!canAdvance}
                >
                  Review
                  <ChevronRight className="ml-1 size-3.5" aria-hidden="true" />
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={handleCreate}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Creating…" : "Create Agent"}
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
