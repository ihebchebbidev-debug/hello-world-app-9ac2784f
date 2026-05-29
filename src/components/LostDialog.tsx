// Rich "Mark as Lost" dialog — category + reason + free-text comment.
// Builds a structured payload so the backend can log it cleanly:
//   "Concurrent — Trop cher | note: Le client a choisi X"
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { XCircle } from "lucide-react";

export type LostPayload = {
  category: string;
  reason: string;
  note: string;
  /** Pre-formatted human-readable string suitable for legacy `lostReason` field. */
  formatted: string;
};

const CATEGORIES = [
  "Prix",
  "Concurrent",
  "Injoignable",
  "Refus produit",
  "Mauvais timing",
  "Doublon",
  "Autre",
] as const;

const REASONS_BY_CATEGORY: Record<string, string[]> = {
  Prix: ["Trop cher", "Hors budget", "Compare offres"],
  Concurrent: ["A choisi un concurrent", "Déjà sous contrat ailleurs"],
  Injoignable: ["Numéro invalide", "Plusieurs tentatives sans réponse", "Adresse e-mail invalide"],
  "Refus produit": ["Pas intéressé", "Couverture insuffisante", "Préfère attendre"],
  "Mauvais timing": ["Reporté à plus tard", "Hors période d'achat"],
  Doublon: ["Déjà client", "Lead en double"],
  Autre: ["Non précisé"],
};

export function LostDialog({
  trigger,
  onConfirm,
  title = "Marquer comme perdu",
  description = "Précisez la catégorie, le motif et un commentaire pour l'analyse des pertes.",
}: {
  trigger?: React.ReactNode;
  onConfirm: (payload: LostPayload) => void;
  title?: string;
  description?: string;
}) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [reason, setReason] = useState<string>(REASONS_BY_CATEGORY[CATEGORIES[0]][0]);
  const [note, setNote] = useState("");

  const reasons = REASONS_BY_CATEGORY[category] ?? ["Non précisé"];

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setNote(""); }}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline" className="border-destructive/30 text-destructive hover:bg-destructive/10">
            <XCircle className="h-4 w-4 mr-1.5" />Perdu
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Catégorie</Label>
              <Select value={category} onValueChange={(v) => { setCategory(v); setReason((REASONS_BY_CATEGORY[v] ?? ["Non précisé"])[0]); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Motif</Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {reasons.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Commentaire libre</Label>
            <Textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 500))}
              placeholder="Précisez le contexte, ce que le client a dit, l'agent qui a tenté…"
            />
            <p className="text-[10px] text-muted-foreground text-right">{note.length}/500</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
          <Button
            variant="destructive"
            onClick={() => {
              const formatted = `${category} — ${reason}${note.trim() ? ` | note: ${note.trim()}` : ""}`;
              onConfirm({ category, reason, note: note.trim(), formatted });
              setOpen(false);
            }}
          >
            Confirmer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
