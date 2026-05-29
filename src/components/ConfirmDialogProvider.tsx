import { useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertTriangle, HelpCircle, Trash2, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export type ConfirmTone = "default" | "destructive" | "warning" | "info";

export interface ConfirmOptions {
  title?: string;
  description?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  tone?: ConfirmTone;
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

let pushConfirm: ((opts: PendingConfirm) => void) | null = null;

/**
 * Imperative confirm dialog. Replaces window.confirm with a styled modal.
 * Usage: `if (!(await confirmDialog({ title: "...", tone: "destructive" }))) return;`
 */
export function confirmDialog(opts: ConfirmOptions = {}): Promise<boolean> {
  return new Promise((resolve) => {
    if (!pushConfirm) {
      // Provider not mounted (SSR or pre-hydration) — fallback to native.
      if (typeof window !== "undefined") {
        resolve(window.confirm(opts.description ? String(opts.description) : opts.title || "Confirmer ?"));
      } else {
        resolve(false);
      }
      return;
    }
    pushConfirm({ ...opts, resolve });
  });
}

const toneIcon = {
  destructive: Trash2,
  warning: AlertTriangle,
  info: Info,
  default: HelpCircle,
};

const toneIconClass = {
  destructive: "text-destructive bg-destructive/10",
  warning: "text-warning bg-warning/10",
  info: "text-primary bg-primary/10",
  default: "text-muted-foreground bg-muted",
};

export function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<PendingConfirm[]>([]);
  const current = queue[0];

  useEffect(() => {
    pushConfirm = (c) => setQueue((q) => [...q, c]);
    return () => {
      pushConfirm = null;
    };
  }, []);

  const close = (value: boolean) => {
    if (!current) return;
    current.resolve(value);
    setQueue((q) => q.slice(1));
  };

  const tone = current?.tone || "default";
  const Icon = toneIcon[tone];

  return (
    <>
      {children}
      <AlertDialog
        open={!!current}
        onOpenChange={(open) => {
          if (!open && current) close(false);
        }}
      >
        {current && (
          <AlertDialogContent>
            <AlertDialogHeader>
              <div className="flex items-start gap-3">
                <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", toneIconClass[tone])}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1 space-y-1.5 text-left">
                  <AlertDialogTitle>{current.title || "Confirmer l'action"}</AlertDialogTitle>
                  {current.description && (
                    <AlertDialogDescription>{current.description}</AlertDialogDescription>
                  )}
                </div>
              </div>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => close(false)}>
                {current.cancelText || "Annuler"}
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => close(true)}
                className={cn(
                  tone === "destructive" &&
                    buttonVariants({ variant: "destructive" }),
                )}
              >
                {current.confirmText || "Confirmer"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </>
  );
}
