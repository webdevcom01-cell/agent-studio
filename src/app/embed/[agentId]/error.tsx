"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";

export default function EmbedError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.ReactElement {
  return (
    <div className="flex h-dvh flex-col items-center justify-center bg-background text-foreground px-6 text-center">
      <AlertTriangle className="size-10 text-destructive mb-4" />
      <h2 className="text-sm font-semibold mb-1">Something went wrong</h2>
      <p className="text-xs text-muted-foreground mb-4">
        This assistant is temporarily unavailable.
      </p>
      <button
        onClick={reset}
        className="flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-xs hover:bg-muted transition-colors"
      >
        <RotateCcw className="size-3" />
        Try again
      </button>
    </div>
  );
}
