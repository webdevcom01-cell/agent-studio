"use client";

import { ErrorDisplay } from "@/components/ui/error-display";

export default function WebhooksError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.ReactElement {
  return <ErrorDisplay error={error} reset={reset} title="Webhooks Error" />;
}
