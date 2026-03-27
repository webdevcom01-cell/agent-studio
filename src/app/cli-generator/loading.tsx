import { Skeleton } from "@/components/ui/skeleton";

export default function CliGeneratorLoading(): React.ReactElement {
  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Skeleton className="h-9 w-9" />
          <Skeleton className="h-7 w-44" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Sidebar: generation list */}
          <div className="space-y-3">
            <Skeleton className="h-5 w-28 mb-2" />
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-lg border bg-card p-3 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-20" />
              </div>
            ))}
          </div>

          {/* Main: pipeline steps */}
          <div className="lg:col-span-2 space-y-4">
            <div className="rounded-lg border bg-card p-5 space-y-4">
              <Skeleton className="h-6 w-36" />
              <div className="space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="size-8 rounded-full shrink-0" />
                    <div className="flex-1 space-y-1">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-48" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
