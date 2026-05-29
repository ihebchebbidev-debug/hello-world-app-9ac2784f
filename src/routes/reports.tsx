import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { BarChart3, Download, RefreshCw, FileSpreadsheet, ArrowDown, ArrowUp, Minus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DatePicker } from "@/components/ui/date-picker";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useEffect, useMemo, useState } from "react";
import { api, API_ENABLED } from "@/lib/api";
import { exportXLSX, withCustomFields } from "@/lib/exportUtils";
import { toast } from "sonner";
import { formatAmount } from "@/lib/currency";
import { useErp } from "@/lib/erpStore";
import { useCustomFieldsTable } from "@/lib/useCustomFields";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "Rapports — CRM" },
      { name: "description", content: "KPIs par agent, entonnoir de conversion, revenus mensuels, exports CSV/Excel." },
    ],
  }),
  component: ReportsPage,
});

type Report = {
  period: { from: string; to: string; team?: string };
  agents: { username: string; fullName: string; team?: string; handled: number; won: number; lost: number; contracts: number; revenue: number; conversion: number }[];
  teams?: { team: string; agents: number; handled: number; won: number; lost: number; contracts: number; revenue: number; conversion: number }[];
  funnel: { pending: number; won: number; lost: number; total: number };
  monthly: { month: string; contracts: number; revenue: number }[];
  sources: { source: string; total: number; won: number; conversion: number }[];
};

const fmtDate = (d: Date) => d.toISOString().slice(0, 10);
const today = () => fmtDate(new Date());
const monthStart = () => new Date().toISOString().slice(0, 8) + "01";
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const daysBetween = (a: string, b: string) =>
  Math.max(1, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000) + 1);

type Preset = { key: string; label: string; compute: () => { from: string; to: string } };
const PRESETS: Preset[] = [
  { key: "today", label: "Aujourd'hui", compute: () => ({ from: today(), to: today() }) },
  { key: "7d", label: "7 derniers jours", compute: () => ({ from: fmtDate(addDays(new Date(), -6)), to: today() }) },
  { key: "30d", label: "30 derniers jours", compute: () => ({ from: fmtDate(addDays(new Date(), -29)), to: today() }) },
  { key: "mtd", label: "Mois en cours", compute: () => ({ from: monthStart(), to: today() }) },
  { key: "ytd", label: "Année en cours", compute: () => ({ from: new Date().getFullYear() + "-01-01", to: today() }) },
  {
    key: "lastMonth",
    label: "Mois précédent",
    compute: () => {
      const d = new Date();
      const first = new Date(d.getFullYear(), d.getMonth() - 1, 1);
      const last = new Date(d.getFullYear(), d.getMonth(), 0);
      return { from: fmtDate(first), to: fmtDate(last) };
    },
  },
];

function previousPeriod(from: string, to: string): { from: string; to: string } {
  const days = daysBetween(from, to);
  const prevTo = fmtDate(addDays(new Date(from), -1));
  const prevFrom = fmtDate(addDays(new Date(prevTo), -(days - 1)));
  return { from: prevFrom, to: prevTo };
}

function ReportsPage() {
  const { prospects, contracts, users } = useErp();
  const { hasPermission } = useAuth();
  const canExport = hasPermission("report.export");
  const pCustom = useCustomFieldsTable("prospect");
  const cCustom = useCustomFieldsTable("contract");
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [team, setTeam] = useState<string>("");
  const [data, setData] = useState<Report | null>(null);
  const [prev, setPrev] = useState<Report | null>(null);
  const [compare, setCompare] = useState(true);
  const [loading, setLoading] = useState(false);

  const teamOptions = useMemo(() => {
    const set = new Set<string>();
    for (const u of users) if (u.team) set.add(u.team);
    return Array.from(set).sort();
  }, [users]);

  const load = async (range?: { from: string; to: string; team?: string }) => {
    if (!API_ENABLED) { toast.error("API désactivée"); return; }
    const f = range?.from ?? from;
    const t = range?.to ?? to;
    const tm = range?.team ?? team;
    setLoading(true);
    try {
      const r = await api<Report>("/reports.php", { query: { from: f, to: t, team: tm || undefined } });
      setData(r);
      if (compare) {
        const pp = previousPeriod(f, t);
        try {
          const r2 = await api<Report>("/reports.php", { query: { from: pp.from, to: pp.to, team: tm || undefined } });
          setPrev(r2);
        } catch { setPrev(null); }
      } else setPrev(null);
    } catch (e: any) {
      toast.error("Erreur chargement", { description: e?.message });
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, []);

  const applyPreset = (p: Preset) => {
    const r = p.compute();
    setFrom(r.from); setTo(r.to);
    void load({ ...r, team });
  };

  // CSV export removed — Excel (.xlsx) is the only supported format.

  const exportXlsx = async () => {
    if (!data) { toast.error("Aucune donnée"); return; }
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.agents), "Agents");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.monthly), "Mensuel");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.sources), "Sources");
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet([{ ...data.funnel, from, to }]),
        "Entonnoir",
      );
      if (prev) {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(prev.agents), "Agents (préc.)");
        XLSX.utils.book_append_sheet(
          wb,
          XLSX.utils.json_to_sheet([{ ...prev.funnel, from: prev.period.from, to: prev.period.to }]),
          "Entonnoir (préc.)",
        );
      }
      XLSX.writeFile(wb, `rapport_${from}_${to}.xlsx`);
      toast.success("Export Excel généré");
    } catch (e: any) {
      toast.error("Échec Excel", { description: e?.message });
    }
  };

  const exportAgentsXlsx = () => {
    if (!data) return;
    void exportXLSX(`agents_${from}_${to}.xlsx`, data.agents, "Agents");
  };

  const inRange = (iso?: string | null) => !!iso && iso >= from && iso <= to;


  const exportProspectsXlsx = async () => {
    const rows = prospects.filter((p) => inRange(p.createdAt?.slice(0, 10)));
    if (rows.length === 0) { toast.error("Aucun prospect sur la période"); return; }
    const enriched = withCustomFields(rows, pCustom.defs, pCustom.valuesById);
    try {
      await exportXLSX(`prospects_${from}_${to}.xlsx`, enriched, "Prospects");
      toast.success(`${rows.length} prospect(s) exporté(s)`);
    } catch (e: any) { toast.error("Échec Excel", { description: e?.message }); }
  };

  const exportContractsXlsx = async () => {
    const rows = contracts.filter((c) => inRange(c.signatureDate?.slice(0, 10)));
    if (rows.length === 0) { toast.error("Aucun contrat sur la période"); return; }
    const enriched = withCustomFields(rows, cCustom.defs, cCustom.valuesById);
    try {
      await exportXLSX(`contrats_${from}_${to}.xlsx`, enriched, "Contrats");
      toast.success(`${rows.length} contrat(s) exporté(s)`);
    } catch (e: any) { toast.error("Échec Excel", { description: e?.message }); }
  };

  const prevByUser = useMemo(() => {
    if (!prev) return new Map<string, Report["agents"][number]>();
    return new Map(prev.agents.map((a) => [a.username, a]));
  }, [prev]);

  return (
    <AppLayout skeleton="dashboard">
      <PageHeader
        title="Rapports & analytique"
        description="Performance par agent, entonnoir, revenus mensuels, comparaison de période et exports."
        icon={<BarChart3 className="h-5 w-5" />}
      />

      <Card className="p-4 mt-6 shadow-elegant">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Du</Label>
            <DatePicker value={from} onChange={setFrom} placeholder="Du" />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Au</Label>
            <DatePicker value={to} onChange={setTo} placeholder="Au" />
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Agence</Label>
            <Select value={team || "__all__"} onValueChange={(v) => { const nv = v === "__all__" ? "" : v; setTeam(nv); void load({ from, to, team: nv }); }}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Toutes" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Toutes les agences</SelectItem>
                <SelectItem value="__none__">Aucune agence</SelectItem>
                {teamOptions.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap gap-1.5 ml-2">
            {PRESETS.map((p) => (
              <Button key={p.key} type="button" variant="outline" size="sm" onClick={() => applyPreset(p)}>
                {p.label}
              </Button>
            ))}
          </div>

          <label className="flex items-center gap-2 text-xs text-muted-foreground ml-2 select-none cursor-pointer">
            <input
              type="checkbox"
              checked={compare}
              onChange={(e) => setCompare(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            Comparer à la période précédente
          </label>

          <div className="ml-auto flex gap-2">
            <Button onClick={() => load()} disabled={loading} className="bg-primary text-primary-foreground hover:bg-primary/90">
              <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />Actualiser
            </Button>
            {canExport && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline"><Download className="h-4 w-4 mr-1.5" />Exporter</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={exportAgentsXlsx}>
                    <FileSpreadsheet className="h-4 w-4 mr-2" />Excel agents
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={exportXlsx}>
                    <FileSpreadsheet className="h-4 w-4 mr-2" />Excel complet (multi-onglets)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={exportProspectsXlsx}>
                    <FileSpreadsheet className="h-4 w-4 mr-2" />Excel prospects (avec champs personnalisés)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={exportContractsXlsx}>
                    <FileSpreadsheet className="h-4 w-4 mr-2" />Excel contrats (avec champs personnalisés)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
        {prev && (
          <div className="mt-3 text-xs text-muted-foreground">
            Comparé à <span className="font-medium text-foreground">{prev.period.from} → {prev.period.to}</span>
          </div>
        )}
      </Card>

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
            <KpiCard label="Leads" value={data.funnel.total} prevValue={prev?.funnel.total} />
            <KpiCard label="Gagnés" value={data.funnel.won} prevValue={prev?.funnel.won} tone="success" />
            <KpiCard label="Perdus" value={data.funnel.lost} prevValue={prev?.funnel.lost} tone="destructive" higherIsBetter={false} />
            <KpiCard label="En attente" value={data.funnel.pending} prevValue={prev?.funnel.pending} />
          </div>

          <Card className="mt-6 shadow-elegant">
            <div className="px-4 py-3 border-b font-semibold text-sm">Performance par agent</div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                  <TableHead className="text-right">Gagnés</TableHead>
                  <TableHead className="text-right">Perdus</TableHead>
                  <TableHead className="text-right">Contrats</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  {prev && <TableHead className="text-right">Δ Revenue</TableHead>}
                  <TableHead className="text-right">Conv. %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.agents.map((a) => {
                  const p = prevByUser.get(a.username);
                  return (
                    <TableRow key={a.username}>
                      <TableCell><div className="font-medium">{a.fullName}</div><div className="text-xs text-muted-foreground">{a.username}</div></TableCell>
                      <TableCell className="text-right">{a.handled}</TableCell>
                      <TableCell className="text-right text-success">{a.won}</TableCell>
                      <TableCell className="text-right text-destructive">{a.lost}</TableCell>
                      <TableCell className="text-right">{a.contracts}</TableCell>
                      <TableCell className="text-right font-medium">{formatAmount(a.revenue)}</TableCell>
                      {prev && (
                        <TableCell className="text-right">
                          <DeltaInline current={a.revenue} previous={p?.revenue ?? 0} format={(n) => formatAmount(n)} />
                        </TableCell>
                      )}
                      <TableCell className="text-right">{a.conversion}%</TableCell>
                    </TableRow>
                  );
                })}
                {data.agents.length === 0 && (
                  <TableRow><TableCell colSpan={prev ? 8 : 7} className="text-center text-muted-foreground py-8">Aucune donnée</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
            <Card className="shadow-elegant">
              <div className="px-4 py-3 border-b font-semibold text-sm">Revenus mensuels (12 mois)</div>
              <Table>
                <TableHeader><TableRow><TableHead>Mois</TableHead><TableHead className="text-right">Contrats</TableHead><TableHead className="text-right">Revenue</TableHead></TableRow></TableHeader>
                <TableBody>
                  {data.monthly.map((m) => (
                    <TableRow key={m.month}>
                      <TableCell>{m.month}</TableCell>
                      <TableCell className="text-right">{m.contracts}</TableCell>
                      <TableCell className="text-right font-medium">{formatAmount(m.revenue)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
            <Card className="shadow-elegant">
              <div className="px-4 py-3 border-b font-semibold text-sm">Performance par source</div>
              <Table>
                <TableHeader><TableRow><TableHead>Source</TableHead><TableHead className="text-right">Total</TableHead><TableHead className="text-right">Gagnés</TableHead><TableHead className="text-right">Conv. %</TableHead></TableRow></TableHeader>
                <TableBody>
                  {data.sources.map((s) => (
                    <TableRow key={s.source}>
                      <TableCell>{s.source}</TableCell>
                      <TableCell className="text-right">{s.total}</TableCell>
                      <TableCell className="text-right text-success">{s.won}</TableCell>
                      <TableCell className="text-right">{s.conversion}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </div>

          {data.teams && data.teams.length > 0 && (
            <Card className="mt-6 shadow-elegant">
              <div className="px-4 py-3 border-b font-semibold text-sm">Performance par agence</div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Agence</TableHead>
                    <TableHead className="text-right">Agents</TableHead>
                    <TableHead className="text-right">Leads</TableHead>
                    <TableHead className="text-right">Gagnés</TableHead>
                    <TableHead className="text-right">Perdus</TableHead>
                    <TableHead className="text-right">Contrats</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Conv. %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.teams.map((t) => (
                    <TableRow key={t.team}>
                      <TableCell className="font-medium">
                        {t.team === "Aucune agence" ? (
                          <span className="italic text-muted-foreground">Aucune agence</span>
                        ) : (
                          t.team
                        )}
                      </TableCell>
                      <TableCell className="text-right">{t.agents}</TableCell>
                      <TableCell className="text-right">{t.handled}</TableCell>
                      <TableCell className="text-right text-success">{t.won}</TableCell>
                      <TableCell className="text-right text-destructive">{t.lost}</TableCell>
                      <TableCell className="text-right">{t.contracts}</TableCell>
                      <TableCell className="text-right font-medium">{formatAmount(t.revenue)}</TableCell>
                      <TableCell className="text-right">{t.conversion}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </>
      )}
    </AppLayout>
  );
}

function KpiCard({
  label, value, prevValue, tone, higherIsBetter = true,
}: { label: string; value: number; prevValue?: number; tone?: "success" | "destructive"; higherIsBetter?: boolean }) {
  const valueClass = tone === "success" ? "text-success" : tone === "destructive" ? "text-destructive" : "";
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold ${valueClass}`}>{value}</div>
      {prevValue !== undefined && (
        <div className="mt-1 text-xs">
          <DeltaInline current={value} previous={prevValue} higherIsBetter={higherIsBetter} />
          <span className="text-muted-foreground ml-1">vs préc.</span>
        </div>
      )}
    </Card>
  );
}

function DeltaInline({
  current, previous, format, higherIsBetter = true,
}: { current: number; previous: number; format?: (n: number) => string; higherIsBetter?: boolean }) {
  if (previous === 0 && current === 0) {
    return <span className="text-muted-foreground inline-flex items-center"><Minus className="h-3 w-3 mr-0.5" />0</span>;
  }
  const diff = current - previous;
  const pct = previous === 0 ? null : Math.round((diff / Math.abs(previous)) * 100);
  const positive = diff > 0;
  const isGood = positive === higherIsBetter;
  const cls = diff === 0 ? "text-muted-foreground" : isGood ? "text-success" : "text-destructive";
  const Icon = diff === 0 ? Minus : positive ? ArrowUp : ArrowDown;
  return (
    <span className={`inline-flex items-center font-medium ${cls}`}>
      <Icon className="h-3 w-3 mr-0.5" />
      {format ? format(Math.abs(diff)) : Math.abs(diff)}
      {pct !== null && <span className="ml-1 opacity-80">({pct > 0 ? "+" : ""}{pct}%)</span>}
    </span>
  );
}
