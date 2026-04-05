"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// ---------------------------------------------------------------------------
// ConfirmDialog — reusable destructive confirmation dialog
// ---------------------------------------------------------------------------

export interface ConfirmDialogProps {
  /** Controls open state */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Dialog heading */
  title: string;
  /** Descriptive text shown below the title */
  description: string;
  /** Label for the confirm button (default: "Delete") */
  confirmLabel?: string;
  /** Label for the cancel button (default: "Cancel") */
  cancelLabel?: string;
  /** Called when user confirms the action */
  onConfirm: () => void;
  /** Whether the confirm action is in progress */
  isLoading?: boolean;
}

/**
 * ConfirmDialog — shows a Dialog requiring explicit confirmation
 * before a destructive action (delete, reset, etc.).
 *
 * Usage:
 * ```tsx
 * const [open, setOpen] = useState(false);
 *
 * <ConfirmDialog
 *   open={open}
 *   onOpenChange={setOpen}
 *   title="Delete Agent"
 *   description={`Are you sure you want to delete "${agent.name}"? This action cannot be undone.`}
 *   onConfirm={handleDelete}
 *   isLoading={isDeleting}
 * />
 * ```
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  onConfirm,
  isLoading = false,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />
            </div>
            <div className="flex-1 space-y-1 pt-1">
              <DialogTitle className="text-base font-semibold leading-none">
                {title}
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                {description}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <DialogFooter className="mt-2">
          <Button
            variant="outline"
            disabled={isLoading}
            onClick={() => onOpenChange(false)}
          >
            {cancelLabel}
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? "Deleting…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
