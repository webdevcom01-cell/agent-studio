"use client";

import { useEffect, useState } from "react";
import { Plus, Minus, Pencil } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { FlowDiff } from "@/lib/versioning/diff-engine";

interface DiffViewProps {
  agentId: string;
  versionId: string;
  compareWith?: string;
  onClose: () => void;
}

export function DiffView({
  agentId,
  versionId,
  compareWith,
  onClose,
}: DiffViewProps) {
  const [diff, setDiff] = useState<FlowDiff | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadDiff(): Promise<void> {
      try {
        const qs = compareWith ? `?compareWith=${compareWith}` : "";
        const res = await fetch(
          `/api/agents/${agentId}/flow/versions/${versionId}/diff${qs}`
        );
        const json = await res.json();
        if (json.success) {
          setDiff(json.data);
        }
      } catch {
        /* handled by null state */
      } finally {
        setIsLoading(false);
      }
    }
    loadDiff();
  }, [agentId, versionId, compareWith]);

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Version Diff</span>
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Loading diff...
          </div>
        ) : !diff ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Could not load diff
          </div>
        ) : (
          <div className="max-h-96 space-y-4 overflow-y-auto">
            <p className="text-sm font-medium">{diff.summary}</p>

            {diff.nodes.added.length > 0 && (
              <DiffSection
                icon={<Plus className="size-3.5 text-foreground/60" />}
                title="Added Nodes"
                className="border-border bg-muted/10"
              >
                {diff.nodes.added.map((n) => (
                  <div key={n.id} className="text-xs">
                    <span className="font-mono">{n.type}</span>
                    <span className="text-muted-foreground"> ({n.id})</span>
                  </div>
                ))}
              </DiffSection>
            )}

            {diff.nodes.removed.length > 0 && (
              <DiffSection
                icon={<Minus className="size-3.5 text-destructive" />}
                title="Removed Nodes"
                className="border-border bg-destructive/10"
              >
                {diff.nodes.removed.map((n) => (
                  <div key={n.id} className="text-xs">
                    <span className="font-mono">{n.type}</span>
                    <span className="text-muted-foreground"> ({n.id})</span>
                  </div>
                ))}
              </DiffSection>
            )}

            {diff.nodes.modified.length > 0 && (
              <DiffSection
                icon={<Pencil className="size-3.5 text-muted-foreground" />}
                title="Modified Nodes"
                className="border-border bg-muted/10"
              >
                {diff.nodes.modified.map((m) => (
                  <div key={m.after.id} className="text-xs">
                    <span className="font-mono">{m.after.type}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      — {m.changes.join(", ")}
                    </span>
                  </div>
                ))}
              </DiffSection>
            )}

            {diff.edges.added.length > 0 && (
              <DiffSection
                icon={<Plus className="size-3.5 text-foreground/60" />}
                title="Added Connections"
                className="border-border bg-muted/10"
              >
                {diff.edges.added.map((e) => (
                  <div key={e.id} className="text-xs text-muted-foreground">
                    {e.source} → {e.target}
                  </div>
                ))}
              </DiffSection>
            )}

            {diff.edges.removed.length > 0 && (
              <DiffSection
                icon={<Minus className="size-3.5 text-destructive" />}
                title="Removed Connections"
                className="border-border bg-destructive/10"
              >
                {diff.edges.removed.map((e) => (
                  <div key={e.id} className="text-xs text-muted-foreground">
                    {e.source} → {e.target}
                  </div>
                ))}
              </DiffSection>
            )}

            {diff.nodes.unchanged > 0 && (
              <p className="text-xs text-muted-foreground">
                {diff.nodes.unchanged} node(s) unchanged,{" "}
                {diff.edges.unchanged} connection(s) unchanged
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DiffSection({
  icon,
  title,
  className,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  className: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-md border p-3 ${className}`}>
      <div className="mb-2 flex items-center gap-1.5 text-xs font-medium">
        {icon}
        {title}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}
