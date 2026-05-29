import { useEffect, useState } from "react";
import { Plus, Trash2, Layers, Pencil, Check, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { api, API_ENABLED } from "@/lib/api";
import type { ProspectType } from "@/lib/types";
import { confirmDialog } from "@/components/ConfirmDialogProvider";

export function ProspectTypesPanel() {
  const [types, setTypes] = useState<ProspectType[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!API_ENABLED) return;
    try {
      const r = await api<{ types: ProspectType[] }>("/prospect_types.php");
      setTypes((r.types ?? []).slice().sort((a, b) => a.position - b.position));
    } catch (e: any) { toast.error("Chargement impossible", { description: e?.message }); }
  };
  useEffect(() => { void load(); }, []);

  const add = async () => {
    const n = name.trim();
    if (!n) { toast.error("Nom requis"); return; }
    if (types.some((t) => t.name.trim().toLowerCase() === n.toLowerCase())) {
      toast.error("Un type avec ce nom existe déjà"); return;
    }
    setBusy(true);
    try {
      await api("/prospect_types.php", { method: "POST", body: { name: n, description: description.trim(), active: true, position: types.length + 1 } });
      setName(""); setDescription(""); toast.success("Type créé"); await load();
    } catch (e: any) { toast.error(e?.message); }
    finally { setBusy(false); }
  };

  const toggleActive = async (t: ProspectType) => {
    try {
      await api("/prospect_types.php", { method: "PATCH", body: { id: t.id, active: !t.active } });
      // Optimistic update so the toggle reflects instantly even before reload.
      setTypes((prev) => prev.map((x) => x.id === t.id ? { ...x, active: !t.active } : x));
      toast.success(t.active ? "Type désactivé" : "Type activé");
    } catch (e: any) { toast.error(e?.message); await load(); }
  };

  const startEdit = (t: ProspectType) => {
    setEditingId(t.id); setEditName(t.name); setEditDesc(t.description ?? "");
  };
  const cancelEdit = () => { setEditingId(null); setEditName(""); setEditDesc(""); };
  const saveEdit = async (t: ProspectType) => {
    const n = editName.trim();
    if (!n) { toast.error("Nom requis"); return; }
    if (types.some((x) => x.id !== t.id && x.name.trim().toLowerCase() === n.toLowerCase())) {
      toast.error("Un autre type porte déjà ce nom"); return;
    }
    setBusy(true);
    try {
      await api("/prospect_types.php", { method: "PATCH", body: { id: t.id, name: n, description: editDesc.trim() } });
      cancelEdit(); toast.success("Type mis à jour"); await load();
    } catch (e: any) { toast.error(e?.message); }
    finally { setBusy(false); }
  };

  const remove = async (t: ProspectType) => {
    if (!(await confirmDialog({ title: "Suppression", description: `Supprimer le type "${t.name}" ?`, tone: "destructive", confirmText: "Supprimer" }))) return;
    try { await api(`/prospect_types.php?id=${t.id}`, { method: "DELETE" }); toast.success("Supprimé"); await load(); }
    catch (e: any) { toast.error(e?.message ?? "Suppression impossible"); }
  };

  return (
    <>
      <Card className="p-4 shadow-elegant">
        <div className="text-sm font-medium mb-1">Ajouter un type de prospect</div>
        <p className="text-xs text-muted-foreground mb-3">
          Le type voyage automatiquement avec le prospect lorsqu'il devient opportunité puis contrat.
          Les champs personnalisés peuvent être <strong>partagés</strong> ou <strong>spécifiques à un type</strong> :
          changez le type d'un prospect et ses champs personnalisés s'adaptent automatiquement.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr_auto] gap-2">
          <div className="space-y-1">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Nom</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Campagne Été 2026"
              onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optionnel" />
          </div>
          <div className="flex items-end">
            <Button onClick={add} disabled={busy} className="w-full md:w-auto"><Plus className="h-4 w-4 mr-1.5" />Ajouter</Button>
          </div>
        </div>
      </Card>

      <Card className="mt-4 shadow-elegant overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
          <div className="text-sm font-semibold">Types configurés</div>
          <Badge variant="outline" className="bg-primary/5">{types.length}</Badge>
        </div>
        {types.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            <Layers className="h-8 w-8 mx-auto mb-2 opacity-30" />
            Aucun type configuré.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {types.map((t) => {
              const isEditing = editingId === t.id;
              return (
                <div key={t.id} className="px-4 py-3 flex items-center gap-3 hover:bg-muted/20">
                  <div className="flex-1 min-w-0">
                    {isEditing ? (
                      <div className="space-y-1.5">
                        <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-8" placeholder="Nom" />
                        <Input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} className="h-8 text-xs" placeholder="Description" />
                      </div>
                    ) : (
                      <>
                        <div className="font-medium text-sm flex items-center gap-2">
                          {t.name}
                          {!t.active && <span className="text-[10px] uppercase text-muted-foreground">Inactif</span>}
                        </div>
                        {t.description && <div className="text-xs text-muted-foreground truncate">{t.description}</div>}
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground">Actif</Label>
                    <Switch checked={t.active} onCheckedChange={() => toggleActive(t)} disabled={isEditing} />
                  </div>
                  {isEditing ? (
                    <>
                      <Button variant="ghost" size="icon" onClick={() => saveEdit(t)} disabled={busy} className="text-success hover:bg-success/10" aria-label="Enregistrer">
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={cancelEdit} aria-label="Annuler">
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button variant="ghost" size="icon" onClick={() => startEdit(t)} aria-label={`Modifier ${t.name}`}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {t.id !== "PT-DEFAULT" && (
                        <Button variant="ghost" size="icon" onClick={() => remove(t)} className="text-destructive hover:bg-destructive/10" aria-label={`Supprimer ${t.name}`}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </>
  );
}
