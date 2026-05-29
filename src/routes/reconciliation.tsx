import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useImportRuns, clearImportRuns, type ImportEntity } from "@/lib/importHistory";
import { exportCSV } from "@/lib/exportUtils";
import { Plus, RefreshCw, FileX2, Copy, FileSpreadsheet, Trash2, Download, CheckCircle2, MinusCircle, CalendarIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { confirmDialog } from "@/components/ConfirmDialogProvider";

type PeriodKey = "all" | "7d" | "30d" | "90d" | "custom";

export const Route = createFileRoute("/reconciliation")({
  head: () => ({
    meta: [
      { title: "Réconciliation des imports — CRM" },
      { name: "description", content: "Historique des imports CSV: ajouts, mises à jour, ignorés et mappage des champs par entité." },
    ],
  }),
  component: ReconciliationPage,
});

const ENTITY_LABELS: Record<ImportEntity, string> = {
  prospect: "Prospects",
  contract: "Contrats",
  user: "Utilisateurs",
};

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("fr-FR", {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

function ReconciliationPage() {
  const runs = useImportRuns();
  const [entity, setEntity] = useState<ImportEntity | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [period, setPeriod] = useState<PeriodKey>("all");
  const [customFrom, setCustomFrom] = useState<Date | undefined>(undefined);
  const [customTo, setCustomTo] = useState<Date | undefined>(undefined);

  const { fromTs, toTs } = useMemo(() => {
    const now = Date.now();
    const day = 86400000;
    if (period === "7d") return { fromTs: now - 7 * day, toTs: now };
    if (period === "30d") return { fromTs: now - 30 * day, toTs: now };
    if (period === "90d") return { fromTs: now - 90 * day, toTs: now };
    if (period === "custom") {
      return {
        fromTs: customFrom ? customFrom.setHours(0, 0, 0, 0) : -Infinity,
        toTs: customTo ? new Date(customTo).setHours(23, 59, 59, 999) : Infinity,
      };
    }
    return { fromTs: -Infinity, toTs: Infinity };
  }, [period, customFrom, customTo]);

  const filtered = useMemo(
    () => runs.filter((r) => {
      if (entity !== "all" && r.entity !== entity) return false;
      const t = new Date(r.ts).getTime();
      return t >= fromTs && t <= toTs;
    }),
    [runs, entity, fromTs, toTs],
  );

  const totals = useMemo(() => {
    const t = { added: 0, updated: 0, skipped: 0, runs: filtered.length };
    for (const r of filtered) {
      t.added += r.totals.added;
      t.updated += r.totals.updated;
      t.skipped += r.totals.skipped;
    }
    return t;
  }, [filtered]);

  const selected = useMemo(
    () => filtered.find((r) => r.id === selectedId) ?? filtered[0] ?? null,
    [filtered, selectedId],
  );

  const exportRunsCSV = () => {
    if (filtered.length === 0) return;
    exportCSV("reconciliation-imports.csv", filtered.map((r) => ({
      date: fmtDate(r.ts),
      entite: ENTITY_LABELS[r.entity],
      fichier: r.fileName ?? "",
      utilisateur: r.user ?? "",
      lignes_lues: r.rowsRead,
      ajoutes: r.totals.added,
      mis_a_jour: r.totals.updated,
      ignores: r.totals.skipped,
      invalides: r.rowsInvalid,
      doublons: r.duplicates,
    })));
  };

  return (
    <AppLayout skeleton="table">
      <PageHeader
        title="Réconciliation des imports"
        description="Historique des imports CSV/Excel: ce qui a été ajouté, mis à jour ou ignoré, et le mappage des colonnes utilisé."
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={period} onValueChange={(v) => setPeriod(v as PeriodKey)}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Période" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toute la période</SelectItem>
                <SelectItem value="7d">7 derniers jours</SelectItem>
                <SelectItem value="30d">30 derniers jours</SelectItem>
                <SelectItem value="90d">90 derniers jours</SelectItem>
                <SelectItem value="custom">Personnalisé…</SelectItem>
              </SelectContent>
            </Select>
            {period === "custom" && (
              <>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className={cn("h-9 justify-start text-left font-normal", !customFrom && "text-muted-foreground")}>
                      <CalendarIcon className="h-4 w-4 mr-1.5" />
                      {customFrom ? format(customFrom, "dd MMM yyyy", { locale: fr }) : "Du"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={customFrom} onSelect={setCustomFrom} initialFocus className={cn("p-3 pointer-events-auto")} />
                  </PopoverContent>
                </Popover>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className={cn("h-9 justify-start text-left font-normal", !customTo && "text-muted-foreground")}>
                      <CalendarIcon className="h-4 w-4 mr-1.5" />
                      {customTo ? format(customTo, "dd MMM yyyy", { locale: fr }) : "Au"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={customTo} onSelect={setCustomTo} initialFocus className={cn("p-3 pointer-events-auto")} />
                  </PopoverContent>
                </Popover>
              </>
            )}
            <Select value={entity} onValueChange={(v) => setEntity(v as any)}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les entités</SelectItem>
                <SelectItem value="prospect">Prospects</SelectItem>
                <SelectItem value="contract">Contrats</SelectItem>
                <SelectItem value="user">Utilisateurs</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={exportRunsCSV} disabled={filtered.length === 0}>
              <Download className="h-4 w-4 mr-1.5" /> Exporter Excel
            </Button>
            <Button
              variant="ghost" size="sm"
              onClick={async () => { if ((await confirmDialog({ title: "Suppression", description: "Vider l'historique des imports ?", tone: "destructive", confirmText: "Supprimer" }))) { clearImportRuns(); setSelectedId(null); } }}
              disabled={runs.length === 0}
            >
              <Trash2 className="h-4 w-4 mr-1.5" /> Vider
            </Button>
          </div>
        }
      />

      {/* KPI tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiCard label="Imports" value={totals.runs} icon={<FileSpreadsheet className="h-4 w-4" />} />
        <KpiCard label="Ajoutés" value={totals.added} tone="info" icon={<Plus className="h-4 w-4" />} />
        <KpiCard label="Mis à jour" value={totals.updated} tone="success" icon={<RefreshCw className="h-4 w-4" />} />
        <KpiCard label="Ignorés" value={totals.skipped} tone={totals.skipped > 0 ? "warning" : "muted"} icon={<MinusCircle className="h-4 w-4" />} />
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            <FileX2 className="h-8 w-8 mx-auto mb-3 text-muted-foreground/60" />
            Aucun import enregistré pour le moment. Les imports CSV depuis Prospects, Contrats ou Utilisateurs apparaîtront ici.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Runs list */}
          <Card className="lg:col-span-3">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Historique ({filtered.length})</CardTitle>
              <CardDescription>Cliquez un import pour voir le détail du mappage.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Entité</TableHead>
                    <TableHead>Fichier</TableHead>
                    <TableHead className="text-right">Ajoutés</TableHead>
                    <TableHead className="text-right">M.à.j.</TableHead>
                    <TableHead className="text-right">Ignorés</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => {
                    const active = selected?.id === r.id;
                    return (
                      <TableRow
                        key={r.id}
                        onClick={() => setSelectedId(r.id)}
                        className={`cursor-pointer ${active ? "bg-muted/60" : ""}`}
                      >
                        <TableCell className="text-xs whitespace-nowrap">{fmtDate(r.ts)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[11px]">{ENTITY_LABELS[r.entity]}</Badge>
                        </TableCell>
                        <TableCell className="text-xs truncate max-w-[200px]">
                          {r.fileName ?? "—"}
                          {r.user && <div className="text-[10px] text-muted-foreground">par @{r.user}</div>}
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium text-info">{r.totals.added}</TableCell>
                        <TableCell className="text-right text-sm font-medium text-success">{r.totals.updated}</TableCell>
                        <TableCell className="text-right text-sm font-medium text-muted-foreground">{r.totals.skipped}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Detail panel */}
          <div className="lg:col-span-2 space-y-4">
            {selected && (
              <>
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Résultats</CardTitle>
                    <CardDescription>{ENTITY_LABELS[selected.entity]} • {fmtDate(selected.ts)}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <Row k="Fichier" v={selected.fileName ?? "—"} />
                    <Row k="Utilisateur" v={selected.user ? `@${selected.user}` : "—"} />
                    <div className="grid grid-cols-3 gap-2 pt-2">
                      <MiniStat label="Ajoutés" value={selected.totals.added} tone="info" />
                      <MiniStat label="Mis à jour" value={selected.totals.updated} tone="success" />
                      <MiniStat label="Ignorés" value={selected.totals.skipped} tone="muted" />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <MiniStat label="Lues" value={selected.rowsRead} />
                      <MiniStat label="Invalides" value={selected.rowsInvalid} tone={selected.rowsInvalid > 0 ? "destructive" : "muted"} />
                      <MiniStat label="Doublons" value={selected.duplicates} tone={selected.duplicates > 0 ? "warning" : "muted"} />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Mappage des champs</CardTitle>
                    <CardDescription>
                      {selected.mapping.filter((m) => m.sourceColumn).length}/{selected.mapping.length} mappé(s)
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Champ ERP</TableHead>
                          <TableHead>Colonne CSV</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selected.mapping.map((m) => (
                          <TableRow key={m.fieldKey}>
                            <TableCell>
                              <div className="text-sm font-medium">{m.fieldLabel}</div>
                              <div className="text-[10px] text-muted-foreground">{m.fieldKey}{m.required && " · requis"}</div>
                            </TableCell>
                            <TableCell>
                              {m.sourceColumn ? (
                                <span className="inline-flex items-center gap-1.5 text-sm">
                                  <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{m.sourceColumn}</code>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                                  <MinusCircle className="h-3.5 w-3.5" />
                                  Non mappé
                                </span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>
      )}
    </AppLayout>
  );
}

function KpiCard({ label, value, icon, tone = "muted" }: {
  label: string; value: number; icon?: React.ReactNode;
  tone?: "info" | "success" | "warning" | "destructive" | "muted";
}) {
  const toneCls: Record<string, string> = {
    info: "text-info",
    success: "text-success",
    warning: "text-warning-foreground",
    destructive: "text-destructive",
    muted: "text-foreground",
  };
  return (
    <Card>
      <CardContent className="py-4 px-4">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className={toneCls[tone]}>{icon}</div>
        </div>
        <div className={`mt-1 text-2xl font-semibold ${toneCls[tone]}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function MiniStat({ label, value, tone = "muted" }: {
  label: string; value: number;
  tone?: "info" | "success" | "warning" | "destructive" | "muted";
}) {
  const toneCls: Record<string, string> = {
    info: "bg-info/10 text-info border-info/20",
    success: "bg-success/10 text-success border-success/20",
    warning: "bg-warning/10 text-warning-foreground border-warning/20",
    destructive: "bg-destructive/10 text-destructive border-destructive/20",
    muted: "bg-muted/50 text-foreground border-border",
  };
  return (
    <div className={`rounded-md border p-2 ${toneCls[tone]}`}>
      <div className="text-[10px] uppercase tracking-wider opacity-70">{label}</div>
      <div className="text-base font-semibold">{value}</div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-muted-foreground">{k}</span>
      <span className="text-sm font-medium truncate">{v}</span>
    </div>
  );
}
