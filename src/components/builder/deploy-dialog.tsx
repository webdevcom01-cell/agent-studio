"use client";

import { useState } from "react";
import { Rocket, Play, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";

interface DeployDialogProps {
  agentId: string;
  versionId: string;
  onClose: () => void;
  onDeployed: () => void;
}

interface TestResult {
  messages: { role: string; content: string }[];
}

export function DeployDialog({
  agentId,
  versionId,
  onClose,
  onDeployed,
}: DeployDialogProps) {
  const [note, setNote] = useState("");
  const [isDeploying, setIsDeploying] = useState(false);

  const [testInput, setTestInput] = useState("");
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);

  async function handleTest(): Promise<void> {
    if (!testInput.trim()) return;
    setIsTesting(true);
    setTestResult(null);
    setTestError(null);

    try {
      const res = await fetch(
        `/api/agents/${agentId}/flow/versions/${versionId}/test`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input: testInput }),
        }
      );
      const json = await res.json();
      if (json.success) {
        setTestResult(json.data);
      } else {
        setTestError(json.error || "Test failed");
      }
    } catch {
      setTestError("Test execution failed");
    } finally {
      setIsTesting(false);
    }
  }

  async function handleDeploy(): Promise<void> {
    setIsDeploying(true);
    try {
      const res = await fetch(
        `/api/agents/${agentId}/flow/versions/${versionId}/deploy`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ note: note || undefined }),
        }
      );
      const json = await res.json();
      if (json.success) {
        toast.success("Version deployed successfully");
        onDeployed();
      } else {
        toast.error(json.error || "Deploy failed");
      }
    } catch {
      toast.error("Deploy failed");
    } finally {
      setIsDeploying(false);
    }
  }

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="size-4" />
            Deploy Version
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Deploy Note (optional)</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What changed in this version?"
              rows={2}
            />
          </div>

          <div className="rounded-md border p-3">
            <Label className="mb-2 block text-xs font-medium text-muted-foreground">
              Test before deploy
            </Label>
            <div className="flex gap-2">
              <Input
                value={testInput}
                onChange={(e) => setTestInput(e.target.value)}
                placeholder="Type a test message..."
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleTest();
                }}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={handleTest}
                disabled={isTesting || !testInput.trim()}
              >
                <Play className="mr-1 size-3.5" />
                {isTesting ? "Running..." : "Test"}
              </Button>
            </div>

            {testResult && (
              <div className="mt-3 rounded border border-emerald-500/30 bg-emerald-500/5 p-2">
                <div className="mb-1 flex items-center gap-1 text-xs font-medium text-emerald-400">
                  <CheckCircle2 className="size-3" />
                  Test passed
                </div>
                {testResult.messages.map((m, i) => (
                  <p key={i} className="text-xs text-muted-foreground">
                    {m.content}
                  </p>
                ))}
              </div>
            )}

            {testError && (
              <div className="mt-3 rounded border border-red-500/30 bg-red-500/5 p-2">
                <div className="flex items-center gap-1 text-xs font-medium text-red-400">
                  <AlertCircle className="size-3" />
                  {testError}
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleDeploy} disabled={isDeploying}>
            <Rocket className="mr-1.5 size-4" />
            {isDeploying ? "Deploying..." : "Deploy"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
