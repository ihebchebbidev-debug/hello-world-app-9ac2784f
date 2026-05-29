import { useEffect, useState } from "react";
import { Bookmark, Plus, Trash2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { confirmDialog } from "@/components/ConfirmDialogProvider";

type SavedView<T> = { id: string; name: string; state: T };

/** Persisted list of named filter snapshots, scoped per page (e.g. "prospects"). */
export function useSavedViews<T>(scope: string) {
  const key = `erp.savedViews.${scope}`;
  const [views, setViews] = useState<SavedView<T>[]>([]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) setViews(JSON.parse(raw));
    } catch { /* ignore */ }
  }, [key]);
  const persist = (next: SavedView<T>[]) => {
    setViews(next);
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* ignore */ }
  };
  return {
    views,
    save: (name: string, state: T) => {
      const id = `v-${Date.now().toString(36)}`;
      persist([...views, { id, name, state }]);
    },
    remove: (id: string) => persist(views.filter((v) => v.id !== id)),
    rename: (id: string, name: string) =>
      persist(views.map((v) => (v.id === id ? { ...v, name } : v))),
  };
}

type Props<T> = {
  scope: string;
  current: T;
  onApply: (state: T) => void;
  /** Optional comparator to detect "no change" for the active highlight. */
  isEqual?: (a: T, b: T) => boolean;
};

export function SavedViews<T>({ scope, current, onApply, isEqual }: Props<T>) {
  const { views, save, remove } = useSavedViews<T>(scope);
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) { toast.error("Donnez un nom à la vue"); return; }
    save(trimmed, current);
    setName("");
    toast.success(`Vue "${trimmed}" enregistrée`);
  };

  const eq = (v: T) => (isEqual ? isEqual(v, current) : false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-10">
          <Bookmark className="h-4 w-4 mr-1.5" />
          Vues
          {views.length > 0 && (
            <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted text-foreground text-[10px] font-semibold px-1.5">
              {views.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="px-3 py-2 border-b border-border text-sm font-semibold">
          Vues enregistrées
        </div>

        <div className="max-h-64 overflow-y-auto">
          {views.length === 0 ? (
            <div className="px-3 py-4 text-xs text-muted-foreground text-center">
              Aucune vue. Configurez vos filtres puis enregistrez-les ci-dessous.
            </div>
          ) : (
            views.map((v) => {
              const active = eq(v.state);
              return (
                <div
                  key={v.id}
                  className="flex items-center gap-2 px-3 py-2 hover:bg-muted/40 border-b border-border last:border-0"
                >
                  <button
                    onClick={() => { onApply(v.state); setOpen(false); toast.success(`Vue "${v.name}" appliquée`); }}
                    className="flex-1 text-left text-sm flex items-center gap-2 min-w-0"
                  >
                    {active && <Check className="h-3.5 w-3.5 text-success shrink-0" />}
                    <span className="truncate">{v.name}</span>
                    {active && (
                      <Badge variant="outline" className="text-[10px] py-0 ml-auto">active</Badge>
                    )}
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={async () => { if ((await confirmDialog({ title: "Suppression", description: `Supprimer la vue "${v.name}" ?`, tone: "destructive", confirmText: "Supprimer" }))) remove(v.id); }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              );
            })
          )}
        </div>

        <div className="p-3 border-t border-border space-y-2 bg-muted/20">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Enregistrer la vue actuelle
          </div>
          <div className="flex gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
              placeholder="Ex: Mes leads chauds"
              className="h-9"
            />
            <Button size="sm" className="h-9" onClick={handleSave}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Enregistrer
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
