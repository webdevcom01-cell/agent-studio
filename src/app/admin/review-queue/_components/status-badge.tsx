import { Badge } from "@/components/ui/badge";
import type { SomaBatchStatus, SomaPostStatus } from "@/generated/prisma";

const COLORS: Record<string, string> = {
  PENDING: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  IN_REVIEW: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  APPROVED: "bg-green-500/10 text-green-400 border-green-500/20",
  REJECTED: "bg-red-500/10 text-red-400 border-red-500/20",
  EDITED: "bg-purple-500/10 text-purple-400 border-purple-500/20",
};

interface StatusBadgeProps {
  status: SomaBatchStatus | SomaPostStatus;
}

export function StatusBadge({ status }: StatusBadgeProps): React.ReactElement {
  return (
    <Badge
      variant="outline"
      className={`text-xs font-medium ${COLORS[status] ?? "bg-muted text-muted-foreground"}`}
    >
      {status.replace("_", " ")}
    </Badge>
  );
}
