import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft, BarChart3, CalendarDays, ShieldAlert, Settings2, RotateCcw,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { useErp } from "@/lib/erpStore";
import { useGuichetEntities } from "@/hooks/use-guichet-entities";
import { getDashboard, ENTRY_TYPE_LABEL, type GuichetDashboard, type GuichetEntryType } from "@/lib/guichetApi";

export const Route = createFileRoute("/guichet_/analytics")({
  head: () => ({ meta: [{ title: "Analytics Guichet — CRM" }] }),
  component: GuichetAnalyticsPage,
});

const TYPES: GuichetEntryType[] = ["sim", "port", "swp", "divers", "facture_tt", "facture_topnet"];

type DashConfig = {
  sections: { kpis: boolean; chart: boolean; detailTable: boolean; leaderboard: boolean };
  types: Record<GuichetEntryType, boolean>;
  filters: { dateRange: boolean; entity: boolean; agent: boolean };
  kpis: { revenue: boolean; contracts: boolean; activation: boolean; budget: boolean };
};

const DEFAULT_CONFIG: DashConfig = {
  sections: { kpis: true, chart: true, detailTable: true, leaderboard: true },
  types: { sim: true, port: true, swp: true, divers: true, facture_tt: true, facture_topnet: true },
  filters: { dateRange: true, entity: true, agent: true },
  kpis: { revenue: true, contracts: true, activation: true, budget: true },
};

const CONFIG_KEY = "guichet:analytics:dashConfig:v1";
function loadConfig(): DashConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const p = JSON.parse(raw);
    return {
      sections: { ...DEFAULT_CONFIG.sections, ...(p.sections || {}) },
      types: { ...DEFAULT_CONFIG.types, ...(p.types || {}) },
      filters: { ...DEFAULT_CONFIG.filters, ...(p.filters || {}) },
      kpis: { ...DEFAULT_CONFIG.kpis, ...(p.kpis || {}) },
    };
  } catch { return DEFAULT_CONFIG; }
}

const fmtDT = (n: number) =>
  `${(Number(n) || 0).toLocaleString("fr-TN", { minimumFractionDigits: 0, maximumFractionDigits: 3 })} DT`;
const fmtInt = (n: number) => (Number(n) || 0).toLocaleString("fr-TN");

function GuichetAnalyticsPage() {
  const { user, hasPermission } = useAuth();
  const { users } = useErp();
  const entities = useGuichetEntities();

  const canRead = hasPermission("guichet.read_own") || hasPermission("guichet.read_all");
  const canReadAll = hasPermission("guichet.read_all")
    || user?.role === "Administrateur";
  const assignedEntity = canReadAll ? "" : (user?.guichetEntityId || "");

  const todayIso = new Date().toISOString().slice(0, 10);
  const [month, setMonth] = useState(todayIso.slice(0, 7));
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [entityId, setEntityId] = useState(assignedEntity);
  // Default scope:
  // - Admin/Manager: no agent filter (all agents)
  // - AgentGuichet with an entity: whole entity by default ("")
  // - Other (legacy / no entity): scoped to self
  const [agentId, setAgentId] = useState<string>(
    canReadAll ? "" : (assignedEntity ? "" : (user?.id ?? ""))
  );
  const [data, setData] = useState<GuichetDashboard | null>(null);
  const [perAgent, setPerAgent] = useState<{ agentId: string; revenue: number; counts: Record<string, number>; amounts: Record<string, number> }[]>([]);
  const [loading, setLoading] = useState(true);

  // Admin-only dashboard config (persisted locally per browser).
  const isAdmin = user?.role === "Administrateur";
  const [config, setConfig] = useState<DashConfig>(() => loadConfig());
  useEffect(() => { try { localStorage.setItem(CONFIG_KEY, JSON.stringify(config)); } catch {} }, [config]);
  // Non-admins always use the default config (admin choices apply only to admins).
  const effectiveConfig = isAdmin ? config : DEFAULT_CONFIG;
  const visibleTypes = TYPES.filter((t) => effectiveConfig.types[t]);

  useEffect(() => { if (assignedEntity) setEntityId(assignedEntity); }, [assignedEntity]);

  // Sync agentId ONCE after auth loads (parity with DashboardTab fix).
  // Do NOT depend on agentId itself, otherwise the user's "Mes données uniquement"
  // selection would be reverted immediately on each re-render.
  const agentSyncedRef = useRef(false);
  useEffect(() => {
    if (agentSyncedRef.current) return;
    if (!user) return;
    agentSyncedRef.current = true;
    setAgentId(canReadAll ? "" : (assignedEntity ? "" : (user.id ?? "")));
  }, [user, assignedEntity, canReadAll]);

  const range = useMemo(() => {
    if (from && to) return from <= to
      ? { from, to, isRange: true }
      : { from: to, to: from, isRange: true };
    if (from && !to) return { from, to: from, isRange: true };
    if (!from && to) return { from: to, to, isRange: true };
    const start = `${month}-01`;
    const [y, m] = month.split("-").map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return { from: start, to: `${month}-${String(last).padStart(2, "0")}`, isRange: false };
  }, [from, to, month]);

  // Single-call fetch: when a date range is set we now hit the backend
  // ONCE with from/to. Previously the page looped one request per day and
  // summed the monthly results, multiplying every KPI by N (the number of
  // days). That is the root cause of the "inaccurate analytics" report.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    const q: Parameters<typeof getDashboard>[0] = {
      month,
      entityId: entityId || undefined,
      agentId: agentId || undefined,
    };
    if (range.isRange) { q.from = range.from; q.to = range.to; }
    getDashboard(q)
      .then((d) => { if (alive) setData(d); })
      .catch((e: any) => toast.error(e?.message ?? "Erreur"))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [month, range, entityId, agentId]);

  // Per-agent breakdown: rely on the backend's `perAgent` field (already
  // scoped to the same WHERE), no N+1 daily refetches.
  useEffect(() => {
    if (!canReadAll || agentId || !data) { setPerAgent([]); return; }
    const rows = (data.perAgent ?? []).map((p) => ({
      agentId: p.agentId,
      counts: p.counts,
      amounts: p.amounts,
      revenue: p.revenue,
    }));
    setPerAgent(rows.sort((a, b) => b.revenue - a.revenue));
  }, [data, agentId, canReadAll]);

  const agentName = (id: string) => {
    const u = users.find((x) => x.id === id || x.username === id);
    return u?.fullName || u?.username || id;
  };

  const revenue = useMemo(() => {
    if (!data) return 0;
    return visibleTypes.reduce((s, t) => s + (data.amounts[t] || 0), 0);
  }, [data, visibleTypes]);

  const typeBreakdown = useMemo(() => {
    if (!data) return [];
    return visibleTypes.map((t) => ({
      type: t,
      label: ENTRY_TYPE_LABEL[t],
      count: data.counts[t] || 0,
      amount: data.amounts[t] || 0,
    }));
  }, [data, visibleTypes]);

  const shiftMonth = (delta: number) => {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(Date.UTC(y, (m - 1) + delta, 1));
    setMonth(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  };

  if (!canRead) {
    return (
      <AppLayout>
        <PageHeader title="Analytics Guichet" icon={<BarChart3 className="h-5 w-5" />} />
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <ShieldAlert className="h-8 w-8 mx-auto mb-2" />Accès refusé.
        </CardContent></Card>
      </AppLayout>
    );
  }

  const fmtDate = (s: string) =>
    new Date(s + "T00:00:00").toLocaleDateString("fr-TN", { day: "2-digit", month: "short", year: "numeric" });
  const periodLabel = range.isRange
    ? (range.from === range.to ? fmtDate(range.from) : `${fmtDate(range.from)} → ${fmtDate(range.to)}`)
    : new Date(month + "-01").toLocaleDateString("fr-TN", { month: "long", year: "numeric" });

  return (
    <AppLayout>
      <div className="flex items-center justify-between gap-3 mb-3">
        <PageHeader title="Analytics Guichet" icon={<BarChart3 className="h-5 w-5" />} />
        <div className="flex items-center gap-2">
          {isAdmin && (
            <AdminConfigButton config={config} setConfig={setConfig} />
          )}
          <Button asChild size="sm" variant="outline">
            <Link to="/guichet"><ArrowLeft className="h-4 w-4 mr-1" /> Retour</Link>
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="mb-4">
        <CardContent className="p-3 flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center rounded-md border bg-background">
            <Button type="button" size="sm" variant="ghost" className="h-9 px-2 rounded-r-none" onClick={() => shiftMonth(-1)}>‹</Button>
            <div className="flex items-center gap-1.5 px-2 border-l border-r">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-9 w-36 border-0 shadow-none focus-visible:ring-0 px-1" />
            </div>
            <Button type="button" size="sm" variant="ghost" className="h-9 px-2 rounded-l-none" onClick={() => shiftMonth(1)}>›</Button>
          </div>

          {effectiveConfig.filters.dateRange && (
            <div className="inline-flex items-center rounded-md border bg-background px-2 gap-1.5">
              <span className="text-xs text-muted-foreground font-medium">Du</span>
              <Input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="h-9 w-40 border-0 shadow-none focus-visible:ring-0 px-1"
              />
              <span className="text-xs text-muted-foreground font-medium">au</span>
              <Input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="h-9 w-40 border-0 shadow-none focus-visible:ring-0 px-1"
              />
              {(from || to) && (
                <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => { setFrom(""); setTo(""); }}>
                  Effacer
                </Button>
              )}
            </div>
          )}

          {effectiveConfig.filters.entity && canReadAll && !assignedEntity && (
            <Select value={entityId || "all"} onValueChange={(v) => setEntityId(v === "all" ? "" : v)}>
              <SelectTrigger className="h-9 w-56"><SelectValue placeholder="Entité" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les entités</SelectItem>
                {entities.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}

          {effectiveConfig.filters.agent && canReadAll && (
            <Select value={agentId || "all"} onValueChange={(v) => setAgentId(v === "all" ? "" : v)}>
              <SelectTrigger className="h-9 w-56"><SelectValue placeholder="Agent" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les agents</SelectItem>
                {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.fullName || u.username}</SelectItem>)}
              </SelectContent>
            </Select>
          )}

          {!canReadAll && assignedEntity && user?.id && (
            <Select
              value={agentId === user.id ? "self" : "entity"}
              onValueChange={(v) => setAgentId(v === "self" ? user.id! : "")}
            >
              <SelectTrigger className="h-9 w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="entity">Toute mon entité</SelectItem>
                <SelectItem value="self">{user?.fullName || user?.username}</SelectItem>
              </SelectContent>
            </Select>
          )}

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="font-normal capitalize">{periodLabel}</Badge>
            {!canReadAll && assignedEntity && (
              <Badge variant="outline" className="font-normal">
                {agentId && user?.id && agentId === user.id
                  ? `Mes données${user?.fullName || user?.username ? ` · ${user.fullName || user.username}` : ""}`
                  : "Toute mon entité"}
              </Badge>
            )}
            {canReadAll && agentId && (
              <Badge variant="outline" className="font-normal">Agent : {agentName(agentId)}</Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4 space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-7 w-20" />
            </CardContent></Card>
          ))}
        </div>
      )}

      {!loading && data && (
        <>
          {/* KPIs — minimal, monochrome */}
          {effectiveConfig.sections.kpis && (() => {
            const kpis = [
              effectiveConfig.kpis.revenue    && <Kpi key="r" label="Chiffre d'affaires" value={fmtDT(revenue)} hint={`${data.contracts.month} contrats`} />,
              effectiveConfig.kpis.contracts  && <Kpi key="c" label="Contrats" value={fmtInt(data.contracts.month)} hint={`Objectif ${data.targets.contractsMonthly}`} />,
              effectiveConfig.kpis.activation && <Kpi key="a" label="Taux d'activation" value={`${data.activation.rate}%`} hint={`Min. ${data.activation.min}%`} />,
              effectiveConfig.kpis.budget     && <Kpi key="b" label="Budget mensuel" value={data.targets.budgetMonthlyDt != null ? fmtDT(data.targets.budgetMonthlyDt) : "—"} hint={data.targets.budgetDailyDt != null ? `${fmtDT(data.targets.budgetDailyDt)} / jour` : ""} />,
            ].filter(Boolean);
            return kpis.length > 0 ? <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">{kpis}</div> : null;
          })()}

          {/* Revenue per type — single neutral chart */}
          {effectiveConfig.sections.chart && (
          <Card className="mb-4">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-semibold">Chiffre d'affaires par type</div>
                <div className="text-xs text-muted-foreground">Montant en DT</div>
              </div>
              {typeBreakdown.length === 0 || typeBreakdown.every((r) => r.amount === 0) ? (
                <EmptyChart />
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={typeBreakdown} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                    <Tooltip
                      cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }}
                      contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }}
                      formatter={(v: any) => fmtDT(Number(v))}
                    />
                    <Bar dataKey="amount" name="Montant" fill="hsl(var(--foreground))" radius={[4, 4, 0, 0]} maxBarSize={56} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
          )}

          {/* Detail table */}
          {effectiveConfig.sections.detailTable && (
          <Card className="mb-4">
            <CardContent className="p-0">
              <div className="px-4 py-3 border-b text-sm font-semibold">Détail par type d'opération</div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-[11px] uppercase text-muted-foreground bg-muted/40">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium">Type</th>
                      <th className="text-right px-4 py-2 font-medium">Opérations</th>
                      <th className="text-right px-4 py-2 font-medium">Montant</th>
                      <th className="text-right px-4 py-2 font-medium">Part du CA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {typeBreakdown.map((r) => {
                      const share = revenue > 0 ? (r.amount * 100) / revenue : 0;
                      return (
                        <tr key={r.type} className="border-t">
                          <td className="px-4 py-2.5">{r.label}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{fmtInt(r.count)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{fmtDT(r.amount)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{share.toFixed(1)}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t bg-muted/30 font-semibold">
                      <td className="px-4 py-2.5">Total</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{fmtInt(typeBreakdown.reduce((s, r) => s + r.count, 0))}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{fmtDT(revenue)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">100%</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
          )}

          {/* Per agent leaderboard */}
          {effectiveConfig.sections.leaderboard && canReadAll && !agentId && perAgent.length > 0 && (
            <Card>
              <CardContent className="p-0">
                <div className="px-4 py-3 border-b text-sm font-semibold">Classement des agents</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-[11px] uppercase text-muted-foreground bg-muted/40">
                      <tr>
                        <th className="text-left px-4 py-2 font-medium w-10">#</th>
                        <th className="text-left px-4 py-2 font-medium">Agent</th>
                        <th className="text-right px-4 py-2 font-medium">CA</th>
                        {visibleTypes.map((t) => (
                          <th key={t} className="text-right px-4 py-2 font-medium">{ENTRY_TYPE_LABEL[t]}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {perAgent.map((r, i) => (
                        <tr key={r.agentId} className="border-t">
                          <td className="px-4 py-2.5 text-muted-foreground tabular-nums">{i + 1}</td>
                          <td className="px-4 py-2.5">{agentName(r.agentId)}</td>
                          <td className="px-4 py-2.5 text-right font-semibold tabular-nums">
                            {fmtDT(visibleTypes.reduce((s, t) => s + (r.amounts[t] || 0), 0))}
                          </td>
                          {visibleTypes.map((t) => (
                            <td key={t} className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                              {r.counts[t] || 0}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </AppLayout>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">{label}</div>
        <div className="text-2xl font-semibold tabular-nums mt-1">{value}</div>
        {hint && <div className="text-[11px] text-muted-foreground mt-0.5">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function EmptyChart() {
  return (
    <div className="h-[260px] flex items-center justify-center text-xs text-muted-foreground">
      Aucune donnée pour la période sélectionnée.
    </div>
  );
}

function AdminConfigButton({ config, setConfig }: { config: DashConfig; setConfig: (c: DashConfig) => void }) {
  const toggle = (path: string) => {
    const [group, key] = path.split(".") as [keyof DashConfig, string];
    const next = { ...config, [group]: { ...(config as any)[group], [key]: !(config as any)[group][key] } };
    setConfig(next);
  };
  const row = (label: string, path: string) => {
    const [group, key] = path.split(".");
    const checked = (config as any)[group][key];
    return (
      <label className="flex items-center gap-2 py-1 cursor-pointer select-none">
        <Checkbox checked={checked} onCheckedChange={() => toggle(path)} />
        <span className="text-sm">{label}</span>
      </label>
    );
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="h-9">
          <Settings2 className="h-4 w-4 mr-1" /> Configurer le dashboard
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 max-h-[70vh] overflow-y-auto">
        <div className="space-y-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground font-medium mb-1">Sections</div>
            {row("KPIs (indicateurs)", "sections.kpis")}
            {row("Graphique CA par type", "sections.chart")}
            {row("Tableau détaillé", "sections.detailTable")}
            {row("Classement des agents", "sections.leaderboard")}
          </div>
          <Separator />
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground font-medium mb-1">Indicateurs (KPIs)</div>
            {row("Chiffre d'affaires", "kpis.revenue")}
            {row("Contrats", "kpis.contracts")}
            {row("Taux d'activation", "kpis.activation")}
            {row("Budget mensuel", "kpis.budget")}
          </div>
          <Separator />
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground font-medium mb-1">Types d'opérations</div>
            {row("SIM", "types.sim")}
            {row("Portabilité", "types.port")}
            {row("SWP", "types.swp")}
            {row("Divers", "types.divers")}
            {row("Facture TT", "types.facture_tt")}
            {row("Facture Topnet", "types.facture_topnet")}
          </div>
          <Separator />
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground font-medium mb-1">Filtres</div>
            {row("Plage de dates", "filters.dateRange")}
            {row("Entité", "filters.entity")}
            {row("Agent", "filters.agent")}
          </div>
          <Separator />
          <Button size="sm" variant="ghost" className="w-full" onClick={() => setConfig(DEFAULT_CONFIG)}>
            <RotateCcw className="h-3.5 w-3.5 mr-1" /> Réinitialiser
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
