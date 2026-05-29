import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DataGrid, type DataGridColumn } from "@/components/DataGrid";
import { ImportDialog, type ImportField } from "@/components/ImportDialog";
import { AttachmentsCard } from "@/components/AttachmentsCard";
import { exportCSV, exportXLSX, relabelRows } from "@/lib/exportUtils";
import { RECLAMATION_LABELS } from "@/lib/exportLabels";
import { api, API_ENABLED } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useErp } from "@/lib/erpStore";
import { FilterPresetPicker } from "@/components/FilterPresetPicker";
import { autoFilterSchema, schemaKeys } from "@/lib/autoFilterSchemas";
import { toast } from "sonner";
import { Plus, Download, FileSpreadsheet, MessageSquareWarning, RefreshCw, Eye, Trash2, Paperclip, X } from "lucide-react";
import { confirmDialog } from "@/components/ConfirmDialogProvider";

/* -------------------------------------------------------- types & const */

const SERVICES = ["Technique", "Facturation", "Commercial", "Autre"] as const;
type Service = (typeof SERVICES)[number];

const AUDIT = ["en_cours", "resolu", "annule"] as const;
type Audit = (typeof AUDIT)[number];

const AUDIT_LABEL: Record<Audit, string> = {
  en_cours: "En cours",
  resolu: "Résolu",
  annule: "Annulé",
};
const AUDIT_CLASS: Record<Audit, string> = {
  en_cours: "bg-warning/15 text-warning-foreground border-warning/20",
  resolu: "bg-success/15 text-success border-success/20",
  annule: "bg-destructive/15 text-destructive border-destructive/20",
};

type Reclamation = {
  id: number;
  reference: string;
  tel_adsl: string | null;
  ref_demand: string | null;
  cin_client: string | null;
  gsm_client: string | null;
  client_name: string | null;
  service: Service;
  description: string | null;
  statut_crm: string | null;
  statut_tt: string | null;
  audit_status: Audit;
  localisation: string | null;
  etat: string | null;
  remarques: string | null;
  date_creation: string;
  date_resolution: string | null;
  mois: number | null;
  annee: number | null;
  assigned_to: string | null;
  created_by: string | null;
};

const ALL = "__all__";

/* ----------------------------------------------------------- Route ---- */

export const Route = createFileRoute("/reclamations/")({
  validateSearch: zodValidator(z.object({
    audit: fallback(z.enum(["en_cours", "resolu", "annule"]).optional(), undefined),
  })),
  head: () => ({
    meta: [
      { title: "Réclamations — CRM" },
      { name: "description", content: "Suivi des réclamations clients (Technique, Facturation, Commercial)." },
    ],
  }),
  component: ReclamationsPage,
});

/* ---------------------------------------------------------- helpers --- */

const empty = (): Partial<Reclamation> => ({
  service: "Technique",
  audit_status: "en_cours",
  statut_crm: "Réclamation TT",
  date_creation: new Date().toISOString().slice(0, 16),
});

function fmtDateTime(s: string | null): string {
  if (!s) return "—";
  const d = new Date(s.replace(" ", "T"));
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

/* ---------------------------------------------------------- Page ----- */

function ReclamationsPage() {
  const navigate = useNavigate();
  const { user, hasPermission } = useAuth();
  const isAdmin = user?.role === "Administrateur";
  const canAdd    = isAdmin || hasPermission("reclamation.add");
  const canEdit   = isAdmin || hasPermission("reclamation.edit");
  const canDelete = isAdmin || hasPermission("reclamation.delete");
  const canImport = isAdmin || hasPermission("reclamation.import");

  const { users } = useErp();
  const agentOptions = useMemo(
    () => (users ?? [])
      .filter((u: any) => ["Agent","Manager","AgentSuivi","AgentActivation","AgentVente","Administrateur"].includes(u.role))
      .map((u: any) => u.username),
    [users],
  );

  const [rows, setRows] = useState<Reclamation[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [tel, setTel] = useState("");
  const [cin, setCin] = useState("");
  const [gsm, setGsm] = useState("");
  const [ref, setRef] = useState("");
  const [service, setService] = useState<string>(ALL);
  const [audit, setAudit] = useState<string>(ALL);
  const { audit: urlAudit } = Route.useSearch();
  useEffect(() => { setAudit(urlAudit ?? ALL); }, [urlAudit]);
  const [mois, setMois] = useState<string>(ALL);
  const [annee, setAnnee] = useState<string>(ALL);

  // Admin-managed filter presets — extra fields applied client-side over `rows`.
  const [presetExtra, setPresetExtra] = useState<Record<string, unknown>>({});

  const [openDialog, setOpenDialog] = useState(false);
  const [editing, setEditing] = useState<Partial<Reclamation> | null>(null);
  const [saving, setSaving] = useState(false);

  const [openAttach, setOpenAttach] = useState<Reclamation | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  /* -------- load */
  const load = async () => {
    if (!API_ENABLED) return;
    setLoading(true);
    try {
      const q: Record<string, string | number> = {};
      if (search) q.q = search;
      if (tel) q.tel = tel;
      if (cin) q.cin = cin;
      if (gsm) q.gsm = gsm;
      if (ref) q.ref = ref;
      if (service !== ALL) q.service = service;
      if (audit !== ALL) q.audit_status = audit;
      if (mois !== ALL) q.mois = mois;
      if (annee !== ALL) q.annee = annee;
      q.limit = 500;
      const r = await api<{ reclamations: Reclamation[] }>("/reclamations.php", { query: q });
      setRows(r.reclamations ?? []);
    } catch (e: any) {
      toast.error("Chargement impossible", { description: e?.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const yearsAvail = useMemo(() => {
    const set = new Set<number>();
    const y = new Date().getFullYear();
    for (let i = y - 4; i <= y + 1; i++) set.add(i);
    rows.forEach((r) => r.annee && set.add(r.annee));
    return Array.from(set).sort((a, b) => b - a);
  }, [rows]);

  /* -------- saved view (basic filters) + preset application */
  type ViewState = { search: string; service: string; audit: string; mois: string; annee: string; tel: string; cin: string; gsm: string; ref: string };
  const VIEW_KEYS = ["search","service","audit","mois","annee","tel","cin","gsm","ref","client_name","statut_crm","statut_tt","localisation","etat","assigned_to","date_creation","date_resolution"];
  const currentView: ViewState = { search, service, audit, mois, annee, tel, cin, gsm, ref };
  const applyView = (v: Partial<ViewState>) => {
    setSearch(v.search ?? "");
    setService(v.service && v.service !== "" ? v.service : ALL);
    setAudit(v.audit && v.audit !== "" ? v.audit : ALL);
    setMois(v.mois && v.mois !== "" ? v.mois : ALL);
    setAnnee(v.annee && v.annee !== "" ? v.annee : ALL);
    setTel(v.tel ?? "");
    setCin(v.cin ?? "");
    setGsm(v.gsm ?? "");
    setRef(v.ref ?? "");
    setTimeout(load, 0);
  };

  // Apply preset extras client-side over server-loaded rows.
  const filtered = useMemo(() => {
    const entries = Object.entries(presetExtra).filter(([k, v]) => v != null && v !== "" && !VIEW_KEYS.slice(0,9).includes(k));
    if (entries.length === 0) return rows;
    return rows.filter((r) => {
      for (const [k, raw] of entries) {
        const target = String(raw).toLowerCase();
        const v = (r as any)[k];
        if (v == null) return false;
        if (!String(v).toLowerCase().includes(target)) return false;
      }
      return true;
    });
  }, [rows, presetExtra]);

  const presetSchema = useMemo(
    () => autoFilterSchema("reclamations", { agents: agentOptions, rows: rows as any }),
    [agentOptions, rows],
  );
  const presetChips = useMemo(() => {
    const labelOf = (k: string) => presetSchema.find((s) => s.key === k)?.label ?? k;
    return Object.entries(presetExtra)
      .filter(([k, v]) => v != null && v !== "" && !VIEW_KEYS.slice(0,9).includes(k))
      .map(([k, v]) => ({ key: k, label: labelOf(k), value: String(v) }));
  }, [presetExtra, presetSchema]);


  /* -------- columns */
  const columns: DataGridColumn<Reclamation>[] = [
    { key: "reference",     header: "Réf",          width: "130px", accessor: (r) => r.reference, cell: (r) => <span className="font-mono text-xs text-primary">{r.reference}</span> },
    { key: "tel_adsl",      header: "Tél ADSL",     width: "110px", accessor: (r) => r.tel_adsl ?? "" },
    { key: "client_name",   header: "Client",       width: "180px", accessor: (r) => r.client_name ?? "" },
    { key: "cin_client",    header: "CIN",          width: "110px", accessor: (r) => r.cin_client ?? "" },
    { key: "gsm_client",    header: "GSM",          width: "120px", accessor: (r) => r.gsm_client ?? "" },
    { key: "service",       header: "Service",      width: "120px", accessor: (r) => r.service,
      cell: (r) => <Badge variant="outline">{r.service}</Badge> },
    { key: "description",   header: "Description",  width: "280px", accessor: (r) => r.description ?? "",
      cell: (r) => <span className="block max-w-[280px] truncate" title={r.description ?? ""}>{r.description ?? "—"}</span> },
    { key: "statut_crm",    header: "Statut CRM",   width: "150px", accessor: (r) => r.statut_crm ?? "",
      cell: (r) => <span className="text-primary text-xs font-medium">{r.statut_crm ?? "—"}</span> },
    { key: "audit_status",  header: "Audit",        width: "110px", accessor: (r) => r.audit_status,
      cell: (r) => <Badge className={AUDIT_CLASS[r.audit_status]}>{AUDIT_LABEL[r.audit_status]}</Badge> },
    { key: "date_creation", header: "Date Création",  width: "150px", accessor: (r) => r.date_creation, cell: (r) => fmtDateTime(r.date_creation) },
    { key: "date_resolution", header: "Date Résolution", width: "150px", accessor: (r) => r.date_resolution ?? "", cell: (r) => fmtDateTime(r.date_resolution) },
    { key: "remarques",     header: "Remarques",    width: "200px", accessor: (r) => r.remarques ?? "",
      cell: (r) => <span className="block max-w-[200px] truncate" title={r.remarques ?? ""}>{r.remarques ?? "—"}</span> },
    { key: "assigned_to",   header: "Assigné à",    width: "130px", accessor: (r) => r.assigned_to ?? "" },
  ];

  /* -------- save */
  const saveRow = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      if (editing.id) {
        await api(`/reclamations.php?id=${editing.id}`, { method: "PATCH", body: editing });
        toast.success("Réclamation mise à jour");
      } else {
        await api("/reclamations.php", { method: "POST", body: editing });
        toast.success("Réclamation créée");
      }
      setOpenDialog(false);
      setEditing(null);
      load();
    } catch (e: any) {
      toast.error("Échec de l'enregistrement", { description: e?.message });
    } finally {
      setSaving(false);
    }
  };

  const deleteRow = async (r: Reclamation) => {
    if (!(await confirmDialog({ title: "Suppression", description: `Supprimer la réclamation ${r.reference} ?`, tone: "destructive", confirmText: "Supprimer" }))) return;
    try {
      await api(`/reclamations.php?id=${r.id}`, { method: "DELETE" });
      toast.success("Réclamation supprimée");
      load();
    } catch (e: any) {
      toast.error("Suppression impossible", { description: e?.message });
    }
  };

  /* -------- export */
  const exportRows = useMemo(() => rows.map((r) => ({
    Reference: r.reference,
    "Tel ADSL": r.tel_adsl ?? "",
    "Ref demande": r.ref_demand ?? "",
    Client: r.client_name ?? "",
    CIN: r.cin_client ?? "",
    GSM: r.gsm_client ?? "",
    Service: r.service,
    Description: r.description ?? "",
    "Statut CRM": r.statut_crm ?? "",
    "Statut TT": r.statut_tt ?? "",
    Audit: AUDIT_LABEL[r.audit_status],
    Localisation: r.localisation ?? "",
    Etat: r.etat ?? "",
    Remarques: r.remarques ?? "",
    "Date creation": r.date_creation,
    "Date resolution": r.date_resolution ?? "",
    "Assigne a": r.assigned_to ?? "",
  })), [rows]);

  /* -------- import */
  const importFields: ImportField[] = [
    { key: "tel_adsl",       label: "Tél ADSL",        sample: "73256249" },
    { key: "ref_demand",     label: "Réf demande",     sample: "DM-12345" },
    { key: "cin_client",     label: "CIN client",      sample: "01234567" },
    { key: "gsm_client",     label: "GSM client",      sample: "98765432" },
    { key: "client_name",    label: "Client",          sample: "Foulen Ben Foulen" },
    { key: "service",        label: "Service",         sample: "Technique" },
    { key: "description",    label: "Description",     required: true, sample: "Lenteur ADSL toute la nuit" },
    { key: "statut_crm",     label: "Statut CRM",      sample: "Réclamation TT" },
    { key: "statut_tt",      label: "Statut TT",       sample: "Prise en charge" },
    { key: "audit_status",   label: "Audit (en_cours/resolu/annule)", sample: "en_cours" },
    { key: "localisation",   label: "Localisation",    sample: "Tunis" },
    { key: "etat",           label: "État",            sample: "Ouvert" },
    { key: "remarques",      label: "Remarques",       sample: "" },
    { key: "date_creation",  label: "Date création (AAAA-MM-JJ HH:MM)", sample: "2026-05-07 12:25" },
    { key: "date_resolution",label: "Date résolution",  sample: "" },
    { key: "assigned_to",    label: "Assigné à (username)", sample: "AGENT.SOPHIE" },
  ];

  const handleImport = async (importedRows: Record<string, unknown>[]) => {
    try {
      const r = await api<{ added: number }>("/reclamations.php", {
        method: "POST",
        body: { action: "import", rows: importedRows },
      });
      toast.success(`${r.added} réclamation(s) importée(s)`);
      load();
      return { added: r.added, updated: 0, skipped: importedRows.length - r.added };
    } catch (e: any) {
      toast.error("Import échoué", { description: e?.message });
      return { added: 0, updated: 0, skipped: importedRows.length };
    }
  };

  /* -------- render */
  return (
    <AppLayout skeleton="table">
      <PageHeader
        icon={<MessageSquareWarning className="h-5 w-5" />}
        title="Réclamations"
        description="Suivi des réclamations clients : technique, facturation, commercial."
        actions={
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
              Rafraîchir
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4 mr-1" /> Exporter
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={async () => { await exportXLSX("reclamations.xlsx", relabelRows(exportRows as any, RECLAMATION_LABELS)); toast.success("Export Excel généré"); }}>
                  <FileSpreadsheet className="h-4 w-4 mr-2" /> Excel
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {canImport && (
              <ImportDialog
                title="Importer des réclamations"
                description="Importez vos réclamations depuis un fichier CSV ou Excel. La référence est générée automatiquement."
                fields={importFields}
                onImport={handleImport}
                templateFileName="reclamations-modele.xlsx"
              />
            )}
            {canAdd && (
              <Button size="sm" onClick={() => { setEditing(empty()); setOpenDialog(true); }}>
                <Plus className="h-4 w-4 mr-1" /> Nouvelle
              </Button>
            )}
          </div>
        }
      />


      {/* Filtre CIN dédié — accès rapide */}
      <Card className="p-3 mb-3 border-primary/30 bg-primary/5">
        <div className="flex flex-col sm:flex-row sm:items-end gap-2">
          <div className="flex-1">
            <Label htmlFor="cin-quick" className="text-xs uppercase tracking-wider text-muted-foreground mb-1 block">
              Filtrer par CIN
            </Label>
            <div className="relative">
              <Input
                id="cin-quick"
                placeholder="Saisir un CIN puis Entrée…"
                value={cin}
                onChange={(e) => setCin(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") load(); }}
                className="h-10 pr-9 font-mono"
                inputMode="numeric"
                autoComplete="off"
              />
              {cin && (
                <button
                  type="button"
                  onClick={() => { setCin(""); setTimeout(load, 0); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Effacer CIN"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
          <Button size="sm" onClick={load} disabled={loading} className="h-10">
            Rechercher
          </Button>
        </div>
      </Card>

      {/* Filtres */}
      <Card className="p-3 mb-3">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
          <Input placeholder="Recherche libre…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Input placeholder="Tél ADSL"         value={tel}    onChange={(e) => setTel(e.target.value)} />
          <Input placeholder="CIN"              value={cin}    onChange={(e) => setCin(e.target.value)} />
          <Input placeholder="GSM"              value={gsm}    onChange={(e) => setGsm(e.target.value)} />
          <Input placeholder="Réf demande"      value={ref}    onChange={(e) => setRef(e.target.value)} />
          <Select value={service} onValueChange={setService}>
            <SelectTrigger><SelectValue placeholder="Service" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Tous services</SelectItem>
              {SERVICES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={audit} onValueChange={setAudit}>
            <SelectTrigger><SelectValue placeholder="Audit" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Tous statuts</SelectItem>
              {AUDIT.map((a) => <SelectItem key={a} value={a}>{AUDIT_LABEL[a]}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex gap-1">
            <Select value={mois} onValueChange={setMois}>
              <SelectTrigger><SelectValue placeholder="Mois" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Mois</SelectItem>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) =>
                  <SelectItem key={m} value={String(m)}>{String(m).padStart(2, "0")}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={annee} onValueChange={setAnnee}>
              <SelectTrigger><SelectValue placeholder="Année" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Année</SelectItem>
                {yearsAvail.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <FilterPresetPicker
            scope={"reclamations" as any}
            current={currentView as any}
            filterKeys={schemaKeys(presetSchema)}
            filterSchema={presetSchema}
            onApply={(f) => {
              applyView({
                search: typeof f.search === "string" ? f.search : "",
                service: typeof f.service === "string" ? f.service : "",
                audit: typeof f.audit === "string" ? f.audit : "",
                mois: typeof f.mois === "string" ? f.mois : "",
                annee: typeof f.annee === "string" ? f.annee : "",
                tel: typeof f.tel === "string" ? f.tel : "",
                cin: typeof f.cin === "string" ? f.cin : "",
                gsm: typeof f.gsm === "string" ? f.gsm : "",
                ref: typeof f.ref === "string" ? f.ref : "",
              });
              const extra: Record<string, unknown> = {};
              for (const [k, v] of Object.entries(f)) {
                if (["search","service","audit","mois","annee","tel","cin","gsm","ref"].includes(k)) continue;
                if (v != null && v !== "") extra[k] = v;
              }
              setPresetExtra(extra);
            }}
            onReset={() => {
              setSearch(""); setTel(""); setCin(""); setGsm(""); setRef("");
              setService(ALL); setAudit(ALL); setMois(ALL); setAnnee(ALL);
              setPresetExtra({});
              setTimeout(load, 0);
            }}
          />
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => {
              setSearch(""); setTel(""); setCin(""); setGsm(""); setRef("");
              setService(ALL); setAudit(ALL); setMois(ALL); setAnnee(ALL);
              setPresetExtra({});
              setTimeout(load, 0);
            }}>Réinitialiser</Button>
            <Button size="sm" onClick={load}>Filtrer</Button>
          </div>
        </div>
      </Card>

      {presetChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 px-1 mb-3">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Filtres :</span>
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

      {selected.size > 0 && canDelete && (
        <Card className="p-3 mb-3 shadow-elegant bg-primary/5 border-primary/20 flex items-center justify-between gap-2 flex-wrap">
          <div className="text-sm font-medium">{selected.size} réclamation(s) sélectionnée(s)</div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={bulkBusy}
              onClick={async () => {
                const ids = Array.from(selected);
                if (!(await confirmDialog({ title: "Suppression", description: `Supprimer ${ids.length} réclamation(s) ?`, tone: "destructive", confirmText: "Supprimer" }))) return;
                setBulkBusy(true);
                let ok = 0;
                try {
                  for (const id of ids) {
                    try { await api(`/reclamations.php?id=${encodeURIComponent(id)}`, { method: "DELETE" }); ok++; } catch { /* ignore */ }
                  }
                  toast.success(`${ok}/${ids.length} supprimée(s)`);
                  setSelected(new Set());
                  await load();
                } finally { setBulkBusy(false); }
              }}
            ><Trash2 className="h-4 w-4 mr-1" />Supprimer</Button>
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Désélectionner</Button>
          </div>
        </Card>
      )}

      <DataGrid
        rows={filtered}
        columns={columns}
        rowKey={(r) => String(r.id)}
        pageSize={50}
        selectable={canDelete}
        selected={selected}
        onSelectedChange={setSelected}
        emptyState={loading ? "Chargement…" : "Aucune réclamation."}
        onRowClick={(r) => navigate({ to: "/reclamations/$id", params: { id: String(r.id) } })}
        rowActions={[
          { label: "Ouvrir",     icon: <Eye className="h-4 w-4" />,        onClick: (r) => navigate({ to: "/reclamations/$id", params: { id: String(r.id) } }) },
          { label: "Pièces jointes", icon: <Paperclip className="h-4 w-4" />, onClick: (r) => navigate({ to: "/reclamations/$id", params: { id: String(r.id) } }) },
          { label: "Supprimer",  icon: <Trash2 className="h-4 w-4" />,    onClick: deleteRow, destructive: true, hidden: () => !canDelete },
        ]}
      />

      {/* Dialog édition / création */}
      <Dialog open={openDialog} onOpenChange={(v) => { setOpenDialog(v); if (!v) setEditing(null); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing?.id ? `Réclamation ${editing.reference ?? ""}` : "Nouvelle réclamation"}
            </DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tél ADSL"><Input value={editing.tel_adsl ?? ""} onChange={(e) => setEditing({ ...editing, tel_adsl: e.target.value })} /></Field>
              <Field label="Réf demande"><Input value={editing.ref_demand ?? ""} onChange={(e) => setEditing({ ...editing, ref_demand: e.target.value })} /></Field>
              <Field label="CIN client"><Input value={editing.cin_client ?? ""} onChange={(e) => setEditing({ ...editing, cin_client: e.target.value })} /></Field>
              <Field label="GSM client"><Input value={editing.gsm_client ?? ""} onChange={(e) => setEditing({ ...editing, gsm_client: e.target.value })} /></Field>
              <Field label="Client" className="col-span-2"><Input value={editing.client_name ?? ""} onChange={(e) => setEditing({ ...editing, client_name: e.target.value })} /></Field>
              <Field label="Service">
                <Select value={editing.service ?? "Technique"} onValueChange={(v) => setEditing({ ...editing, service: v as Service })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SERVICES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Audit">
                <Select value={editing.audit_status ?? "en_cours"} onValueChange={(v) => setEditing({ ...editing, audit_status: v as Audit })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {AUDIT.map((a) => <SelectItem key={a} value={a}>{AUDIT_LABEL[a]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Statut CRM"><Input value={editing.statut_crm ?? ""} onChange={(e) => setEditing({ ...editing, statut_crm: e.target.value })} /></Field>
              <Field label="Statut TT"><Input value={editing.statut_tt ?? ""} onChange={(e) => setEditing({ ...editing, statut_tt: e.target.value })} /></Field>
              <Field label="Localisation"><Input value={editing.localisation ?? ""} onChange={(e) => setEditing({ ...editing, localisation: e.target.value })} /></Field>
              <Field label="État"><Input value={editing.etat ?? ""} onChange={(e) => setEditing({ ...editing, etat: e.target.value })} /></Field>
              <Field label="Date création">
                <Input type="datetime-local"
                       value={editing.date_creation ? String(editing.date_creation).slice(0, 16).replace(" ", "T") : ""}
                       onChange={(e) => setEditing({ ...editing, date_creation: e.target.value })} />
              </Field>
              <Field label="Date résolution">
                <Input type="datetime-local"
                       value={editing.date_resolution ? String(editing.date_resolution).slice(0, 16).replace(" ", "T") : ""}
                       onChange={(e) => setEditing({ ...editing, date_resolution: e.target.value || null })} />
              </Field>
              <Field label="Assigné à (username)" className="col-span-2"><Input value={editing.assigned_to ?? ""} onChange={(e) => setEditing({ ...editing, assigned_to: e.target.value })} /></Field>
              <Field label="Description" className="col-span-2"><Textarea rows={3} value={editing.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></Field>
              <Field label="Remarques" className="col-span-2"><Textarea rows={2} value={editing.remarques ?? ""} onChange={(e) => setEditing({ ...editing, remarques: e.target.value })} /></Field>

              {editing.id && (
                <div className="col-span-2 mt-2">
                  <Label className="mb-2 block">Photos & pièces jointes</Label>
                  <AttachmentsCard entity="reclamation" entityId={String(editing.id)} />
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpenDialog(false)}>Annuler</Button>
            <Button onClick={saveRow} disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog pièces jointes (depuis menu rangée) */}
      <Dialog open={!!openAttach} onOpenChange={(v) => { if (!v) setOpenAttach(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Pièces jointes — {openAttach?.reference}</DialogTitle>
          </DialogHeader>
          {openAttach && <AttachmentsCard entity="reclamation" entityId={String(openAttach.id)} />}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

function Field({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <Label className="text-xs mb-1 block">{label}</Label>
      {children}
    </div>
  );
}
