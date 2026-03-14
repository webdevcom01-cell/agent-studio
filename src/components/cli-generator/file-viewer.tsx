"use client";

import { useState } from "react";
import useSWR from "swr";
import { FileCode2 } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
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

interface FileViewerProps {
  generationId: string;
}

export function FileViewer({ generationId }: FileViewerProps): React.JSX.Element {
  const [activeFile, setActiveFile] = useState<string | null>(null);

  const { data: fileList, isLoading: isLoadingList } = useSWR<FileListResponse>(
    `/api/cli-generator/${generationId}/files`,
    fetcher,
  );

  const files = fileList?.success ? fileList.data.files : [];

  const selectedFile = activeFile ?? files[0] ?? null;

  const { data: fileContent, isLoading: isLoadingContent } = useSWR<FileContentResponse>(
    selectedFile
      ? `/api/cli-generator/${generationId}/files?path=${encodeURIComponent(selectedFile)}`
      : null,
    fetcher,
  );

  if (isLoadingList) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <FileCode2 className="size-8 text-muted-foreground/40 mb-2" />
        <p className="text-sm text-muted-foreground">No files generated yet</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">Generated Files</h3>
      <Tabs
        value={selectedFile ?? undefined}
        onValueChange={setActiveFile}
      >
        <TabsList className="flex-wrap h-auto gap-1">
          {files.map((file) => (
            <TabsTrigger key={file} value={file} className="text-xs px-2.5 py-1">
              {file}
            </TabsTrigger>
          ))}
        </TabsList>

        {files.map((file) => (
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
  );
}
