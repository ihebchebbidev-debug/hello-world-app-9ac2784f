import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ShieldAlert, Mail, Copy, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PERMISSION_SECTIONS } from "@/lib/permissions";

// ---------------------------------------------------------------------------
// Lookup: permission key -> { label, section }
// ---------------------------------------------------------------------------
const PERM_INDEX: Record<string, { label: string; section: string }> = (() => {
  const out: Record<string, { label: string; section: string }> = {};
  for (const s of PERMISSION_SECTIONS) {
    for (const p of s.perms) out[p.key] = { label: p.label, section: s.title };
  }
  return out;
})();

export type PermissionDeniedPayload = {
  perm?: string;
  /** Optional action description, e.g. "Supprimer ce prospect". */
  action?: string;
  /** Optional extra context line shown to the user (in French, plain text). */
  details?: string;
};

type Ctx = {
  show: (p: PermissionDeniedPayload) => void;
};
const PermDeniedCtx = createContext<Ctx | null>(null);

export function usePermissionDenied(): Ctx {
  const ctx = useContext(PermDeniedCtx);
  if (!ctx) return { show: () => {} };
  return ctx;
}

// Module-level emitter so non-React code (api.ts global 403 handler,
// permissionGuard helpers) can open the dialog without using a hook.
let _externalShow: ((p: PermissionDeniedPayload) => void) | null = null;
export function showPermissionDenied(p: PermissionDeniedPayload) {
  if (_externalShow) _externalShow(p);
  else if (typeof window !== "undefined") {
    // Defer until provider mounts (e.g. very early 403)
    setTimeout(() => _externalShow?.(p), 50);
  }
}

export function PermissionDeniedDialogProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState<PermissionDeniedPayload | null>(null);
  const [copied, setCopied] = useState(false);

  const show = useCallback((p: PermissionDeniedPayload) => {
    setPayload(p);
    setCopied(false);
    setOpen(true);
  }, []);

  useEffect(() => {
    _externalShow = show;
    return () => {
      if (_externalShow === show) _externalShow = null;
    };
  }, [show]);

  const info = payload?.perm ? PERM_INDEX[payload.perm] : undefined;
  const label = info?.label ?? payload?.perm ?? "Permission requise";
  const section = info?.section;

  const copyMessage = useMemo(() => {
    const lines = [
      "Bonjour,",
      "",
      "Je ne parviens pas à effectuer une action dans le CRM car il me manque une permission.",
      payload?.action ? `Action souhaitée : ${payload.action}` : "",
      payload?.perm
        ? `Permission à m'accorder : « ${label} » (clé technique : ${payload.perm})`
        : `Permission à m'accorder : « ${label} »`,
      section ? `Catégorie : ${section}` : "",
      "",
      "Merci de me l'attribuer dans Rôles & Permissions, ou via mes accès personnels.",
    ].filter(Boolean);
    return lines.join("\n");
  }, [payload, label, section]);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(copyMessage);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  const ctx = useMemo<Ctx>(() => ({ show }), [show]);

  return (
    <PermDeniedCtx.Provider value={ctx}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <div className="mx-auto h-14 w-14 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mb-2">
              <ShieldAlert className="h-7 w-7" />
            </div>
            <DialogTitle className="text-center text-xl">
              Vous n'avez pas la permission nécessaire
            </DialogTitle>
            <DialogDescription className="text-center">
              Cette action a été bloquée par le système de sécurité du CRM.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {payload?.action && (
              <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-0.5">
                  Action demandée
                </div>
                <div className="font-medium">{payload.action}</div>
              </div>
            )}

            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-3">
              <div className="text-[11px] uppercase tracking-wide text-destructive/80 mb-1">
                Permission manquante
              </div>
              <div className="font-semibold text-sm">{label}</div>
              {section && (
                <Badge variant="outline" className="mt-2 text-[10px]">
                  {section}
                </Badge>
              )}
            </div>

            <div className="text-sm text-muted-foreground leading-relaxed">
              Pour débloquer cette action, veuillez contacter votre{" "}
              <span className="font-medium text-foreground">administrateur</span>{" "}
              et lui demander de vous attribuer la permission{" "}
              <span className="font-medium text-foreground">« {label} »</span>.
              Il pourra le faire depuis la page{" "}
              <span className="font-medium text-foreground">Rôles &amp; Permissions</span>{" "}
              ou directement dans vos accès personnels.
            </div>

            {payload?.details && (
              <div className="text-xs text-muted-foreground italic">{payload.details}</div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={onCopy} className="gap-2">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Message copié" : "Copier le message pour l'admin"}
            </Button>
            <Button onClick={() => setOpen(false)} className="gap-2">
              <Mail className="h-4 w-4" />
              J'ai compris
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PermDeniedCtx.Provider>
  );
}
