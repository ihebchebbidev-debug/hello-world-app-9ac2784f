// FilterPresetPicker — dropdown to pick an admin-managed filter preset, plus
// (for admins) a manager dialog to create/edit/delete/set-default presets.
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Filter, Plus, Settings, Star, Trash2, X, Pencil, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import {
  useFilterPresets, useFilterPresetActions, resolveInitialPreset,
  type FilterPreset, type FilterPresetScope,
} from "@/lib/filterPresets";
import { confirmDialog } from "@/components/ConfirmDialogProvider";

const ROLES = [
  "Administrateur", "Manager", "Agent",
  "Backoffice", "AgentSuivi", "AgentActivation", "AgentVente",
];

export type FilterFieldSchema = {
  key: string;
  label: string;
  type: "text" | "select" | "date";
  /** For select. Each option's value is what gets stored in the preset. */
  options?: { value: string; label: string }[];
  description?: string;
};

type Props = {
  scope: FilterPresetScope;
  /** Current filters object that maps directly to the page's filter state. */
  current: Record<string, unknown>;
  /** Apply a preset's filters to the page's local state. */
  onApply: (filters: Record<string, unknown>) => void;
  /** Reset all filters (called when user clears the active preset). */
  onReset?: () => void;
  /** Optional: declare known filter keys so the manager UI can hint which fields are saved. */
  filterKeys?: string[];
  /** Recommended: full schema enabling no-JSON checkbox/value editing. */
  filterSchema?: FilterFieldSchema[];
};

export function FilterPresetPicker({ scope, current, onApply, onReset, filterKeys, filterSchema }: Props) {
  const { user, hasPermission } = useAuth();
  const q = useFilterPresets(scope);
  const actions = useFilterPresetActions(scope);
  const data = q.data;

  // Server tells us if the current user can manage presets; fall back to role check.
  const canManage =
    data?.canManage ??
    (user?.role === "Administrateur" ||
      hasPermission?.("filter_preset.manage"));

  const [activeId, setActiveId] = useState<string | null>(null);
  const autoApplied = useRef(false);
  const [open, setOpen] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
  const [editing, setEditing] = useState<FilterPreset | null>(null);

  // Sync activeId from server's myChoice and auto-apply filters whenever the
  // chosen preset (or its contents, if an admin edited it) changes.
  const lastAppliedSig = useRef<string | null>(null);
  useEffect(() => {
    if (!data) return;
    let target: FilterPreset | null = null;
    if (!autoApplied.current) {
      target = resolveInitialPreset(data);
      autoApplied.current = true;
    } else if (data.myChoice) {
      target = data.presets.find((p) => p.id === data.myChoice) ?? null;
    } else if (activeId) {
      target = data.presets.find((p) => p.id === activeId) ?? null;
    }
    if (target) {
      const sig = `${target.id}::${JSON.stringify(target.filters)}`;
      if (sig !== lastAppliedSig.current) {
        lastAppliedSig.current = sig;
        onApply(target.filters);
        setActiveId(target.id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const presets = useMemo(
    () => [...(data?.presets ?? [])].sort((a, b) => a.position - b.position),
    [data],
  );
  const effectiveDefault = data?.effectiveDefault ?? null;

  const apply = async (p: FilterPreset) => {
    // Mark as applied BEFORE calling onApply so the post-refetch effect
    // doesn't re-fire onApply with stale data and clobber state.
    lastAppliedSig.current = `${p.id}::${JSON.stringify(p.filters)}`;
    setActiveId(p.id);
    onApply(p.filters);
    setOpen(false);
    const count = Object.keys(p.filters || {}).filter((k) => {
      const v = (p.filters as any)[k];
      return v != null && v !== "";
    }).length;
    toast.success(`Modèle « ${p.name} » appliqué`, {
      description: count > 0 ? `${count} filtre(s) actif(s)` : "Aucun filtre — affichage complet",
    });
    try { await actions.choose(p.id); }
    catch (e: any) { toast.error(e?.message ?? "Choix non enregistré"); }
  };

  const clear = async () => {
    lastAppliedSig.current = null;
    setActiveId(null);
    onReset?.();
    setOpen(false);
    toast.success("Modèle effacé");
    try { await actions.choose(null); }
    catch (e: any) { toast.error(e?.message ?? "Réinitialisation échouée"); }
  };

  const move = async (id: string, dir: -1 | 1) => {
    const ids = presets.map((p) => p.id);
    const idx = ids.indexOf(id);
    const next = idx + dir;
    if (idx < 0 || next < 0 || next >= ids.length) return;
    [ids[idx], ids[next]] = [ids[next], ids[idx]];
    try { await actions.reorder(ids); }
    catch (e: any) { toast.error(e?.message ?? "Réordonnancement échoué"); }
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant={activeId ? "default" : "outline"}
            size="sm"
            className={`h-10 transition-all duration-200 ${activeId ? "shadow-md ring-2 ring-primary/20" : ""}`}
          >
            <Filter className="h-4 w-4 mr-1.5" />
            {activeId
              ? <span className="max-w-[140px] truncate">{presets.find((p) => p.id === activeId)?.name ?? "Modèle"}</span>
              : "Modèles de filtres"}
            {presets.length > 0 && !activeId && (
              <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted text-foreground text-[10px] font-semibold px-1.5">
                {presets.length}
              </span>
            )}
            {activeId && (
              <Check className="h-3.5 w-3.5 ml-1.5 animate-in zoom-in-50 duration-300" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-96 p-0">
          <div className="px-3 py-2 border-b border-border flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-sm font-semibold">Modèles partagés</div>
              {effectiveDefault && (
                <div className="text-[11px] text-muted-foreground truncate">
                  Défaut : <span className="font-medium text-foreground">{effectiveDefault.name}</span>
                  {effectiveDefault.defaultRole ? ` (${effectiveDefault.defaultRole})` : " (global)"}
                </div>
              )}
            </div>
            {canManage && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 shrink-0"
                onClick={() => { setEditing(null); setManagerOpen(true); setOpen(false); }}
              >
                <Settings className="h-3.5 w-3.5 mr-1" />Gérer
              </Button>
            )}
          </div>

          {q.isLoading ? (
            <div className="p-4 text-sm text-muted-foreground">Chargement…</div>
          ) : presets.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              <Filter className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <div>Aucun modèle pour l'instant.</div>
              {canManage && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3"
                  onClick={() => { setEditing(null); setManagerOpen(true); setOpen(false); }}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />Créer un modèle
                </Button>
              )}
            </div>
          ) : (
            <ul className="max-h-80 overflow-y-auto p-2 space-y-1">
              {presets.map((p) => {
                const isActive = activeId === p.id;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => apply(p)}
                      className={`w-full text-left rounded-md px-3 py-2 text-sm border transition-colors ${
                        isActive
                          ? "border-primary bg-primary/5"
                          : "border-transparent hover:bg-accent"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium truncate">{p.name}</div>
                        <div className="flex items-center gap-1 shrink-0">
                          {p.isDefault && (
                            <Badge variant="secondary" className="h-5 text-[10px] px-1.5">
                              <Star className="h-2.5 w-2.5 mr-0.5" />
                              {p.defaultRole ? p.defaultRole : "Défaut"}
                            </Badge>
                          )}
                          {isActive && <Check className="h-3.5 w-3.5 text-primary" />}
                        </div>
                      </div>
                      {p.description && (
                        <div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                          {p.description}
                        </div>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {(activeId || presets.length > 0) && (
            <div className="border-t border-border p-2 flex items-center justify-between">
              <Button size="sm" variant="ghost" onClick={clear}>
                <X className="h-3.5 w-3.5 mr-1" />Effacer le modèle
              </Button>
              {canManage && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditing(null);
                    setManagerOpen(true);
                    setOpen(false);
                  }}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Créer depuis filtres actuels
                </Button>
              )}
            </div>
          )}
        </PopoverContent>
      </Popover>

      {canManage && (
        <PresetManagerDialog
          open={managerOpen}
          onOpenChange={setManagerOpen}
          scope={scope}
          presets={presets}
          editing={editing}
          setEditing={setEditing}
          currentFilters={current}
          filterKeys={filterKeys}
          filterSchema={filterSchema}
          canDelete={user?.role === "Administrateur"}
          onCreate={async (input) => { await actions.create(input); }}
          onUpdate={async (id, patch) => { await actions.update(id, patch); }}
          onDelete={async (id) => { await actions.remove(id); if (activeId === id) setActiveId(null); }}
          onMove={move}
        />
      )}
    </>
  );
}

// ---------- Manager dialog --------------------------------------------------

type ManagerProps = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  scope: FilterPresetScope;
  presets: FilterPreset[];
  editing: FilterPreset | null;
  setEditing: (p: FilterPreset | null) => void;
  currentFilters: Record<string, unknown>;
  filterKeys?: string[];
  filterSchema?: FilterFieldSchema[];
  onCreate: (input: {
    name: string;
    description?: string;
    filters: Record<string, unknown>;
    isShared?: boolean;
    isDefault?: boolean;
    defaultRole?: string | null;
  }) => Promise<void>;
  onUpdate: (id: string, patch: Partial<Omit<FilterPreset, "id" | "scope">>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onMove: (id: string, dir: -1 | 1) => Promise<void>;
  canDelete?: boolean;
};

const ROLE_GLOBAL = "__global__";

function PresetManagerDialog(props: ManagerProps) {
  const {
    open, onOpenChange, presets, editing, setEditing,
    currentFilters, filterKeys, filterSchema, onCreate, onUpdate, onDelete, onMove,
    canDelete = false,
  } = props;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [defaultRole, setDefaultRole] = useState<string>(ROLE_GLOBAL);
  const [filtersText, setFiltersText] = useState("{}");
  const [busy, setBusy] = useState(false);

  // Per-field state for the schema-driven UI: which keys are enabled, their values,
  // and (for select fields) whether to switch to free-text input mode.
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [freeText, setFreeText] = useState<Record<string, boolean>>({});

  // Sync form when editing target changes or dialog opens.
  useEffect(() => {
    if (!open) return;
    const init = (preset: { filters?: Record<string, unknown> } | null) => {
      const f = (preset?.filters ?? {}) as Record<string, unknown>;
      const en: Record<string, boolean> = {};
      const va: Record<string, string> = {};
      if (filterSchema) {
        for (const s of filterSchema) {
          const has = Object.prototype.hasOwnProperty.call(f, s.key);
          en[s.key] = has;
          va[s.key] = has ? String(f[s.key] ?? "") : "";
        }
      }
      setEnabled(en);
      setValues(va);
      setFiltersText(JSON.stringify(f, null, 2));
    };
    if (editing) {
      setName(editing.name);
      setDescription(editing.description ?? "");
      setIsDefault(!!editing.isDefault);
      setDefaultRole(editing.defaultRole ?? ROLE_GLOBAL);
      init(editing);
    } else {
      setName("");
      setDescription("");
      setIsDefault(false);
      setDefaultRole(ROLE_GLOBAL);
      init({ filters: currentFilters });
    }
  }, [editing, open, currentFilters, filterSchema]);

  const buildFiltersFromSchema = (): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const s of filterSchema ?? []) {
      if (!enabled[s.key]) continue;
      const v = values[s.key] ?? "";
      if (v === "") continue;
      out[s.key] = v;
    }
    return out;
  };

  const parseFilters = (): Record<string, unknown> | null => {
    if (filterSchema && filterSchema.length > 0) {
      return buildFiltersFromSchema();
    }
    try {
      const v = JSON.parse(filtersText);
      if (!v || typeof v !== "object" || Array.isArray(v)) {
        toast.error("Les filtres doivent être un objet JSON");
        return null;
      }
      return v as Record<string, unknown>;
    } catch {
      toast.error("JSON des filtres invalide");
      return null;
    }
  };

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) { toast.error("Nom requis"); return; }
    const filters = parseFilters();
    if (!filters) return;
    setBusy(true);
    try {
      const payload = {
        name: trimmed,
        description: description.trim() || undefined,
        filters,
        isShared: true,
        isDefault,
        defaultRole: defaultRole === ROLE_GLOBAL ? null : defaultRole,
      };
      if (editing) {
        await onUpdate(editing.id, payload);
        toast.success(`Modèle "${trimmed}" mis à jour`);
      } else {
        await onCreate(payload);
        toast.success(`Modèle "${trimmed}" créé`);
      }
      setEditing(null);
      setName("");
      setDescription("");
      setIsDefault(false);
      setDefaultRole(ROLE_GLOBAL);
      setFiltersText(JSON.stringify(currentFilters ?? {}, null, 2));
    } catch (e: any) {
      toast.error(e?.message ?? "Échec de l'enregistrement");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!(await confirmDialog({ title: "Suppression", description: "Supprimer ce modèle ?", tone: "destructive", confirmText: "Supprimer" }))) return;
    try {
      await onDelete(id);
      toast.success("Modèle supprimé");
      if (editing?.id === id) setEditing(null);
    } catch (e: any) {
      toast.error(e?.message ?? "Échec de la suppression");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Gérer les modèles de filtres</DialogTitle>
          <DialogDescription>
            Crée des modèles partagés que les utilisateurs pourront sélectionner.
            Marque-en un comme défaut (global ou par rôle) pour qu'il s'applique automatiquement.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-4">
          {/* Existing presets list */}
          <div className="border rounded-md max-h-[420px] overflow-y-auto">
            <div className="px-3 py-2 border-b bg-muted/30 text-xs font-semibold uppercase tracking-wider">
              Existants ({presets.length})
            </div>
            {presets.length === 0 ? (
              <div className="p-4 text-xs text-muted-foreground">Aucun modèle.</div>
            ) : (
              <ul className="divide-y">
                {presets.map((p) => (
                  <li
                    key={p.id}
                    className={`px-3 py-2 text-sm cursor-pointer hover:bg-accent ${
                      editing?.id === p.id ? "bg-accent" : ""
                    }`}
                    onClick={() => setEditing(p)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{p.name}</div>
                        {p.isDefault && (
                          <Badge variant="secondary" className="mt-1 h-4 text-[10px] px-1">
                            <Star className="h-2.5 w-2.5 mr-0.5" />
                            {p.defaultRole ? p.defaultRole : "Défaut global"}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                          disabled={presets[0]?.id === p.id}
                          onClick={(e) => { e.stopPropagation(); onMove(p.id, -1); }}
                          title="Monter"
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                          disabled={presets[presets.length - 1]?.id === p.id}
                          onClick={(e) => { e.stopPropagation(); onMove(p.id, 1); }}
                          title="Descendre"
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          className="p-1 text-muted-foreground hover:text-foreground"
                          onClick={(e) => { e.stopPropagation(); setEditing(p); }}
                          title="Éditer"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        {canDelete && (
                          <button
                            type="button"
                            className="p-1 text-destructive hover:opacity-80"
                            onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }}
                            title="Supprimer (Administrateur uniquement)"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="p-2 border-t">
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                onClick={() => setEditing(null)}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />Nouveau
              </Button>
            </div>
          </div>

          {/* Form */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nom</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Leads non traités Tunis" />
            </div>
            <div className="space-y-1.5">
              <Label>Description (optionnel)</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3 items-end">
              <div className="space-y-1.5">
                <Label>Défaut</Label>
                <div className="flex items-center gap-2 h-10">
                  <Switch checked={isDefault} onCheckedChange={setIsDefault} />
                  <span className="text-xs text-muted-foreground">
                    Appliqué automatiquement à l'ouverture
                  </span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Cible du défaut</Label>
                <Select value={defaultRole} onValueChange={setDefaultRole} disabled={!isDefault}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ROLE_GLOBAL}>Tous les utilisateurs</SelectItem>
                    {ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {filterSchema && filterSchema.length > 0 ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Filtres inclus dans ce modèle</Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => {
                      const en: Record<string, boolean> = {};
                      const va: Record<string, string> = {};
                      const cur = (currentFilters ?? {}) as Record<string, unknown>;
                      for (const s of filterSchema) {
                        const has = Object.prototype.hasOwnProperty.call(cur, s.key);
                        const v = has ? String(cur[s.key] ?? "") : "";
                        en[s.key] = has && v !== "" && v !== "__all__";
                        va[s.key] = v;
                      }
                      setEnabled(en);
                      setValues(va);
                    }}
                  >
                    Reprendre les filtres actuels
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Cochez les critères à appliquer, puis choisissez la valeur. Les
                  champs non cochés ne seront pas filtrés.
                </p>
                <div className="border rounded-md divide-y max-h-[300px] overflow-y-auto">
                  {filterSchema.map((f) => {
                    const on = !!enabled[f.key];
                    const val = values[f.key] ?? "";
                    return (
                      <div key={f.key} className="px-3 py-2 flex items-start gap-3">
                        <input
                          type="checkbox"
                          id={`pp-${f.key}`}
                          className="mt-2 h-4 w-4 rounded border-input"
                          checked={on}
                          onChange={(e) => setEnabled((p) => ({ ...p, [f.key]: e.target.checked }))}
                        />
                        <div className="flex-1 min-w-0">
                          <Label htmlFor={`pp-${f.key}`} className="text-sm font-medium">
                            {f.label}
                          </Label>
                          {f.description && (
                            <p className="text-[11px] text-muted-foreground mt-0.5">{f.description}</p>
                          )}
                          <div className="mt-1.5">
                            {f.type === "select" && !freeText[f.key] ? (
                              <div className="flex gap-1.5">
                                <Select
                                  value={val || undefined}
                                  onValueChange={(v) => {
                                    setValues((p) => ({ ...p, [f.key]: v }));
                                    setEnabled((p) => ({ ...p, [f.key]: true }));
                                  }}
                                  disabled={!on}
                                >
                                  <SelectTrigger className="h-9 flex-1"><SelectValue placeholder="Choisir une valeur…" /></SelectTrigger>
                                  <SelectContent>
                                    {(f.options ?? []).map((o) => (
                                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-9 text-[11px] shrink-0"
                                  onClick={() => setFreeText((p) => ({ ...p, [f.key]: true }))}
                                  title="Saisir une valeur libre (non listée)"
                                >
                                  <Pencil className="h-3 w-3 mr-1" />Libre
                                </Button>
                              </div>
                            ) : (
                              <div className="flex gap-1.5">
                                <Input
                                  type={f.type === "date" ? "date" : "text"}
                                  value={val}
                                  onChange={(e) => {
                                    setValues((p) => ({ ...p, [f.key]: e.target.value }));
                                    if (e.target.value) setEnabled((p) => ({ ...p, [f.key]: true }));
                                  }}
                                  disabled={!on}
                                  className="h-9 flex-1"
                                  placeholder={
                                    f.type === "date"
                                      ? ""
                                      : f.type === "select"
                                        ? "Saisir une valeur libre…"
                                        : "Saisir une valeur (texte libre)…"
                                  }
                                />
                                {f.type === "select" && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="h-9 text-[11px] shrink-0"
                                    onClick={() => setFreeText((p) => ({ ...p, [f.key]: false }))}
                                    title="Revenir à la liste"
                                  >
                                    <X className="h-3 w-3" />
                                  </Button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>Filtres (JSON)</Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => setFiltersText(JSON.stringify(currentFilters ?? {}, null, 2))}
                  >
                    Reprendre les filtres actuels
                  </Button>
                </div>
                <Textarea
                  value={filtersText}
                  onChange={(e) => setFiltersText(e.target.value)}
                  rows={10}
                  className="font-mono text-xs"
                />
                {filterKeys && filterKeys.length > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    Clés disponibles : <code>{filterKeys.join(", ")}</code>
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fermer</Button>
          <Button onClick={submit} disabled={busy}>
            {editing ? "Enregistrer" : "Créer le modèle"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
