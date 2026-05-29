import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { Target, Trophy, TrendingUp, Users as UsersIcon, Save, RotateCcw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useErp } from "@/lib/erpStore";
import { formatAmount, useCurrency } from "@/lib/currency";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api, API_ENABLED } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/objectives")({
  head: () => ({
    meta: [
      { title: "Objectifs — CRM" },
      { name: "description", content: "Quotas mensuels par agent: leads, ventes, CA, conversion." },
    ],
  }),
  component: ObjectivesPage,
});

type Quota = { leads: number; won: number; revenue: number };
type QuotasMap = Record<string, Quota>;
const STORAGE_KEY = "erp_agent_quotas_v1";
const SETTING_KEY = "agent_quotas";
const DEFAULT_QUOTA: Quota = { leads: 80, won: 12, revenue: 15000 };

function loadQuotasCache(): QuotasMap {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}"); } catch { return {}; }
}
function cacheQuotas(q: QuotasMap) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(q));
}
async function fetchQuotas(): Promise<QuotasMap | null> {
  if (!API_ENABLED) return null;
  try {
    const r = await api<{ value: QuotasMap | null }>("/settings.php", {
      query: { scope: "global", key: SETTING_KEY },
    });
    return (r?.value && typeof r.value === "object") ? r.value : {};
  } catch { return null; }
}
async function persistQuotas(q: QuotasMap): Promise<void> {
  cacheQuotas(q);
  if (!API_ENABLED) return;
  try {
    await api("/settings.php", { method: "PUT", body: { scope: "global", key: SETTING_KEY, value: q } });
  } catch (e: any) {
    toast.error("Impossible d'enregistrer côté serveur", { description: e?.message });
  }
}

const monthOptions = (() => {
  const out: { value: string; label: string }[] = [];
  const d = new Date();
  for (let i = 0; i < 6; i++) {
    const dt = new Date(d.getFullYear(), d.getMonth() - i, 1);
    const v = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
    out.push({ value: v, label: dt.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }) });
  }
  return out;
})();

function pct(actual: number, target: number) {
  if (target <= 0) return 0;
  return Math.min(100, Math.round((actual / target) * 100));
}

function progressTone(p: number) {
  if (p >= 100) return "bg-success/15 text-success border-success/20";
  if (p >= 75) return "bg-primary/10 text-primary border-primary/20";
  if (p >= 40) return "bg-warning/15 text-warning-foreground border-warning/20";
  return "bg-destructive/10 text-destructive border-destructive/20";
}

function ObjectivesPage() {
  const { users, prospects, contracts } = useErp();
  const currency = useCurrency();
  const [month, setMonth] = useState(monthOptions[0].value);
  const [quotas, setQuotas] = useState<QuotasMap>({});
  const [editing, setEditing] = useState<Record<string, Quota>>({});

  useEffect(() => {
    setQuotas(loadQuotasCache());
    void fetchQuotas().then((q) => { if (q) { setQuotas(q); cacheQuotas(q); } });
  }, []);

  const agents = useMemo(
    () => users.filter((u) => (u.role === "Agent" || u.role === "Manager" || u.role === "AgentSuivi" || u.role === "AgentActivation" || u.role === "AgentVente") && u.active !== false),
    [users],
  );

  const inMonth = (iso: string | null | undefined) => !!iso && iso.startsWith(month);

  const rows = useMemo(() => {
    return agents.map((u) => {
      const myProspects = prospects.filter((p) => p.assignedTo === u.username && inMonth(p.createdAt));
      const won = myProspects.filter((p) => p.outcome === "won").length;
      const lost = myProspects.filter((p) => p.outcome === "lost").length;
      const handled = myProspects.length;
      const myContracts = contracts.filter(
        (c) => c.assignedTo === u.username && inMonth(c.signatureDate),
      );
      const revenue = myContracts.reduce((s, c) => s + (c.premium || 0), 0);
      const conversion = handled ? (won / handled) * 100 : 0;
      const q = quotas[u.username] ?? DEFAULT_QUOTA;
      return {
        username: u.username,
        fullName: u.fullName,
        role: u.role,
        handled, won, lost, revenue, conversion,
        contractsCount: myContracts.length,
        quota: q,
      };
    });
  }, [agents, prospects, contracts, quotas, month]);

  // Team aggregates
  const team = useMemo(() => {
    const acc = rows.reduce(
      (s, r) => ({
        handled: s.handled + r.handled,
        won: s.won + r.won,
        revenue: s.revenue + r.revenue,
        leadsTarget: s.leadsTarget + r.quota.leads,
        wonTarget: s.wonTarget + r.quota.won,
        revenueTarget: s.revenueTarget + r.quota.revenue,
      }),
      { handled: 0, won: 0, revenue: 0, leadsTarget: 0, wonTarget: 0, revenueTarget: 0 },
    );
    const conv = acc.handled ? (acc.won / acc.handled) * 100 : 0;
    return { ...acc, conv };
  }, [rows]);

  const startEdit = (username: string) => {
    setEditing((e) => ({ ...e, [username]: { ...(quotas[username] ?? DEFAULT_QUOTA) } }));
  };
  const cancelEdit = (username: string) => {
    setEditing((e) => { const n = { ...e }; delete n[username]; return n; });
  };
  const saveEdit = async (username: string) => {
    const next = { ...quotas, [username]: editing[username] };
    setQuotas(next);
    await persistQuotas(next);
    cancelEdit(username);
    toast.success(`Objectifs enregistrés pour ${username}`);
  };
  const resetAll = async () => {
    setQuotas({});
    await persistQuotas({});
    toast.success("Objectifs réinitialisés (valeurs par défaut)");
  };

  const topPerformer = rows.reduce<typeof rows[number] | null>(
    (best, r) => (!best || r.won > best.won ? r : best),
    null,
  );

  return (
    <AppLayout skeleton="dashboard">
      <PageHeader
        title="Objectifs mensuels"
        description="Quotas et progression par agent"
        icon={<Target className="h-5 w-5" />}
        actions={
          <div className="flex items-center gap-2">
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger className="h-9 w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {monthOptions.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={resetAll}>
              <RotateCcw className="h-4 w-4 mr-1.5" /> Réinitialiser
            </Button>
          </div>
        }
      />

      {/* Team KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-6">
        <KpiCard
          icon={<UsersIcon className="h-5 w-5" />}
          label="Leads traités"
          value={team.handled}
          target={team.leadsTarget}
        />
        <KpiCard
          icon={<Trophy className="h-5 w-5" />}
          label="Ventes"
          value={team.won}
          target={team.wonTarget}
        />
        <KpiCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="CA"
          value={team.revenue}
          target={team.revenueTarget}
          format={(v) => formatAmount(v, currency)}
        />
        <Card className="p-4 shadow-elegant">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs text-muted-foreground">Conversion équipe</div>
            <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <TrendingUp className="h-5 w-5" />
            </div>
          </div>
          <div className="text-2xl font-bold">{team.conv.toFixed(1)}%</div>
          <div className="text-[11px] text-muted-foreground mt-1">
            {team.won} ventes / {team.handled} leads
          </div>
        </Card>
      </div>

      {topPerformer && topPerformer.won > 0 && (
        <Card className="mt-4 p-4 shadow-elegant bg-gradient-to-r from-primary/5 to-primary/0 border-primary/20 flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-sm">
            <Trophy className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold truncate">Top performer du mois — {topPerformer.fullName}</div>
            <div className="text-xs text-muted-foreground">
              {topPerformer.won} ventes · {formatAmount(topPerformer.revenue, currency)} · conversion {topPerformer.conversion.toFixed(1)}%
            </div>
          </div>
        </Card>
      )}

      {/* Per-agent table */}
      <Card className="mt-4 shadow-elegant overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>Agent</TableHead>
                <TableHead>Leads (objectif)</TableHead>
                <TableHead>Ventes (objectif)</TableHead>
                <TableHead>CA (objectif)</TableHead>
                <TableHead>Conversion</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                    Aucun agent actif
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => {
                const ed = editing[r.username];
                const leadsP = pct(r.handled, r.quota.leads);
                const wonP = pct(r.won, r.quota.won);
                const revP = pct(r.revenue, r.quota.revenue);
                return (
                  <TableRow key={r.username} className="align-top">
                    <TableCell>
                      <div className="font-medium text-sm">{r.fullName}</div>
                      <div className="text-[11px] text-muted-foreground">{r.username} · {r.role}</div>
                    </TableCell>
                    <TableCell className="min-w-[180px]">
                      {ed ? (
                        <QuotaInput
                          value={ed.leads}
                          onChange={(v) => setEditing((e) => ({ ...e, [r.username]: { ...ed, leads: v } }))}
                        />
                      ) : (
                        <ProgressCell actual={r.handled} target={r.quota.leads} pct={leadsP} />
                      )}
                    </TableCell>
                    <TableCell className="min-w-[180px]">
                      {ed ? (
                        <QuotaInput
                          value={ed.won}
                          onChange={(v) => setEditing((e) => ({ ...e, [r.username]: { ...ed, won: v } }))}
                        />
                      ) : (
                        <ProgressCell actual={r.won} target={r.quota.won} pct={wonP} />
                      )}
                    </TableCell>
                    <TableCell className="min-w-[200px]">
                      {ed ? (
                        <QuotaInput
                          value={ed.revenue}
                          step={500}
                          onChange={(v) => setEditing((e) => ({ ...e, [r.username]: { ...ed, revenue: v } }))}
                        />
                      ) : (
                        <ProgressCell
                          actual={r.revenue}
                          target={r.quota.revenue}
                          pct={revP}
                          format={(v) => formatAmount(v, currency)}
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={progressTone(r.conversion)}>
                        {r.conversion.toFixed(1)}%
                      </Badge>
                      <div className="text-[11px] text-muted-foreground mt-1">
                        {r.won}V / {r.lost}P
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {ed ? (
                        <div className="flex justify-end gap-1.5">
                          <Button size="sm" variant="ghost" onClick={() => cancelEdit(r.username)}>Annuler</Button>
                          <Button size="sm" onClick={() => saveEdit(r.username)}>
                            <Save className="h-3.5 w-3.5 mr-1" /> Enregistrer
                          </Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => startEdit(r.username)}>
                          Définir objectifs
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>
    </AppLayout>
  );
}

function KpiCard({
  icon, label, value, target, format,
}: {
  icon: React.ReactNode; label: string; value: number; target: number;
  format?: (v: number) => string;
}) {
  const p = pct(value, target);
  const fmt = format ?? ((v: number) => String(v));
  return (
    <Card className="p-4 shadow-elegant">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">{icon}</div>
      </div>
      <div className="text-2xl font-bold">{fmt(value)}</div>
      <div className="text-[11px] text-muted-foreground mt-1">Objectif : {fmt(target)}</div>
      <div className="mt-2 flex items-center gap-2">
        <Progress value={p} className="h-2 flex-1" />
        <span className="text-[11px] font-semibold tabular-nums w-9 text-right">{p}%</span>
      </div>
    </Card>
  );
}

function ProgressCell({
  actual, target, pct: p, format,
}: { actual: number; target: number; pct: number; format?: (v: number) => string }) {
  const fmt = format ?? ((v: number) => String(v));
  return (
    <div className="space-y-1">
      <div className="text-sm font-medium tabular-nums">
        {fmt(actual)} <span className="text-muted-foreground font-normal">/ {fmt(target)}</span>
      </div>
      <div className="flex items-center gap-2">
        <Progress value={p} className="h-2 flex-1" />
        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-5 ${progressTone(p)}`}>
          {p}%
        </Badge>
      </div>
    </div>
  );
}

function QuotaInput({
  value, onChange, step = 1,
}: { value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] text-muted-foreground">Objectif</Label>
      <Input
        type="number"
        min={0}
        step={step}
        value={value}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
        className="h-8 w-32"
      />
    </div>
  );
}
