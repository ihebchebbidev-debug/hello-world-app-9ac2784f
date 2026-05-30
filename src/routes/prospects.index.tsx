import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { ClipboardList, Download, FileSpreadsheet, FileJson, Eye, Trash2, UserCheck, Search, X, Paperclip, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useErp } from "@/lib/erpStore";
import { useAuth } from "@/lib/auth";
import { api, API_ENABLED } from "@/lib/api";
import { exportCSV, exportJSON, exportXLSX, withCustomFields, relabelRows } from "@/lib/exportUtils";
import { PROSPECT_LABELS } from "@/lib/exportLabels";
import { ImportDialog, type ImportField } from "@/components/ImportDialog";
import { DataGrid, CellInput, CellSelect, type DataGridColumn } from "@/components/DataGrid";
import { useCustomFieldsTable, formatCustomValue } from "@/lib/useCustomFields";
import { SavedViews } from "@/components/SavedViews";
import { CustomColumnsPicker } from "@/components/CustomColumnsPicker";
import { FilterPresetPicker } from "@/components/FilterPresetPicker";
import { autoFilterSchema, schemaKeys } from "@/lib/autoFilterSchemas";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useProspectTypes } from "@/hooks/use-prospect-types";
import type { Prospect, ProspectType } from "@/lib/types";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AttachmentsCard } from "@/components/AttachmentsCard";
import { confirmDialog } from "@/components/ConfirmDialogProvider";

const PROSPECT_IMPORT_FIELDS: ImportField[] = [
  { key: "civility",   label: "civility (M/Mme)", sample: "M" },
  { key: "lastName",   label: "Nom", required: true, sample: "BEN ALI" },
  { key: "firstName",  label: "Prenom", sample: "Mohamed" },
  { key: "phone",      label: "Gsm1", sample: "20123456" },
  { key: "phone2",     label: "Gsm2", sample: "20123457" },
  { key: "ancienLigne",label: "Ancien Ligne", sample: "70123456" },
  { key: "cin",        label: "Cin", sample: "12345678" },
  { key: "birthDate",  label: "Date de naissance (AAAA-MM-JJ)", sample: "1985-04-12" },
  { key: "email",      label: "Mail", sample: "ex@mail.com" },
  { key: "source",     label: "Source", sample: "Terrain" },
  { key: "status",     label: "Statu", sample: "Nouveau" },
  { key: "assignedTo", label: "Assigné a (username)", sample: "agent1" },
  { key: "createdAt",  label: "cree le (AAAA-MM-JJ)", sample: "2026-04-28" },
  { key: "gouvernorat",label: "Gouvernorat", sample: "TUNIS" },
  { key: "address",    label: "Adresse", sample: "12 rue …" },
  { key: "delegation", label: "Delegation", sample: "La Marsa" },
  { key: "localisationXy", label: "Localisation XY (lat,lng)", sample: "36.123456,10.123698" },
  { key: "codePostal", label: "Code postal", sample: "2078" },
  { key: "comment",    label: "Observ1" },
  { key: "comment2",   label: "Observ2" },
  { key: "type",       label: "Type de prospect (nom)", sample: "Standard" },
];

const prospectsSearchSchema = z.object({
  typeId: fallback(z.string().optional(), undefined),
});

export const Route = createFileRoute("/prospects/")({
  validateSearch: zodValidator(prospectsSearchSchema),
  head: () => ({
    meta: [
      { title: "Leads — CRM" },
      { name: "description", content: "Gestion des leads — feuille interactive, édition rapide." },
    ],
  }),
  component: ProspectsPage,
});

const ALL = "__all__";
const PAGE_SIZE = 50;

const statusColor: Record<string, string> = {
  "Ok": "bg-success/15 text-success border-success/20",
  "Déjà connecté": "bg-success/15 text-success border-success/20",
  "Att cin": "bg-warning/15 text-warning-foreground border-warning/20",
  "Att confirmation": "bg-warning/15 text-warning-foreground border-warning/20",
  "Rappel": "bg-info/15 text-info border-info/20",
  "refuse": "bg-destructive/10 text-destructive border-destructive/20",
  "Pas intersse": "bg-destructive/10 text-destructive border-destructive/20",
  "migration": "bg-primary/10 text-primary border-primary/20",
  "Basculement": "bg-primary/10 text-primary border-primary/20",
  "Ing": "bg-info/15 text-info border-info/20",
  "Nrp": "bg-muted text-muted-foreground border-border",
  "Pas de rep": "bg-muted text-muted-foreground border-border",
  "Autr dde encor": "bg-info/15 text-info border-info/20",
  "Autre": "bg-muted text-muted-foreground border-border",
};

function ProspectsPage() {
  const { prospects: allProspects, users, importProspects, updateProspect, deleteProspect, refresh } = useErp();
  const { user, hasPermission } = useAuth();
  const navigate = useNavigate();
  const { typeId: filterTypeId } = Route.useSearch();
  const isAgent = user?.role === "Agent" || user?.role === "AgentSuivi" || user?.role === "AgentActivation" || user?.role === "AgentVente";
  const isAdmin = user?.role === "Administrateur";
  const canDelete = hasPermission("prospect.delete");
  const canExport = hasPermission("prospect.export");
  const canImport = hasPermission("prospect.import");
  const canAdd = hasPermission("prospect.add");
  const canEdit = hasPermission("prospect.edit");
  const canAssign = hasPermission("prospect.assign");
  const canChangeStatus = canEdit || hasPermission("prospect.status");
  const canChangeSource = canEdit || hasPermission("prospect.source");
  const myUsername = user?.username ?? "";

  const { defs: customDefs, valuesById: customValuesById } = useCustomFieldsTable("prospect");
  const types = useProspectTypes();
  // Backwards-compat: ProspectTypesPanel uses the active list; some callers
  // still need every type. Re-fetch if needed.
  const [allTypes, setAllTypes] = useState<ProspectType[]>(types);
  useEffect(() => { setAllTypes(types); }, [types]);
  const typeNameById = useMemo(() => {
    const m = new Map<string, string>();
    allTypes.forEach((t) => m.set(t.id, t.name));
    return m;
  }, [allTypes]);
  const typeIdByName = useMemo(() => {
    const m = new Map<string, string>();
    allTypes.forEach((t) => m.set(t.name.trim().toLowerCase(), t.id));
    return m;
  }, [allTypes]);

  const withType = (rows: Prospect[]) =>
    rows.map((p) => ({
      ...p,
      "Type de prospect": p.typeId ? (typeNameById.get(p.typeId) ?? "") : "",
    }));

  const resolveImportTypes = (rows: Record<string, unknown>[]) => rows.map((r) => {
    const raw = String(r["Type de prospect"] ?? r.type ?? r.typeId ?? "").trim();
    if (!raw) return r;
    const byId = typeNameById.has(raw) ? raw : null;
    const byName = typeIdByName.get(raw.toLowerCase()) ?? null;
    const resolved = byId ?? byName;
    const next: Record<string, unknown> = { ...r };
    delete next["Type de prospect"];
    delete next.type;
    if (resolved) next.typeId = resolved;
    return next;
  });

  // Inject a `validate` for the "type" import column so unknown type names are
  // surfaced in the preview step (review screen) before any DB write.
  const importFields = useMemo<ImportField[]>(() => PROSPECT_IMPORT_FIELDS.map((f) => {
    if (f.key !== "type") return f;
    return {
      ...f,
      validate: (v: unknown) => {
        const s = String(v ?? "").trim();
        if (!s) return null;
        if (typeIdByName.has(s.toLowerCase())) return null;
        const sample = allTypes.slice(0, 5).map((t) => t.name).join(", ");
        return `Type "${s}" introuvable. Créez ce type dans Configuration › Types de prospect, ou utilisez : ${sample || "(aucun type configuré)"}`;
      },
    };
  }), [typeIdByName, allTypes]);

  const prospects = allProspects;
  const agentOptions = useMemo(
    () => users.filter((u) => u.role === "Agent" || u.role === "Manager" || u.role === "AgentSuivi" || u.role === "AgentActivation" || u.role === "AgentVente").map((u) => u.username),
    [users],
  );

  // -------- Persisted filters (mirrors contracts page) --------
  const [search, setSearch] = usePersistedState("prospects:list:search", "");
  const [statut, setStatut] = useState<string>(ALL);
  const [assigne, setAssigne] = usePersistedState("prospects:list:assigne", ALL);
  const [source, setSource] = usePersistedState("prospects:list:source", ALL);
  const [typeF, setTypeF] = usePersistedState("prospects:list:type", ALL);
  const [dateCree, setDateCree] = usePersistedState("prospects:list:dateCree", "");
  const [dateFrom, setDateFrom] = usePersistedState("prospects:list:dateFrom", "");
  const [dateTo, setDateTo] = usePersistedState("prospects:list:dateTo", "");
  const [recoveredF, setRecoveredF] = usePersistedState("prospects:list:recovered", ALL);
  const [page, setPage] = usePersistedState("prospects:list:page", 0);

  // Effective type: URL search param wins so sidebar dropdown stays sticky.
  const effectiveTypeId = filterTypeId ?? (typeF !== ALL ? typeF : undefined);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [attachProspect, setAttachProspect] = useState<Prospect | null>(null);
  const [restoredProspectId, setRestoredProspectId] = useState<string | null>(null);
  const [presetExtra, setPresetExtra] = useState<Record<string, unknown>>({});
  const [visibleCols, setVisibleCols] = useState<Set<string>>(new Set());
  const [customFilters, setCustomFilters] = useState<Record<string, string>>({});
  const setCustomFilter = (k: string, v: string) =>
    setCustomFilters((prev) => {
      const next = { ...prev };
      if (!v) delete next[k]; else next[k] = v;
      return next;
    });

  // -------- Dynamic options --------
  const statusOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of prospects) if (p.status) set.add(p.status);
    if (statut !== ALL && statut) set.add(statut);
    return [...set].sort((a, b) => a.localeCompare(b, "fr"));
  }, [prospects, statut]);
  const sourceOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of prospects) if (p.source) set.add(p.source);
    if (source !== ALL && source) set.add(source);
    return [...set].sort((a, b) => a.localeCompare(b, "fr"));
  }, [prospects, source]);
  const assigneOptions = useMemo(() => {
    const set = new Set<string>(agentOptions);
    for (const p of prospects) if (p.assignedTo) set.add(p.assignedTo);
    if (assigne !== ALL && assigne) set.add(assigne);
    return [...set].sort((a, b) => a.localeCompare(b, "fr"));
  }, [prospects, agentOptions, assigne]);

  // -------- Saved views --------
  type ViewState = {
    search: string; statut: string; source: string; assigne: string; typeF: string; dateCree: string;
  };
  const currentView: ViewState = { search, statut, source, assigne, typeF, dateCree };
  const VIEW_KEYS = ["search","statut","source","assigne","typeF","dateCree"];
  const applyView = (v: ViewState) => {
    setSearch(v.search ?? "");
    setStatut(v.statut ?? ALL);
    setSource(v.source ?? ALL);
    setAssigne(v.assigne ?? ALL);
    setTypeF(v.typeF ?? ALL);
    setDateCree(v.dateCree ?? "");
    setPage(0);
  };
  const eqView = (a: ViewState, b: ViewState) =>
    a.search === b.search && a.statut === b.statut && a.source === b.source &&
    a.assigne === b.assigne && a.typeF === b.typeF && a.dateCree === b.dateCree;

  const reset = () => {
    setSearch(""); setStatut(ALL); setAssigne(ALL); setSource(ALL); setTypeF(ALL);
    setDateCree(""); setDateFrom(""); setDateTo("");
    setRecoveredF(ALL); setPresetExtra({}); setCustomFilters({}); setPage(0);
    if (filterTypeId) navigate({ to: "/prospects", search: () => ({ typeId: undefined }) });
    toast.success("Filtres réinitialisés");
  };

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("crm:reverted-prospect");
      if (!raw) return;
      const parsed = JSON.parse(raw) as { prospectId?: string };
      if (parsed?.prospectId) {
        setRestoredProspectId(parsed.prospectId);
        // Auto-clear filters so the recovered lead is always visible
        setSearch(""); setStatut(ALL); setAssigne(ALL); setSource(ALL); setTypeF(ALL);
        setDateCree(""); setRecoveredF(ALL); setPresetExtra({}); setCustomFilters({}); setPage(0);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounce the search term so 50k+ rows don't refilter on every keystroke.
  const debouncedSearch = useDebouncedValue(search, 250);
  // Pre-lowercased haystack per row, recomputed only when the dataset changes.
  const haystackById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of prospects) {
      m.set(p.id, `${p.lastName} ${p.firstName} ${p.phone} ${p.city} ${p.email} ${p.cin ?? ""}`.toLowerCase());
    }
    return m;
  }, [prospects]);
  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    const cfEntries = Object.entries(customFilters);
    const KEY_MAP: Record<string, keyof Prospect> = {
      statut: "status", assigne: "assignedTo",
    };
    return prospects.filter((p) => {
      if (p.converted || p.opportunityId) return false;
      if (q) {
        const hay = haystackById.get(p.id) ?? "";
        if (!hay.includes(q)) return false;
      }
      if (statut !== ALL && p.status !== statut) return false;
      if (assigne !== ALL && p.assignedTo !== assigne) return false;
      if (source !== ALL && p.source !== source) return false;
      if (effectiveTypeId && p.typeId !== effectiveTypeId) return false;
      if (dateCree && (p.createdAt ?? "").slice(0, 10) !== dateCree) return false;
      if (dateFrom && (p.createdAt ?? "").slice(0, 10) < dateFrom) return false;
      if (dateTo && (p.createdAt ?? "").slice(0, 10) > dateTo) return false;
      if (recoveredF !== ALL) {
        if (!p.revertedAt) return false;
        if (recoveredF === "opportunity" && p.revertedFrom !== "opportunity") return false;
        if (recoveredF === "contract" && p.revertedFrom !== "contract") return false;
      }
      if (cfEntries.length > 0) {
        const vals = customValuesById[p.id] ?? {};
        for (const [k, want] of cfEntries) {
          const v = String(vals[k] ?? "").toLowerCase();
          if (!v.includes(want.toLowerCase())) return false;
        }
      }
      for (const [k, raw] of Object.entries(presetExtra)) {
        if (raw == null || raw === "" || VIEW_KEYS.includes(k)) continue;
        const field = (KEY_MAP[k] ?? k) as keyof Prospect;
        const val = (p as any)[field];
        const target = String(raw).toLowerCase();
        if (val == null) return false;
        if (typeof val === "boolean") { if (String(val) !== target) return false; continue; }
        if (!String(val).toLowerCase().includes(target)) return false;
      }
      return true;
    });
  }, [prospects, debouncedSearch, haystackById, statut, assigne, source, effectiveTypeId, dateCree, dateFrom, dateTo, recoveredF, customFilters, customValuesById, presetExtra]);

  const presetChips = useMemo(() => {
    const schema = autoFilterSchema("prospects", { agents: agentOptions, rows: prospects as any });
    const labelOf = (k: string) => schema.find((s) => s.key === k)?.label ?? k;
    return Object.entries(presetExtra)
      .filter(([k, v]) => v != null && v !== "" && !VIEW_KEYS.includes(k))
      .map(([k, v]) => ({ key: k, label: labelOf(k), value: String(v) }));
  }, [presetExtra, agentOptions, prospects]);

  const exportRows = useMemo(
    () => relabelRows(withCustomFields(withType(filtered), customDefs, customValuesById), PROSPECT_LABELS),
    [filtered, customDefs, customValuesById, typeNameById],
  );

  // CSV scope: selected rows if any, otherwise all filtered rows.
  // Columns: only what's visible in the grid (base columns + enabled custom columns).
  const csvScope = useMemo(
    () => (selected.size > 0 ? filtered.filter((p) => selected.has(p.id)) : filtered),
    [filtered, selected],
  );
  const buildVisibleCsvRows = () => {
    const cols = [...baseColumns, ...customColumns];
    return csvScope.map((p) => {
      const row: Record<string, unknown> = {};
      for (const c of cols) {
        const header = typeof c.header === "string" ? c.header : String(c.key);
        row[header] = c.accessor ? (c.accessor(p) as unknown) ?? "" : "";
      }
      return row;
    });
  };

  // Stats (mirrors contracts: 3 KPI tiles).
  const stats = useMemo(() => ({
    total: filtered.length,
    converted: filtered.filter((p) => p.converted || p.opportunityId).length,
    unassigned: filtered.filter((p) => !p.assignedTo).length,
  }), [filtered]);

  const baseColumns: DataGridColumn<Prospect>[] = [
    {
      key: "lastName", header: "Nom", accessor: (p) => p.lastName,
      cell: (p) => (
        <div className="min-w-0">
          <div className="font-medium text-[13px] truncate">{p.civility} {p.lastName} {p.firstName}</div>
          {(p.revertedAt || restoredProspectId === p.id) && (
            <div className="mt-1">
              <Badge variant="outline" className="border-warning/40 bg-warning/15 text-warning-foreground font-normal text-[10px]">
                ↩ Récupéré depuis {p.revertedFrom === "contract" ? "contrat" : "opportunité"}
              </Badge>
            </div>
          )}
        </div>
      ),
      editor: ({ value, setValue }) => <CellInput value={value} setValue={setValue} />,
    },
    { key: "firstName", header: "Prénom", accessor: (p) => p.firstName ?? "", hideBelow: "md",
      editor: ({ value, setValue }) => <CellInput value={value} setValue={setValue} /> },
    { key: "phone", header: "Gsm 1", accessor: (p) => p.phone, hideBelow: "md",
      editor: ({ value, setValue }) => <CellInput value={value} setValue={setValue} /> },
    { key: "phone2", header: "Gsm 2", accessor: (p) => p.phone2 ?? "", hideBelow: "lg",
      editor: ({ value, setValue }) => <CellInput value={value} setValue={setValue} /> },
    { key: "ancienLigne", header: "Ancien Ligne", accessor: (p) => p.ancienLigne ?? "", hideBelow: "lg",
      editor: ({ value, setValue }) => <CellInput value={value} setValue={setValue} /> },
    { key: "cin", header: "CIN", accessor: (p) => p.cin ?? "", hideBelow: "lg",
      editor: ({ value, setValue }) => <CellInput value={value} setValue={setValue} /> },
    { key: "email", header: "Mail", accessor: (p) => p.email, hideBelow: "lg",
      cell: (p) => <span className="text-muted-foreground">{p.email || "—"}</span>,
      editor: ({ value, setValue }) => <CellInput value={value} setValue={setValue} type="email" /> },
    {
      key: "typeId", header: "Type", accessor: (p) => p.typeId ?? "", hideBelow: "lg",
      cell: (p) => p.typeId
        ? <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 font-normal text-[11px]">{typeNameById.get(p.typeId) ?? "—"}</Badge>
        : <span className="text-muted-foreground italic">—</span>,
      editor: ({ value, setValue }) => (
        <CellSelect
          value={value ?? ""}
          setValue={setValue}
          options={[{ value: "", label: "— Aucun —" }, ...allTypes.map((t) => ({ value: t.id, label: t.name }))]}
        />
      ),
    },
    {
      key: "status", header: "Statut", accessor: (p) => p.status,
      cell: (p) => <Badge variant="outline" className={`${statusColor[p.status] ?? ""} font-normal text-[11px]`}>{p.status}</Badge>,
      editor: ({ value, setValue }) => <CellSelect value={value} setValue={setValue} options={statusOptions.map((s: string) => ({ value: s, label: s }))} />,
    },
    {
      key: "assignedTo", header: "Assigné À", accessor: (p) => p.assignedTo ?? "", hideBelow: "md",
      cell: (p) => p.assignedTo ?? <span className="italic text-muted-foreground">Non attribué</span>,
      editor: ({ value, setValue }) => <CellSelect value={value} setValue={setValue} options={[{ value: "", label: "—" }, ...agentOptions.map((u) => ({ value: u, label: u }))]} />,
    },
    {
      key: "createdAt", header: "Créé le", accessor: (p) => p.createdAt, hideBelow: "xl",
      cell: (p) => <span className="text-muted-foreground text-[12px]">{p.createdAt}</span>,
    },
  ];
  const customColumns: DataGridColumn<Prospect>[] = customDefs
    .filter((d) => visibleCols.has(d.key))
    .map((d) => ({
      key: `cf-${d.key}`,
      header: d.label,
      accessor: (p) => customValuesById[p.id]?.[d.key] ?? "",
      cell: (p) => <span className="text-muted-foreground text-sm">{formatCustomValue(d, customValuesById[p.id]?.[d.key])}</span>,
      hideBelow: "lg",
    }));

  const hasActiveFilter =
    search || statut !== ALL || source !== ALL || assigne !== ALL ||
    typeF !== ALL || dateCree || dateFrom || dateTo || recoveredF !== ALL || filterTypeId || Object.keys(customFilters).length > 0;

  return (
    <AppLayout skeleton="table">
      <PageHeader
        title="Prospects"
        description={`${prospects.length.toLocaleString("fr-FR")} leads — feuille interactive, cliquez sur ✎ pour éditer`}
        icon={<ClipboardList className="h-5 w-5" />}
        actions={
          <>
            <SavedViews scope="prospects" current={currentView} onApply={applyView} isEqual={eqView} />
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
                  <DropdownMenuItem onClick={async () => {
                    const rows = buildVisibleCsvRows();
                    if (rows.length === 0) { toast.error("Aucune ligne à exporter"); return; }
                    try {
                      await exportXLSX("prospects.xlsx", rows as any, "Prospects");
                      toast.success(`Export Excel (${rows.length} ${selected.size > 0 ? "sélectionnés" : "filtrés"})`);
                    } catch (e: any) { toast.error("Échec Excel", { description: e?.message }); }
                  }}>
                    <FileSpreadsheet className="h-4 w-4 mr-2" />Excel ({selected.size > 0 ? `${selected.size} sél.` : filtered.length})
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { exportJSON("prospects.json", exportRows as any); toast.success("Export JSON"); }}>
                    <FileJson className="h-4 w-4 mr-2" />JSON
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {canImport && (
              <ImportDialog
                title="Importer des prospects"
                description="Migrez vos leads depuis CSV / Excel — mappez les colonnes (y compris vos champs personnalisés) puis validez."
                fields={importFields}
                extraFields={customDefs.map((d) => ({ key: d.key, label: d.label, sample: "" }))}
                templateFileName="modele-prospects.xlsx"
                existingIds={prospects.map((p) => p.id)}
                existingRecords={prospects.map((p) => ({ id: p.id, label: `${p.lastName} ${p.firstName}`, phone: p.phone, email: p.email }))}
                entity="prospect"
                onImport={(rows) => importProspects(resolveImportTypes(rows) as Partial<Prospect>[])}
                reviewToolbar={({ validated, mapping }) => {
                  const typeSrc = mapping["type"];
                  if (!typeSrc || typeSrc === "__skip__") return null;
                  const typeBad = validated.filter((v) =>
                    v.errors.some((e) => /Type ".+" introuvable/.test(e.message)),
                  );
                  const otherBad = validated.filter((v) =>
                    v.errors.some((e) => !/Type ".+" introuvable/.test(e.message)),
                  );
                  if (typeBad.length === 0 || otherBad.length > 0) return null;
                  return (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        // Replace the source type column with the resolved typeId
                        // when possible; leave unresolved values blank so the
                        // backend simply drops the type instead of failing.
                        const fixed = validated.map((v) => {
                          const row: Record<string, unknown> = {};
                          for (const [k, src] of Object.entries(mapping)) {
                            if (!src || src === "__skip__") continue;
                            row[src] = v.values[k] ?? "";
                          }
                          const raw = String(row[typeSrc] ?? "").trim();
                          const resolved = raw ? typeIdByName.get(raw.toLowerCase()) ?? "" : "";
                          row[typeSrc] = resolved;
                          return row;
                        });
                        exportCSV("prospects-corriges.csv", fixed);
                        toast.success(
                          `${typeBad.length} ligne(s) corrigée(s) (type → typeId vide si introuvable). Réimportez ce fichier.`,
                        );
                      }}
                    >
                      <Download className="h-3.5 w-3.5 mr-1.5" />
                      CSV corrigé (type → typeId, {typeBad.length})
                    </Button>
                  );
                }}
              />
            )}
            {canAdd && (
              <Button size="sm" asChild>
                <Link to="/prospects/new"><Plus className="h-4 w-4 mr-1.5" />Nouveau prospect</Link>
              </Button>
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
                placeholder="Rechercher nom, prénom, téléphone, email…"
                className="pl-9 h-9"
              />
            </div>
            <Select value={statut} onValueChange={(v) => { setStatut(v); setPage(0); }}>
              <SelectTrigger className="h-9 w-[200px]"><SelectValue placeholder="Statut" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Tous statuts</SelectItem>
                {statusOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={source} onValueChange={(v) => { setSource(v); setPage(0); }}>
              <SelectTrigger className="h-9 w-[170px]"><SelectValue placeholder="Source" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Toutes sources</SelectItem>
                {sourceOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={typeF} onValueChange={(v) => { setTypeF(v); setPage(0); }} disabled={!!filterTypeId}>
              <SelectTrigger className="h-9 w-[180px]"><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Tous types</SelectItem>
                {allTypes.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
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
            <Select value={recoveredF} onValueChange={(v) => { setRecoveredF(v); setPage(0); }}>
              <SelectTrigger
                className={`h-9 w-[200px] ${recoveredF !== ALL ? "border-warning bg-warning/10 text-warning-foreground" : ""}`}
                title="Filtrer les leads récupérés"
              >
                <SelectValue placeholder="Récupérés" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Tous (récupérés inclus)</SelectItem>
                <SelectItem value="any">↩ Récupérés uniquement</SelectItem>
                <SelectItem value="opportunity">↩ Depuis opportunité</SelectItem>
                <SelectItem value="contract">↩ Depuis contrat</SelectItem>
              </SelectContent>
            </Select>
            {hasActiveFilter && (
              <Button variant="ghost" size="sm" onClick={reset}><X className="h-3.5 w-3.5 mr-1" />Réinitialiser</Button>
            )}
            <FilterPresetPicker
              scope="prospects"
              current={currentView as any}
              filterKeys={schemaKeys(autoFilterSchema("prospects", { agents: agentOptions, rows: prospects as any }))}
              filterSchema={autoFilterSchema("prospects", { agents: agentOptions, rows: prospects as any })}
              onApply={(f) => {
                applyView({
                  search: typeof f.search === "string" ? f.search : "",
                  statut: typeof f.statut === "string" && f.statut ? f.statut : ALL,
                  source: typeof f.source === "string" && f.source ? f.source : ALL,
                  assigne: typeof f.assigne === "string" && f.assigne ? f.assigne : ALL,
                  typeF: typeof f.typeF === "string" && f.typeF ? f.typeF : ALL,
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
              key={`count-${search}|${statut}|${source}|${assigne}|${typeF}|${dateCree}|${JSON.stringify(presetExtra)}|${JSON.stringify(customFilters)}`}
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
              placeholder="Créé le"
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

        {(presetChips.length > 0 || filterTypeId) && (
          <div className="flex flex-wrap items-center gap-1.5 px-1">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Filtres :</span>
            {filterTypeId && (
              <Badge variant="secondary" className="gap-1 pr-1 bg-primary/10 text-primary border-primary/20">
                <span className="text-[11px]">Type: <span className="font-semibold">{typeNameById.get(filterTypeId) ?? filterTypeId}</span></span>
                <button
                  type="button"
                  className="rounded hover:bg-muted-foreground/20 p-0.5"
                  onClick={() => navigate({ to: "/prospects", search: () => ({ typeId: undefined }) })}
                  aria-label="Retirer le filtre type"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
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
            {presetChips.length > 0 && (
              <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={() => setPresetExtra({})}>Tout retirer</Button>
            )}
          </div>
        )}

        {/* Stat cards (mirrors contracts) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { label: "Total prospects", value: stats.total },
            { label: "Convertis", value: stats.converted },
            { label: "Non attribués", value: stats.unassigned },
          ].map((s) => (
            <Card key={s.label} className="p-4 shadow-elegant">
              <div className="text-xs text-muted-foreground uppercase tracking-wider">{s.label}</div>
              <div className="mt-1 text-2xl font-semibold">{s.value.toLocaleString("fr-FR")}</div>
            </Card>
          ))}
        </div>

        {/* Bulk action bar (mirrors contracts) */}
        {selected.size > 0 && (canEdit || canAssign || canDelete || canChangeStatus || canChangeSource || canExport) && (
          <Card className="p-3 shadow-elegant bg-primary/5 border-primary/20 flex items-center justify-between gap-2 flex-wrap">
            <div className="text-sm font-medium">{selected.size} prospect(s) sélectionné(s)</div>
            <div className="flex gap-2 items-center flex-wrap">
              {canChangeStatus && (
              <Select
                onValueChange={async (val) => {
                  if (!API_ENABLED) return;
                  setBulkBusy(true);
                  try {
                    const r = await api<{ updated: number }>("/prospects.php?action=bulk", { method: "POST", body: { op: "status", ids: Array.from(selected), status: val } });
                    toast.success(`${r.updated} statut(s) mis à jour`); setSelected(new Set()); await refresh();
                  } catch (e: any) { toast.error(e?.message); }
                  finally { setBulkBusy(false); }
                }}
              >
                <SelectTrigger className="h-9 w-[200px]" disabled={bulkBusy}><SelectValue placeholder="Changer statut…" /></SelectTrigger>
                <SelectContent>
                  {statusOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              )}
              {canAssign && (
              <Select
                value=""
                onValueChange={async (val) => {
                  if (!API_ENABLED || !val) return;
                  setBulkBusy(true);
                  try {
                    const count = selected.size;
                    const r = await api<{ updated: number }>("/prospects.php?action=bulk", { method: "POST", body: { op: "assign", ids: Array.from(selected), assignedTo: val } });
                    toast.success(`${r.updated}/${count} prospect(s) réassigné(s) à ${val}`);
                    setSelected(new Set()); await refresh();
                  } catch (e: any) { toast.error(e?.message ?? "Échec de la réassignation"); }
                  finally { setBulkBusy(false); }
                }}
              >
                <SelectTrigger className="h-9 w-[200px]" disabled={bulkBusy}><SelectValue placeholder="Réassigner à…" /></SelectTrigger>
                <SelectContent>{agentOptions.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
              </Select>
              )}
              {canEdit && (
              <Select
                value=""
                onValueChange={async (val) => {
                  const tid = val === "__none__" ? null : val;
                  setBulkBusy(true);
                  try {
                    const r = await api<{ updated: number }>("/prospects.php?action=bulk", { method: "POST", body: { op: "type", ids: Array.from(selected), typeId: tid } });
                    toast.success(`${r.updated} type(s) mis à jour`); setSelected(new Set()); await refresh();
                  } catch (e: any) { toast.error(e?.message); }
                  finally { setBulkBusy(false); }
                }}
              >
                <SelectTrigger className="h-9 w-[200px]" disabled={bulkBusy}><SelectValue placeholder="Changer type…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Aucun —</SelectItem>
                  {allTypes.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
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
                    withCustomFields(withType(filtered.filter((p) => selected.has(p.id))), customDefs, customValuesById),
                    PROSPECT_LABELS,
                  );
                  exportCSV("prospects-selection.csv", rows as any);
                  toast.success(`${rows.length} prospect(s) exporté(s)`);
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
                    if (!(await confirmDialog({ title: "Suppression", description: `Supprimer ${ids.length} prospect(s) ?`, tone: "destructive", confirmText: "Supprimer" }))) return;
                    setBulkBusy(true);
                    let ok = 0;
                    const CHUNK = 500;
                    try {
                      // Chunk to keep request size & DB IN(...) sane on big batches.
                      for (let i = 0; i < ids.length; i += CHUNK) {
                        const slice = ids.slice(i, i + CHUNK);
                        let chunkOk = 0;
                        try {
                          const r = await api<{ deleted: number }>("/prospects.php?action=bulk", { method: "POST", body: { op: "delete", ids: slice } });
                          chunkOk = r?.deleted ?? 0;
                        } catch { /* fall through to per-row for this chunk */ }
                        if (chunkOk < slice.length) {
                          for (const id of slice) {
                            try { await api(`/prospects.php?id=${encodeURIComponent(id)}`, { method: "DELETE" }); chunkOk++; } catch { /* ignore */ }
                          }
                          if (chunkOk > slice.length) chunkOk = slice.length;
                        }
                        ok += chunkOk;
                        toast.message(`Suppression… ${Math.min(ok, ids.length)}/${ids.length}`);
                      }
                      toast.success(`${Math.min(ok, ids.length)}/${ids.length} supprimé(s)`);
                      setSelected(new Set());
                      await refresh();
                    } catch (e: any) { toast.error(e?.message); }
                    finally { setBulkBusy(false); }
                  }}
                >Supprimer</Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Désélectionner</Button>
            </div>
          </Card>
        )}


        {/* Quick bulk-select toolbar — pick the first N filtered prospects in one click. */}
        <Card className="p-3 flex items-center justify-between gap-2 flex-wrap">
          <div className="text-sm text-muted-foreground">
            {filtered.length.toLocaleString("fr-FR")} prospect(s) après filtres
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
                  const ids = filtered.slice(0, n).map((p) => p.id);
                  setSelected(new Set(ids));
                  toast.success(`${ids.length} prospect(s) sélectionné(s)`);
                }}
              >{n.toLocaleString("fr-FR")}</Button>
            ))}
            <Button
              variant="outline"
              size="sm"
              disabled={bulkBusy || filtered.length === 0}
              onClick={() => {
                setSelected(new Set(filtered.map((p) => p.id)));
                toast.success(`${filtered.length} prospect(s) sélectionné(s)`);
              }}
            >Tous ({filtered.length.toLocaleString("fr-FR")})</Button>
            {selected.size > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                Vider
              </Button>
            )}
          </div>
        </Card>

        <div
          key={`grid-${statut}-${source}-${assigne}-${typeF}-${dateCree}-${JSON.stringify(presetExtra)}`}
          className="animate-in fade-in duration-300"
        >
          <DataGrid
            storageKey="prospects:list"
            rows={[...filtered].sort((a, b) => {
              // Reverted leads pinned to the top, most recent first.
              const ar = a.revertedAt ? new Date(a.revertedAt).getTime() : 0;
              const br = b.revertedAt ? new Date(b.revertedAt).getTime() : 0;
              if (ar !== br) return br - ar;
              return 0;
            })}
            rowClassName={(p) => p.revertedAt ? "bg-warning/15 hover:bg-warning/25" : ""}
            columns={[...baseColumns, ...customColumns]}
            rowKey={(p) => p.id}
            selected={selected}
            onSelectedChange={setSelected}
            pageSize={PAGE_SIZE}
            onRowClick={(p) => navigate({ to: "/prospects/$prospectId", params: { prospectId: p.id } })}
            onSaveRow={canEdit ? async (row, patch) => {
              const norm: Record<string, any> = { ...patch };
              if ("typeId" in norm && (norm.typeId === "" || norm.typeId == null)) norm.typeId = null;
              try { await updateProspect(row.id, norm as any); toast.success("Prospect mis à jour"); }
              catch (e: any) { toast.error(e?.message ?? "Échec"); }
            } : undefined}
            onDeleteRow={canDelete ? async (row) => {
              if (!(await confirmDialog({ title: "Suppression", description: `Supprimer ${row.firstName} ${row.lastName} ?`, tone: "destructive", confirmText: "Supprimer" }))) return;
              try { await deleteProspect(row.id); toast.success("Supprimé"); }
              catch (e: any) { toast.error(e?.message ?? "Échec"); }
            } : undefined}
            rowActions={[
              { label: "Ouvrir la fiche", icon: <Eye className="h-4 w-4" />, onClick: (p) => navigate({ to: "/prospects/$prospectId", params: { prospectId: p.id } }) },
              { label: "Pièces jointes", icon: <Paperclip className="h-4 w-4" />, onClick: (p: Prospect) => setAttachProspect(p) },
              ...(canAssign ? [{ label: "M'assigner ce lead", icon: <UserCheck className="h-4 w-4" />, hidden: (p: Prospect) => p.assignedTo === myUsername, onClick: async (p: Prospect) => {
                try { await updateProspect(p.id, { assignedTo: myUsername } as any); toast.success("Assigné"); }
                catch (e: any) { toast.error(e?.message); }
              } }] : []),
              ...(canDelete ? [{ label: "Supprimer", icon: <Trash2 className="h-4 w-4" />, destructive: true, onClick: async (p: Prospect) => {
                if (!(await confirmDialog({ title: "Suppression", description: `Supprimer ${p.firstName} ${p.lastName} ?`, tone: "destructive", confirmText: "Supprimer" }))) return;
                try { await deleteProspect(p.id); toast.success("Supprimé"); }
                catch (e: any) { toast.error(e?.message); }
              } }] : []),
            ]}
          />
        </div>
      </div>

      <Dialog open={!!attachProspect} onOpenChange={(o) => { if (!o) setAttachProspect(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Pièces jointes — {attachProspect ? `${attachProspect.firstName} ${attachProspect.lastName}` : ""}
            </DialogTitle>
          </DialogHeader>
          {attachProspect && (
            <AttachmentsCard entity="prospect" entityId={attachProspect.id} />
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
