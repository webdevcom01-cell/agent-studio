"use client";

import { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Plus,
  Globe,
  FileText,
  Upload,
  Trash2,
  Loader2,
  CheckCircle2,
  XCircle,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";

interface KBSource {
  id: string;
  name: string;
  type: string;
  status: string;
  url: string | null;
  charCount: number | null;
  errorMsg: string | null;
  createdAt: string;
  _count: { chunks: number };
}

interface SearchResult {
  chunkId: string;
  content: string;
  similarity: number;
  sourceDocument?: string;
}

export default function KnowledgePage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = use(params);
  const [sources, setSources] = useState<KBSource[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [addType, setAddType] = useState<"TEXT" | "URL" | "FILE">("URL");
  const [addName, setAddName] = useState("");
  const [addUrl, setAddUrl] = useState("");
  const [addContent, setAddContent] = useState("");
  const [addFile, setAddFile] = useState<File | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const [confirmDeleteSourceId, setConfirmDeleteSourceId] = useState<string | null>(null);
  const [isDeletingSource, setIsDeletingSource] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const fetchSources = useCallback(async () => {
    try {
      const res = await fetch(`/api/agents/${agentId}/knowledge/sources`);
      const json = await res.json();
      if (json.success) setSources(json.data);
    } catch {
      toast.error("Failed to load sources");
    } finally {
      setIsLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    fetchSources();
  }, [fetchSources]);

  async function handleAdd() {
    setIsAdding(true);
    try {
      let res: Response;

      if (addType === "FILE") {
        if (!addFile) {
          toast.error("Please select a file");
          setIsAdding(false);
          return;
        }
        const formData = new FormData();
        formData.append("file", addFile);
        if (addName) formData.append("name", addName);

        res = await fetch(
          `/api/agents/${agentId}/knowledge/sources/upload`,
          { method: "POST", body: formData }
        );
      } else {
        const body: Record<string, string> = {
          type: addType,
          name: addName || (addType === "URL" ? addUrl : "Text source"),
        };
        if (addType === "URL") body.url = addUrl;
        if (addType === "TEXT") body.content = addContent;

        res = await fetch(`/api/agents/${agentId}/knowledge/sources`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }

      const json = await res.json();
      if (json.success) {
        setShowAdd(false);
        setAddName("");
        setAddUrl("");
        setAddContent("");
        setAddFile(null);
        toast.success("Source added — ingesting in background");
        fetchSources();
      } else {
        toast.error(json.error || "Failed to add source");
      }
    } catch {
      toast.error("Failed to add source");
    } finally {
      setIsAdding(false);
    }
  }

  async function handleDelete() {
    if (!confirmDeleteSourceId) return;
    setIsDeletingSource(true);
    try {
      await fetch(`/api/agents/${agentId}/knowledge/sources/${confirmDeleteSourceId}`, {
        method: "DELETE",
      });
      setSources((prev) => prev.filter((s) => s.id !== confirmDeleteSourceId));
      toast.success("Source deleted");
      setConfirmDeleteSourceId(null);
    } catch {
      toast.error("Failed to delete source");
    } finally {
      setIsDeletingSource(false);
    }
  }

  async function handleSearch() {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/knowledge/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery }),
      });
      const json = await res.json();
      if (json.success) setSearchResults(json.data);
    } catch {
      toast.error("Search failed");
    } finally {
      setIsSearching(false);
    }
  }

  const statusIcon = (status: string) => {
    switch (status) {
      case "READY":
        return <CheckCircle2 className="size-4 text-green-500" />;
      case "PROCESSING":
      case "PENDING":
        return <Loader2 className="size-4 text-yellow-500 animate-spin" />;
      case "FAILED":
        return <XCircle className="size-4 text-red-500" />;
      default:
        return null;
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon-sm" aria-label="Back to flow builder" asChild>
          <Link href={`/builder/${agentId}`}>
            <ArrowLeft className="size-4" aria-hidden="true" />
          </Link>
        </Button>
        <h1 className="text-xl font-bold flex-1">Knowledge Base</h1>
        <Button onClick={() => setShowAdd(true)} data-testid="kb-add-source">
          <Plus className="mr-2 size-4" />
          Add Source
        </Button>
      </div>

      <Tabs defaultValue="sources">
        <TabsList>
          <TabsTrigger value="sources">Sources</TabsTrigger>
          <TabsTrigger value="search">Test Search</TabsTrigger>
        </TabsList>

        <TabsContent value="sources">
          {isLoading ? (
            <div className="py-12 text-center text-muted-foreground">Loading...</div>
          ) : sources.length === 0 ? (
            <Card className="py-12">
              <CardContent className="flex flex-col items-center text-center">
                <FileText className="size-12 text-muted-foreground mb-4" />
                <h3 className="font-semibold">No sources yet</h3>
                <p className="text-muted-foreground mt-1 mb-4">
                  Add URLs, text, or files to build the knowledge base
                </p>
                <Button onClick={() => setShowAdd(true)}>
                  <Plus className="mr-2 size-4" />
                  Add Source
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3 mt-4">
              {sources.map((source) => (
                <Card key={source.id} data-testid="kb-source-item">
                  <CardHeader className="py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {statusIcon(source.status)}
                        <div>
                          <CardTitle className="text-sm">{source.name}</CardTitle>
                          <CardDescription className="text-xs">
                            {source.type} &middot; {source._count.chunks} chunks
                            {source.charCount
                              ? ` · ${(source.charCount / 1000).toFixed(1)}k chars`
                              : ""}
                          </CardDescription>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            source.status === "READY"
                              ? "default"
                              : source.status === "FAILED"
                                ? "destructive"
                                : "secondary"
                          }
                        >
                          {source.status}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => setConfirmDeleteSourceId(source.id)}
                          aria-label={`Delete source ${source.name}`}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                    {source.errorMsg && (
                      <p className="text-xs text-destructive mt-1">{source.errorMsg}</p>
                    )}
                  </CardHeader>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="search">
          <div className="mt-4 space-y-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSearch();
              }}
              className="flex gap-2"
            >
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Test a search query..."
                data-testid="kb-search-input"
              />
              <Button type="submit" disabled={isSearching} data-testid="kb-search-btn">
                <Search className="mr-1.5 size-4" />
                Search
              </Button>
            </form>

            {searchResults.length > 0 && (
              <div className="space-y-3">
                {searchResults.map((result, i) => (
                  <Card key={result.chunkId} data-testid="kb-search-result">
                    <CardContent className="py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <p className="text-sm whitespace-pre-wrap line-clamp-4">
                            {result.content}
                          </p>
                          {result.sourceDocument && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Source: {result.sourceDocument}
                            </p>
                          )}
                        </div>
                        <Badge variant="outline" className="shrink-0">
                          #{i + 1} · {(result.similarity * 100).toFixed(0)}%
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Source</DialogTitle>
          </DialogHeader>
          <Tabs value={addType} onValueChange={(v) => setAddType(v as "TEXT" | "URL" | "FILE")}>
            <TabsList className="w-full">
              <TabsTrigger value="URL" className="flex-1">
                <Globe className="mr-1.5 size-4" />
                URL
              </TabsTrigger>
              <TabsTrigger value="TEXT" className="flex-1">
                <FileText className="mr-1.5 size-4" />
                Text
              </TabsTrigger>
              <TabsTrigger value="FILE" className="flex-1">
                <Upload className="mr-1.5 size-4" />
                File
              </TabsTrigger>
            </TabsList>

            <TabsContent value="URL" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  placeholder="e.g. Company FAQ"
                />
              </div>
              <div className="space-y-2">
                <Label>URL</Label>
                <Input
                  value={addUrl}
                  onChange={(e) => setAddUrl(e.target.value)}
                  placeholder="https://example.com/docs"
                />
              </div>
            </TabsContent>

            <TabsContent value="TEXT" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  placeholder="e.g. Product Info"
                />
              </div>
              <div className="space-y-2">
                <Label>Content</Label>
                <Textarea
                  value={addContent}
                  onChange={(e) => setAddContent(e.target.value)}
                  placeholder="Paste your text content here..."
                  rows={8}
                />
              </div>
            </TabsContent>

            <TabsContent value="FILE" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Name (optional)</Label>
                <Input
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  placeholder="Uses filename if empty"
                />
              </div>
              <div className="space-y-2">
                <Label>File (PDF or DOCX, max 10 MB)</Label>
                <Input
                  type="file"
                  accept=".pdf,.docx"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    if (file && file.size > 10 * 1024 * 1024) {
                      toast.error("File exceeds 10 MB limit");
                      e.target.value = "";
                      return;
                    }
                    setAddFile(file);
                  }}
                />
                {addFile && (
                  <p className="text-xs text-muted-foreground">
                    {addFile.name} ({(addFile.size / 1024).toFixed(0)} KB)
                  </p>
                )}
              </div>
            </TabsContent>
          </Tabs>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>
              Cancel
            </Button>
            <Button onClick={handleAdd} disabled={isAdding}>
              {isAdding ? "Adding..." : "Add Source"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDeleteSourceId !== null}
        onOpenChange={(open) => { if (!open) setConfirmDeleteSourceId(null); }}
        title="Delete Source"
        description={`Are you sure you want to delete "${sources.find((s) => s.id === confirmDeleteSourceId)?.name ?? "this source"}"? All embedded chunks will be permanently removed.`}
        onConfirm={handleDelete}
        isLoading={isDeletingSource}
      />
    </div>
  );
}
