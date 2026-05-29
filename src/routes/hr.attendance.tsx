import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Clock, RefreshCw, LogOut as LogOutIcon, LogIn as LogInIcon, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { AttendanceEntry } from "@/lib/types";
import { toast } from "sonner";

export const Route = createFileRoute("/hr/attendance")({
  head: () => ({ meta: [{ title: "Pointage — CRM" }] }),
  component: AttendancePage,
});

type Summary = { username: string; totalMinutes: number; totalHours: number; sessions: number };

function fmtMin(m: number) {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}h${mm.toString().padStart(2, "0")}`;
}

function splitDateTime(s: string | null | undefined): { date: string; time: string } {
  if (!s) return { date: "—", time: "" };
  // Backend returns "YYYY-MM-DD HH:MM:SS" (server local time).
  const [d, t] = s.split(" ");
  return { date: d ?? s, time: (t ?? "").slice(0, 5) };
}

/** Build the inclusive list of "YYYY-MM" months between two ISO dates. */
function monthsBetween(from: string, to: string): string[] {
  const a = new Date(from + "T00:00:00");
  const b = new Date(to + "T00:00:00");
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || a > b) return [];
  const out: string[] = [];
  const cur = new Date(a.getFullYear(), a.getMonth(), 1);
  const end = new Date(b.getFullYear(), b.getMonth(), 1);
  while (cur <= end) {
    out.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`);
    cur.setMonth(cur.getMonth() + 1);
  }
  return out;
}

function AttendancePage() {
  const { user, hasPermission } = useAuth();
  const isPriv = user?.role === "Administrateur" || hasPermission("hr.attendance.export");
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [username, setUsername] = useState("");
  const [rows, setRows] = useState<AttendanceEntry[]>([]);
  const [summary, setSummary] = useState<Summary[]>([]);
  const [loading, setLoading] = useState(false);

  const rangeActive = Boolean(from && to);

  const load = async () => {
    setLoading(true);
    try {
      // Backend only supports ?month=YYYY-MM. For a date range we fetch each
      // month it spans then concat client-side. Otherwise we just hit `month`.
      if (rangeActive) {
        const months = monthsBetween(from, to);
        if (months.length === 0) {
          toast.error("Plage de dates invalide");
          setLoading(false);
          return;
        }
        const results = await Promise.all(
          months.map((m) =>
            api<{ attendance: AttendanceEntry[]; summary: Summary[] }>("/attendance.php", {
              query: { month: m, ...(username ? { username } : {}) },
            }),
          ),
        );
        const all = results.flatMap((r) => r.attendance);
        setRows(all);
        // Recompute summary across all months for consistency.
        const agg = new Map<string, Summary>();
        for (const r of all) {
          const cur = agg.get(r.username) ?? { username: r.username, totalMinutes: 0, totalHours: 0, sessions: 0 };
          cur.totalMinutes += r.totalMinutes ?? 0;
          cur.sessions += 1;
          agg.set(r.username, cur);
        }
        for (const s of agg.values()) s.totalHours = Math.round((s.totalMinutes / 60) * 10) / 10;
        setSummary([...agg.values()]);
      } else {
        const r = await api<{ attendance: AttendanceEntry[]; summary: Summary[] }>("/attendance.php", {
          query: { month, ...(username ? { username } : {}) },
        });
        setRows(r.attendance);
        setSummary(r.summary);
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, from, to]);

  // Backend (attendance.php) only accepts the action via query string.
  // JSON body actions like {"action":"clock_in"} are rejected with
  // "Méthode non supportée". Keep one helper so UI + API stay aligned.
  const punch = async (action: "clock_in" | "clock_out") => {
    try {
      await api("/attendance.php", { method: "POST", query: { action }, body: {} });
      toast.success(action === "clock_in" ? "Pointage ouvert" : "Pointage fermé");
      void load();
    } catch (e: any) { toast.error(e?.message ?? "Erreur"); }
  };
  const clockIn = () => punch("clock_in");
  const clockOut = () => punch("clock_out");

  // Apply client-side date-range filter (rows are already month-bounded server-side)
  // and optional username filter.
  const visibleRows = useMemo(() => {
    let r = rows;
    if (rangeActive) {
      r = r.filter((row) => {
        const d = (row.loginAt ?? "").slice(0, 10);
        return d >= from && d <= to;
      });
    }
    if (username && isPriv) {
      const u = username.toLowerCase();
      r = r.filter((row) => row.username.toLowerCase().includes(u));
    }
    return r;
  }, [rows, rangeActive, from, to, username, isPriv]);

  const myRows = useMemo(
    () => visibleRows.filter((r) => r.username === user?.username).slice(0, 10),
    [visibleRows, user?.username],
  );

  const periodLabel = rangeActive ? `${from} → ${to}` : month;

  const clearRange = () => { setFrom(""); setTo(""); };

  return (
    <AppLayout skeleton="table">
      <PageHeader
        title="Pointage / Présence"
        description="Heures travaillées par utilisateur, calculées au login/logout."
        icon={<Clock className="h-5 w-5" />}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              <RefreshCw className="h-4 w-4 mr-1.5" /> Actualiser
            </Button>
            <Button variant="outline" size="sm" onClick={clockIn}>
              <LogInIcon className="h-4 w-4 mr-1.5" /> Pointer (entrée)
            </Button>
            <Button variant="outline" size="sm" onClick={clockOut}>
              <LogOutIcon className="h-4 w-4 mr-1.5" /> Clore ma session
            </Button>
          </>
        }
      />

      <div className="mt-6 flex flex-wrap gap-3 items-end">
        <div>
          <Label htmlFor="m">Mois</Label>
          <Input
            id="m"
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            disabled={rangeActive}
            className="w-44"
          />
        </div>
        <div>
          <Label htmlFor="from">Du</Label>
          <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
        </div>
        <div>
          <Label htmlFor="to">Au</Label>
          <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
        </div>
        {rangeActive && (
          <Button variant="ghost" size="sm" onClick={clearRange}>
            <X className="h-4 w-4 mr-1.5" /> Effacer la plage
          </Button>
        )}
        {isPriv && (
          <div>
            <Label htmlFor="u">Utilisateur (filtre)</Label>
            <Input id="u" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" className="w-56" />
          </div>
        )}
        {isPriv && (
          <Button size="sm" onClick={() => void load()}>Filtrer</Button>
        )}
      </div>

      {/* Personal history — confirms each clock-in / clock-out for the current user */}
      <Card className="p-4 mt-6">
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <div>
            <h3 className="font-semibold text-sm">Mes derniers pointages</h3>
            <p className="text-xs text-muted-foreground">
              Historique des entrées / sorties enregistrées pour {user?.username} — période {periodLabel}.
            </p>
          </div>
          {(() => {
            const open = visibleRows.find((r) => r.username === user?.username && !r.logoutAt);
            return open ? (
              <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30">
                Session ouverte
              </Badge>
            ) : (
              <Badge variant="outline">Aucune session ouverte</Badge>
            );
          })()}
        </div>
        <div className="overflow-x-auto rounded-md border border-border/60">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Entrée</TableHead>
                <TableHead>Sortie</TableHead>
                <TableHead>Durée</TableHead>
                <TableHead>IP</TableHead>
                <TableHead>Statut</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {myRows.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground text-sm">Aucun pointage sur cette période</TableCell></TableRow>
              )}
              {myRows.map((r, i) => {
                const inDt = splitDateTime(r.loginAt);
                const outDt = r.logoutAt ? splitDateTime(r.logoutAt) : null;
                return (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                    <TableCell>
                      <div className="text-sm font-medium">{inDt.time}</div>
                      <div className="text-xs text-muted-foreground">{inDt.date}</div>
                    </TableCell>
                    <TableCell>
                      {outDt ? (
                        <>
                          <div className="text-sm font-medium">{outDt.time}</div>
                          <div className="text-xs text-muted-foreground">{outDt.date}</div>
                        </>
                      ) : (
                        <Badge variant="outline">en cours</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{r.totalMinutes ? fmtMin(r.totalMinutes) : "—"}</TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground max-w-[180px] truncate" title={r.ip ?? ""}>
                      {r.ip ?? "—"}
                    </TableCell>
                    <TableCell>
                      {r.logoutAt ? (
                        <Badge variant="secondary">Fermée</Badge>
                      ) : (
                        <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30">Ouverte</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>

      <div className="grid lg:grid-cols-3 gap-4 mt-6">
        <Card className="p-4 lg:col-span-1">
          <h3 className="font-semibold mb-3 text-sm">Synthèse {periodLabel}</h3>
          <div className="space-y-2">
            {summary.length === 0 && <div className="text-sm text-muted-foreground">Aucune donnée</div>}
            {summary.map((s) => (
              <div key={s.username} className="flex items-center justify-between text-sm border-b border-border/60 pb-2 last:border-0">
                <div>
                  <div className="font-medium">{s.username}</div>
                  <div className="text-xs text-muted-foreground">{s.sessions} session(s)</div>
                </div>
                <Badge variant="secondary">{s.totalHours} h</Badge>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-0 lg:col-span-2 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Utilisateur</TableHead>
                <TableHead>Entrée</TableHead>
                <TableHead>Sortie</TableHead>
                <TableHead>Durée</TableHead>
                <TableHead>IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Chargement…</TableCell></TableRow>}
              {!loading && visibleRows.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Aucune session</TableCell></TableRow>
              )}
              {visibleRows.map((r) => {
                const inDt = splitDateTime(r.loginAt);
                const outDt = r.logoutAt ? splitDateTime(r.logoutAt) : null;
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.username}</TableCell>
                    <TableCell>
                      <div className="text-sm">{inDt.time}</div>
                      <div className="text-xs text-muted-foreground">{inDt.date}</div>
                    </TableCell>
                    <TableCell>
                      {outDt ? (
                        <>
                          <div className="text-sm">{outDt.time}</div>
                          <div className="text-xs text-muted-foreground">{outDt.date}</div>
                        </>
                      ) : (
                        <Badge variant="outline">en cours</Badge>
                      )}
                    </TableCell>
                    <TableCell>{r.totalMinutes ? fmtMin(r.totalMinutes) : "—"}</TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground max-w-[180px] truncate" title={r.ip ?? ""}>
                      {r.ip ?? "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      </div>
    </AppLayout>
  );
}
