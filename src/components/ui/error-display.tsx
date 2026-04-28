"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { logger } from "@/lib/logger";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface ErrorDisplayProps {
  error: Error & { digest?: string };
  reset: () => void;
  title?: string;
}

export function ErrorDisplay({
  error,
  reset,
  title = "Something went wrong",
}: ErrorDisplayProps): React.ReactElement {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      logger.error("Component error", error);
    }
  }, [error]);

  return (
    <div className="mx-auto max-w-lg px-6 py-16">
      <Card>
        <CardContent className="flex flex-col items-center text-center py-8">
          <AlertTriangle className="size-10 text-destructive mb-4" />
          <h2 className="text-lg font-semibold mb-2">{title}</h2>
          <p className="text-muted-foreground mb-1">
            An unexpected error occurred. Please try again.
          </p>
          {process.env.NODE_ENV === "development" && (
            <p className="text-xs text-destructive/80 font-mono mt-2 mb-4 max-w-sm break-all">
              {error.message}
              {error.digest && ` (digest: ${error.digest})`}
            </p>
          )}
          <div className="flex gap-3 mt-4">
            <Button variant="outline" asChild>
              <Link href="/">Back to Dashboard</Link>
            </Button>
            <Button onClick={reset}>Try Again</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
