"use client";

import { useState, useCallback, use } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  ArrowLeft,
  Brain,
  Trash2,
  Pencil,
  Download,
  Upload,
  Search,
  Flame,
  Snowflake,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface MemoryEntry {
  id: string;
  key: string;
  value: unknown;
  category: string;
  importance: number;
  accessCount: number;
  accessedAt: string;
  createdAt: string;
  updatedAt: string;
}

interface MemoryListResponse {
  success: boolean;
  data: {
    memories: MemoryEntry[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    categories: string[];
  };
}

const HOT_IMPORTANCE_THRESHOLD = 0.8;
const HOT_ACCESS_COUNT_THRESHOLD = 10;

function isHot(m: MemoryEntry): boolean {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  return (
    new Date(m.accessedAt).getTime() > cutoff ||
    m.importance > HOT_IMPORTANCE_THRESHOLD ||
    m.accessCount > HOT_ACCESS_COUNT_THRESHOLD
  );
}

function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

function truncateValue(value: unknown, maxLen = 100): string {
  const str = formatValue(value);
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + "...";
}

export default function MemoryPage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = use(params);
  const [page, setPage] = useState(1);
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [editingMemory, setEditingMemory] = useState<MemoryEntry | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editImportance, setEditImportance] = useState(0.5);
  const [editCategory, setEditCategory] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);

  const queryParams = new URLSearchParams({
    page: String(page),
    limit: "50",
    ...(categoryFilter ? { category: categoryFilter } : {}),
  });

  const { data, mutate, isLoading } = useSWR<MemoryListResponse>(
    `/api/agents/${agentId}/memory?${queryParams}`,
    fetcher,
  );

  const memories = data?.data?.memories ?? [];
  const totalPages = data?.data?.totalPages ?? 1;
  const categories = data?.data?.categories ?? [];
  const total = data?.data?.total ?? 0;

  // Client-side search filter
  const filtered = searchTerm
    ? memories.filter(
        (m) =>
          m.key.toLowerCase().includes(searchTerm.toLowerCase()) ||
          formatValue(m.value).toLowerCase().includes(searchTerm.toLowerCase()),
      )
    : memories;

  const handleEdit = useCallback(
    async () => {
      if (!editingMemory) return;
      try {
        const res = await fetch(
          `/api/agents/${agentId}/memory/${editingMemory.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              value: editValue,
              importance: editImportance,
              category: editCategory,
            }),
          },
        );
        if (!res.ok) throw new Error("Failed to update");
        toast.success("Memory updated");
        setEditingMemory(null);
        mutate();
      } catch {
        toast.error("Failed to update memory");
      }
    },
    [agentId, editingMemory, editValue, editImportance, editCategory, mutate],
  );

  const handleDelete = useCallback(
    async (memoryId: string) => {
      try {
        const res = await fetch(`/api/agents/${agentId}/memory/${memoryId}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error("Failed to delete");
        toast.success("Memory deleted");
        setDeletingId(null);
        mutate();
      } catch {
        toast.error("Failed to delete memory");
      }
    },
    [agentId, mutate],
  );

  const handleExport = useCallback(async () => {
    try {
      const res = await fetch(`/api/agents/${agentId}/memory/export`);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `MEMORY-${agentId.slice(0, 8)}.md`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Memory exported");
    } catch {
      toast.error("Failed to export memory");
    }
  }, [agentId]);

  const handleImport = useCallback(async () => {
    if (!importText.trim()) return;
    setImporting(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/memory/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markdown: importText }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? "Import failed");
      toast.success(
        `Imported ${result.data.imported} memories (${result.data.skipped} skipped)`,
      );
      setImportDialogOpen(false);
      setImportText("");
      mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }, [agentId, importText, mutate]);

  const openEditDialog = (m: MemoryEntry) => {
    setEditingMemory(m);
    setEditValue(formatValue(m.value));
    setEditImportance(m.importance);
    setEditCategory(m.category);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto"><div className="mx-auto max-w-6xl p-6">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="mr-1 size-4" />
                Back
              </Button>
            </Link>
            <Brain className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium">Agent Memory</span>
            <Badge variant="secondary">{total} memories</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="mr-1 size-4" />
              Export MD
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setImportDialogOpen(true)}
            >
              <Upload className="mr-1 size-4" />
              Import MD
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-4 flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/40" />
            <Input
              placeholder="Search memories..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground h-9"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {/* Memory list */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground/40">
            Loading memories...
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground/40">
              {total === 0
                ? "No memories yet. Memories are created by memory_write nodes during agent conversations."
                : "No memories match your filters."}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {filtered.map((m) => {
              const hot = isHot(m);
              return (
                <Card
                  key={m.id}
                  className={
                    hot
                      ? "border-border bg-muted/10"
                      : "border-border"
                  }
                >
                  <CardHeader className="px-4 py-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {hot ? (
                          <Flame className="size-4 text-foreground/50" />
                        ) : (
                          <Snowflake className="size-4 text-muted-foreground/40" />
                        )}
                        <CardTitle className="text-sm font-semibold">
                          {m.key}
                        </CardTitle>
                        <Badge
                          variant="outline"
                          className="text-xs"
                        >
                          {m.category}
                        </Badge>
                        <Badge
                          variant={hot ? "default" : "secondary"}
                          className="text-xs"
                        >
                          {(m.importance * 100).toFixed(0)}%
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="mr-2 text-xs text-muted-foreground/40">
                          {m.accessCount} reads
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditDialog(m)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeletingId(m.id)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="px-4 pb-3 pt-0">
                    <pre className="whitespace-pre-wrap text-sm text-muted-foreground/60 font-mono">
                      {truncateValue(m.value, 300)}
                    </pre>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground/40">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        )}

        {/* Edit Dialog */}
        <Dialog
          open={!!editingMemory}
          onOpenChange={(open) => !open && setEditingMemory(null)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Memory: {editingMemory?.key}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium">Value</label>
                <Textarea
                  rows={6}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                />
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="mb-1 block text-sm font-medium">
                    Category
                  </label>
                  <Input
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                  />
                </div>
                <div className="w-32">
                  <label className="mb-1 block text-sm font-medium">
                    Importance
                  </label>
                  <Input
                    type="number"
                    min={0}
                    max={1}
                    step={0.1}
                    value={editImportance}
                    onChange={(e) =>
                      setEditImportance(parseFloat(e.target.value) || 0)
                    }
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setEditingMemory(null)}>
                Cancel
              </Button>
              <Button onClick={handleEdit}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <ConfirmDialog
          open={!!deletingId}
          onOpenChange={(open) => !open && setDeletingId(null)}
          title="Delete Memory"
          description="This will permanently delete this memory entry. This action cannot be undone."
          onConfirm={() => deletingId && handleDelete(deletingId)}
          confirmLabel="Delete"
        />

        {/* Import Dialog */}
        <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Import Memory from Markdown</DialogTitle>
            </DialogHeader>
            <div>
              <p className="mb-2 text-sm text-muted-foreground">
                Paste a MEMORY.md file content below. Entries will be
                upserted (existing keys get updated, new keys get created).
              </p>
              <Textarea
                rows={12}
                placeholder={`### general\n- **user-name**: Alice\n- **preference**: dark mode`}
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => setImportDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button onClick={handleImport} disabled={importing}>
                {importing ? "Importing..." : "Import"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div></div>
  );
}
