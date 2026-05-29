import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Plus, Trash2, CheckCircle2, Save, Layers, Download, FileSpreadsheet,
  ShieldAlert, Pencil, Upload, MoreHorizontal, Eye,
  Folder, RefreshCw, Smartphone,
  LayoutDashboard, Trophy, Target, Wallet, Activity, CalendarDays, BarChart3,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  Cell, Legend,
} from "recharts";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { Can } from "@/components/Can";
import { exportCSV, exportXLSX } from "@/lib/exportUtils";
import { ImportDialog, type ImportField } from "@/components/ImportDialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useErp } from "@/lib/erpStore";
import {
  listDossiers, listEntities, createDossier, validateDossier, deleteDossier,
  getDashboard, updateDossier, updateEntry, deleteEntry, upsertEntry,
  ENTRY_TYPE_LABEL, SIM_OFFRES,
  type GuichetDossier, type GuichetEntity, type GuichetEntryType, type GuichetEntry,
  type GuichetDashboard,
} from "@/lib/guichetApi";

export const Route = createFileRoute("/guichet")({
  head: () => ({ meta: [
    { title: "Guichet — CRM" },
    { name: "description", content: "Saisie des opérations guichet (SIM, Portabilité, SWP, Factures)." },
  ] }),
  validateSearch: zodValidator(z.object({
    entityId: fallback(z.string(), "").default(""),
  })),
  component: GuichetPage,
});

const TYPES: GuichetEntryType[] = ["sim","port","swp","divers","facture_tt","facture_topnet"];

const TYPE_COLORS: Record<GuichetEntryType, string> = {
  facture_topnet: "#f59e0b",
  facture_tt:     "#0ea5e9",
  sim:            "#06b6d4",
  port:           "#84cc16",
  swp:            "#f97316",
  divers:         "#f43f5e",
};

// (Les boutons rapides par type ont été retirés : on choisit le type dans le modal.)

// Row tint by primary entry type — matches the screenshot legend.
const ROW_TINT: Partial<Record<GuichetEntryType, string>> = {
  facture_topnet: "bg-amber-50/70 hover:bg-amber-50",
  facture_tt:     "bg-sky-50/70 hover:bg-sky-50",
  sim:            "bg-cyan-50/70 hover:bg-cyan-50",
  port:           "bg-lime-50/70 hover:bg-lime-50",
  swp:            "bg-orange-50/70 hover:bg-orange-50",
  divers:         "bg-rose-50/70 hover:bg-rose-50",
};

/** Effective operation date for a dossier — mirrors the backend's
 *  COALESCE(op_date, DATE(validated_at), DATE(created_at)) so the list
 *  filter Du/Au matches the dashboard date semantics exactly. */
function effectiveEntryDate(d: GuichetDossier, e?: GuichetEntry): string {
  const opd = e?.opDate ? String(e.opDate).slice(0, 10) : "";
  if (opd) return opd;
  const va = d.validatedAt ? String(d.validatedAt).slice(0, 10) : "";
  if (va) return va;
  return (d.createdAt ?? "").slice(0, 10);
}
/** A dossier matches the range if ANY of its entries falls in it
 *  (or, when it has no entries yet, the dossier's own effective date). */
function entryDateMatchesRange(d: GuichetDossier, from?: string, to?: string): boolean {
  const dates = (d.entries && d.entries.length ? d.entries.map((e) => effectiveEntryDate(d, e)) : [effectiveEntryDate(d)])
    .filter(Boolean);
  return dates.some((dt) => (!from || dt >= from) && (!to || dt <= to));
}

function GuichetPage() {
  const { hasPermission, user, loading: authLoading, permissionsLoading } = useAuth();
  const { users } = useErp();
  const canRead = hasPermission("guichet.read_own") || hasPermission("guichet.read_all");
  // Admin / Manager / read_all : aucun verrou de franchise — voient tout.
  const canReadAll = hasPermission("guichet.read_all");
  const isAdminLike = canReadAll;
  const assignedEntity = isAdminLike ? "" : (user?.guichetEntityId || "");

  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const urlEntityId = assignedEntity || (search.entityId ?? "");

  const [rows, setRows] = useState<GuichetDossier[]>([]);
  const [entities, setEntities] = useState<GuichetEntity[]>([]);
  const [q, setQ] = useState("");
  const [entityId, setEntityIdState] = useState(urlEntityId);
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const month = "";
  const status = "";
  const type = "";

  useEffect(() => { setEntityIdState(assignedEntity || urlEntityId); }, [urlEntityId, assignedEntity]);
  const setEntityId = (id: string) => {
    if (assignedEntity) return; // verrouillé sur la franchise affectée
    setEntityIdState(id);
    navigate({ search: (prev: any) => ({ ...prev, entityId: id || undefined }), replace: true } as any);
  };

  const [createOpen, setCreateOpen] = useState(false);
  const [createPrefill, setCreatePrefill] = useState<GuichetEntryType | null>(null);
  const [editOpen, setEditOpen] = useState<GuichetDossier | null>(null);
  const [editDossier, setEditDossier] = useState<GuichetDossier | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const entityName = (id: string) => entities.find((e) => e.id === id)?.name ?? id;
  const findAgent = (id: string) => users.find((u) => u.id === id || u.username === id);
  const agentName = (id: string) => {
    const u = findAgent(id);
    return u?.fullName || u?.username || id;
  };
  const agentIsMissing = (id: string) => !id || !id.trim() || !findAgent(id);

  const reload = async () => {
    setLoading(true);
    try {
      const list = await listDossiers({
        q: q || undefined, status: status || undefined, month: month || undefined,
        entity_id: entityId || undefined, entityId: entityId || undefined, type: type || undefined,
      });
      setRows(list);
    } catch (e: any) { toast.error(e?.message ?? "Erreur"); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (authLoading || (user && user.role !== "Administrateur" && permissionsLoading)) return;
    listEntities().then(setEntities).catch(() => {});
  }, [authLoading, permissionsLoading, user]);

  useEffect(() => {
    if (authLoading || (user && user.role !== "Administrateur" && permissionsLoading)) return;
    if (!canRead) return;
    void reload();
  }, [authLoading, permissionsLoading, user, canRead, entityId]);

  // Auto-refresh : polling toutes les 20s + au retour de focus / online,
  // pour que les dossiers créés par d'autres agents apparaissent sans
  // devoir créer un nouveau dossier pour déclencher un reload manuel.
  useEffect(() => {
    if (!canRead) return;
    const tick = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      reload();
    };
    const interval = window.setInterval(tick, 20000);
    const onFocus = () => reload();
    const onVisible = () => { if (!document.hidden) reload(); };
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRead, entityId, q, status, month, type]);

  const filtered = useMemo(() => {
    let base = rows;
    if (entityId) base = base.filter((d) => d.entityId === entityId);
    if (status) base = base.filter((d) => d.status === status);
    if (type) base = base.filter((d) => (d.entries ?? []).some((e) => e.type === type));
    if (month) base = base.filter((d) => (d.createdAt ?? "").slice(0, 7) === month);
    if (agentFilter && agentFilter !== "all") base = base.filter((d) => d.agentId === agentFilter);
    if (dateFrom || dateTo) base = base.filter((d) => entryDateMatchesRange(d, dateFrom || undefined, dateTo || undefined));
    if (!q.trim()) return base;
    const s = q.trim().toLowerCase();
    return base.filter((d) =>
      (d.ref || "").toLowerCase().includes(s) ||
      (d.clientName || "").toLowerCase().includes(s) ||
      (d.clientCin || "").toLowerCase().includes(s) ||
      (d.entries ?? []).some((e) => (e.numero || "").toLowerCase().includes(s) || (e.cin || "").toLowerCase().includes(s))
    );
  }, [rows, q, entityId, status, type, month, agentFilter, dateFrom, dateTo]);

  /* ---------- KPI sidebar (current view) ----------
   * Aligned with the backend dashboard semantics:
   *  - only `status='valide'` entries are counted (drafts excluded)
   *  - amounts coerced via Number() and guarded against NaN
   * This guarantees the cards match the dashboard tab to the cent.
   */
  const summary = useMemo(() => {
    const acc: Record<GuichetEntryType, { count: number; amount: number }> = {
      sim: { count: 0, amount: 0 }, port: { count: 0, amount: 0 }, swp: { count: 0, amount: 0 },
      divers: { count: 0, amount: 0 }, facture_tt: { count: 0, amount: 0 }, facture_topnet: { count: 0, amount: 0 },
    };
    const dossierIds = new Set<string>();
    for (const d of filtered) for (const e of d.entries ?? []) {
      if (e.status !== "valide") continue;
      if (!acc[e.type]) continue;
      // When a date range is active, only count entries whose effective date
      // falls in the range — otherwise we over-count entries from dossiers
      // that merely have ONE matching entry. Mirrors backend semantics.
      const dt = effectiveEntryDate(d, e);
      if (dateFrom && dt < dateFrom) continue;
      if (dateTo   && dt > dateTo)   continue;
      const amt = Number(e.amount);
      acc[e.type].count++;
      acc[e.type].amount += Number.isFinite(amt) ? amt : 0;
      dossierIds.add(d.id);
    }
    return { ...acc, dossierCount: dossierIds.size };
  }, [filtered, dateFrom, dateTo]);
  const fmt = (n: number) =>
    (Number(n) || 0).toLocaleString("fr-TN", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

  /* ---------- Export ---------- */
  const buildExport = () => {
    const out: Record<string, unknown>[] = [];
    for (const d of filtered) {
      const entries = (d.entries ?? []).filter((e) => {
        if (e.status !== "valide") return false;
        const dt = effectiveEntryDate(d, e);
        if (dateFrom && dt < dateFrom) return false;
        if (dateTo && dt > dateTo) return false;
        return true;
      });
      const total = entries.reduce((s, e) => {
        const amt = Number(e.amount);
        return s + (Number.isFinite(amt) ? amt : 0);
      }, 0);
      if (!entries.length) {
        out.push({ Réf: d.ref, Client: d.clientName, CIN: d.clientCin, Type: "", Détails: "", Montant: "", Agent: agentName(d.agentId), Statut: d.status, Date: d.createdAt?.slice(0,10) ?? "", Total: total });
        continue;
      }
      for (const e of entries) {
        out.push({ Réf: d.ref, Client: d.clientName, CIN: e.cin || d.clientCin, Type: ENTRY_TYPE_LABEL[e.type], Numéro: e.numero, Offre: e.offre, Montant: e.amount ?? "", Agent: agentName(d.agentId), Statut: e.status, Date: effectiveEntryDate(d, e), Total: total });
      }
    }
    return out;
  };
  const onExportCsv = () => { const d = buildExport(); if (!d.length) return toast.error("Aucune donnée"); exportCSV(`guichet_${new Date().toISOString().slice(0,10)}.csv`, d); };
  const onExportXlsx = async () => { const d = buildExport(); if (!d.length) return toast.error("Aucune donnée"); await exportXLSX(`guichet_${new Date().toISOString().slice(0,10)}.xlsx`, d, "Guichet"); };

  /* ---------- Import ---------- */
  const TYPE_ALIAS: Record<string, GuichetEntryType> = (() => {
    const m: Record<string, GuichetEntryType> = {};
    for (const t of TYPES) { m[t] = t; m[ENTRY_TYPE_LABEL[t].toLowerCase()] = t; }
    m["portabilite"] = "port"; m["portabilité"] = "port";
    return m;
  })();
  const importFields: ImportField[] = [
    { key: "entite", label: "Entité", required: true, sample: entities[0]?.name ?? "TTshop" },
    { key: "agent", label: "Agent", required: true,
      sample: users[0]?.username ?? "nom.prenom",
      validate: (v) => (v && String(v).trim() ? null : "agent requis") },
    { key: "type", label: "Type", required: true, sample: "SIM",
      validate: (v) => (v && TYPE_ALIAS[String(v).trim().toLowerCase()] ? null : "type inconnu") },
    { key: "client", label: "Client", sample: "Mohamed Ali" },
    { key: "cin", label: "CIN", sample: "12345678" },
    { key: "numero", label: "Numéro", sample: "29123456" },
    { key: "offre", label: "Offre", sample: "Fancy" },
    { key: "amount", label: "Montant", sample: "25", validate: (v) => (v === "" || v == null || !isNaN(Number(v))) ? null : "invalide" },
    { key: "opDate", label: "Date", sample: new Date().toISOString().slice(0,10) },
  ];

  // Index users (id / username / email / fullName) → user pour résoudre la colonne Agent.
  const userByKey = useMemo(() => {
    const m = new Map<string, { id: string }>();
    for (const u of users) {
      const keys = [u.id, u.username, u.email, u.fullName].filter(Boolean) as string[];
      for (const k of keys) m.set(String(k).trim().toLowerCase(), u);
    }
    return m;
  }, [users]);

  const handleImport = async (importedRows: Record<string, unknown>[]) => {
    let added = 0, skipped = 0;
    const skippedReasons: string[] = [];
    const entByName = new Map(entities.map((e) => [e.name.trim().toLowerCase(), e]));
    for (const r of importedRows) {
      const ent = entByName.get(String(r.entite ?? "").trim().toLowerCase());
      const tKey = TYPE_ALIAS[String(r.type ?? "").trim().toLowerCase()];
      const agentRaw = String(r.agent ?? "").trim().toLowerCase();
      const agentUser = agentRaw ? userByKey.get(agentRaw) : null;

      if (!ent)       { skipped++; skippedReasons.push(`entité inconnue (${r.entite})`); continue; }
      if (!tKey)      { skipped++; skippedReasons.push(`type inconnu (${r.type})`); continue; }
      if (!agentUser) { skipped++; skippedReasons.push(`agent introuvable (${r.agent})`); continue; }

      try {
        await createDossier({
          entityId: ent.id,
          agentId: agentUser.id,
          clientName: String(r.client ?? ""),
          clientCin: String(r.cin ?? ""),
          status: "draft",
          entries: [{
            type: tKey, cin: String(r.cin ?? ""), numero: String(r.numero ?? ""),
            amount: r.amount == null || r.amount === "" ? null : Number(r.amount),
            offre: String(r.offre ?? ""),
            opDate: r.opDate ? String(r.opDate).slice(0,10) : null,
          }],
        });
        added++;
      } catch (e: any) {
        skipped++; skippedReasons.push(e?.message ?? "erreur serveur");
      }
    }
    if (skipped > 0) {
      const sample = skippedReasons.slice(0, 3).join(" · ");
      toast.warning(`${skipped} ligne(s) ignorée(s) — ${sample}${skippedReasons.length > 3 ? "…" : ""}`);
    }
    reload();
    return { added, updated: 0, skipped };
  };

  const onValidate = async (id: string) => { try { await validateDossier(id); toast.success("Validé"); reload(); } catch (e: any) { toast.error(e?.message ?? "Erreur"); } };
  const performDelete = async () => {
    const id = confirmDeleteId; setConfirmDeleteId(null); if (!id) return;
    try { await deleteDossier(id); toast.success("Supprimé"); reload(); } catch (e: any) { toast.error(e?.message ?? "Erreur"); }
  };

  if (!canRead) {
    return (
      <AppLayout>
        <PageHeader title="Guichet" icon={<Layers className="h-5 w-5" />} />
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <ShieldAlert className="h-8 w-8 mx-auto mb-2" />Accès refusé.
        </CardContent></Card>
      </AppLayout>
    );
  }

  // AgentGuichet (verrouillé sur sa franchise) sans entityId affecté →
  // message clair au lieu d'un écran vide / spinner infini.
  if (user?.role === "AgentGuichet" && !assignedEntity) {
    return (
      <AppLayout>
        <PageHeader title="Guichet" icon={<Layers className="h-5 w-5" />} />
        <Card><CardContent className="py-12 text-center space-y-3">
          <ShieldAlert className="h-8 w-8 mx-auto text-muted-foreground" />
          <div className="font-medium">Aucune franchise affectée à votre compte</div>
          <div className="text-sm text-muted-foreground max-w-md mx-auto">
            Votre administrateur doit vous rattacher à une entité guichet
            avant que vous puissiez créer ou consulter des dossiers.
          </div>
        </CardContent></Card>
      </AppLayout>
    );
  }
  const openCreate = (preset: GuichetEntryType | null = null) => { setCreatePrefill(preset); setCreateOpen(true); };

  return (
    <AppLayout>
      <PageHeader
        title="Traitement Guichet"
        icon={<Layers className="h-5 w-5" />}
        actions={
          <Link
            to="/guichet/analytics"
            className="inline-flex items-center justify-center h-9 px-3 rounded-md text-sm font-medium bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white shadow-sm transition-colors"
          >
            <BarChart3 className="h-4 w-4 mr-1.5" /> Analytics détaillés
          </Link>
        }
      />

      <Tabs defaultValue="dossiers" className="space-y-3">
        <TabsList>
          <TabsTrigger value="dossiers"><Folder className="h-4 w-4 mr-1.5" /> Dossiers</TabsTrigger>
          <TabsTrigger value="dashboard"><LayoutDashboard className="h-4 w-4 mr-1.5" /> Tableau de bord</TabsTrigger>
        </TabsList>


        <TabsContent value="dashboard" className="mt-0">
          <DashboardTab
            entityId={entityId}
            setEntityId={setEntityId}
            assignedEntity={assignedEntity}
            canReadAll={canReadAll}
            entities={entities}
            agentName={agentName}
          />
        </TabsContent>

        <TabsContent value="dossiers" className="mt-0">
      <div className="space-y-3">
        {/* Top KPI row — moved from right sidebar */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2">
          <KpiCard title="Total Factures Topnet" value={`${fmt(summary.facture_topnet.amount)} DT`} sub={`${summary.facture_topnet.count} opération(s)`} />
          <KpiCard title="Total Factures Telecom" value={`${fmt(summary.facture_tt.amount)} DT`} sub={`${summary.facture_tt.count} opération(s)`} />
          <KpiCard title="Divers (Prix)" value={`${fmt(summary.divers.amount)} DT`} sub={`${summary.divers.count} opération(s)`} />
          <KpiCard title="Total général" value={`${fmt(summary.facture_topnet.amount + summary.facture_tt.amount + summary.divers.amount)} DT`} sub={`${summary.dossierCount} dossier(s) validé(s)`} highlight />
          <KpiCard title="SIM Activées" value={`${summary.sim.count} opération(s)`} />
          <KpiCard title="Portabilités" value={`${summary.port.count} opération(s)`} />
          <KpiCard title="SWP Traités" value={`${summary.swp.count} opération(s)`} />
        </div>
      <div className="grid grid-cols-1 gap-3 items-start">
        <Card>
          <CardContent className="p-4 space-y-3">
            {/* Action principale : un seul bouton "Nouveau" — le type d'opération est choisi dans le modal */}
            <Can perm="guichet.create">
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => openCreate(null)}>
                  <Plus className="h-4 w-4 mr-1" /> Nouveau dossier
                </Button>
              </div>
            </Can>

            {/* Simple search + filters + actions */}
            <div className="flex flex-wrap items-center gap-2">
              <Input
                placeholder="Rechercher client, CIN, n°…"
                value={q} onChange={(e) => setQ(e.target.value)}
                className="h-9 w-full sm:w-64"
              />
              {canReadAll && (
                <Select value={agentFilter} onValueChange={setAgentFilter}>
                  <SelectTrigger className="h-9 w-full sm:w-44"><SelectValue placeholder="Agent" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous les agents</SelectItem>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.fullName || u.username}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <div className="flex items-center gap-1">
                <Label className="text-[11px] text-muted-foreground">Du</Label>
                <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 w-36" />
                <Label className="text-[11px] text-muted-foreground">Au</Label>
                <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 w-36" />
              </div>
              {(q || (agentFilter && agentFilter !== "all") || dateFrom || dateTo) && (
                <Button size="sm" variant="ghost" onClick={() => { setQ(""); setAgentFilter("all"); setDateFrom(""); setDateTo(""); }}>
                  Réinitialiser
                </Button>
              )}
              <div className="ml-auto">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="ghost"><MoreHorizontal className="h-4 w-4" /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <Can perm="guichet.export">
                    <DropdownMenuItem onClick={onExportCsv}><Download className="h-4 w-4 mr-2" /> Export Excel</DropdownMenuItem>
                    <DropdownMenuItem onClick={onExportXlsx}><FileSpreadsheet className="h-4 w-4 mr-2" /> Export Excel</DropdownMenuItem>
                  </Can>
                  <Can anyOf={["guichet.import", "guichet.create"]}>
                    <ImportDialog
                      title="Importer Guichet" description="Une ligne = une opération."
                      fields={importFields} onImport={handleImport} templateFileName="modele-guichet.xlsx"
                      trigger={<DropdownMenuItem onSelect={(e) => e.preventDefault()}><Upload className="h-4 w-4 mr-2" /> Importer</DropdownMenuItem>}
                    />
                  </Can>
                </DropdownMenuContent>
              </DropdownMenu>
              </div>
            </div>

            {/* Table */}
            <div className="border rounded-md overflow-x-auto">
              <Table className="[&_th]:h-9 [&_th]:py-1 [&_th]:text-[11px] [&_th]:font-bold [&_th]:text-rose-700 [&_thead_tr]:bg-rose-50 [&_thead_tr]:hover:bg-rose-50">
                <TableHeader>
                  <TableRow>
                    <TableHead>Dossier Réf./N°</TableHead>
                    <TableHead>Type Opération</TableHead>
                    <TableHead>Client / CIN</TableHead>
                    <TableHead>Détails Opération</TableHead>
                    <TableHead>Montant / Offre</TableHead>
                    <TableHead>Agent</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Date Saisie</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading && Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={`sk-${i}`} className="[&>td]:py-2">
                      <TableCell><Skeleton className="h-4 w-24" /><Skeleton className="h-3 w-16 mt-1" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-32" /><Skeleton className="h-3 w-20 mt-1" /></TableCell>
                      <TableCell><Skeleton className="h-3 w-40" /><Skeleton className="h-3 w-28 mt-1" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-7 w-16 ml-auto" /></TableCell>
                    </TableRow>
                  ))}
                  {!loading && filtered.length === 0 && <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Aucun dossier.</TableCell></TableRow>}
                   {filtered.map((d) => {
                     const e0 = d.entries?.[0];
                     const total = (d.entries ?? []).reduce((s, e) => s + (e.amount ?? 0), 0);
                     // Build 2-line details (≈40 chars/line, ellipsis if more)
                     const detailItems = d.entries?.length === 1 && e0
                       ? [e0.numero || e0.label || "—"]
                       : (d.entries ?? []).map((e) => e.numero || ENTRY_TYPE_LABEL[e.type]);
                     const MAX = 40;
                     const lines: string[] = ["", ""];
                     let li = 0, overflow = false;
                     for (const it of detailItems) {
                       const sep = lines[li] ? ", " : "";
                       if ((lines[li] + sep + it).length <= MAX) { lines[li] += sep + it; }
                       else if (li === 0) { li = 1; lines[li] = it.length <= MAX ? it : it.slice(0, MAX - 1) + "…"; }
                       else { overflow = true; break; }
                     }
                     if (overflow) lines[1] = (lines[1] + "…").slice(0, MAX);
                     return (
                       <TableRow key={d.id} className={`[&>td]:py-1.5 ${e0 ? ROW_TINT[e0.type] ?? "" : ""}`}>
                         <TableCell className="font-mono text-xs py-1.5">
                           <div>{d.ref}</div>
                           <div className="text-[10px] text-muted-foreground font-sans">{entityName(d.entityId)}</div>
                         </TableCell>
                         <TableCell className="py-1.5">
                           {d.entries?.length === 1 && e0
                             ? <Badge variant="outline" className="font-normal text-[11px]">{ENTRY_TYPE_LABEL[e0.type]}</Badge>
                             : <span className="text-xs text-muted-foreground">{d.entries?.length ?? 0} op.</span>}
                         </TableCell>
                         <TableCell className="py-1.5">
                           <div className="text-xs">{d.clientName || "—"}</div>
                           <div className="text-[11px] text-muted-foreground">{d.clientCin || e0?.cin || ""}</div>
                         </TableCell>
                         <TableCell className="text-xs py-1.5 leading-tight">
                           <div>{lines[0] || "—"}</div>
                           {lines[1] && <div>{lines[1]}</div>}
                         </TableCell>
                         <TableCell className="text-xs py-1.5">
                           {total ? `${total.toLocaleString("fr-TN", { maximumFractionDigits: 3 })} DT` : (e0?.offre || "—")}
                         </TableCell>
                          <TableCell className="text-xs py-1.5 whitespace-nowrap">
                            {agentIsMissing(d.agentId)
                              ? <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 text-[11px]">⚠ Agent manquant</Badge>
                              : agentName(d.agentId)}
                          </TableCell>
                         <TableCell className="py-1.5">
                           {d.status === "valide"
                             ? <Badge className="bg-success/15 text-success border-success/20 text-[11px]">Validé</Badge>
                             : <Badge variant="outline" className="text-[11px]">Brouillon</Badge>}
                         </TableCell>
                         <TableCell className="text-[11px] text-muted-foreground py-1.5 whitespace-nowrap">{d.createdAt?.slice(0,10) ?? ""}</TableCell>
                         <TableCell className="text-right py-1.5">
                           <div className="flex justify-end gap-0.5">
                            <Button size="sm" variant="ghost" onClick={() => setEditOpen(d)} title="Voir">
                              <Eye className="h-4 w-4" />
                            </Button>
                            {(isAdminLike || d.agentId === user?.id) && (d.status !== "valide" || isAdminLike || hasPermission("guichet.edit_validated")) && (
                              <Can perm="guichet.edit">
                                <Button size="sm" variant="ghost" onClick={() => setEditDossier(d)} title={d.status === "valide" ? "Modifier (validé)" : "Modifier"}>
                                  <Pencil className={`h-4 w-4 ${d.status === "valide" ? "text-amber-600" : "text-primary"}`} />
                                </Button>
                              </Can>
                            )}
                            {d.status !== "valide" && (
                              <Can perm="guichet.validate">
                                <Button size="sm" variant="ghost" onClick={() => onValidate(d.id)} title="Valider">
                                  <CheckCircle2 className="h-4 w-4 text-success" />
                                </Button>
                              </Can>
                            )}
                            <Can perm="guichet.delete">
                              <Button size="sm" variant="ghost" onClick={() => setConfirmDeleteId(d.id)} title="Supprimer">
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </Can>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Right summary moved to top of page */}
        </div>
      </div>
        </TabsContent>
      </Tabs>

      {/* Create dialog */}
      <CreateDialog
        open={createOpen} onClose={() => setCreateOpen(false)}
        prefillType={createPrefill}
        entities={assignedEntity ? entities.filter((e) => e.id === assignedEntity) : entities}
        prefillEntityId={entityId}
        canAssignAgent={canReadAll}
        onSaved={() => { setCreateOpen(false); reload(); }}
      />

      {/* View dialog */}
      <ViewDossierDialog dossier={editOpen} entities={entities} onClose={() => setEditOpen(null)} />

      {/* Edit dialog */}
      <EditDossierDialog
        dossier={editDossier}
        entities={assignedEntity ? entities.filter((e) => e.id === assignedEntity) : entities}
        canAssignAgent={canReadAll}
        onClose={() => setEditDossier(null)}
        onSaved={() => { setEditDossier(null); reload(); }}
      />

      <ConfirmDialog
        open={!!confirmDeleteId} title="Supprimer ce dossier ?" description="Action définitive."
        destructive confirmLabel="Supprimer"
        onConfirm={performDelete} onCancel={() => setConfirmDeleteId(null)}
      />
    </AppLayout>
  );
}

function KpiCard({ title, value, sub, highlight }: { title: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className={`rounded-md border bg-card px-3 py-2 shadow-sm ${highlight ? "border-rose-200 bg-rose-50/40" : ""}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
      <div className="mt-0.5 text-sm font-bold tabular-nums">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

/* ============================== CREATE DIALOG ============================== */
function CreateDialog({
  open, onClose, prefillType, entities, prefillEntityId, canAssignAgent, onSaved,
}: {
  open: boolean; onClose: () => void; prefillType: GuichetEntryType | null;
  entities: GuichetEntity[]; prefillEntityId?: string; canAssignAgent: boolean; onSaved: () => void;
}) {
  const { user } = useAuth();
  const { users } = useErp();
  // Brouillon LOCAL : on accumule TOUTES les opérations de la journée dans
  // localStorage sans toucher au backend. Le bouton "Valider" envoie le tout
  // d'un coup en fin de journée. Clé par utilisateur (poste partagé safe).
  const DRAFT_KEY = `guichet:draft:v1:${user?.id ?? "anon"}`;
  type Draft = {
    entityId: string; agentId: string; clientName: string; clientCin: string;
    notes: string; entries: Partial<GuichetEntry>[];
  };
  const loadDraft = (): Draft | null => {
    if (typeof window === "undefined") return null;
    try { const raw = localStorage.getItem(DRAFT_KEY); return raw ? JSON.parse(raw) as Draft : null; }
    catch { return null; }
  };

  const [entityId, setEntityId] = useState("");
  const [agentId, setAgentId] = useState<string>(user?.id ?? "");
  const [clientName, setClientName] = useState("");
  const [clientCin, setClientCin] = useState("");
  const [notes, setNotes] = useState("");
  const [entries, setEntries] = useState<Partial<GuichetEntry>[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const d = loadDraft();
    if (d && (d.entries?.length || d.clientName || d.clientCin || d.notes)) {
      setEntityId(d.entityId || prefillEntityId || (entities.length === 1 ? entities[0].id : ""));
      setAgentId(d.agentId || user?.id || "");
      setClientName(d.clientName ?? "");
      setClientCin(d.clientCin ?? "");
      setNotes(d.notes ?? "");
      setEntries(d.entries ?? []);
      toast.info(`Brouillon local restauré (${d.entries?.length ?? 0} op.)`);
    } else {
      setEntityId(prefillEntityId || (entities.length === 1 ? entities[0].id : ""));
      setAgentId(user?.id ?? "");
      setClientName(""); setClientCin(""); setNotes("");
      setEntries(prefillType ? [{
        type: prefillType, cin: "", numero: "", amount: null, offre: "", operatorSource: "", label: "",
        opDate: new Date().toISOString().slice(0,10), status: "draft",
      }] : []);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Auto-persist le brouillon à chaque modification (modal ouvert).
  useEffect(() => {
    if (!open) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        entityId, agentId, clientName, clientCin, notes, entries,
      }));
    } catch { /* quota */ }
  }, [open, DRAFT_KEY, entityId, agentId, clientName, clientCin, notes, entries]);

  const clearDraft = () => { try { localStorage.removeItem(DRAFT_KEY); } catch {} };

  const addEntry = (t: GuichetEntryType) => setEntries((p) => [...p, {
    type: t, cin: clientCin, numero: "", amount: null, offre: "", operatorSource: "", label: "",
    opDate: new Date().toISOString().slice(0,10), status: "draft",
  }]);
  const updEntry = (i: number, patch: Partial<GuichetEntry>) => setEntries((p) => p.map((e, idx) => idx === i ? { ...e, ...patch } : e));
  const delEntry = (i: number) => setEntries((p) => p.filter((_, idx) => idx !== i));

  // "Brouillon" = sauvegarde LOCALE uniquement, le modal reste ouvert
  // pour que l'agent continue d'ajouter des opérations dans la journée.
  const saveDraftLocal = () => {
    if (entries.length === 0) return toast.error("Ajouter au moins une opération");
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        entityId, agentId, clientName, clientCin, notes, entries,
      }));
      toast.success(`Brouillon local enregistré (${entries.length} op.) — vous pouvez continuer à ajouter.`);
    } catch { toast.error("Impossible d'enregistrer le brouillon local"); }
  };

  const discardDraft = () => {
    clearDraft();
    setEntries([]); setClientName(""); setClientCin(""); setNotes("");
    toast.success("Brouillon local vidé");
  };

  const save = async (status: "draft" | "valide") => {
    if (!entityId) return toast.error("Choisir une entité");
    if (entries.length === 0) return toast.error("Ajouter au moins une opération");
    setSaving(true);
    try {
      await createDossier({
        entityId, agentId: canAssignAgent ? agentId : undefined,
        clientName, clientCin, notes, status, entries,
      });
      toast.success(status === "valide" ? "Validé" : "Brouillon enregistré");
      clearDraft();
      onSaved();
    } catch (e: any) { toast.error(e?.message ?? "Erreur"); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="w-[95vw] sm:max-w-3xl max-h-[90vh] p-0 flex flex-col gap-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b shrink-0">
          <div className="flex items-center justify-between gap-2">
            <DialogTitle>Nouveau Dossier Guichet</DialogTitle>
            {(entries.length > 0) && (
              <div className="flex items-center gap-1.5">
                <div className="text-xs text-muted-foreground bg-muted rounded-full px-2.5 py-1 border">
                  <span className="font-semibold text-foreground">{entries.length}</span> op. · {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "short" })}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={discardDraft}
                  title="Effacer le brouillon local et réinitialiser le compteur"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Effacer
                </Button>
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Ajoutez autant d'opérations que nécessaire (SIM, Portabilité, SWP, factures…) — tout est envoyé en une seule soumission.
          </p>
        </DialogHeader>


        <div className="space-y-3 px-6 py-4 overflow-y-auto flex-1 min-h-0">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <div className="space-y-1.5"><Label>Entité *</Label>
              <Select value={entityId} onValueChange={setEntityId}>
                <SelectTrigger><SelectValue placeholder="Choisir…" /></SelectTrigger>
                <SelectContent>{entities.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {canAssignAgent ? (
              <div className="space-y-1.5"><Label>Agent</Label>
                <Select value={agentId} onValueChange={setAgentId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{users.map((u) => <SelectItem key={u.id} value={u.id}>{u.fullName || u.username}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            ) : <div />}
            <div className="space-y-1.5"><Label>Client</Label><Input value={clientName} onChange={(e) => setClientName(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>CIN</Label><Input value={clientCin} onChange={(e) => setClientCin(e.target.value)} /></div>
          </div>

          <div className="flex flex-wrap gap-1.5 border-t pt-2">
            <span className="text-xs text-muted-foreground self-center mr-1">Ajouter :</span>
            {TYPES.map((t) => (
              <Button key={t} size="sm" variant="outline" onClick={() => addEntry(t)}>
                <Plus className="h-3 w-3 mr-1" /> {ENTRY_TYPE_LABEL[t]}
              </Button>
            ))}
          </div>

          <div className="overflow-x-auto -mx-2">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Type</TableHead><TableHead>N°</TableHead><TableHead>CIN</TableHead>
              <TableHead>Montant</TableHead><TableHead>Offre / Détail</TableHead><TableHead>Date</TableHead><TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {entries.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-4 text-xs text-muted-foreground">Aucune opération.</TableCell></TableRow>}
              {entries.map((e, i) => {
                const t = e.type as GuichetEntryType;
                const showOffre = t === "sim" || t === "port";
                const showLabel = t === "divers";
                return (
                  <TableRow key={i}>
                    <TableCell><Badge variant="outline">{ENTRY_TYPE_LABEL[t]}</Badge></TableCell>
                    <TableCell><Input className="h-8" value={e.numero ?? ""} onChange={(ev) => updEntry(i, { numero: ev.target.value })} /></TableCell>
                    <TableCell><Input className="h-8" value={e.cin ?? ""} onChange={(ev) => updEntry(i, { cin: ev.target.value })} /></TableCell>
                    <TableCell><Input className="h-8 w-24" type="number" step="0.001" value={e.amount ?? ""} onChange={(ev) => updEntry(i, { amount: ev.target.value === "" ? null : Number(ev.target.value) })} /></TableCell>
                    <TableCell>
                      {showOffre && <Select value={e.offre || ""} onValueChange={(v) => updEntry(i, { offre: v })}>
                        <SelectTrigger className="h-8 w-32"><SelectValue placeholder="Offre" /></SelectTrigger>
                        <SelectContent>{SIM_OFFRES.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                      </Select>}
                      {showLabel && <Input className="h-8" placeholder="Libellé" value={e.label ?? ""} onChange={(ev) => updEntry(i, { label: ev.target.value })} />}
                    </TableCell>
                    <TableCell><Input className="h-8 w-32" type="date" value={e.opDate ?? ""} onChange={(ev) => updEntry(i, { opDate: ev.target.value })} /></TableCell>
                    <TableCell><Button size="sm" variant="ghost" onClick={() => delEntry(i)}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          </div>

          <div className="space-y-1.5"><Label>Notes</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
        <DialogFooter className="px-6 py-3 border-t shrink-0 bg-background flex-wrap gap-2">
          <Button variant="ghost" onClick={discardDraft} disabled={saving} className="text-destructive hover:text-destructive">
            <Trash2 className="h-4 w-4 mr-1" /> Vider brouillon local
          </Button>
          <div className="flex-1" />
          <Button variant="outline" onClick={onClose}>Fermer</Button>
          <Button variant="outline" onClick={saveDraftLocal} disabled={saving}>
            <Save className="h-4 w-4 mr-1" /> Brouillon (local)
          </Button>
          <Can perm="guichet.validate">
            <Button onClick={() => save("valide")} disabled={saving}><CheckCircle2 className="h-4 w-4 mr-1" /> Valider &amp; envoyer
            </Button>
          </Can>
        </DialogFooter>

      </DialogContent>
    </Dialog>
  );
}

function ViewDossierDialog({ dossier, entities, onClose }: { dossier: GuichetDossier | null; entities: GuichetEntity[]; onClose: () => void }) {
  const currentEntityId = dossier?.entityId ?? "";
  return (
    <Dialog open={!!dossier} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Dossier {dossier?.ref}</DialogTitle></DialogHeader>
        {dossier && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2 items-end">
              <div>
                <Label className="text-xs text-muted-foreground">Franchise / Entité</Label>
                <Select value={currentEntityId} disabled>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    {entities.map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><span className="text-muted-foreground">Client :</span> {dossier.clientName || "—"}</div>
              <div><span className="text-muted-foreground">CIN :</span> {dossier.clientCin || "—"}</div>
              <div><span className="text-muted-foreground">Statut :</span> {dossier.status === "valide" ? "Validé" : "Brouillon"}</div>
              <div><span className="text-muted-foreground">Créé le :</span> {dossier.createdAt?.slice(0,10) ?? "—"}</div>
            </div>
            {dossier.notes && <div><span className="text-muted-foreground">Notes :</span> {dossier.notes}</div>}
            <Table>
              <TableHeader><TableRow><TableHead>Type</TableHead><TableHead>N°</TableHead><TableHead>CIN</TableHead><TableHead>Montant</TableHead><TableHead>Offre</TableHead><TableHead>Date</TableHead></TableRow></TableHeader>
              <TableBody>
                {(dossier.entries ?? []).map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>{ENTRY_TYPE_LABEL[e.type]}</TableCell>
                    <TableCell>{e.numero || "—"}</TableCell>
                    <TableCell>{e.cin || "—"}</TableCell>
                    <TableCell>{e.amount != null ? `${e.amount} DT` : "—"}</TableCell>
                    <TableCell>{e.offre || e.label || "—"}</TableCell>
                    <TableCell>{e.opDate || "—"}</TableCell>
                  </TableRow>
                ))}
                {(!dossier.entries || dossier.entries.length === 0) && <TableRow><TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-4">Aucune opération.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        )}
        <DialogFooter><Button variant="outline" onClick={onClose}>Fermer</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================== EDIT DOSSIER DIALOG ============================== */
function EditDossierDialog({
  dossier, entities, canAssignAgent, onClose, onSaved,
}: {
  dossier: GuichetDossier | null;
  entities: GuichetEntity[];
  canAssignAgent: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { users } = useErp();
  const [entityId, setEntityId] = useState("");
  const [agentId, setAgentId] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientCin, setClientCin] = useState("");
  const [notes, setNotes] = useState("");
  const [entries, setEntries] = useState<Partial<GuichetEntry>[]>([]);
  const [deletedEntryIds, setDeletedEntryIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!dossier) return;
    setEntityId(dossier.entityId ?? "");
    setAgentId(dossier.agentId ?? "");
    setClientName(dossier.clientName ?? "");
    setClientCin(dossier.clientCin ?? "");
    setNotes(dossier.notes ?? "");
    setEntries((dossier.entries ?? []).map((e) => ({ ...e })));
    setDeletedEntryIds([]);
  }, [dossier]);

  const updEntry = (i: number, patch: Partial<GuichetEntry>) =>
    setEntries((p) => p.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  const removeEntry = (i: number) => {
    const e = entries[i];
    if (e?.id) setDeletedEntryIds((p) => [...p, e.id as string]);
    setEntries((p) => p.filter((_, idx) => idx !== i));
  };
  const addEntry = (t: GuichetEntryType) =>
    setEntries((p) => [...p, {
      type: t, cin: clientCin, numero: "", amount: null, offre: "", operatorSource: "", label: "",
      opDate: new Date().toISOString().slice(0, 10), status: "draft",
    }]);

  const save = async () => {
    if (!dossier) return;
    setSaving(true);
    try {
      await updateDossier({
        id: dossier.id,
        entityId,
        ...(canAssignAgent && agentId ? { agentId } : {}),
        clientName, clientCin, notes,
      } as any);
      for (const id of deletedEntryIds) {
        try { await deleteEntry(id); } catch (e: any) { toast.error(e?.message ?? "Erreur suppression"); }
      }
      for (const e of entries) {
        if (e.id) {
          await updateEntry({
            id: e.id as string,
            numero: e.numero ?? "",
            cin: e.cin ?? "",
            amount: e.amount ?? null,
            offre: e.offre ?? "",
            label: e.label ?? "",
            opDate: e.opDate ?? null,
          } as any);
        } else if (e.type) {
          await upsertEntry({
            dossierId: dossier.id,
            type: e.type as GuichetEntryType,
            numero: e.numero ?? "",
            cin: e.cin ?? "",
            amount: e.amount ?? null,
            offre: e.offre ?? "",
            label: e.label ?? "",
            opDate: e.opDate ?? null,
          } as any);
        }
      }
      toast.success("Dossier mis à jour");
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Erreur");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!dossier} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="w-[95vw] sm:max-w-3xl max-h-[90vh] p-0 flex flex-col gap-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b shrink-0">
          <DialogTitle>Modifier dossier {dossier?.ref}</DialogTitle>
        </DialogHeader>
        {dossier && (
          <div className="space-y-3 px-6 py-4 overflow-y-auto flex-1 min-h-0">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
              <div className="space-y-1.5">
                <Label>Entité</Label>
                <Select value={entityId} onValueChange={setEntityId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{entities.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {canAssignAgent ? (
                <div className="space-y-1.5">
                  <Label>Agent</Label>
                  <Select value={agentId} onValueChange={setAgentId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{users.map((u) => <SelectItem key={u.id} value={u.id}>{u.fullName || u.username}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              ) : <div />}
              <div className="space-y-1.5"><Label>Client</Label><Input value={clientName} onChange={(e) => setClientName(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>CIN</Label><Input value={clientCin} onChange={(e) => setClientCin(e.target.value)} /></div>
            </div>

            <div className="flex flex-wrap gap-1.5 border-t pt-2">
              <span className="text-xs text-muted-foreground self-center mr-1">Ajouter :</span>
              {TYPES.map((t) => (
                <Button key={t} size="sm" variant="outline" onClick={() => addEntry(t)}>
                  <Plus className="h-3 w-3 mr-1" /> {ENTRY_TYPE_LABEL[t]}
                </Button>
              ))}
            </div>

            <div className="overflow-x-auto -mx-2">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Type</TableHead><TableHead>N°</TableHead><TableHead>CIN</TableHead>
                  <TableHead>Montant</TableHead><TableHead>Offre / Détail</TableHead><TableHead>Date</TableHead><TableHead></TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {entries.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-4 text-xs text-muted-foreground">Aucune opération.</TableCell></TableRow>}
                  {entries.map((e, i) => {
                    const t = e.type as GuichetEntryType;
                    const showOffre = t === "sim" || t === "port";
                    const showLabel = t === "divers";
                    return (
                      <TableRow key={e.id ?? `new-${i}`}>
                        <TableCell><Badge variant="outline">{ENTRY_TYPE_LABEL[t]}</Badge></TableCell>
                        <TableCell><Input className="h-8" value={e.numero ?? ""} onChange={(ev) => updEntry(i, { numero: ev.target.value })} /></TableCell>
                        <TableCell><Input className="h-8" value={e.cin ?? ""} onChange={(ev) => updEntry(i, { cin: ev.target.value })} /></TableCell>
                        <TableCell><Input className="h-8 w-24" type="number" step="0.001" value={e.amount ?? ""} onChange={(ev) => updEntry(i, { amount: ev.target.value === "" ? null : Number(ev.target.value) })} /></TableCell>
                        <TableCell>
                          {showOffre && <Select value={e.offre || ""} onValueChange={(v) => updEntry(i, { offre: v })}>
                            <SelectTrigger className="h-8 w-32"><SelectValue placeholder="Offre" /></SelectTrigger>
                            <SelectContent>{SIM_OFFRES.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                          </Select>}
                          {showLabel && <Input className="h-8" placeholder="Libellé" value={e.label ?? ""} onChange={(ev) => updEntry(i, { label: ev.target.value })} />}
                        </TableCell>
                        <TableCell><Input className="h-8 w-32" type="date" value={e.opDate ?? ""} onChange={(ev) => updEntry(i, { opDate: ev.target.value })} /></TableCell>
                        <TableCell><Button size="sm" variant="ghost" onClick={() => removeEntry(i)}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="space-y-1.5"><Label>Notes</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          </div>
        )}
        <DialogFooter className="px-6 py-3 border-t shrink-0 bg-background">
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={save} disabled={saving}><Save className="h-4 w-4 mr-1" /> Enregistrer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
function DashboardTab({
  entityId, setEntityId, assignedEntity, canReadAll, entities, agentName,
}: {
  entityId: string;
  setEntityId: (id: string) => void;
  assignedEntity: string;
  canReadAll: boolean;
  entities: GuichetEntity[];
  agentName: (id: string) => string;
}) {
  const { user } = useAuth();
  const { users } = useErp();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [day, setDay] = useState<string>("");
  // canReadAll: pas de filtre par défaut. Agent affecté à une entité : voit toute l'entité par défaut
  // (toggle "Mes données" possible). Sinon (legacy) : limité à soi.
  const [agentId, setAgentId] = useState<string>(canReadAll ? "" : (assignedEntity ? "" : (user?.id ?? "")));
  const [data, setData] = useState<GuichetDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [perAgent, setPerAgent] = useState<{ agentId: string; revenue: number; amounts: Record<string, number> }[]>([]);

  // Keep day inside the selected month (clear it if month changes away).
  useEffect(() => {
    if (day && !day.startsWith(month)) setDay("");
  }, [month, day]);

  // Sync agentId ONCE after auth loads — do NOT depend on agentId itself,
  // otherwise the user's "Mes données uniquement" selection is reverted
  // immediately (effect re-runs, sees mismatch, resets back to "").
  const syncedRef = useRef(false);
  useEffect(() => {
    if (syncedRef.current) return;
    if (!user) return;
    syncedRef.current = true;
    const initial = canReadAll ? "" : (assignedEntity ? "" : (user.id ?? ""));
    setAgentId(initial);
  }, [user, assignedEntity, canReadAll]);

  const shiftMonth = (delta: number) => {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(Date.UTC(y, (m - 1) + delta, 1));
    setMonth(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  };
  const setThisMonth = () => setMonth(new Date().toISOString().slice(0, 7));
  const resetFilters = () => {
    setThisMonth();
    setDay("");
    setAgentId(canReadAll ? "" : (assignedEntity ? "" : (user?.id ?? "")));
    if (!assignedEntity) setEntityId("");
  };

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getDashboard({
      month,
      day: day || undefined,
      entityId: entityId || undefined,
      agentId: agentId || undefined,
    })
      .then((d) => { if (alive) setData(d); })
      .catch((e: any) => toast.error(e?.message ?? "Erreur dashboard"))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [month, day, entityId, agentId]);

  // Per-agent revenue (admin viewing all agents) — sourced from backend (all agents, not just top-10 SIM).
  useEffect(() => {
    if (!canReadAll || agentId || !data) { setPerAgent([]); return; }
    const rows = (data.perAgent ?? []).map((r) => ({
      agentId: r.agentId,
      amounts: r.amounts,
      revenue: r.revenue ?? TYPES.reduce((s, t) => s + (r.amounts?.[t] || 0), 0),
    }));
    setPerAgent(rows.sort((a, b) => b.revenue - a.revenue));
  }, [data, agentId, canReadAll]);

  const fmt = (n: number) =>
    (Number(n) || 0).toLocaleString("fr-TN", { minimumFractionDigits: 0, maximumFractionDigits: 3 });

  const entityLabel = entityId ? (entities.find((e) => e.id === entityId)?.name ?? "Entité") : "Toutes les interfaces";
  const scopeLabel = canReadAll
    ? (agentId ? `Agent : ${agentName(agentId)}` : "Tous les agents")
    : "Mon activité";
  const monthLabel = (() => {
    const [y, m] = month.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  })();

  const showAgentFilter = !canReadAll && assignedEntity && user?.id;

  return (
    <div className="space-y-3">
      {/* Header / filters */}
      <Card>
        <CardContent className="p-3 flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center rounded-md border bg-background">
            <Button type="button" size="sm" variant="ghost" className="h-9 px-2 rounded-r-none" onClick={() => shiftMonth(-1)} aria-label="Mois précédent">‹</Button>
            <div className="flex items-center gap-1.5 px-2 border-l border-r">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <Input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="h-9 w-36 border-0 shadow-none focus-visible:ring-0 px-1"
              />
            </div>
            <Button type="button" size="sm" variant="ghost" className="h-9 px-2 rounded-l-none" onClick={() => shiftMonth(1)} aria-label="Mois suivant">›</Button>
          </div>
          <Button type="button" size="sm" variant="outline" className="h-9" onClick={setThisMonth}>Ce mois</Button>

          <div className="flex items-center gap-1.5">
            <Label className="text-[11px] text-muted-foreground">Jour</Label>
            <Input
              type="date"
              value={day}
              min={`${month}-01`}
              max={`${month}-31`}
              onChange={(e) => setDay(e.target.value)}
              className="h-9 w-40"
            />
            {day && (
              <Button type="button" size="sm" variant="ghost" className="h-9 px-2" onClick={() => setDay("")}>
                ✕
              </Button>
            )}
          </div>

          {canReadAll && !assignedEntity && (
            <Select value={entityId || "all"} onValueChange={(v) => setEntityId(v === "all" ? "" : v)}>
              <SelectTrigger className="h-9 w-56"><SelectValue placeholder="Entité" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les entités</SelectItem>
                {entities.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {canReadAll && (
            <Select value={agentId || "all"} onValueChange={(v) => setAgentId(v === "all" ? "" : v)}>
              <SelectTrigger className="h-9 w-56"><SelectValue placeholder="Agent" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les agents</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.fullName || u.username}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {!canReadAll && assignedEntity && user?.id && (
            <Select
              value={agentId === user.id ? "self" : "entity"}
              onValueChange={(v) => setAgentId(v === "self" ? user.id! : "")}
            >
              <SelectTrigger className="h-9 w-56">
                <SelectValue placeholder={agentId === user.id ? (user.fullName || user.username) : "Toute mon entité"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="entity">Toute mon entité</SelectItem>
                <SelectItem value="self">{user.fullName || user.username}</SelectItem>
              </SelectContent>
            </Select>
          )}

          <Button type="button" size="sm" variant="ghost" className="h-9" onClick={resetFilters}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Réinitialiser
          </Button>




          <div className="ml-auto flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline" className="capitalize">{monthLabel}</Badge>
            {day && <Badge variant="outline">Jour : {day}</Badge>}
            <Badge variant="outline">{entityLabel}</Badge>
            <Badge variant="outline">{scopeLabel}</Badge>
          </div>
        </CardContent>
      </Card>

      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4 space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-7 w-20" />
              <Skeleton className="h-2 w-full" />
            </CardContent></Card>
          ))}
        </div>
      )}

      {!loading && data && (
        <>
          {/* Top KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <ProgressCard
              title="Contrats du jour"
              icon={<Target className="h-4 w-4" />}
              value={data.contracts.today}
              target={data.targets.contractsDaily}
              progress={data.progress.contractsDaily}
              hint={`Objectif quotidien : ${data.targets.contractsDaily} contrats`}
            />
            <ProgressCard
              title="Contrats du mois"
              icon={<Trophy className="h-4 w-4" />}
              value={data.contracts.month}
              target={data.targets.contractsMonthly}
              progress={data.progress.contractsMonthly}
              hint={`Sur ${data.targets.workingDays} jours ouvrés`}
            />
            <ProgressCard
              title="SIM activées"
              icon={<Smartphone className="h-4 w-4" />}
              value={data.counts.sim}
              target={data.targets.sim}
              progress={data.progress.sim}
              hint={`Fancy : ${data.counts.fancy ?? 0}`}
            />
            <ProgressCard
              title="Portabilités"
              icon={<RefreshCw className="h-4 w-4" />}
              value={data.counts.port}
              target={data.targets.port}
              progress={data.progress.port}
            />
          </div>

          {/* Récap du jour (agent) — total opérations validées + factures TT+Topnet combinées */}
          {data.todayRecap && (
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <CalendarDays className="h-4 w-4 text-primary" />
                    Récap du jour
                    <span className="text-xs font-normal text-muted-foreground">
                      ({new Date(data.todayRecap.date).toLocaleDateString("fr-TN")})
                    </span>
                  </div>
                  {agentId && (
                    <Badge variant="outline" className="text-[11px]">
                      {agentName(agentId)}
                    </Badge>
                  )}
                </div>
                {(() => {
                  const r = data.todayRecap!;
                  const fmt = (n: number) => (n || 0).toLocaleString("fr-TN", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
                  const dc = r.dossierCounts ?? {};
                  const topnetAmt = r.amounts.facture_topnet ?? 0;
                  const topnetOps = r.counts.facture_topnet ?? 0;
                  const ttAmt = r.amounts.facture_tt ?? 0;
                  const ttOps = r.counts.facture_tt ?? 0;
                  const diversAmt = r.amounts.divers ?? 0;
                  const diversOps = r.counts.divers ?? 0;
                  const totalAmt = r.totalAmount ?? (topnetAmt + ttAmt + diversAmt);
                  const totalDossiers = r.dossiersTotal ?? 0;
                  return (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        <div className="rounded-lg border p-3 bg-amber-50/40">
                          <div className="text-[11px] text-muted-foreground uppercase tracking-wide">Total Factures Topnet</div>
                          <div className="text-xl font-bold tabular-nums mt-1">{fmt(topnetAmt)} DT</div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">{topnetOps} opération(s)</div>
                        </div>
                        <div className="rounded-lg border p-3 bg-amber-50/40">
                          <div className="text-[11px] text-muted-foreground uppercase tracking-wide">Total Factures Telecom</div>
                          <div className="text-xl font-bold tabular-nums mt-1">{fmt(ttAmt)} DT</div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">{ttOps} opération(s)</div>
                        </div>
                        <div className="rounded-lg border p-3">
                          <div className="text-[11px] text-muted-foreground uppercase tracking-wide">Divers (Prix)</div>
                          <div className="text-xl font-bold tabular-nums mt-1">{fmt(diversAmt)} DT</div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">{diversOps} opération(s)</div>
                        </div>
                        <div className="rounded-lg border p-3 bg-primary/5 border-primary/30">
                          <div className="text-[11px] text-muted-foreground uppercase tracking-wide">Total général</div>
                          <div className="text-xl font-bold tabular-nums mt-1 text-primary">{fmt(totalAmt)} DT</div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">{r.operations} opération(s) · {totalDossiers} dossier(s)</div>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="rounded-lg border p-3">
                          <div className="text-[11px] text-muted-foreground uppercase tracking-wide">SIM Activées</div>
                          <div className="text-lg font-bold tabular-nums mt-1">{r.counts.sim ?? 0} <span className="text-xs font-normal text-muted-foreground">opération(s)</span></div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">{dc.sim ?? 0} dossier(s)</div>
                        </div>
                        <div className="rounded-lg border p-3">
                          <div className="text-[11px] text-muted-foreground uppercase tracking-wide">Portabilités</div>
                          <div className="text-lg font-bold tabular-nums mt-1">{r.counts.port ?? 0} <span className="text-xs font-normal text-muted-foreground">opération(s)</span></div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">{dc.port ?? 0} dossier(s)</div>
                        </div>
                        <div className="rounded-lg border p-3">
                          <div className="text-[11px] text-muted-foreground uppercase tracking-wide">SWP Traités</div>
                          <div className="text-lg font-bold tabular-nums mt-1">{r.counts.swp ?? 0} <span className="text-xs font-normal text-muted-foreground">opération(s)</span></div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">{dc.swp ?? 0} dossier(s)</div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          )}


          {/* Activation + Budget */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <Card>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Activity className="h-4 w-4 text-primary" />
                    Taux d'activation
                  </div>
                  <Badge className={data.activation.meets ? "bg-success/15 text-success border-success/20" : "bg-destructive/15 text-destructive border-destructive/20"}>
                    {data.activation.meets ? "Objectif atteint" : "Sous objectif"}
                  </Badge>
                </div>
                <div className="flex items-baseline gap-2">
                  <div className="text-3xl font-bold tabular-nums">{data.activation.rate}%</div>
                  <div className="text-xs text-muted-foreground">min. requis : {data.activation.min}%</div>
                </div>
                <Progress value={Math.min(100, data.activation.rate)} className="h-2" />
                <div className="text-[11px] text-muted-foreground">
                  {data.activation.validated} validées / {data.activation.totalEntries} opérations
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Wallet className="h-4 w-4 text-primary" />
                  Budget alloué
                </div>
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Mensuel</div>
                    <div className="text-xl font-bold tabular-nums">
                      {data.targets.budgetMonthlyDt != null ? `${fmt(data.targets.budgetMonthlyDt)} DT` : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Quotidien</div>
                    <div className="text-xl font-bold tabular-nums">
                      {data.targets.budgetDailyDt != null ? `${fmt(data.targets.budgetDailyDt)} DT` : "—"}
                    </div>
                  </div>
                </div>
                {data.bonusDt != null && (
                  <div className="text-[11px] text-muted-foreground pt-1">
                    Bonus challenge : <span className="font-semibold text-foreground">{fmt(data.bonusDt)} DT</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Chiffre d'affaires par type (toujours visible) */}
          {(() => {
            const typeBreakdown = TYPES.map((t) => ({
              type: t,
              label: ENTRY_TYPE_LABEL[t],
              color: TYPE_COLORS[t],
              count: data.counts[t] || 0,
              amount: data.amounts[t] || 0,
            }));
            const totalRevenue = typeBreakdown.reduce((s, r) => s + r.amount, 0);
            const hasData = typeBreakdown.some((r) => r.amount > 0 || r.count > 0);
            return (
              <Card>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <BarChart3 className="h-4 w-4 text-primary" />
                      Chiffre d'affaires par type
                    </div>
                    <Badge variant="outline" className="tabular-nums">Total : {fmt(totalRevenue)} DT</Badge>
                  </div>
                  {!hasData ? (
                    <div className="h-48 flex items-center justify-center text-xs text-muted-foreground">
                      Aucune opération pour la période sélectionnée.
                    </div>
                  ) : (
                    <>
                      <ResponsiveContainer width="100%" height={240}>
                        <BarChart data={typeBreakdown}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} />
                          <Tooltip formatter={(v: any) => `${fmt(Number(v))} DT`} />
                          <Bar dataKey="amount" name="Montant (DT)" radius={[6,6,0,0]}>
                            {typeBreakdown.map((d) => <Cell key={d.type} fill={d.color} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 pt-1">
                        {typeBreakdown.map((r) => (
                          <div key={r.type} className="rounded-md border p-2" style={{ background: `linear-gradient(180deg, ${r.color}15, transparent)` }}>
                            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: r.color }}>
                              <span className="h-2 w-2 rounded-full" style={{ background: r.color }} />
                              {r.label}
                            </div>
                            <div className="text-base font-bold tabular-nums">{r.count}</div>
                            <div className="text-[11px] text-muted-foreground tabular-nums">{fmt(r.amount)} DT</div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })()}

          {/* Chiffre d'affaires par agent (admin, vue "tous les agents") */}
          {canReadAll && !agentId && perAgent.length > 0 && (
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Trophy className="h-4 w-4 text-amber-500" />
                    Chiffre d'affaires par agent
                  </div>
                  <Badge variant="outline" className="tabular-nums">
                    Total : {fmt(perAgent.reduce((s, r) => s + r.revenue, 0))} DT
                  </Badge>
                </div>
                <ResponsiveContainer width="100%" height={Math.max(200, perAgent.length * 38)}>
                  <BarChart data={perAgent.map((r) => ({ name: agentName(r.agentId), ...r }))} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={140} />
                    <Tooltip formatter={(v: any) => `${fmt(Number(v))} DT`} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {TYPES.map((t) => (
                      <Bar key={t} dataKey={`amounts.${t}`} stackId="a" name={ENTRY_TYPE_LABEL[t]} fill={TYPE_COLORS[t]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Leaderboard (admin only when looking at all agents) */}
          {canReadAll && data.leaderboard.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-sm font-semibold mb-3">
                  <Trophy className="h-4 w-4 text-amber-500" />
                  Classement des agents — {month}
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">#</TableHead>
                        <TableHead>Agent</TableHead>
                        <TableHead className="text-right">SIM</TableHead>
                        <TableHead className="text-right">Portabilité</TableHead>
                        <TableHead className="text-right">Fancy</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.leaderboard.map((row, i) => (
                        <TableRow key={row.agentId}>
                          <TableCell className="font-bold">{i + 1}</TableCell>
                          <TableCell>{agentName(row.agentId)}</TableCell>
                          <TableCell className="text-right tabular-nums">{row.sim}</TableCell>
                          <TableCell className="text-right tabular-nums">{row.port}</TableCell>
                          <TableCell className="text-right tabular-nums">{row.fancy}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function ProgressCard({
  title, icon, value, target, progress, hint,
}: {
  title: string;
  icon: React.ReactNode;
  value: number;
  target: number;
  progress: number;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
          <div className="flex items-center gap-1.5">{icon} {title}</div>
          <span className="tabular-nums">{progress}%</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <div className="text-2xl font-bold tabular-nums">{value}</div>
          <div className="text-xs text-muted-foreground">/ {target}</div>
        </div>
        <Progress value={Math.min(100, progress)} className="h-2" />
        {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}
