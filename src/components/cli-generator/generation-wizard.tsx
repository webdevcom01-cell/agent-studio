"use client";

import { useState, useCallback } from "react";
import { ArrowLeft, ArrowRight, Loader2, Terminal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AppSelector } from "./app-selector";
import { getDesktopApp } from "@/lib/constants/desktop-apps";

const WIZARD_STEPS = [
  { title: "Select Application", description: "Choose the app to create a CLI bridge for" },
  { title: "Configure", description: "Set capabilities and platform" },
  { title: "Review & Start", description: "Confirm settings and start generation" },
] as const;

const STEP_COUNT = WIZARD_STEPS.length;

export interface GenerationWizardResult {
  applicationName: string;
  description: string;
  capabilities: string[];
  platform: string;
  /** Target runtime for the generated MCP bridge. */
  target: "python" | "typescript";
}

interface GenerationWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: GenerationWizardResult) => void;
  isSubmitting: boolean;
}

export function GenerationWizard({
  open,
  onOpenChange,
  onSubmit,
  isSubmitting,
}: GenerationWizardProps): React.JSX.Element {
  const [step, setStep] = useState(0);
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [customAppName, setCustomAppName] = useState("");
  const [description, setDescription] = useState("");
  const [capabilities, setCapabilities] = useState("");
  const [platform, setPlatform] = useState("cross-platform");
  const [target, setTarget] = useState<"python" | "typescript">("python");

  const appName = selectedAppId
    ? (getDesktopApp(selectedAppId)?.label ?? selectedAppId)
    : customAppName;

  const isStep0Valid = Boolean(selectedAppId || customAppName.trim());
  const isStep1Valid = Boolean(appName);

  const handleReset = useCallback((): void => {
    setStep(0);
    setSelectedAppId(null);
    setCustomAppName("");
    setDescription("");
    setCapabilities("");
    setPlatform("cross-platform");
    setTarget("python");
  }, []);

  function handleOpenChange(nextOpen: boolean): void {
    if (!nextOpen) handleReset();
    onOpenChange(nextOpen);
  }

  function handleNext(): void {
    if (step < STEP_COUNT - 1) setStep(step + 1);
  }

  function handleBack(): void {
    if (step > 0) setStep(step - 1);
  }

  function handleSubmit(): void {
    const selectedApp = selectedAppId ? getDesktopApp(selectedAppId) : null;
    const caps = selectedApp
      ? selectedApp.capabilities.map((c) => c.id)
      : capabilities
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);

    onSubmit({
      applicationName: appName,
      description: description || `CLI bridge for ${appName}`,
      capabilities: caps,
      platform,
      target,
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Terminal className="size-4" />
            Generate CLI Bridge
          </DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-4">
          {WIZARD_STEPS.map(({ title }, i) => (
            <div key={title} className="flex items-center gap-2 flex-1">
              <div
                className={`size-6 rounded-full flex items-center justify-center text-xs font-medium ${
                  i <= step
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {i + 1}
              </div>
              {i < STEP_COUNT - 1 && (
                <div
                  className={`flex-1 h-px ${
                    i < step ? "bg-primary" : "bg-border"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        <p className="text-xs text-muted-foreground mb-4">
          {WIZARD_STEPS[step].description}
        </p>

        {/* Step 0 — Select App */}
        {step === 0 && (
          <div className="flex flex-col gap-4">
            <AppSelector
              selectedApp={selectedAppId}
              onSelect={(id) => {
                setSelectedAppId(id);
                setCustomAppName("");
              }}
            />
            <div>
              <Label className="text-xs">Custom Application Name</Label>
              <Input
                value={customAppName}
                onChange={(e) => {
                  setCustomAppName(e.target.value);
                  if (e.target.value.trim()) setSelectedAppId(null);
                }}
                placeholder="e.g. MyApp"
                className="mt-1 h-8 text-sm"
              />
            </div>
          </div>
        )}

        {/* Step 1 — Configure */}
        {step === 1 && (
          <div className="flex flex-col gap-4">
            <div>
              <Label className="text-xs">Language / Runtime</Label>
              <div className="flex gap-2 mt-1">
                {(["python", "typescript"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTarget(t)}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-xs font-medium transition-colors",
                      target === t
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-muted/30 text-muted-foreground hover:border-primary/50",
                    )}
                  >
                    <span className="font-mono text-sm">{t === "python" ? "🐍" : "⬡"}</span>
                    {t === "python" ? "Python (FastMCP)" : "TypeScript (Node.js)"}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-xs">Description</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={`Describe what the ${appName} CLI bridge should do...`}
                rows={3}
                className="mt-1 text-sm"
              />
            </div>

            {!selectedAppId && (
              <div>
                <Label className="text-xs">Capabilities (comma-separated)</Label>
                <Input
                  value={capabilities}
                  onChange={(e) => setCapabilities(e.target.value)}
                  placeholder="e.g. render, export, convert"
                  className="mt-1 h-8 text-sm"
                />
              </div>
            )}

            {selectedAppId && (
              <div>
                <Label className="text-xs">Detected Capabilities</Label>
                <div className="flex flex-wrap gap-1 mt-1">
                  {getDesktopApp(selectedAppId)?.capabilities.map((cap) => (
                    <span
                      key={cap.id}
                      className="text-[10px] bg-muted px-2 py-0.5 rounded-full text-muted-foreground"
                    >
                      {cap.id}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div>
              <Label className="text-xs">Platform</Label>
              <Select value={platform} onValueChange={setPlatform}>
                <SelectTrigger className="mt-1 h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cross-platform">Cross-platform</SelectItem>
                  <SelectItem value="linux">Linux</SelectItem>
                  <SelectItem value="macos">macOS</SelectItem>
                  <SelectItem value="windows">Windows</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Step 2 — Review */}
        {step === 2 && (
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-4">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Application</span>
              <span className="font-medium">{appName}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Language</span>
              <span className="font-medium">
                {target === "python" ? "🐍 Python (FastMCP)" : "⬡ TypeScript (Node.js)"}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Platform</span>
              <span className="font-medium">{platform}</span>
            </div>
            {description && (
              <div className="text-sm">
                <span className="text-muted-foreground">Description</span>
                <p className="text-xs mt-1 text-foreground">{description}</p>
              </div>
            )}
            {selectedAppId && (
              <div className="text-sm">
                <span className="text-muted-foreground">Capabilities</span>
                <p className="text-xs mt-1 text-foreground">
                  {getDesktopApp(selectedAppId)
                    ?.capabilities.map((c) => c.id)
                    .join(", ")}
                </p>
              </div>
            )}
            {!selectedAppId && capabilities && (
              <div className="text-sm">
                <span className="text-muted-foreground">Capabilities</span>
                <p className="text-xs mt-1 text-foreground">{capabilities}</p>
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBack}
            disabled={step === 0}
            className="gap-1"
          >
            <ArrowLeft className="size-3" />
            Back
          </Button>

          {step < STEP_COUNT - 1 ? (
            <Button
              size="sm"
              onClick={handleNext}
              disabled={step === 0 ? !isStep0Valid : !isStep1Valid}
              className="gap-1"
            >
              Next
              <ArrowRight className="size-3" />
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="gap-1"
            >
              {isSubmitting ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Terminal className="size-3" />
              )}
              Start Generation
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
