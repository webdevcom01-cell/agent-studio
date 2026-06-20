import { Badge } from "@/components/ui/badge";
import type { SomaBatchStatus, SomaPostStatus } from "@/generated/prisma";

const COLORS: Record<string, string> = {
  PENDING: "bg-warning/10 text-warning border-warning/20",
  IN_REVIEW: "bg-info/10 text-info border-info/20",
  APPROVED: "bg-success/10 text-success border-success/20",
  REJECTED: "bg-destructive/10 text-destructive border-destructive/20",
  EDITED: "bg-primary/10 text-primary border-primary/20",
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
