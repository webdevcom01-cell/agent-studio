"use client";

import { useState } from "react";
import useSWR from "swr";
import { FileCode2, Terminal, Copy, Check } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface FileListResponse {
  success: boolean;
  data: { files: string[] };
}

interface FileContentResponse {
  success: boolean;
  data: {
    filename: string;
    content: string;
    language: string;
  };
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

/** Files that appear in the Quick Start section rather than the main file tabs. */
const QUICK_START_FILES = new Set(["install.sh", "Dockerfile"]);

interface FileViewerProps {
  generationId: string;
  /** When true, polls the file list every 2s to show files as they are generated. */
  isRunning?: boolean;
}

export function FileViewer({ generationId, isRunning = false }: FileViewerProps): React.JSX.Element {
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [copiedScript, setCopiedScript] = useState(false);

  const { data: fileList, isLoading: isLoadingList } = useSWR<FileListResponse>(
    `/api/cli-generator/${generationId}/files`,
    fetcher,
    { refreshInterval: isRunning ? 2000 : 0 },
  );

  const allFiles = fileList?.success ? fileList.data.files : [];
  // Separate quick-start files from regular source files
  const sourceFiles = allFiles.filter((f) => !QUICK_START_FILES.has(f));
  const quickStartFiles = allFiles.filter((f) => QUICK_START_FILES.has(f));

  const selectedFile = activeFile ?? sourceFiles[0] ?? null;

  const { data: fileContent, isLoading: isLoadingContent } = useSWR<FileContentResponse>(
    selectedFile
      ? `/api/cli-generator/${generationId}/files?path=${encodeURIComponent(selectedFile)}`
      : null,
    fetcher,
  );

  // Quick Start script content (install.sh preferred, Dockerfile fallback)
  const quickStartFile = quickStartFiles.includes("install.sh")
    ? "install.sh"
    : quickStartFiles[0] ?? null;
  const { data: quickStartContent } = useSWR<FileContentResponse>(
    quickStartFile
      ? `/api/cli-generator/${generationId}/files?path=${encodeURIComponent(quickStartFile)}`
      : null,
    fetcher,
    { revalidateOnFocus: false },
  );

  function handleCopyScript(text: string): void {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopiedScript(true);
        setTimeout(() => setCopiedScript(false), 2000);
      })
      .catch(() => {
        // clipboard not available
      });
  }

  if (isLoadingList && sourceFiles.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (allFiles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <FileCode2 className="size-8 text-muted-foreground/40 mb-2" />
        <p className="text-sm text-muted-foreground">
          {isRunning ? "Files will appear as they are generated…" : "No files generated yet"}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Source files */}
      {sourceFiles.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">Generated Files</h3>
          <Tabs
            value={selectedFile ?? undefined}
            onValueChange={setActiveFile}
          >
            <TabsList className="flex-wrap h-auto gap-1">
              {sourceFiles.map((file) => (
                <TabsTrigger key={file} value={file} className="text-xs px-2.5 py-1">
                  {file}
                </TabsTrigger>
              ))}
            </TabsList>

            {sourceFiles.map((file) => (
              <TabsContent key={file} value={file}>
                {isLoadingContent && selectedFile === file ? (
                  <div className="flex flex-col gap-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-4 w-5/6" />
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-4 w-4/5" />
                  </div>
                ) : fileContent?.success && selectedFile === file ? (
                  <div className="relative">
                    <span
                      className={cn(
                        "absolute top-2 right-2 text-[10px] font-mono px-1.5 py-0.5 rounded",
                        "bg-zinc-800 text-zinc-400",
                      )}
                    >
                      {fileContent.data.language}
                    </span>
                    <pre className="overflow-x-auto rounded-lg border border-zinc-700 bg-zinc-900 p-4 text-xs leading-relaxed text-zinc-100">
                      <code>{fileContent.data.content}</code>
                    </pre>
                  </div>
                ) : null}
              </TabsContent>
            ))}
          </Tabs>
        </div>
      )}

      {/* Quick Start section — shown when install.sh or Dockerfile are available */}
      {quickStartFile && quickStartContent?.success && (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Terminal className="size-4 text-muted-foreground" />
              <span className="text-sm font-medium">Quick Start</span>
            </div>
            <div className="flex items-center gap-1">
              {quickStartFiles.length > 1 && (
                <div className="flex items-center gap-0.5 mr-1">
                  {quickStartFiles.map((f) => (
                    <span
                      key={f}
                      className="text-[10px] font-mono text-muted-foreground/60 px-1"
                    >
                      {f}
                    </span>
                  ))}
                </div>
              )}
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => handleCopyScript(quickStartContent.data.content)}
                title="Copy install script"
              >
                {copiedScript ? (
                  <Check className="size-3 text-green-500" />
                ) : (
                  <Copy className="size-3" />
                )}
              </Button>
            </div>
          </div>
          <pre className="overflow-x-auto rounded-lg border border-zinc-700 bg-zinc-900 p-3 text-[11px] leading-relaxed text-zinc-100">
            <code>{quickStartContent.data.content}</code>
          </pre>
          <p className="text-[10px] text-muted-foreground">
            Run <code className="font-mono">bash install.sh</code> in your project directory after downloading.
          </p>
        </div>
      )}
    </div>
  );
}
