"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  Clock,
  Rocket,
  RotateCcw,
  Eye,
  GitCompare,
  ChevronDown,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DiffView } from "./diff-view";
import { DeployDialog } from "./deploy-dialog";
import { toast } from "sonner";

interface FlowVersionItem {
  id: string;
  version: number;
  label: string | null;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  changesSummary: { summary?: string } | null;
  createdAt: string;
  _count?: { deployments: number; conversations: number };
}

interface VersionPanelProps {
  agentId: string;
  onClose: () => void;
  onVersionRestored?: () => void;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  PUBLISHED: "bg-muted/10 text-foreground/60",
  ARCHIVED: "bg-muted/50 text-muted-foreground/60",
};

export function VersionPanel({
  agentId,
  onClose,
  onVersionRestored,
}: VersionPanelProps) {
  const { data, mutate } = useSWR(
    `/api/agents/${agentId}/flow/versions`,
    fetcher
  );
  const [diffVersionId, setDiffVersionId] = useState<string | null>(null);
  const [deployVersionId, setDeployVersionId] = useState<string | null>(null);
  const [isRollingBack, setIsRollingBack] = useState(false);

  const versions: FlowVersionItem[] = data?.success ? data.data : [];

  async function handleRollback(versionId: string, versionNum: number): Promise<void> {
    setIsRollingBack(true);
    try {
      const res = await fetch(
        `/api/agents/${agentId}/flow/versions/${versionId}/rollback`,
        { method: "POST" }
      );
      const json = await res.json();
      if (json.success) {
        toast.success(`Rolled back to v${versionNum} and deployed`);
        await mutate();
        onVersionRestored?.();
      } else {
        toast.error(json.error || "Rollback failed");
      }
    } catch {
      toast.error("Rollback failed");
    } finally {
      setIsRollingBack(false);
    }
  }

  return (
    <div className="flex w-80 flex-col border-l bg-background">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <Clock className="size-4" />
          Version History
          {versions.length > 0 && (
            <span className="text-xs font-normal text-muted-foreground">
              ({versions.length})
            </span>
          )}
        </h3>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={onClose}
        >
          <X className="size-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {versions.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            No versions yet. Save your flow to create the first version.
          </div>
        ) : (
          <div className="divide-y">
            {versions.map((v) => (
              <div key={v.id} className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold">
                      v{v.version}
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_STYLES[v.status] ?? STATUS_STYLES.DRAFT}`}
                    >
                      {v.status === "PUBLISHED" ? "LIVE" : v.status}
                    </span>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-xs">
                        <ChevronDown className="size-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {v.version > 1 && (
                        <DropdownMenuItem
                          onClick={() => setDiffVersionId(v.id)}
                        >
                          <GitCompare className="size-4" />
                          Compare
                        </DropdownMenuItem>
                      )}
                      {v.status !== "PUBLISHED" && (
                        <DropdownMenuItem
                          onClick={() => setDeployVersionId(v.id)}
                        >
                          <Rocket className="size-4" />
                          Deploy
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onClick={() =>
                          handleRollback(v.id, v.version)
                        }
                        disabled={isRollingBack}
                      >
                        <RotateCcw className="size-4" />
                        Rollback
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <p className="mt-1 text-xs text-muted-foreground">
                  {v.label ||
                    (v.changesSummary as { summary?: string })?.summary ||
                    "No description"}
                </p>

                <div className="mt-1 flex items-center gap-3 text-[10px] text-muted-foreground/60">
                  <span>{formatRelativeTime(v.createdAt)}</span>
                  {v._count && v._count.conversations > 0 && (
                    <span className="flex items-center gap-0.5">
                      <Eye className="size-2.5" />
                      {v._count.conversations}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {diffVersionId && (
        <DiffView
          agentId={agentId}
          versionId={diffVersionId}
          onClose={() => setDiffVersionId(null)}
        />
      )}

      {deployVersionId && (
        <DeployDialog
          agentId={agentId}
          versionId={deployVersionId}
          onClose={() => setDeployVersionId(null)}
          onDeployed={() => {
            setDeployVersionId(null);
            mutate();
          }}
        />
      )}
    </div>
  );
}
