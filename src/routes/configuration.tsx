import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import {
  Settings, Plus, Trash2, Type, Hash, Calendar, ToggleLeft, List, ListChecks, AlignLeft, Coins, Save, RotateCcw,
  ArrowUp, ArrowDown, Pencil, X, Check, Layers,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, API_ENABLED } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  DEFAULT_CURRENCY, formatAmount, readCurrency, useCurrency, writeCurrency, type Currency,
} from "@/lib/currency";
import { ProspectTypesPanel } from "@/components/ProspectTypesPanel";
import type { ProspectType } from "@/lib/types";
import { IdleTimeoutsPanel } from "@/components/IdleTimeoutsPanel";
import { ObjectivesPanel, EntitiesPanel } from "@/components/GuichetAdmin";
import { TeamsPanel } from "@/components/TeamsPanel";
import { Can } from "@/components/Can";

export const Route = createFileRoute("/configuration")({
  head: () => ({
    meta: [
      { title: "Configuration — CRM" },
      { name: "description", content: "Personnalisez les champs des prospects, contrats et utilisateurs." },
    ],
  }),
  component: ConfigPage,
});

type Field = {
  id: string;
  label: string;
  type: string;
  required: boolean;
  key?: string;
  options?: string[];
  position?: number;
  typeId?: string | null;
};

const TYPE_META: Record<string, { label: string; icon: typeof Type; hint: string }> = {
  text: { label: "Texte", icon: Type, hint: "Une ligne de texte libre" },
  textarea: { label: "Texte long", icon: AlignLeft, hint: "Plusieurs lignes (commentaires, notes)" },
  number: { label: "Nombre", icon: Hash, hint: "Valeur numérique entière ou décimale" },
  date: { label: "Date", icon: Calendar, hint: "Sélecteur de date (JJ/MM/AAAA)" },
  boolean: { label: "Oui / Non", icon: ToggleLeft, hint: "Interrupteur binaire" },
  select: { label: "Liste déroulante", icon: List, hint: "Choix unique parmi une liste" },
  multiselect: { label: "Choix multiples", icon: ListChecks, hint: "Plusieurs choix parmi une liste" },
};

function FieldIcon({ type }: { type: string }) {
  const Icon = TYPE_META[type]?.icon ?? Type;
  return <Icon className="h-3.5 w-3.5" />;
}

function FieldList({ tab }: { tab: string }) {
  const [fields, setFields] = useState<Field[]>([]);
  const [label, setLabel] = useState("");
  const [type, setType] = useState("text");
  const [optionsRaw, setOptionsRaw] = useState(""); // comma-separated for new select
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editOptions, setEditOptions] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  // Prospect types — only relevant for the "prospect" tab. A field can be
  // either shared (typeId = null) or scoped to a specific type id.
  const supportsTypes = tab === "prospect" || tab === "opportunity";
  const [types, setTypes] = useState<ProspectType[]>([]);
  const [scope, setScope] = useState<string>("__shared__"); // "__shared__" | typeId
  const [filterScope, setFilterScope] = useState<string>("__all__"); // "__all__" | "__shared__" | typeId
  const [editScope, setEditScope] = useState<string>("__shared__");

  const slugify = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

  const load = async () => {
    if (!API_ENABLED) return;
    try {
      const r = await api<{ fields: any[] }>("/custom_fields.php", { query: { entity: tab } });
      setFields(
        r.fields.map((f) => ({
          id: f.id, label: f.label, type: f.type, required: !!f.required, key: f.key,
          options: Array.isArray(f.options) ? f.options : [],
          position: Number(f.position) || 0,
          typeId: f.typeId ?? null,
        })),
      );
    } catch (e: any) { toast.error("Chargement impossible", { description: e?.message }); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [tab]);

  const loadTypes = async () => {
    if (!supportsTypes || !API_ENABLED) return;
    try {
      const r = await api<{ types: ProspectType[] }>("/prospect_types.php");
      setTypes((r.types ?? []).slice().sort((a, b) => a.position - b.position));
    } catch { /* optional */ }
  };
  useEffect(() => { void loadTypes(); }, [supportsTypes, tab]);
  // Refresh types when window regains focus — picks up edits made in the
  // sibling "Types" tab without forcing a manual page reload.
  useEffect(() => {
    if (!supportsTypes) return;
    const onFocus = () => { void loadTypes(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supportsTypes]);

  const scopeLabel = (typeId: string | null | undefined) => {
    if (!typeId) return "Partagé";
    return types.find((t) => t.id === typeId)?.name ?? "Type supprimé";
  };

  const add = async () => {
    const trimmed = label.trim();
    if (!trimmed) { toast.error("Donnez un nom au champ"); return; }
    // Duplicate-label / duplicate-key guard (case-insensitive)
    const newKey = slugify(trimmed);
    const dup = fields.find(
      (f) => f.label.trim().toLowerCase() === trimmed.toLowerCase() || (f.key && f.key === newKey),
    );
    if (dup) {
      toast.error("Un champ avec ce nom existe déjà", { description: `« ${dup.label} » utilise déjà la clé "${dup.key ?? newKey}".` });
      return;
    }
    const options = (type === "select" || type === "multiselect")
      ? optionsRaw.split(",").map((s) => s.trim()).filter(Boolean)
      : undefined;
    if ((type === "select" || type === "multiselect") && (!options || options.length === 0)) {
      toast.error("Ajoutez au moins une option (séparées par des virgules)"); return;
    }
    if (!API_ENABLED) {
      setFields([...fields, { id: String(Date.now()), label: trimmed, type, required: false, options: options ?? [], position: fields.length, key: newKey }]);
      setLabel(""); setOptionsRaw(""); toast.success("Champ ajouté (mock)"); return;
    }
    try {
      await api("/custom_fields.php", {
        method: "POST",
        body: {
          entity: tab,
          label: trimmed,
          type,
          options,
          position: fields.length,
          typeId: supportsTypes && scope !== "__shared__" ? scope : null,
        },
      });
      setLabel(""); setOptionsRaw(""); toast.success("Champ ajouté"); await load();
    } catch (e: any) { toast.error(e?.message); }
  };

  const confirmRemove = async () => {
    if (!deleteTarget) return;
    const { id, name } = deleteTarget;
    setDeleteTarget(null);
    if (!API_ENABLED) { setFields(fields.filter((f) => f.id !== id)); toast.success("Supprimé"); return; }
    try { await api(`/custom_fields.php?id=${id}`, { method: "DELETE" }); await load(); toast.success("Champ supprimé", { description: name }); }
    catch (e: any) { toast.error(e?.message); }
  };

  const toggleReq = async (id: string) => {
    const f = fields.find((x) => x.id === id); if (!f) return;
    if (!API_ENABLED) { setFields(fields.map((x) => x.id === id ? { ...x, required: !x.required } : x)); return; }
    try { await api("/custom_fields.php", { method: "PATCH", body: { id, required: !f.required } }); await load(); }
    catch (e: any) { toast.error(e?.message); }
  };

  const move = async (id: string, dir: -1 | 1) => {
    const idx = fields.findIndex((f) => f.id === id);
    const swap = idx + dir;
    if (idx < 0 || swap < 0 || swap >= fields.length) return;
    const next = [...fields];
    [next[idx], next[swap]] = [next[swap], next[idx]];
    // re-number positions
    const reindexed = next.map((f, i) => ({ ...f, position: i }));
    setFields(reindexed);
    if (!API_ENABLED) return;
    try {
      await Promise.all([
        api("/custom_fields.php", { method: "PATCH", body: { id: reindexed[idx].id, position: idx } }),
        api("/custom_fields.php", { method: "PATCH", body: { id: reindexed[swap].id, position: swap } }),
      ]);
    } catch (e: any) { toast.error(e?.message); await load(); }
  };

  const startEdit = (f: Field) => {
    setEditingId(f.id);
    setEditLabel(f.label);
    setEditOptions((f.options ?? []).join(", "));
    setEditScope(f.typeId ? f.typeId : "__shared__");
  };
  const cancelEdit = () => { setEditingId(null); setEditLabel(""); setEditOptions(""); setEditScope("__shared__"); };
  const saveEdit = async (f: Field) => {
    const trimmed = editLabel.trim();
    if (!trimmed) { toast.error("Le nom est requis"); return; }
    const dup = fields.find(
      (x) => x.id !== f.id && x.label.trim().toLowerCase() === trimmed.toLowerCase(),
    );
    if (dup) {
      toast.error("Un autre champ porte déjà ce nom", { description: `« ${dup.label} »` });
      return;
    }
    const body: any = { id: f.id, label: trimmed };
    if ((f.type === "select" || f.type === "multiselect")) {
      const opts = editOptions.split(",").map((s) => s.trim()).filter(Boolean);
      if (opts.length === 0) { toast.error("Au moins une option requise"); return; }
      body.options = opts;
    }
    if (supportsTypes) {
      body.typeId = editScope === "__shared__" ? null : editScope;
    }
    if (!API_ENABLED) {
      setFields(fields.map((x) => x.id === f.id
        ? { ...x, label: body.label, options: body.options ?? x.options, typeId: body.typeId ?? x.typeId }
        : x));
      cancelEdit(); toast.success("Champ modifié (mock)"); return;
    }
    try { await api("/custom_fields.php", { method: "PATCH", body }); cancelEdit(); await load(); toast.success("Champ modifié"); }
    catch (e: any) { toast.error(e?.message); }
  };

  const visibleFields = !supportsTypes || filterScope === "__all__"
    ? fields
    : fields.filter((f) =>
        filterScope === "__shared__" ? !f.typeId : f.typeId === filterScope,
      );

  return (
    <>
      <Card className="p-4 shadow-elegant">
        <div className="text-sm font-medium mb-1">Ajouter un champ personnalisé</div>
        <p className="text-xs text-muted-foreground mb-3">
          Ces champs apparaîtront dans le formulaire {tab === "prospect" ? "prospect" : tab === "contract" ? "contrat" : tab === "opportunity" ? "opportunité" : "utilisateur"}.
        </p>
        {supportsTypes && (
          <div className="mb-3 space-y-1">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Portée du champ</Label>
            <Select value={scope} onValueChange={setScope}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__shared__">
                  <span className="inline-flex items-center gap-2"><Layers className="h-3.5 w-3.5" />Partagé (tous les types)</span>
                </SelectItem>
                {types.map((t) => (
                  <SelectItem key={t.id} value={t.id} disabled={!t.active}>
                    Spécifique au type : {t.name}{!t.active ? " (inactif)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground italic">
              {scope === "__shared__"
                ? "Apparaît sur tous les prospects, quel que soit leur type."
                : "N'apparaît que sur les prospects (et opportunités/contrats) ayant ce type."}
            </p>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_220px_auto] gap-2">
          <div className="space-y-1">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Nom du champ</Label>
            <Input
              placeholder="ex: Numéro Sécu"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && type !== "select") add(); }}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(TYPE_META).map(([k, m]) => (
                  <SelectItem key={k} value={k}>
                    <span className="inline-flex items-center gap-2">
                      <m.icon className="h-3.5 w-3.5" />{m.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button onClick={add} className="bg-primary text-primary-foreground hover:bg-primary/90 w-full md:w-auto">
              <Plus className="h-4 w-4 mr-1.5" />Ajouter
            </Button>
          </div>
        </div>
        {(type === "select" || type === "multiselect") && (
          <div className="mt-3 space-y-1">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Options (séparées par des virgules)</Label>
            <Input
              placeholder="ex: Particulier, Professionnel, Entreprise"
              value={optionsRaw}
              onChange={(e) => setOptionsRaw(e.target.value)}
            />
          </div>
        )}
        <p className="text-[11px] text-muted-foreground mt-2 italic">
          {TYPE_META[type]?.hint}
        </p>
      </Card>

      <Card className="mt-4 shadow-elegant overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
          <div className="text-sm font-semibold">Champs configurés</div>
          <div className="flex items-center gap-2">
            {supportsTypes && (
              <Select value={filterScope} onValueChange={setFilterScope}>
                <SelectTrigger className="h-8 w-[220px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Tous les champs</SelectItem>
                  <SelectItem value="__shared__">Partagés uniquement</SelectItem>
                  {types.map((t) => (
                    <SelectItem key={t.id} value={t.id}>Type : {t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Badge variant="outline" className="bg-primary/5">{visibleFields.length}</Badge>
          </div>
        </div>
        {visibleFields.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            <Settings className="h-8 w-8 mx-auto mb-2 opacity-30" />
            Aucun champ personnalisé pour le moment.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {visibleFields.map((f, idx) => {
              const meta = TYPE_META[f.type];
              const isEditing = editingId === f.id;
              return (
                <div key={f.id} className="px-4 py-3 flex items-center gap-3 hover:bg-muted/20">
                  <div className="flex flex-col">
                    <Button variant="ghost" size="icon" className="h-5 w-5" disabled={idx === 0} onClick={() => move(f.id, -1)} aria-label="Monter">
                      <ArrowUp className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-5 w-5" disabled={idx === visibleFields.length - 1} onClick={() => move(f.id, 1)} aria-label="Descendre">
                      <ArrowDown className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="h-8 w-8 rounded-md bg-accent/40 flex items-center justify-center shrink-0">
                    <FieldIcon type={f.type} />
                  </div>
                  <div className="flex-1 min-w-0">
                    {isEditing ? (
                      <div className="space-y-2">
                        <Input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} className="h-8" />
                        {(f.type === "select" || f.type === "multiselect") && (
                          <Input
                            value={editOptions}
                            onChange={(e) => setEditOptions(e.target.value)}
                            placeholder="Options séparées par virgules"
                            className="h-8 text-xs"
                          />
                        )}
                        {supportsTypes && (
                          <Select value={editScope} onValueChange={setEditScope}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__shared__">Partagé (tous les types)</SelectItem>
                              {types.map((t) => (
                                <SelectItem key={t.id} value={t.id}>Type : {t.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    ) : (
                      <>
                        <div className="font-medium text-sm flex items-center gap-2 flex-wrap">
                          {f.label}
                          {f.required && (
                            <span className="text-[10px] font-semibold text-destructive uppercase">Requis</span>
                          )}
                          {supportsTypes && (
                            <Badge
                              variant="outline"
                              className={f.typeId
                                ? "border-primary/40 text-primary bg-primary/5 text-[10px]"
                                : "text-[10px]"}
                            >
                              <Layers className="h-3 w-3 mr-1" />{scopeLabel(f.typeId)}
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {meta?.label} · clé: <code className="text-foreground/70">{f.key ?? slugify(f.label)}</code>
                          {(f.type === "select" || f.type === "multiselect") && f.options && f.options.length > 0 && (
                            <> · {f.options.length} option(s)</>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                  <div className="hidden sm:flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground cursor-pointer" htmlFor={`req-${f.id}`}>Requis</Label>
                    <Switch id={`req-${f.id}`} checked={f.required} onCheckedChange={() => toggleReq(f.id)} />
                  </div>
                  {isEditing ? (
                    <>
                      <Button variant="ghost" size="icon" className="text-success hover:bg-success/10" onClick={() => saveEdit(f)} aria-label="Enregistrer">
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={cancelEdit} aria-label="Annuler">
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button variant="ghost" size="icon" onClick={() => startEdit(f)} aria-label={`Modifier ${f.label}`}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteTarget({ id: f.id, name: f.label })}
                        className="text-destructive hover:bg-destructive/10"
                        aria-label={`Supprimer ${f.label}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer le champ ?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget ? <>Le champ <strong>« {deleteTarget.name} »</strong> et toutes ses valeurs associées seront supprimés. Cette action est irréversible.</> : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRemove}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

const PRESET_CURRENCIES: Currency[] = [
  { code: "TND", symbol: "TND", decimals: 3, position: "suffix" },
  { code: "TND", symbol: "د.ت", decimals: 3, position: "suffix" },
  { code: "EUR", symbol: "€", decimals: 2, position: "suffix" },
  { code: "USD", symbol: "$", decimals: 2, position: "prefix" },
  { code: "MAD", symbol: "DH", decimals: 2, position: "suffix" },
  { code: "DZD", symbol: "DA", decimals: 2, position: "suffix" },
];

function CurrencySettings() {
  const live = useCurrency();
  const [draft, setDraft] = useState<Currency>(() => readCurrency());

  // Keep draft in sync if external change occurs
  useEffect(() => { setDraft(live); }, [live]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(live);

  const save = () => {
    if (!draft.symbol.trim()) { toast.error("Le symbole est requis"); return; }
    const cleaned: Currency = {
      ...draft,
      symbol: draft.symbol.trim(),
      code: draft.code.trim().toUpperCase() || "TND",
      decimals: Math.max(0, Math.min(4, Number(draft.decimals) || 0)),
    };
    void writeCurrency(cleaned);
    toast.success("Devise mise à jour", { description: `Affichée comme ${formatAmount(1234.5, cleaned)}` });
  };

  const reset = () => {
    void writeCurrency(DEFAULT_CURRENCY);
    setDraft(DEFAULT_CURRENCY);
    toast.success("Devise réinitialisée à TND");
  };

  return (
    <Card className="p-5 shadow-elegant">
      <div className="flex items-center gap-3 mb-1">
        <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
          <Coins className="h-4 w-4" />
        </div>
        <div>
          <div className="font-semibold text-sm">Devise de l'application</div>
          <div className="text-xs text-muted-foreground">Symbole, format et décimales utilisés partout (contrats, dashboard, dispatch…)</div>
        </div>
      </div>

      {/* Presets */}
      <div className="mt-4">
        <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Préréglages</Label>
        <div className="mt-2 flex flex-wrap gap-2">
          {PRESET_CURRENCIES.map((p, i) => {
            const active = p.code === draft.code && p.symbol === draft.symbol;
            return (
              <button
                key={`${p.code}-${i}`}
                onClick={() => setDraft(p)}
                className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium border transition-base ${
                  active ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted/50"
                }`}
              >
                <span className="font-semibold">{p.symbol}</span>
                <span className="text-muted-foreground">{p.code}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="space-y-1">
          <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Code</Label>
          <Input value={draft.code} maxLength={6} onChange={(e) => setDraft({ ...draft, code: e.target.value })} placeholder="TND" />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Symbole</Label>
          <Input value={draft.symbol} maxLength={6} onChange={(e) => setDraft({ ...draft, symbol: e.target.value })} placeholder="TND" />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Décimales</Label>
          <Select value={String(draft.decimals)} onValueChange={(v) => setDraft({ ...draft, decimals: Number(v) })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {[0, 1, 2, 3, 4].map((d) => <SelectItem key={d} value={String(d)}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Position</Label>
          <Select value={draft.position} onValueChange={(v: "prefix" | "suffix") => setDraft({ ...draft, position: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="suffix">Après le montant (1 234 TND)</SelectItem>
              <SelectItem value="prefix">Avant le montant ($ 1 234)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Preview */}
      <div className="mt-5 p-4 rounded-lg border border-border bg-muted/30">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Aperçu</div>
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <div>
            <div className="text-[10px] text-muted-foreground">Cotisation</div>
            <div className="text-lg font-semibold">{formatAmount(950, draft)}</div>
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground">CA mensuel</div>
            <div className="text-lg font-semibold">{formatAmount(125430.5, draft)}</div>
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground">Petit montant</div>
            <div className="text-lg font-semibold">{formatAmount(7.5, draft)}</div>
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2 justify-end">
        <Button variant="outline" size="sm" onClick={reset}>
          <RotateCcw className="h-4 w-4 mr-1.5" />Réinitialiser
        </Button>
        <Button size="sm" disabled={!dirty} onClick={save} className="bg-primary text-primary-foreground hover:bg-primary/90">
          <Save className="h-4 w-4 mr-1.5" />Enregistrer
        </Button>
      </div>
    </Card>
  );
}

function ConfigPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "Administrateur";

  if (!isAdmin) {
    return (
      <AppLayout skeleton="form">
        <PageHeader
          title="Configuration"
          description="Réservé aux administrateurs"
          icon={<Settings className="h-5 w-5" />}
        />
        <Card className="mt-6 p-8 text-center text-sm text-muted-foreground">
          Cette page est réservée au rôle <strong>Administrateur</strong>.
        </Card>
      </AppLayout>
    );
  }

  return (
    <AppLayout skeleton="form">
      <PageHeader
        title="Configuration"
        description="Devise, formats et champs personnalisés de vos formulaires"
        icon={<Settings className="h-5 w-5" />}
      />

      <Tabs defaultValue="general" className="mt-6">
        <TabsList>
          <TabsTrigger value="general">Général</TabsTrigger>
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
          <TabsTrigger value="types">Types de prospect</TabsTrigger>
          <TabsTrigger value="prospect">Prospects</TabsTrigger>
          <TabsTrigger value="opportunity">Opportunités</TabsTrigger>
          <TabsTrigger value="contract">Contrats</TabsTrigger>
          <TabsTrigger value="user">Utilisateurs</TabsTrigger>
          <TabsTrigger value="teams">Équipes</TabsTrigger>
          <Can anyOf={["guichet.view_objectives", "guichet.manage_objectives"]}>
            <TabsTrigger value="guichet-objectives">Guichet · Objectifs</TabsTrigger>
          </Can>
          <Can perm="guichet.manage_entities">
            <TabsTrigger value="guichet-entities">Guichet · Entités</TabsTrigger>
          </Can>
        </TabsList>
        <TabsContent value="general" className="space-y-4 mt-4">
          <CurrencySettings />
        </TabsContent>
        <TabsContent value="sessions" className="space-y-4 mt-4"><IdleTimeoutsPanel /></TabsContent>
        <TabsContent value="types" className="space-y-0 mt-4"><ProspectTypesPanel /></TabsContent>
        <TabsContent value="prospect" className="space-y-0 mt-4"><FieldList tab="prospect" /></TabsContent>
        <TabsContent value="opportunity" className="space-y-0 mt-4"><FieldList tab="opportunity" /></TabsContent>
        <TabsContent value="contract" className="space-y-0 mt-4"><FieldList tab="contract" /></TabsContent>
        <TabsContent value="user" className="space-y-0 mt-4"><FieldList tab="user" /></TabsContent>
        <TabsContent value="teams" className="space-y-4 mt-4"><TeamsPanel /></TabsContent>
        <TabsContent value="guichet-objectives" className="space-y-4 mt-4"><ObjectivesPanel /></TabsContent>
        <TabsContent value="guichet-entities" className="space-y-4 mt-4"><EntitiesPanel /></TabsContent>
      </Tabs>
    </AppLayout>
  );
}
