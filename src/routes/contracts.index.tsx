import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { FileText, Plus, Download, ChevronRight, FileSpreadsheet, FileJson, Paperclip, Search, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";

import { DatePicker } from "@/components/ui/date-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DataGrid, CellSelect, type DataGridColumn } from "@/components/DataGrid";
import { Eye, Trash2 } from "lucide-react";
import { useErp } from "@/lib/erpStore";
import { useAuth } from "@/lib/auth";
import { api, API_ENABLED } from "@/lib/api";
import { useQuery } from "@/lib/queryClient";
import { fetchContracts } from "@/lib/contractsApi";
import { useCurrency } from "@/lib/currency";
import { exportCSV, exportJSON, exportXLSX, withCustomFields, relabelRows } from "@/lib/exportUtils";
import { CONTRACT_LABELS } from "@/lib/exportLabels";
import { ImportDialog, type ImportField } from "@/components/ImportDialog";
import { NewContractDialog } from "@/components/NewContractDialog";
import { SavedViews } from "@/components/SavedViews";
import { FilterPresetPicker } from "@/components/FilterPresetPicker";
import { autoFilterSchema, schemaKeys } from "@/lib/autoFilterSchemas";
import { CustomColumnsPicker } from "@/components/CustomColumnsPicker";
import { useCustomFieldsTable, formatCustomValue } from "@/lib/useCustomFields";
import type { Contract } from "@/lib/types";
import { useEffect, useMemo, useState } from "react";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import type { PipelineStage } from "@/lib/types";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AttachmentsCard } from "@/components/AttachmentsCard";
import { confirmDialog } from "@/components/ConfirmDialogProvider";

function buildImportFields(currencySymbol: string): ImportField[] {
  return [
    { key: "lastName", label: "Nom", required: true, sample: "DUPONT" },
    { key: "firstName", label: "Prénom", required: true, sample: "Marie" },
    { key: "city", label: "Ville", sample: "PARIS" },
    { key: "address", label: "Adresse", sample: "12 rue …" },
    { key: "localisationXy", label: "Localisation XY (lat,lng)", sample: "36.123456,10.123698" },
    { key: "codePostal", label: "Code postal", sample: "75001" },
    { key: "partner", label: "Partenaire", sample: "NEOLIANE" },
    { key: "cabinet", label: "Cabinet", sample: "Cabinet Paris 1" },
    { key: "premium", label: `Cotisation (${currencySymbol})`, required: true, sample: "950" },
    { key: "billingStatus", label: "Statut facturation", sample: "Pré-validé" },
    { key: "signatureDate", label: "Date signature (AAAA-MM-JJ)", sample: "2026-04-28" },
    { key: "effectiveDate", label: "Date d'effet", sample: "2026-05-01" },
    { key: "validationDate", label: "Date validation" },
    { key: "source", label: "Source", sample: "Web" },
    { key: "assignedTo", label: "Assigné à (username)", sample: "REDISSI.SONIA" },
  ];
}

export const Route = createFileRoute("/contracts/")({
  validateSearch: zodValidator(z.object({ statut: fallback(z.string().optional(), undefined) })),
  head: () => ({
    meta: [
      { title: "Contrats — CRM" },
      { name: "description", content: "Suivi des contrats signés, en attente de validation et facturation." },
    ],
  }),
  component: ContractsPage,
});

const billingColor: Record<string, string> = {
  "Validé Confirmation": "bg-success/15 text-success border-success/20",
  "En attente de validation": "bg-warning/15 text-warning-foreground border-warning/20",
  "Annuler la confirmation": "bg-destructive/15 text-destructive border-destructive/20",
  "Pré-validé": "bg-info/15 text-info border-info/20",
};

const ALL = "__all__";
const PAGE_SIZE = 50;
// Filter options are derived 100% from real data + admin-managed pipelines.

function ContractsPage() {
  const { contracts: storeContracts, users, importContracts, updateContractBilling, refresh } = useErp();
  const navigate = useNavigate();
  const { statut: urlStatut } = Route.useSearch();
  const { user, hasPermission } = useAuth();
  const contractsQ = useQuery<Contract[]>({
    queryKey: ["contracts"],
    queryFn: fetchContracts,
    enabled: API_ENABLED && !!user,
    // Defaults from createAppQueryClient apply:
    //   - background refetch on every mount/focus (data always fresh)
    //   - keep previous data while refetch runs (table never blanks)
    //   - gcTime 5 min so back-nav paints instantly
  });
  // Always prefer freshly-fetched React Query data (kept in sync via invalidation
  // after conversions/imports). Fall back to the legacy ERP store only if the
  // query hasn't returned yet (or the API is disabled).
  const allContracts = (API_ENABLED && contractsQ.data) ? contractsQ.data : storeContracts;
  const isAdmin = user?.role === "Administrateur";
  const canDeleteContract = hasPermission("contract.delete");
  const canExport = hasPermission("contract.export");
  const canImport = hasPermission("contract.import");
  const canAddContract = hasPermission("contract.add");
  const canEditContract = hasPermission("contract.edit");
  const isAgent = user?.role === "Agent" || user?.role === "AgentSuivi" || user?.role === "AgentActivation" || user?.role === "AgentVente";
  const myUsername = user?.username ?? "";
  // Lecture globale : tous les rôles voient l'ensemble des contrats.
  const contracts = allContracts;
  const currency = useCurrency();
  const agentOptions = useMemo(
    () => users.filter((u) => u.role === "Agent" || u.role === "Manager" || u.role === "AgentSuivi" || u.role === "AgentActivation" || u.role === "AgentVente").map((u) => u.username),
    [users],
  );
  const [contractStages, setContractStages] = useState<PipelineStage[]>([]);
  useEffect(() => {
    if (!API_ENABLED) return;
    api<{ stages: PipelineStage[] }>("/contract_stages.php")
      .then((r) => setContractStages([...(r.stages ?? [])].sort((a, b) => a.position - b.position)))
      .catch(() => {});
  }, []);
  const BILLING = contractStages.map((s) => s.name);

  // Filter dropdown options derived 100% from real data — no hardcoded lists.
  const partnerOptions = useMemo(() => {
    const set = new Set<string>();
    for (const c of contracts) if (c.partner) set.add(c.partner);
    return [...set].sort((a, b) => a.localeCompare(b, "fr"));
  }, [contracts]);
  const cabinetOptions = useMemo(() => {
    const set = new Set<string>();
    for (const c of contracts) if (c.cabinet) set.add(c.cabinet);
    return [...set].sort((a, b) => a.localeCompare(b, "fr"));
  }, [contracts]);
  const sourceOptions = useMemo(() => {
    const set = new Set<string>();
    for (const c of contracts) if (c.source) set.add(c.source);
    return [...set].sort((a, b) => a.localeCompare(b, "fr"));
  }, [contracts]);
  const assigneOptions = useMemo(() => {
    const set = new Set<string>(agentOptions);
    for (const c of contracts) if (c.assignedTo) set.add(c.assignedTo);
    return [...set].sort((a, b) => a.localeCompare(b, "fr"));
  }, [contracts, agentOptions]);

  // Unified search across nom/prenom/ville — persisted per user so switching accounts
  // never inherits another user's restrictive filters (e.g. admin landing on a previously
  // set "assigné à = someAgent" filter and only seeing that subset). Each account starts
  // with a clean slate → everyone sees 100% of the contracts they have rights to view.
  const userScope = user?.username ?? "anon";
  const pk = (k: string) => `contracts:list:${userScope}:${k}`;
  const [search, setSearch] = usePersistedState(pk("search"), "");
  // Advanced filters
  const [dateSig, setDateSig] = usePersistedState(pk("dateSig"), "");
  const [dateFrom, setDateFrom] = usePersistedState(pk("dateFrom"), "");
  const [dateTo, setDateTo] = usePersistedState(pk("dateTo"), "");
  const [dateEffet, setDateEffet] = usePersistedState(pk("dateEffet"), "");
  const [dateVal, setDateVal] = usePersistedState(pk("dateVal"), "");
  const [assigne, setAssigne] = usePersistedState(pk("assigne"), ALL);
  const [source, setSource] = usePersistedState(pk("source"), ALL);
  const [statut, setStatut] = usePersistedState(pk("statut"), ALL);
  const [partenaire, setPartenaire] = usePersistedState(pk("partenaire"), ALL);
  const [cabinet, setCabinet] = usePersistedState(pk("cabinet"), ALL);
  const [page, setPage] = usePersistedState(pk("page"), 0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [attachContract, setAttachContract] = useState<Contract | null>(null);

  // Sync URL ?statut= → filter (sidebar deep-links by stage name)
  useEffect(() => {
    if (urlStatut && urlStatut !== statut) {
      setStatut(urlStatut);
      setPage(0);
    }
  }, [urlStatut]);

  const reset = () => {
    setSearch(""); setDateSig(""); setDateEffet(""); setDateVal("");
    setDateFrom(""); setDateTo("");
    setAssigne(ALL); setSource(ALL); setStatut(ALL); setPartenaire(ALL); setCabinet(ALL); setPage(0);
    setCustomFilters({});
    toast.success("Filtres réinitialisés");
  };

  const { defs: customDefs, valuesById: customValuesById } = useCustomFieldsTable("contract");
  const [visibleCols, setVisibleCols] = useState<Set<string>>(new Set());
  const [customFilters, setCustomFilters] = useState<Record<string, string>>({});
  const setCustomFilter = (k: string, v: string) =>
    setCustomFilters((prev) => {
      const next = { ...prev };
      if (!v) delete next[k]; else next[k] = v;
      return next;
    });

  type ViewState = {
    search: string; dateSig: string; dateEffet: string; dateVal: string;
    assigne: string; source: string; statut: string; partenaire: string; cabinet: string;
  };
  const currentView: ViewState = { search, dateSig, dateEffet, dateVal, assigne, source, statut, partenaire, cabinet };
  const [presetExtra, setPresetExtra] = useState<Record<string, unknown>>({});
  const applyView = (v: ViewState) => {
    setSearch(v.search ?? ""); setDateSig(v.dateSig ?? ""); setDateEffet(v.dateEffet ?? "");
    setDateVal(v.dateVal ?? ""); setAssigne(v.assigne ?? ALL); setSource(v.source ?? ALL);
    setStatut(v.statut ?? ALL); setPartenaire(v.partenaire ?? ALL); setCabinet(v.cabinet ?? ALL);
    setPage(0);
  };
  const eqView = (a: ViewState, b: ViewState) =>
    a.search === b.search && a.dateSig === b.dateSig && a.dateEffet === b.dateEffet &&
    a.dateVal === b.dateVal && a.assigne === b.assigne && a.source === b.source &&
    a.statut === b.statut && a.partenaire === b.partenaire && a.cabinet === b.cabinet;

  const VIEW_KEYS = ["search","dateSig","dateEffet","dateVal","assigne","source","statut","partenaire","cabinet"];

  const debouncedSearch = useDebouncedValue(search, 250);
  const haystackById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of contracts) {
      m.set(c.id, `${c.lastName} ${c.firstName} ${c.city} ${(c as any).cin ?? ""} ${(c as any).phone ?? ""}`.toLowerCase());
    }
    return m;
  }, [contracts]);
  const filtered = useMemo(() => {
    const cfEntries = Object.entries(customFilters);
    const KEY_MAP: Record<string, string> = {
      statut: "billingStatus", assigne: "assignedTo", partenaire: "partner",
      dateSig: "signatureDate", dateEffet: "effectiveDate", dateVal: "validationDate",
    };
    return contracts.filter((c) => {
      const q = debouncedSearch.trim().toLowerCase();
      if (q) {
        const hay = haystackById.get(c.id) ?? "";
        if (!hay.includes(q)) return false;
      }
      if (dateSig && c.signatureDate !== dateSig) return false;
      if (dateEffet && c.effectiveDate !== dateEffet) return false;
      if (dateVal && c.validationDate !== dateVal) return false;
      if (dateFrom && (c.signatureDate ?? "").slice(0, 10) < dateFrom) return false;
      if (dateTo && (c.signatureDate ?? "").slice(0, 10) > dateTo) return false;
      if (assigne !== ALL && c.assignedTo !== assigne) return false;
      if (source !== ALL && c.source !== source) return false;
      if (statut !== ALL && c.billingStatus !== statut) return false;
      if (partenaire !== ALL && c.partner !== partenaire) return false;
      if (cabinet !== ALL && c.cabinet !== cabinet) return false;
      if (cfEntries.length > 0) {
        const vals = customValuesById[c.id] ?? {};
        for (const [k, want] of cfEntries) {
          const v = String(vals[k] ?? "").toLowerCase();
          if (!v.includes(want.toLowerCase())) return false;
        }
      }
      for (const [k, raw] of Object.entries(presetExtra)) {
        if (raw == null || raw === "" || VIEW_KEYS.includes(k)) continue;
        if (k === "premiumMin") { if (Number((c as any).premium ?? 0) < Number(raw)) return false; continue; }
        if (k === "premiumMax") { if (Number((c as any).premium ?? 0) > Number(raw)) return false; continue; }
        const field = KEY_MAP[k] ?? k;
        const val = (c as any)[field];
        const target = String(raw).toLowerCase();
        if (val == null) return false;
        if (typeof val === "boolean") { if (String(val) !== target) return false; continue; }
        if (!String(val).toLowerCase().includes(target)) return false;
      }
      return true;
    });
  }, [contracts, debouncedSearch, haystackById, dateSig, dateEffet, dateVal, dateFrom, dateTo, assigne, source, statut, partenaire, cabinet, customFilters, customValuesById, presetExtra]);

  const presetChips = useMemo(() => {
    const schema = autoFilterSchema("contracts", { agents: agentOptions, contractBilling: BILLING, rows: contracts as any });
    const labelOf = (k: string) => schema.find((s) => s.key === k)?.label ?? k;
    return Object.entries(presetExtra)
      .filter(([k, v]) => v != null && v !== "" && !VIEW_KEYS.includes(k))
      .map(([k, v]) => ({ key: k, label: labelOf(k), value: String(v) }));
  }, [presetExtra, agentOptions, contracts]);

  const exportRows = useMemo(
    () => relabelRows(withCustomFields(filtered, customDefs, customValuesById), CONTRACT_LABELS),
    [filtered, customValuesById, customDefs],
  );

  const pageRows = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const contractsLoadError = contractsQ.error?.message ?? null;
  

  return (
    <AppLayout skeleton="table">
      {contractsLoadError && (
        <Card className="mb-4 border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {contractsLoadError}
        </Card>
      )}
      <PageHeader
        title="Contrats"
        description={`${contracts.length.toLocaleString("fr-FR")} contrats`}
        icon={<FileText className="h-5 w-5" />}
        actions={
          <>
            <SavedViews scope="contracts" current={currentView} onApply={applyView} isEqual={eqView} />
            <FilterPresetPicker
              scope="contracts"
              current={currentView}
              filterKeys={schemaKeys(autoFilterSchema("contracts", { agents: agentOptions, contractBilling: BILLING, rows: contracts as any }))}
              filterSchema={autoFilterSchema("contracts", { agents: agentOptions, contractBilling: BILLING, rows: contracts as any })}
              onApply={(f) => {
                applyView({
                  search: typeof f.search === "string" ? f.search : "",
                  dateSig: typeof f.dateSig === "string" ? f.dateSig : "",
                  dateEffet: typeof f.dateEffet === "string" ? f.dateEffet : "",
                  dateVal: typeof f.dateVal === "string" ? f.dateVal : "",
                  assigne: typeof f.assigne === "string" && f.assigne ? f.assigne : ALL,
                  source: typeof f.source === "string" && f.source ? f.source : ALL,
                  statut: typeof f.statut === "string" && f.statut ? f.statut : ALL,
                  partenaire: typeof f.partenaire === "string" && f.partenaire ? f.partenaire : ALL,
                  cabinet: typeof f.cabinet === "string" && f.cabinet ? f.cabinet : ALL,
                });
                const extra: Record<string, unknown> = {};
                for (const [k, v] of Object.entries(f)) {
                  if (VIEW_KEYS.includes(k)) continue;
                  if (v != null && v !== "") extra[k] = v;
                }
                setPresetExtra(extra);
              }}
              onReset={() => {
                applyView({
                  search: "", dateSig: "", dateEffet: "", dateVal: "",
                  assigne: ALL, source: ALL, statut: ALL, partenaire: ALL, cabinet: ALL,
                });
                setPresetExtra({});
              }}
            />
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
                  <DropdownMenuItem onClick={async () => { try { await exportXLSX("contrats.xlsx", exportRows as any, "Contrats"); toast.success("Export Excel généré"); } catch (e: any) { toast.error("Échec Excel", { description: e?.message }); } }}>
                    <FileSpreadsheet className="h-4 w-4 mr-2" />Excel ({filtered.length})
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { exportJSON("contrats.json", exportRows); toast.success("Export JSON généré"); }}>
                    <FileJson className="h-4 w-4 mr-2" />JSON
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {canImport && (
              <ImportDialog
                title="Importer des contrats"
                description="Migrez vos contrats depuis un CSV ou Excel — mappez les colonnes (y compris vos champs personnalisés) puis validez."
                fields={buildImportFields(currency.symbol)}
                extraFields={customDefs.map((d) => ({ key: d.key, label: d.label, sample: "" }))}
                templateFileName="modele-contrats.xlsx"
                existingIds={contracts.map((c) => c.id)}
                entity="contract"
                onImport={(rows) => importContracts(rows)}
              />
            )}
            {canAddContract && <NewContractDialog currency={currency} />}
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
                placeholder="Rechercher nom, prénom, ville…"
                className="pl-9 h-9"
              />
            </div>
            <Select value={statut} onValueChange={(v) => { setStatut(v); setPage(0); }}>
              <SelectTrigger className="h-9 w-[200px]"><SelectValue placeholder="Statut" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Tous statuts</SelectItem>
                {[...new Set([...BILLING, ...(statut !== ALL && statut ? [statut] : [])])].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={partenaire} onValueChange={(v) => { setPartenaire(v); setPage(0); }}>
              <SelectTrigger className="h-9 w-[170px]"><SelectValue placeholder="Partenaire" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Tous partenaires</SelectItem>
                {[...new Set([...partnerOptions, ...(partenaire !== ALL && partenaire ? [partenaire] : [])])].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={cabinet} onValueChange={(v) => { setCabinet(v); setPage(0); }}>
              <SelectTrigger className="h-9 w-[170px]"><SelectValue placeholder="Cabinet" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Tous cabinets</SelectItem>
                {[...new Set([...cabinetOptions, ...(cabinet !== ALL && cabinet ? [cabinet] : [])])].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={source} onValueChange={(v) => { setSource(v); setPage(0); }}>
              <SelectTrigger className="h-9 w-[160px]"><SelectValue placeholder="Source" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Toutes sources</SelectItem>
                {[...new Set([...sourceOptions, ...(source !== ALL && source ? [source] : [])])].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            {!isAgent && (
              <Select value={assigne} onValueChange={(v) => { setAssigne(v); setPage(0); }}>
                <SelectTrigger className="h-9 w-[170px]"><SelectValue placeholder="Assigné à" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Tous</SelectItem>
                  {[...new Set([...assigneOptions, ...(assigne !== ALL && assigne ? [assigne] : [])])].map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {(search || statut !== ALL || partenaire !== ALL || cabinet !== ALL || source !== ALL || assigne !== ALL || dateSig || dateEffet || dateVal || dateFrom || dateTo || Object.keys(customFilters).length > 0) && (
              <Button variant="ghost" size="sm" onClick={reset}><X className="h-3.5 w-3.5 mr-1" />Réinitialiser</Button>
            )}
            <FilterPresetPicker
              scope="contracts"
              current={currentView}
              filterKeys={schemaKeys(autoFilterSchema("contracts", { agents: agentOptions, contractBilling: BILLING, rows: contracts as any }))}
              filterSchema={autoFilterSchema("contracts", { agents: agentOptions, contractBilling: BILLING, rows: contracts as any })}
              onApply={(f) => {
                applyView({
                  search: typeof f.search === "string" ? f.search : "",
                  dateSig: typeof f.dateSig === "string" ? f.dateSig : "",
                  dateEffet: typeof f.dateEffet === "string" ? f.dateEffet : "",
                  dateVal: typeof f.dateVal === "string" ? f.dateVal : "",
                  assigne: typeof f.assigne === "string" && f.assigne ? f.assigne : ALL,
                  source: typeof f.source === "string" && f.source ? f.source : ALL,
                  statut: typeof f.statut === "string" && f.statut ? f.statut : ALL,
                  partenaire: typeof f.partenaire === "string" && f.partenaire ? f.partenaire : ALL,
                  cabinet: typeof f.cabinet === "string" && f.cabinet ? f.cabinet : ALL,
                });
                const extra: Record<string, unknown> = {};
                for (const [k, v] of Object.entries(f)) {
                  if (VIEW_KEYS.includes(k)) continue;
                  if (v != null && v !== "") extra[k] = v;
                }
                setPresetExtra(extra);
              }}
              onReset={() => {
                applyView({
                  search: "", dateSig: "", dateEffet: "", dateVal: "",
                  assigne: ALL, source: ALL, statut: ALL, partenaire: ALL, cabinet: ALL,
                });
                setPresetExtra({});
              }}
            />
            <div
              key={`count-${search}|${statut}|${partenaire}|${cabinet}|${source}|${assigne}|${dateSig}|${dateEffet}|${dateVal}|${JSON.stringify(presetExtra)}|${JSON.stringify(customFilters)}`}
              className="ml-auto text-xs text-muted-foreground tabular-nums animate-in fade-in slide-in-from-right-2 duration-300"
            >
              <span className="font-semibold text-foreground">{filtered.length.toLocaleString("fr-FR")}</span> résultat(s)
            </div>
          </div>

          {/* Date filters + custom filters — second compact row, only when user wants them */}
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
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground ml-2 mr-1">Signature</Label>
            <div className="w-[150px]"><DatePicker value={dateSig} onChange={(v) => { setDateSig(v); setPage(0); }} /></div>
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground mr-1">Effet</Label>
            <div className="w-[150px]"><DatePicker value={dateEffet} onChange={(v) => { setDateEffet(v); setPage(0); }} /></div>
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground mr-1">Validation</Label>
            <div className="w-[150px]"><DatePicker value={dateVal} onChange={(v) => { setDateVal(v); setPage(0); }} /></div>
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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              { label: "Total contrats", value: filtered.length },
              { label: "Validés", value: filtered.filter((c) => c.billingStatus === "Validé Confirmation").length },
              { label: "En attente", value: filtered.filter((c) => c.billingStatus === "En attente de validation").length },
            ].map((s) => (
              <Card key={s.label} className="p-4 shadow-elegant">
                <div className="text-xs text-muted-foreground uppercase tracking-wider">{s.label}</div>
                <div className="mt-1 text-2xl font-semibold">{s.value}</div>
              </Card>
            ))}
          </div>

          {selected.size > 0 && (canEditContract || canExport || canDeleteContract) && (
            <Card className="p-3 shadow-elegant bg-primary/5 border-primary/20 flex items-center justify-between gap-2 flex-wrap">
              <div className="text-sm font-medium">{selected.size} contrat(s) sélectionné(s)</div>
              <div className="flex gap-2 items-center flex-wrap">
                {canEditContract && (
                  <Select
                    onValueChange={async (val) => {
                      const ids = Array.from(selected);
                      setBulkBusy(true);
                      try {
                        let ok = 0;
                        for (const id of ids) {
                          try { await updateContractBilling(id, val as Contract["billingStatus"]); ok++; } catch { /* ignore per-row */ }
                        }
                        toast.success(`${ok}/${ids.length} contrat(s) mis à jour`);
                        setSelected(new Set());
                        if (API_ENABLED) await refresh();
                      } finally { setBulkBusy(false); }
                    }}
                  >
                    <SelectTrigger className="h-9 w-[230px]"><SelectValue placeholder="Changer le statut…" /></SelectTrigger>
                    <SelectContent>
                      {BILLING.map((s: string) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
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
                        withCustomFields(
                          filtered.filter((c) => selected.has(c.id)),
                          customDefs,
                          customValuesById,
                        ),
                        CONTRACT_LABELS,
                      );
                      exportCSV("contrats-selection.csv", rows);
                      toast.success(`${rows.length} contrat(s) exporté(s)`);
                    }}
                  >Exporter sélection</Button>
                )}
                {canDeleteContract && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={bulkBusy || !API_ENABLED}
                    onClick={async () => {
                      const ids = Array.from(selected);
                      if (!(await confirmDialog({ title: "Suppression", description: `Supprimer définitivement ${ids.length} contrat(s) ?`, tone: "destructive", confirmText: "Supprimer" }))) return;
                      setBulkBusy(true);
                      try {
                        const CHUNK = 50;
                        let ok = 0;
                        for (let i = 0; i < ids.length; i += CHUNK) {
                          const slice = ids.slice(i, i + CHUNK);
                          const res = await Promise.allSettled(
                            slice.map((id) => api(`/contracts.php?id=${encodeURIComponent(id)}`, { method: "DELETE" })),
                          );
                          ok += res.filter((r) => r.status === "fulfilled").length;
                          toast.message(`Suppression… ${Math.min(i + CHUNK, ids.length)}/${ids.length}`);
                        }
                        toast.success(`${ok}/${ids.length} contrat(s) supprimé(s)`);
                        setSelected(new Set());
                        await refresh();
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
              {filtered.length.toLocaleString("fr-FR")} contrat(s) après filtres
              {selected.size > 0 && ` · ${selected.size} sélectionné(s)`}
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
                    const ids = filtered.slice(0, n).map((c) => c.id);
                    setSelected(new Set(ids));
                    toast.success(`${ids.length} contrat(s) sélectionné(s)`);
                  }}
                >{n.toLocaleString("fr-FR")}</Button>
              ))}
              <Button
                variant="outline"
                size="sm"
                disabled={bulkBusy || filtered.length === 0}
                onClick={() => {
                  setSelected(new Set(filtered.map((c) => c.id)));
                  toast.success(`${filtered.length} contrat(s) sélectionné(s)`);
                }}
              >Tous ({filtered.length.toLocaleString("fr-FR")})</Button>
              {selected.size > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Vider</Button>
              )}
            </div>
          </Card>

          {(() => {
            const baseColumns: DataGridColumn<Contract>[] = [
              {
                key: "lastName", header: "Nom", accessor: (c) => c.lastName,
                cell: (c) => (
                  <div className="font-medium text-[13px] truncate">{c.lastName} {c.firstName}</div>
                ),
              },
              { key: "partner", header: "Partenaire", accessor: (c) => c.partner, hideBelow: "md" },
              { key: "signatureDate", header: "Date SI", accessor: (c) => c.signatureDate, hideBelow: "lg" },
              { key: "validationDate", header: "Date VA", accessor: (c) => c.validationDate ?? "", hideBelow: "lg",
                cell: (c) => <span className="text-muted-foreground">{c.validationDate ?? "—"}</span> },
              {
                key: "billingStatus", header: "Statut Facturation", accessor: (c) => c.billingStatus,
                cell: (c) => <Badge variant="outline" className={billingColor[c.billingStatus] ?? ""}>{c.billingStatus}</Badge>,
                editor: ({ value, setValue }) => <CellSelect value={value} setValue={setValue} options={BILLING.map((s: string) => ({ value: s, label: s }))} />,
              },
              { key: "assignedTo", header: "Assigné À", accessor: (c) => c.assignedTo, hideBelow: "md",
                cell: (c) => <span className="text-muted-foreground">{c.assignedTo}</span> },
            ];
            const customColumns: DataGridColumn<Contract>[] = customDefs
              .filter((d) => visibleCols.has(d.key))
              .map((d) => ({
                key: `cf-${d.key}`,
                header: d.label,
                accessor: (c) => customValuesById[c.id]?.[d.key] ?? "",
                cell: (c) => <span className="text-muted-foreground text-sm">{formatCustomValue(d, customValuesById[c.id]?.[d.key])}</span>,
                hideBelow: "lg",
              }));
            return (
              <div
                key={`grid-${statut}-${partenaire}-${cabinet}-${source}-${assigne}-${JSON.stringify(presetExtra)}`}
                className="animate-in fade-in duration-300"
              >
                <DataGrid
                  storageKey="contracts:list"
                  rows={filtered}
                  columns={[...baseColumns, ...customColumns]}
                  rowKey={(c) => c.id}
                  selected={selected}
                  onSelectedChange={setSelected}
                  pageSize={PAGE_SIZE}
                  onRowClick={(c) => navigate({ to: "/contracts/$contractId", params: { contractId: c.id } })}
                  onSaveRow={canEditContract ? async (row, patch) => {
                    if (patch.billingStatus && patch.billingStatus !== row.billingStatus) {
                      try { await updateContractBilling(row.id, patch.billingStatus as Contract["billingStatus"]); toast.success("Statut mis à jour"); }
                      catch (e: any) { toast.error(e?.message ?? "Échec"); }
                    }
                  } : undefined}
                  onDeleteRow={canDeleteContract ? async (row) => {
                    if (!(await confirmDialog({ title: "Suppression", description: `Supprimer définitivement le contrat ${row.lastName} ${row.firstName} ?`, tone: "destructive", confirmText: "Supprimer" }))) return;
                    try { await api(`/contracts.php?id=${encodeURIComponent(row.id)}`, { method: "DELETE" }); await refresh(); toast.success("Supprimé"); }
                    catch (e: any) { toast.error(e?.message ?? "Échec"); }
                  } : undefined}
                  rowActions={[
                    { label: "Ouvrir la fiche", icon: <Eye className="h-4 w-4" />, onClick: (c) => navigate({ to: "/contracts/$contractId", params: { contractId: c.id } }) },
                    { label: "Pièces jointes", icon: <Paperclip className="h-4 w-4" />, onClick: (c: Contract) => setAttachContract(c) },
                    ...(canDeleteContract ? [{ label: "Supprimer", icon: <Trash2 className="h-4 w-4" />, destructive: true, onClick: async (c: Contract) => {
                      if (!(await confirmDialog({ title: "Suppression", description: `Supprimer ${c.lastName} ?`, tone: "destructive", confirmText: "Supprimer" }))) return;
                      try { await api(`/contracts.php?id=${encodeURIComponent(c.id)}`, { method: "DELETE" }); await refresh(); toast.success("Supprimé"); }
                      catch (e: any) { toast.error(e?.message); }
                    } }] : []),
                  ]}
                />
              </div>
            );
          })()}
      </div>
      <Dialog open={!!attachContract} onOpenChange={(o) => { if (!o) setAttachContract(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Pièces jointes — {attachContract ? `${attachContract.firstName} ${attachContract.lastName}` : ""}
            </DialogTitle>
          </DialogHeader>
          {attachContract && (
            <AttachmentsCard entity="contract" entityId={attachContract.id} />
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

