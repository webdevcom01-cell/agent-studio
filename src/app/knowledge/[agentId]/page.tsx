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
  RefreshCw,
  Settings,
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
  const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set());

  const [confirmDeleteSourceId, setConfirmDeleteSourceId] = useState<string | null>(null);
  const [isDeletingSource, setIsDeletingSource] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const [kbConfig, setKbConfig] = useState<Record<string, unknown>>({
    chunkingStrategy: null,
    embeddingModel: "text-embedding-3-small",
    embeddingDimension: 1536,
    retrievalMode: "hybrid",
    rerankingModel: "llm-rubric",
    queryTransform: "none",
    searchTopK: 5,
    searchThreshold: 0.25,
    hybridAlpha: 0.7,
    maxChunks: 500,
  });
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [chunkStrategyType, setChunkStrategyType] = useState("recursive");
  const [chunkSize, setChunkSize] = useState(512);
  const [chunkOverlap, setChunkOverlap] = useState(100);
  const [codeLanguage, setCodeLanguage] = useState("python");
  const [preserveHeaders, setPreserveHeaders] = useState(true);

  const fetchSources = useCallback(async () => {
    try {
      const res = await fetch(`/api/agents/${agentId}/knowledge/sources`);
      const json = await res.json();
      if (json.success) setSources(json.data);
    } catch {
      // silent on poll failures
    } finally {
      setIsLoading(false);
    }
  }, [agentId]);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch(`/api/agents/${agentId}/knowledge/config`);
      const json = await res.json();
      if (json.success) {
        setKbConfig(json.data);
        const cs = json.data.chunkingStrategy;
        if (cs && typeof cs === "object") {
          const strategy = cs as Record<string, unknown>;
          setChunkStrategyType((strategy.type as string) ?? "recursive");
          setChunkSize((strategy.chunkSize as number) ?? 512);
          setChunkOverlap((strategy.chunkOverlap as number) ?? 100);
          if (strategy.language) setCodeLanguage(strategy.language as string);
          if (strategy.preserveHeaders !== undefined) setPreserveHeaders(strategy.preserveHeaders as boolean);
        }
      }
    } catch {
      // Non-critical
    } finally {
      setIsLoadingConfig(false);
    }
  }, [agentId]);

  async function saveConfig() {
    setIsSavingConfig(true);
    try {
      const strategyPayload: Record<string, unknown> = {
        type: chunkStrategyType,
        chunkSize,
        chunkOverlap,
      };
      if (chunkStrategyType === "code") strategyPayload.language = codeLanguage;
      if (chunkStrategyType === "markdown") strategyPayload.preserveHeaders = preserveHeaders;

      const body: Record<string, unknown> = {
        chunkingStrategy: strategyPayload,
        embeddingModel: kbConfig.embeddingModel,
        retrievalMode: kbConfig.retrievalMode,
        rerankingModel: kbConfig.rerankingModel,
        queryTransform: kbConfig.queryTransform,
        searchTopK: kbConfig.searchTopK,
        searchThreshold: kbConfig.searchThreshold,
        hybridAlpha: kbConfig.hybridAlpha,
        maxChunks: kbConfig.maxChunks,
      };

      const res = await fetch(`/api/agents/${agentId}/knowledge/config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.success) {
        setKbConfig(json.data);
        toast.success("Configuration saved");
      } else {
        toast.error(json.error || "Failed to save configuration");
      }
    } catch {
      toast.error("Failed to save configuration");
    } finally {
      setIsSavingConfig(false);
    }
  }

  useEffect(() => {
    fetchSources();
    fetchConfig();
  }, [fetchSources, fetchConfig]);

  // Auto-poll while any source is PENDING or PROCESSING
  useEffect(() => {
    const hasActive = sources.some(
      (s) => s.status === "PENDING" || s.status === "PROCESSING"
    );
    if (!hasActive) return;
    const interval = setInterval(fetchSources, 4_000);
    return () => clearInterval(interval);
  }, [sources, fetchSources]);

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

  async function handleRetry(sourceId: string) {
    setRetryingIds((prev) => new Set(prev).add(sourceId));
    try {
      const res = await fetch(
        `/api/agents/${agentId}/knowledge/sources/${sourceId}/retry`,
        { method: "POST" }
      );
      const json = await res.json();
      if (json.success) {
        toast.success("Retrying — ingestion started");
        setSources((prev) =>
          prev.map((s) =>
            s.id === sourceId ? { ...s, status: "PENDING", errorMsg: null } : s
          )
        );
        fetchSources();
      } else {
        toast.error(json.error || "Failed to retry");
      }
    } catch {
      toast.error("Failed to retry");
    } finally {
      setRetryingIds((prev) => {
        const next = new Set(prev);
        next.delete(sourceId);
        return next;
      });
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
        return <Loader2 className="size-4 text-blue-500 animate-spin" />;
      case "PENDING":
        return <Loader2 className="size-4 text-yellow-500 animate-spin" />;
      case "FAILED":
        return <XCircle className="size-4 text-red-500" />;
      default:
        return null;
    }
  };

  const statusLabel = (status: string) => {
    if (status === "PROCESSING") return "Processing…";
    if (status === "PENDING") return "Queued";
    return status;
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
          <TabsTrigger value="settings"><Settings className="h-4 w-4 mr-1" />Settings</TabsTrigger>
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
                          {statusLabel(source.status)}
                        </Badge>
                        {source.status === "FAILED" && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={retryingIds.has(source.id)}
                            onClick={() => handleRetry(source.id)}
                            aria-label={`Retry ingestion for ${source.name}`}
                          >
                            <RefreshCw
                              className={`mr-1.5 size-3.5 ${retryingIds.has(source.id) ? "animate-spin" : ""}`}
                            />
                            Retry
                          </Button>
                        )}
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
                      <p className="text-xs text-destructive mt-2 pl-7">{source.errorMsg}</p>
                    )}
                    {(source.status === "PENDING" || source.status === "PROCESSING") && (
                      <div className="mt-2 pl-7">
                        <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-1 rounded-full bg-blue-400 animate-pulse"
                            style={{ width: source.status === "PROCESSING" ? "60%" : "20%" }}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {source.status === "PROCESSING"
                            ? "Chunking and embedding…"
                            : "Waiting to start…"}
                        </p>
                      </div>
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

        <TabsContent value="settings">
          {isLoadingConfig ? (
            <div className="py-12 text-center text-muted-foreground">Loading configuration...</div>
          ) : (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle>RAG Pipeline Configuration</CardTitle>
                <CardDescription>Configure chunking, embedding, and retrieval settings for this knowledge base.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-8">
                {/* Chunking Strategy */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold">Chunking Strategy</h3>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Strategy Type</Label>
                      <select
                        value={chunkStrategyType}
                        onChange={(e) => setChunkStrategyType(e.target.value)}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="fixed">Fixed Size</option>
                        <option value="recursive">Recursive Character</option>
                        <option value="markdown">Markdown-Aware</option>
                        <option value="code">Code Block</option>
                        <option value="sentence">Sentence-Based</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label>Chunk Size (tokens)</Label>
                      <Input
                        type="number"
                        min={50}
                        max={2048}
                        value={chunkSize}
                        onChange={(e) => setChunkSize(Number(e.target.value))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Chunk Overlap (tokens)</Label>
                      <Input
                        type="number"
                        min={0}
                        max={512}
                        value={chunkOverlap}
                        onChange={(e) => setChunkOverlap(Number(e.target.value))}
                      />
                    </div>
                    {chunkStrategyType === "code" && (
                      <div className="space-y-2">
                        <Label>Language</Label>
                        <select
                          value={codeLanguage}
                          onChange={(e) => setCodeLanguage(e.target.value)}
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        >
                          <option value="python">Python</option>
                          <option value="typescript">TypeScript</option>
                          <option value="javascript">JavaScript</option>
                        </select>
                      </div>
                    )}
                    {chunkStrategyType === "markdown" && (
                      <div className="flex items-center gap-2 pt-6">
                        <input
                          type="checkbox"
                          id="preserveHeaders"
                          checked={preserveHeaders}
                          onChange={(e) => setPreserveHeaders(e.target.checked)}
                          className="rounded border-input"
                        />
                        <Label htmlFor="preserveHeaders">Preserve headers in each chunk</Label>
                      </div>
                    )}
                  </div>
                </div>

                {/* Embedding */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold">Embedding Model</h3>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Model</Label>
                      <select
                        value={(kbConfig.embeddingModel as string) ?? "text-embedding-3-small"}
                        onChange={(e) => setKbConfig((prev) => ({
                          ...prev,
                          embeddingModel: e.target.value,
                          embeddingDimension: e.target.value === "text-embedding-3-large" ? 3072 : 1536,
                        }))}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="text-embedding-3-small">text-embedding-3-small (1536 dim)</option>
                        <option value="text-embedding-3-large">text-embedding-3-large (3072 dim)</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label>Dimensions</Label>
                      <Input
                        type="number"
                        value={(kbConfig.embeddingDimension as number) ?? 1536}
                        readOnly
                        className="bg-muted"
                      />
                    </div>
                  </div>
                </div>

                {/* Retrieval */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold">Retrieval</h3>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Retrieval Mode</Label>
                      <select
                        value={(kbConfig.retrievalMode as string) ?? "hybrid"}
                        onChange={(e) => setKbConfig((prev) => ({ ...prev, retrievalMode: e.target.value }))}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="semantic">Semantic Only</option>
                        <option value="keyword">Keyword Only (BM25)</option>
                        <option value="hybrid">Hybrid (Semantic + Keyword)</option>
                      </select>
                    </div>
                    {(kbConfig.retrievalMode as string) === "hybrid" && (
                      <div className="space-y-2">
                        <Label>
                          Semantic Weight: {((kbConfig.hybridAlpha as number) ?? 0.7).toFixed(2)}
                          {" / "}
                          Keyword Weight: {(1 - ((kbConfig.hybridAlpha as number) ?? 0.7)).toFixed(2)}
                        </Label>
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.05}
                          value={(kbConfig.hybridAlpha as number) ?? 0.7}
                          onChange={(e) => setKbConfig((prev) => ({ ...prev, hybridAlpha: parseFloat(e.target.value) }))}
                          className="w-full"
                        />
                      </div>
                    )}
                    <div className="space-y-2">
                      <Label>Top-K Results</Label>
                      <Input
                        type="number"
                        min={1}
                        max={50}
                        value={(kbConfig.searchTopK as number) ?? 5}
                        onChange={(e) => setKbConfig((prev) => ({ ...prev, searchTopK: Number(e.target.value) }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Similarity Threshold ({((kbConfig.searchThreshold as number) ?? 0.25).toFixed(2)})</Label>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={(kbConfig.searchThreshold as number) ?? 0.25}
                        onChange={(e) => setKbConfig((prev) => ({ ...prev, searchThreshold: parseFloat(e.target.value) }))}
                        className="w-full"
                      />
                    </div>
                  </div>
                </div>

                {/* Advanced */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold">Advanced</h3>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Reranking</Label>
                      <select
                        value={(kbConfig.rerankingModel as string) ?? "llm-rubric"}
                        onChange={(e) => setKbConfig((prev) => ({ ...prev, rerankingModel: e.target.value }))}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="none">None</option>
                        <option value="llm-rubric">LLM Rubric</option>
                        <option value="cohere">Cohere Rerank</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label>Query Transform</Label>
                      <select
                        value={(kbConfig.queryTransform as string) ?? "none"}
                        onChange={(e) => setKbConfig((prev) => ({ ...prev, queryTransform: e.target.value }))}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="none">None</option>
                        <option value="hyde">HyDE (Hypothetical Document)</option>
                        <option value="multi_query">Multi-Query Expansion</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label>Max Chunks per KB</Label>
                      <Input
                        type="number"
                        min={50}
                        max={5000}
                        value={(kbConfig.maxChunks as number) ?? 500}
                        onChange={(e) => setKbConfig((prev) => ({ ...prev, maxChunks: Number(e.target.value) }))}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-4 border-t border-border">
                  <Button onClick={saveConfig} disabled={isSavingConfig}>
                    {isSavingConfig ? "Saving..." : "Save Configuration"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
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
