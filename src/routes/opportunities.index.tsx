import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { Target, RotateCcw, FileSignature, Trash2, Eye, Search, X, Download, FileSpreadsheet, FileJson, Paperclip } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { api, API_ENABLED } from "@/lib/api";
import { useApiQuery, useQuery, useQueryClient } from "@/lib/queryClient";
import { fetchAllPaginated } from "@/lib/paginatedFetch";
import { useAuth } from "@/lib/auth";
import { exportCSV, exportJSON, exportXLSX, withCustomFields, relabelRows } from "@/lib/exportUtils";
import { OPPORTUNITY_LABELS } from "@/lib/exportLabels";
import { DataGrid, CellSelect, type DataGridColumn } from "@/components/DataGrid";
import { SavedViews } from "@/components/SavedViews";
import { CustomColumnsPicker } from "@/components/CustomColumnsPicker";
import { useCustomFieldsTable, formatCustomValue } from "@/lib/useCustomFields";
import { useErp } from "@/lib/erpStore";
import type { Opportunity, OpportunityStage } from "@/lib/types";
import { useMemo, useState } from "react";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AttachmentsCard } from "@/components/AttachmentsCard";
import { FilterPresetPicker } from "@/components/FilterPresetPicker";
import { autoFilterSchema, schemaKeys } from "@/lib/autoFilterSchemas";
import { confirmDialog } from "@/components/ConfirmDialogProvider";

const opportunitiesSearchSchema = z.object({
  stage: fallback(z.string().optional(), undefined),
});

export const Route = createFileRoute("/opportunities/")({
  validateSearch: zodValidator(opportunitiesSearchSchema),
  head: () => ({
    meta: [
      { title: "Opportunités — CRM" },
      { name: "description", content: "Pipeline opportunités — feuille interactive style Excel." },
    ],
  }),
  component: OpportunitiesPage,
});

const ALL = "__all__";
const PAGE_SIZE = 50;

function OpportunitiesPage() {
  const { user, hasPermission } = useAuth();
  const { users, refresh } = useErp();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { stage: filterStage } = Route.useSearch();

  const isAdmin = user?.role === "Administrateur";
  const isAgent = user?.role === "Agent" || user?.role === "AgentSuivi" || user?.role === "AgentActivation" || user?.role === "AgentVente";
  const canConvert = hasPermission("opportunity.convert");
  const canRevert = hasPermission("opportunity.revert");
  const canDelete = hasPermission("opportunity.delete");
  const canExport = hasPermission("opportunity.export");
  const canEdit = hasPermission("opportunity.edit");

  const oppQ = useQuery<{ opportunities: Opportunity[] }, Error>({
    queryKey: ["opportunities"],
    queryFn: async ({ signal }: { signal?: AbortSignal }) => {
      const opportunities = await fetchAllPaginated<Opportunity>(
        "/opportunities.php", "opportunities",
        { baseQuery: { _t: Date.now() }, signal },
      );
      return { opportunities };
    },
    enabled: API_ENABLED,
    staleTime: 0,
  });
  const stageQ = useApiQuery<{ stages: OpportunityStage[] }>(
    ["opportunity_stages"], "/opportunity_stages.php",
    { enabled: API_ENABLED, staleTime: 5 * 60_000 },
  );
  const items: Opportunity[] = (oppQ.data?.opportunities ?? []).filter(o => !o.convertedToContract);
  const stages = useMemo(
    () => [...(stageQ.data?.stages ?? [])].sort((x, y) => x.position - y.position),
    [stageQ.data],
  );
  const loading = oppQ.isLoading || stageQ.isLoading;
  const reload = () => qc.invalidateQueries({ queryKey: ["opportunities"] });
  if (oppQ.error) toast.error(oppQ.error.message ?? "Échec du chargement");

  const { defs: customDefs, valuesById: customValuesById } = useCustomFieldsTable("opportunity");

  const agentOptions = useMemo(
    () => users.filter((u) => u.role === "Agent" || u.role === "Manager" || u.role === "AgentSuivi" || u.role === "AgentActivation" || u.role === "AgentVente").map((u) => u.username),
    [users],
  );

  // -------- Persisted filters (mirrors contracts) --------
  const [search, setSearch] = usePersistedState("opportunities:list:search", "");
  const [stageF, setStageF] = usePersistedState("opportunities:list:stage", ALL);
  const [assigne, setAssigne] = usePersistedState("opportunities:list:assigne", ALL);
  const [source, setSource] = usePersistedState("opportunities:list:source", ALL);
  const [dateCree, setDateCree] = usePersistedState("opportunities:list:dateCree", "");
  const [dateFrom, setDateFrom] = usePersistedState("opportunities:list:dateFrom", "");
  const [dateTo, setDateTo] = usePersistedState("opportunities:list:dateTo", "");
  const [page, setPage] = usePersistedState("opportunities:list:page", 0);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [attachOpp, setAttachOpp] = useState<Opportunity | null>(null);
  const [presetExtra, setPresetExtra] = useState<Record<string, unknown>>({});
  const [visibleCols, setVisibleCols] = useState<Set<string>>(new Set());
  const [customFilters, setCustomFilters] = useState<Record<string, string>>({});
  const setCustomFilter = (k: string, v: string) =>
    setCustomFilters((prev) => {
      const next = { ...prev };
      if (!v) delete next[k]; else next[k] = v;
      return next;
    });

  // Dynamic options
  const sourceOptions = useMemo(() => {
    const set = new Set<string>();
    for (const o of items) if (o.source) set.add(o.source);
    if (source !== ALL && source) set.add(source);
    return [...set].sort((a, b) => a.localeCompare(b, "fr"));
  }, [items, source]);
  const assigneOptions = useMemo(() => {
    const set = new Set<string>(agentOptions);
    for (const o of items) if (o.assignedTo) set.add(o.assignedTo);
    if (assigne !== ALL && assigne) set.add(assigne);
    return [...set].sort((a, b) => a.localeCompare(b, "fr"));
  }, [items, agentOptions, assigne]);

  // -------- Saved views --------
  type ViewState = { search: string; stage: string; assigne: string; source: string; dateCree: string };
  const currentView: ViewState = { search, stage: stageF, assigne, source, dateCree };
  const VIEW_KEYS = ["search", "stage", "assigne", "source", "dateCree"];
  const applyView = (v: ViewState) => {
    setSearch(v.search ?? "");
    setStageF(v.stage ?? ALL);
    setAssigne(v.assigne ?? ALL);
    setSource(v.source ?? ALL);
    setDateCree(v.dateCree ?? "");
    setPage(0);
  };
  const eqView = (a: ViewState, b: ViewState) =>
    a.search === b.search && a.stage === b.stage && a.assigne === b.assigne &&
    a.source === b.source && a.dateCree === b.dateCree;

  const reset = () => {
    setSearch(""); setStageF(ALL); setAssigne(ALL); setSource(ALL);
    setDateCree(""); setDateFrom(""); setDateTo("");
    setPresetExtra({}); setCustomFilters({}); setPage(0);
    toast.success("Filtres réinitialisés");
  };

  // -------- Mutations --------
  const updateStage = async (id: string, stage: string) => {
    try {
      await api("/opportunities.php", { method: "PATCH", body: { id, stage } });
      toast.success("Statut mis à jour"); reload();
    } catch (e: any) { toast.error(e?.message); }
  };
  const revert = async (id: string) => {
    if (!(await confirmDialog({ title: "Confirmer l'action", description: "Renvoyer cette opportunité dans la liste des leads ?", tone: "warning", confirmText: "Continuer" })) ) return;
    try {
      const r = await api<{ prospectId?: string | null }>("/opportunities.php", { method: "POST", body: { action: "revert_to_prospect", id } });
      // Refresh both opportunities cache AND ERP store (prospects) so the
      // lead reappears in /prospects without a manual hard-refresh.
      reload();
      try { await refresh?.(); } catch {}
      const restoredAt = new Date().toISOString();
      try {
        sessionStorage.setItem("crm:reverted-prospect", JSON.stringify({ prospectId: r.prospectId, opportunityId: id, restoredAt }));
      } catch {}
      toast.success("Retournée vers les leads", { description: r.prospectId ? `Ouverture de la fiche ${r.prospectId}` : undefined });
      if (r.prospectId) {
        navigate({ to: "/prospects/$prospectId", params: { prospectId: r.prospectId } });
      }
    } catch (e: any) { toast.error(e?.message); }
  };
  const convertContract = async (id: string) => {
    if (!(await confirmDialog({ title: "Conversion", description: "Convertir cette opportunité en contrat ?", tone: "info", confirmText: "Convertir" }))) return;
    try {
      const r = await api<{ contractId: string }>("/opportunities.php",
        { method: "POST", body: { action: "convert_to_contract", id } });
      toast.success("Contrat créé");
      // Invalidate both lists so the new contract appears and the opportunity
      // disappears from the active opportunities list when navigating back.
      qc.invalidateQueries({ queryKey: ["contracts"] });
      qc.invalidateQueries({ queryKey: ["opportunities"] });
      navigate({ to: "/contracts/$contractId", params: { contractId: r.contractId } });
    } catch (e: any) { toast.error(e?.message); }
  };
  const remove = async (id: string) => {
    if (!(await confirmDialog({ title: "Suppression", description: "Supprimer cette opportunité ?", tone: "destructive", confirmText: "Supprimer" }))) return;
    try {
      await api(`/opportunities.php?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      toast.success("Supprimée"); reload();
    } catch (e: any) { toast.error(e?.message); }
  };

  const stageColor = (name: string) => {
    const s = stages.find((x) => x.name === name);
    if (s?.isWon) return "bg-success/15 text-success border-success/20";
    if (s?.isLost) return "bg-destructive/15 text-destructive border-destructive/20";
    return "bg-info/15 text-info border-info/20";
  };

  const debouncedSearch = useDebouncedValue(search, 250);
  const haystackById = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of items) {
      m.set(o.id, `${o.lastName} ${o.firstName} ${o.phone} ${o.city} ${o.title ?? ""} ${o.cin ?? ""} ${o.email ?? ""}`.toLowerCase());
    }
    return m;
  }, [items]);
  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    const cfEntries = Object.entries(customFilters);
    const KEY_MAP: Record<string, string> = { stage: "stage", assigne: "assignedTo" };
    return items.filter((o) => {
      if (q) {
        const hay = haystackById.get(o.id) ?? "";
        if (!hay.includes(q)) return false;
      }
      if (filterStage && o.stage !== filterStage) return false;
      if (stageF !== ALL && o.stage !== stageF) return false;
      if (assigne !== ALL && o.assignedTo !== assigne) return false;
      if (source !== ALL && o.source !== source) return false;
      if (dateCree && (o.createdAt ?? "").slice(0, 10) !== dateCree) return false;
      if (dateFrom && (o.createdAt ?? "").slice(0, 10) < dateFrom) return false;
      if (dateTo && (o.createdAt ?? "").slice(0, 10) > dateTo) return false;
      if (cfEntries.length > 0) {
        const vals = customValuesById[o.id] ?? {};
        for (const [k, want] of cfEntries) {
          const v = String(vals[k] ?? "").toLowerCase();
          if (!v.includes(want.toLowerCase())) return false;
        }
      }
      for (const [k, raw] of Object.entries(presetExtra)) {
        if (raw == null || raw === "" || VIEW_KEYS.includes(k)) continue;
        if (k === "amountMin") { if (Number(o.amount) < Number(raw)) return false; continue; }
        if (k === "amountMax") { if (Number(o.amount) > Number(raw)) return false; continue; }
        if (k === "probabilityMin") { if (Number(o.probability) < Number(raw)) return false; continue; }
        const field = KEY_MAP[k] ?? k;
        const val = (o as any)[field];
        const target = String(raw).toLowerCase();
        if (val == null) return false;
        if (typeof val === "boolean") { if (String(val) !== target) return false; continue; }
        if (!String(val).toLowerCase().includes(target)) return false;
      }
      return true;
    });
  }, [items, debouncedSearch, haystackById, stageF, filterStage, assigne, source, dateCree, dateFrom, dateTo, customFilters, customValuesById, presetExtra]);

  const presetChips = useMemo(() => {
    const schema = autoFilterSchema("opportunities", { opportunityStages: stages.map((s) => s.name), rows: items as any });
    const labelOf = (k: string) => schema.find((s) => s.key === k)?.label ?? k;
    return Object.entries(presetExtra)
      .filter(([k, v]) => v != null && v !== "" && !VIEW_KEYS.includes(k))
      .map(([k, v]) => ({ key: k, label: labelOf(k), value: String(v) }));
  }, [presetExtra, stages, items]);

  const exportRows = useMemo(
    () => relabelRows(withCustomFields(filtered, customDefs, customValuesById), OPPORTUNITY_LABELS),
    [filtered, customDefs, customValuesById],
  );

  // Stats (mirrors contracts)
  const stats = useMemo(() => {
    const wonNames = new Set(stages.filter((s) => s.isWon).map((s) => s.name));
    const lostNames = new Set(stages.filter((s) => s.isLost).map((s) => s.name));
    return {
      total: filtered.length,
      won: filtered.filter((o) => wonNames.has(o.stage)).length,
      open: filtered.filter((o) => !wonNames.has(o.stage) && !lostNames.has(o.stage)).length,
    };
  }, [filtered, stages]);

  const baseColumns: DataGridColumn<Opportunity>[] = [
    {
      key: "lastName", header: "Nom", accessor: (o) => o.lastName,
      cell: (o) => (
        <div className="font-medium text-[13px] truncate">{o.civility} {o.lastName} {o.firstName}</div>
      ),
    },
    { key: "phone", header: "Téléphone", accessor: (o) => o.phone, hideBelow: "md" },
    { key: "city", header: "Ville", accessor: (o) => o.city, hideBelow: "lg" },
    {
      key: "stage", header: "Statut", accessor: (o) => o.stage,
      cell: (o) => <Badge variant="outline" className={`${stageColor(o.stage)} font-normal text-[11px]`}>{o.stage}</Badge>,
      editor: ({ value, setValue }) => <CellSelect value={value} setValue={setValue} options={stages.map((s) => ({ value: s.name, label: s.name }))} />,
    },
    {
      key: "probability", header: "%", accessor: (o) => o.probability, align: "right",
      cell: (o) => <span className="text-muted-foreground">{o.probability}%</span>,
      hideBelow: "lg",
    },
    {
      key: "assignedTo", header: "Assigné À", accessor: (o) => o.assignedTo ?? "",
      cell: (o) => o.assignedTo ?? <span className="italic text-muted-foreground">—</span>,
      hideBelow: "lg",
    },
    {
      key: "createdAt", header: "Date", accessor: (o) => o.createdAt, hideBelow: "xl",
      cell: (o) => <span className="text-muted-foreground text-[12px]">{o.createdAt?.slice(0, 10)}</span>,
    },
  ];
  const customColumns: DataGridColumn<Opportunity>[] = customDefs
    .filter((d) => visibleCols.has(d.key))
    .map((d) => ({
      key: `cf-${d.key}`,
      header: d.label,
      accessor: (o) => customValuesById[o.id]?.[d.key] ?? "",
      cell: (o) => <span className="text-muted-foreground text-sm">{formatCustomValue(d, customValuesById[o.id]?.[d.key])}</span>,
      hideBelow: "lg",
    }));

  const hasActiveFilter =
    search || stageF !== ALL || assigne !== ALL || source !== ALL ||
    dateCree || dateFrom || dateTo || filterStage || Object.keys(customFilters).length > 0;

  return (
    <AppLayout skeleton="table">
      <PageHeader
        title="Opportunités"
        description={`${items.length.toLocaleString("fr-FR")} opportunité(s) — feuille interactive, cliquez sur ✎ pour changer le statut`}
        icon={<Target className="h-5 w-5" />}
        actions={
          <>
            <SavedViews scope="opportunities" current={currentView} onApply={applyView} isEqual={eqView} />
            <CustomColumnsPicker
              defs={customDefs}
              visible={visibleCols}
              onToggle={(k, v) => setVisibleCols((prev) => {
                const n = new Set(prev);
                if (v) n.add(k); else n.delete(k);
                return n;
              })}
            />
            {canExport && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm"><Download className="h-4 w-4 mr-1.5" />Exporter</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={async () => { try { await exportXLSX("opportunites.xlsx", exportRows as any, "Opportunités"); toast.success("Export Excel"); } catch (e: any) { toast.error("Échec Excel", { description: e?.message }); } }}>
                    <FileSpreadsheet className="h-4 w-4 mr-2" />Excel ({filtered.length})
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { exportJSON("opportunites.json", exportRows as any); toast.success("Export JSON"); }}>
                    <FileJson className="h-4 w-4 mr-2" />JSON
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </>
        }
      />

      <div className="mt-5 space-y-3">
        <Card className="p-3 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                placeholder="Rechercher nom, prénom, téléphone, ville…"
                className="pl-9 h-9"
              />
            </div>
            <Select value={stageF} onValueChange={(v) => { setStageF(v); setPage(0); }}>
              <SelectTrigger className="h-9 w-[200px]"><SelectValue placeholder="Statut" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Tous statuts</SelectItem>
                {stages.map((s) => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={source} onValueChange={(v) => { setSource(v); setPage(0); }}>
              <SelectTrigger className="h-9 w-[170px]"><SelectValue placeholder="Source" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Toutes sources</SelectItem>
                {sourceOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            {!isAgent && (
              <Select value={assigne} onValueChange={(v) => { setAssigne(v); setPage(0); }}>
                <SelectTrigger className="h-9 w-[180px]"><SelectValue placeholder="Assigné à" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Tous</SelectItem>
                  {assigneOptions.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {hasActiveFilter && (
              <Button variant="ghost" size="sm" onClick={reset}><X className="h-3.5 w-3.5 mr-1" />Réinitialiser</Button>
            )}
            <FilterPresetPicker
              scope="opportunities"
              current={currentView as any}
              filterKeys={schemaKeys(autoFilterSchema("opportunities", { opportunityStages: stages.map((s) => s.name), rows: items as any }))}
              filterSchema={autoFilterSchema("opportunities", { opportunityStages: stages.map((s) => s.name), rows: items as any })}
              onApply={(f) => {
                applyView({
                  search: typeof f.search === "string" ? f.search : "",
                  stage: typeof f.stage === "string" && f.stage ? f.stage : ALL,
                  assigne: typeof f.assigne === "string" && f.assigne ? f.assigne : ALL,
                  source: typeof f.source === "string" && f.source ? f.source : ALL,
                  dateCree: typeof f.dateCree === "string" ? f.dateCree : "",
                });
                const extra: Record<string, unknown> = {};
                for (const [k, v] of Object.entries(f)) {
                  if (VIEW_KEYS.includes(k)) continue;
                  if (v != null && v !== "") extra[k] = v;
                }
                setPresetExtra(extra);
              }}
              onReset={reset}
            />
            <div
              key={`count-${search}|${stageF}|${assigne}|${source}|${dateCree}|${JSON.stringify(presetExtra)}|${JSON.stringify(customFilters)}`}
              className="ml-auto text-xs text-muted-foreground tabular-nums animate-in fade-in slide-in-from-right-2 duration-300"
            >
              <span className="font-semibold text-foreground">{filtered.length.toLocaleString("fr-FR")}</span> résultat(s)
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-border flex flex-wrap items-center gap-2">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground mr-1">Date début</Label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(0); }}
              className="h-9 w-[160px]"
            />
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground mr-1">Date fin</Label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(0); }}
              className="h-9 w-[160px]"
            />
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground mr-1">Créé le (exact)</Label>
            <Input
              type="date"
              value={dateCree}
              onChange={(e) => { setDateCree(e.target.value); setPage(0); }}
              className="h-9 w-[160px]"
            />
            {customDefs.length > 0 && (
              <>
                <Label className="text-[11px] uppercase tracking-wider text-muted-foreground ml-2 mr-1">Champs perso</Label>
                {customDefs.map((def) => (
                  <Input
                    key={def.id}
                    type={def.type === "number" ? "number" : def.type === "date" ? "date" : "text"}
                    value={customFilters[def.key] ?? ""}
                    onChange={(e) => setCustomFilter(def.key, e.target.value)}
                    placeholder={def.label}
                    className="h-9 w-[160px]"
                  />
                ))}
              </>
            )}
          </div>

        </Card>

        {filterStage && (
          <div className="flex flex-wrap items-center gap-1.5 px-1">
            <Badge variant="secondary" className="gap-1 pr-1 bg-primary/10 text-primary border-primary/20">
              <span className="text-[11px]">Statut : <span className="font-semibold">{filterStage}</span></span>
              <button
                type="button"
                className="rounded hover:bg-muted-foreground/20 p-0.5"
                onClick={() => navigate({ to: "/opportunities", search: () => ({ stage: undefined }) })}
                aria-label="Retirer le filtre de statut"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          </div>
        )}

        {presetChips.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 px-1">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Filtres modèle :</span>
            {presetChips.map((c) => (
              <Badge key={c.key} variant="secondary" className="gap-1 pr-1">
                <span className="text-[11px]">{c.label}: <span className="font-semibold">{c.value}</span></span>
                <button
                  type="button"
                  className="rounded hover:bg-muted-foreground/20 p-0.5"
                  onClick={() => setPresetExtra((prev) => { const n = { ...prev }; delete n[c.key]; return n; })}
                  aria-label={`Retirer ${c.label}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={() => setPresetExtra({})}>Tout retirer</Button>
          </div>
        )}

        {/* Stat cards (mirrors contracts) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { label: "Total opportunités", value: stats.total },
            { label: "Gagnées", value: stats.won },
            { label: "En cours", value: stats.open },
          ].map((s) => (
            <Card key={s.label} className="p-4 shadow-elegant">
              <div className="text-xs text-muted-foreground uppercase tracking-wider">{s.label}</div>
              <div className="mt-1 text-2xl font-semibold">{s.value.toLocaleString("fr-FR")}</div>
            </Card>
          ))}
        </div>

        {/* Bulk action bar (mirrors contracts) */}
        {selected.size > 0 && (canEdit || canExport || canDelete || canConvert || canRevert) && (
          <Card className="p-3 shadow-elegant bg-primary/5 border-primary/20 flex items-center justify-between gap-2 flex-wrap">
            <div className="text-sm font-medium">{selected.size} opportunité(s) sélectionnée(s)</div>
            <div className="flex gap-2 items-center flex-wrap">
              {canEdit && (
                <Select
                  onValueChange={async (val) => {
                    const ids = Array.from(selected);
                    setBulkBusy(true);
                    try {
                      let ok = 0;
                      for (const id of ids) {
                        try { await api("/opportunities.php", { method: "PATCH", body: { id, stage: val } }); ok++; } catch { /* ignore */ }
                      }
                      toast.success(`${ok}/${ids.length} étape(s) mises à jour`);
                      setSelected(new Set()); reload();
                    } finally { setBulkBusy(false); }
                  }}
                >
                  <SelectTrigger className="h-9 w-[230px]" disabled={bulkBusy}><SelectValue placeholder="Changer l'étape…" /></SelectTrigger>
                  <SelectContent>
                    {stages.map((s) => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              {canExport && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={bulkBusy}
                  onClick={() => {
                    const rows = relabelRows(
                      withCustomFields(filtered.filter((o) => selected.has(o.id)), customDefs, customValuesById),
                      OPPORTUNITY_LABELS,
                    );
                    exportCSV("opportunites-selection.csv", rows as any);
                    toast.success(`${rows.length} opportunité(s) exportée(s)`);
                  }}
                >Exporter sélection</Button>
              )}
              {canDelete && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={bulkBusy || !API_ENABLED}
                  onClick={async () => {
                    const ids = Array.from(selected);
                    if (!(await confirmDialog({ title: "Suppression", description: `Supprimer ${ids.length} opportunité(s) ?`, tone: "destructive", confirmText: "Supprimer" }))) return;
                    setBulkBusy(true);
                    try {
                      const CHUNK = 50;
                      let ok = 0;
                      for (let i = 0; i < ids.length; i += CHUNK) {
                        const slice = ids.slice(i, i + CHUNK);
                        const res = await Promise.allSettled(
                          slice.map((id) => api(`/opportunities.php?id=${encodeURIComponent(id)}`, { method: "DELETE" })),
                        );
                        ok += res.filter((r) => r.status === "fulfilled").length;
                        toast.message(`Suppression… ${Math.min(i + CHUNK, ids.length)}/${ids.length}`);
                      }
                      toast.success(`${ok}/${ids.length} supprimée(s)`);
                      setSelected(new Set()); reload();
                    } finally { setBulkBusy(false); }
                  }}
                >Supprimer</Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Désélectionner</Button>
            </div>
          </Card>
        )}

        {/* Quick bulk-select toolbar */}
        <Card className="p-3 flex items-center justify-between gap-2 flex-wrap">
          <div className="text-sm text-muted-foreground">
            {filtered.length.toLocaleString("fr-FR")} opportunité(s) après filtres
            {selected.size > 0 && ` · ${selected.size} sélectionnée(s)`}
          </div>
          <div className="flex gap-1 items-center flex-wrap">
            <span className="text-xs text-muted-foreground mr-1">Sélectionner :</span>
            {[100, 500, 1000, 2000, 5000].map((n) => (
              <Button
                key={n}
                variant="outline"
                size="sm"
                disabled={bulkBusy || filtered.length === 0}
                onClick={() => {
                  const ids = filtered.slice(0, n).map((o) => o.id);
                  setSelected(new Set(ids));
                  toast.success(`${ids.length} opportunité(s) sélectionnée(s)`);
                }}
              >{n.toLocaleString("fr-FR")}</Button>
            ))}
            <Button
              variant="outline"
              size="sm"
              disabled={bulkBusy || filtered.length === 0}
              onClick={() => {
                setSelected(new Set(filtered.map((o) => o.id)));
                toast.success(`${filtered.length} opportunité(s) sélectionnée(s)`);
              }}
            >Tous ({filtered.length.toLocaleString("fr-FR")})</Button>
            {selected.size > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Vider</Button>
            )}
          </div>
        </Card>

        {loading ? (
          <Card className="p-8 text-center text-muted-foreground">Chargement…</Card>
        ) : (
          <div
            key={`grid-${stageF}-${assigne}-${source}-${dateCree}-${JSON.stringify(presetExtra)}`}
            className="animate-in fade-in duration-300"
          >
            <DataGrid
              storageKey="opportunities:list"
              rows={filtered}
              columns={[...baseColumns, ...customColumns]}
              rowKey={(o) => o.id}
              selected={selected}
              onSelectedChange={setSelected}
              pageSize={PAGE_SIZE}
              emptyState="Aucune opportunité ne correspond aux filtres actifs."
              onRowClick={(o) => navigate({ to: "/opportunities/$opportunityId", params: { opportunityId: o.id } })}
              onSaveRow={canEdit ? async (row, patch) => {
                if (patch.stage && patch.stage !== row.stage) await updateStage(row.id, patch.stage);
              } : undefined}
              onDeleteRow={canDelete ? (row) => remove(row.id) : undefined}
              rowActions={[
                { label: "Ouvrir la fiche", icon: <Eye className="h-4 w-4" />, onClick: (o) => navigate({ to: "/opportunities/$opportunityId", params: { opportunityId: o.id } }) },
                { label: "Pièces jointes", icon: <Paperclip className="h-4 w-4" />, onClick: (o: Opportunity) => setAttachOpp(o) },
                ...(canConvert ? [{ label: "Convertir en contrat", icon: <FileSignature className="h-4 w-4" />, onClick: (o: Opportunity) => convertContract(o.id) }] : []),
                ...(canRevert ? [{ label: "Renvoyer en lead", icon: <RotateCcw className="h-4 w-4" />, onClick: (o: Opportunity) => revert(o.id) }] : []),
                ...(canDelete ? [{ label: "Supprimer", icon: <Trash2 className="h-4 w-4" />, destructive: true, onClick: (o: Opportunity) => remove(o.id) }] : []),
              ]}
            />
          </div>
        )}
      </div>
      <Dialog open={!!attachOpp} onOpenChange={(o) => { if (!o) setAttachOpp(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Pièces jointes — {attachOpp ? `${attachOpp.firstName ?? ""} ${attachOpp.lastName ?? ""}`.trim() || attachOpp.id : ""}
            </DialogTitle>
          </DialogHeader>
          {attachOpp && (
            <AttachmentsCard entity="opportunity" entityId={attachOpp.id} />
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
