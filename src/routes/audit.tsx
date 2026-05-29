import { DatePicker } from "@/components/ui/date-picker";
// Admin-only audit log viewer — every user action with timestamp/IP/UA.
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { ShieldAlert, RefreshCw, Search, Download } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Fragment, useEffect, useState } from "react";
import { api, API_ENABLED } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { exportCSV } from "@/lib/exportUtils";
import { roleLabel } from "@/lib/roleLabels";
import { toast } from "sonner";

const ACTION_LABELS: Record<string, string> = {
  login: "Connexion",
  logout: "Déconnexion",
  login_failed: "Échec de connexion",
  otp_verify: "Vérification du code OTP",
  create: "Création",
  update: "Modification",
  delete: "Suppression",
  claim: "Prise en charge du lead",
  assign: "Assignation",
  status_change: "Changement de statut",
  note_add: "Ajout d'une note",
  call_log: "Appel enregistré",
  validate: "Validation",
  cancel: "Annulation",
};
const ENTITY_LABELS: Record<string, string> = {
  prospect: "Prospect", lead: "Lead", contract: "Contrat", user: "Utilisateur",
  role: "Rôle", attachment: "Pièce jointe", note: "Note", call: "Appel",
  task: "Tâche", calendar: "Événement", grant: "Accès temporaire",
};
const FIELD_LABELS: Record<string, string> = {
  status: "Statut", assignedTo: "Assigné à", assigned_to: "Assigné à",
  name: "Nom", fullName: "Nom complet", email: "E-mail", phone: "Téléphone",
  company: "Société", source: "Source", role: "Rôle", team: "Équipe",
  amount: "Montant", title: "Titre", description: "Description",
  reason: "Motif", note: "Note", value: "Valeur", oldStatus: "Ancien statut",
  newStatus: "Nouveau statut", oldValue: "Ancienne valeur", newValue: "Nouvelle valeur",
  ip: "Adresse IP", username: "Identifiant", password: "Mot de passe",
};
function humanAction(a: string) { return ACTION_LABELS[a] ?? a.replace(/[._]/g, " "); }
function humanEntity(e: string | null) { return e ? (ENTITY_LABELS[e] ?? e) : ""; }
function humanField(k: string) { return FIELD_LABELS[k] ?? k.replace(/([A-Z])/g, " $1").replace(/[._]/g, " ").replace(/^./, (c) => c.toUpperCase()); }
function humanValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Oui" : "Non";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") {
    if (/^\d{4}-\d{2}-\d{2}T/.test(v)) { try { return new Date(v).toLocaleString("fr-FR"); } catch { return v; } }
    return v;
  }
  if (Array.isArray(v)) return v.map(humanValue).join(", ");
  return JSON.stringify(v);
}
function parseDetails(d: string | null): Record<string, unknown> | string | null {
  if (!d) return null;
  try { const j = JSON.parse(d); return typeof j === "object" && j !== null ? j as Record<string, unknown> : String(j); }
  catch { return d; }
}

export const Route = createFileRoute("/audit")({
  head: () => ({ meta: [{ title: "Journal d'audit — CRM" }] }),
  component: AuditPage,
});

type LogRow = {
  id: number; createdAt: string; user: string | null; userRole: string | null;
  action: string; entityType: string | null; entityId: string | null;
  method: string | null; path: string | null; ip: string | null;
  userAgent: string | null; statusCode: number | null; details: string | null;
  sessionSeconds: number | null;
};

function formatDuration(s: number | null): string {
  if (s === null || s === undefined) return "—";
  if (s < 60) return `${s}s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${sec}s`;
}

function AuditPage() {
  const { user, hasPermission } = useAuth();
  const canView = !!user && (hasPermission("audit.view"));
  if (user && !canView) return <Navigate to="/" />;

  const [logs, setLogs] = useState<LogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [actions, setActions] = useState<string[]>([]);
  const [users, setUsers] = useState<string[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [entities, setEntities] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [from, setFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [fUser, setFUser] = useState("all");
  const [fRole, setFRole] = useState("all");
  const [fAction, setFAction] = useState("all");
  const [fEntity, setFEntity] = useState("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"asc" | "desc">("desc");
  const [offset, setOffset] = useState(0);
  const limit = 100;
  const [selected, setSelected] = useState<LogRow | null>(null);

  const load = async () => {
    if (!API_ENABLED) return;
    setLoading(true);
    try {
      const r = await api<{
        total: number; logs: LogRow[];
        filters: { actions: string[]; users: string[]; roles: string[]; entities: string[] };
      }>("/audit_log.php", {
        query: {
          from: from || undefined, to: to || undefined,
          user: fUser !== "all" ? fUser : undefined,
          role: fRole !== "all" ? fRole : undefined,
          action: fAction !== "all" ? fAction : undefined,
          entity: fEntity !== "all" ? fEntity : undefined,
          q: q || undefined, sort, limit, offset,
        },
      });
      setLogs(r.logs); setTotal(r.total);
      setActions(r.filters.actions); setUsers(r.filters.users);
      setRoles(r.filters.roles || []); setEntities(r.filters.entities);
    } catch (e: any) { toast.error("Erreur chargement", { description: e?.message }); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [offset, sort]);

  const fmt = (iso: string) => {
    try { return new Date(iso).toLocaleString("fr-FR"); } catch { return iso; }
  };

  const rowsToCsv = (rows: LogRow[]) => rows.map((l) => ({
    date: l.createdAt, utilisateur: l.user ?? "", role: l.userRole ?? "",
    action: l.action, entite: l.entityType ?? "", entite_id: l.entityId ?? "",
    methode: l.method ?? "", chemin: l.path ?? "", ip: l.ip ?? "",
    user_agent: l.userAgent ?? "", statut: l.statusCode ?? "",
    duree_session_s: l.sessionSeconds ?? "", details: l.details ?? "",
  }));

  const exportCsv = () => {
    exportCSV(`audit_${new Date().toISOString().slice(0, 10)}.csv`, rowsToCsv(logs));
  };

  const exportAllCsv = async () => {
    if (!API_ENABLED) return;
    try {
      const r = await api<{ logs: LogRow[] }>("/audit_log.php", {
        query: {
          from: from || undefined, to: to || undefined,
          user: fUser !== "all" ? fUser : undefined,
          role: fRole !== "all" ? fRole : undefined,
          action: fAction !== "all" ? fAction : undefined,
          entity: fEntity !== "all" ? fEntity : undefined,
          q: q || undefined, sort, limit: 1000, offset: 0,
        },
      });
      exportCSV(`audit_full_${new Date().toISOString().slice(0, 10)}.csv`, rowsToCsv(r.logs));
      toast.success(`${r.logs.length} entrées exportées`);
    } catch (e: any) { toast.error("Erreur export", { description: e?.message }); }
  };

  return (
    <AppLayout>
      <PageHeader
        title="Journal d'audit"
        description="Toutes les actions des utilisateurs (connexions, créations, modifications, suppressions)."
        icon={<ShieldAlert className="h-5 w-5" />}
      />
      <Card className="p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <div><Label className="text-xs">Du</Label><DatePicker value={from} onChange={setFrom} /></div>
          <div><Label className="text-xs">Au</Label><DatePicker value={to} onChange={setTo} /></div>
          <div>
            <Label className="text-xs">Utilisateur</Label>
            <Select value={fUser} onValueChange={setFUser}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                {users.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Action</Label>
            <Select value={fAction} onValueChange={setFAction}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes</SelectItem>
                {actions.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Entité</Label>
            <Select value={fEntity} onValueChange={setFEntity}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes</SelectItem>
                {entities.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Recherche</Label>
            <div className="flex gap-1">
              <Input placeholder="ID, chemin, détails…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">{total} entrée{total > 1 ? "s" : ""}</div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { setOffset(0); load(); }} disabled={loading}>
              <Search className="h-3.5 w-3.5 mr-1" />Filtrer
            </Button>
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`} />Recharger
            </Button>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={loading || logs.length === 0}>
              <Download className="h-3.5 w-3.5 mr-1" />Export Excel
            </Button>
            <Button variant="outline" size="sm" onClick={exportAllCsv} disabled={loading || total === 0}>
              <Download className="h-3.5 w-3.5 mr-1" />Export tout ({total})
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date / Heure</TableHead>
                <TableHead>Utilisateur</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entité</TableHead>
                <TableHead>Méthode</TableHead>
                <TableHead>IP</TableHead>
                <TableHead>Durée session</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Détails</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-8">Aucune entrée.</TableCell></TableRow>
              ) : logs.map((l) => (
                <TableRow key={l.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelected(l)}>
                  <TableCell className="text-xs whitespace-nowrap">{fmt(l.createdAt)}</TableCell>
                  <TableCell className="text-xs">
                    <div className="font-medium">{l.user ?? "—"}</div>
                    <div className="text-muted-foreground text-[10px]">{roleLabel(l.userRole)}</div>
                  </TableCell>
                  <TableCell><Badge variant={l.action === "login" ? "default" : l.action === "logout" ? "secondary" : "outline"} className="text-[10px]">{humanAction(l.action)}</Badge></TableCell>
                  <TableCell className="text-xs">
                    {l.entityType && <span className="text-muted-foreground">{humanEntity(l.entityType)}</span>}
                    {l.entityId && <div className="font-mono text-[10px]">{l.entityId}</div>}
                  </TableCell>
                  <TableCell className="text-xs font-mono">{l.method ?? "—"}</TableCell>
                  <TableCell className="text-xs font-mono" title={l.userAgent ?? ""}>{l.ip ?? "—"}</TableCell>
                  <TableCell className="text-xs">{l.action === "login" ? formatDuration(l.sessionSeconds) : "—"}</TableCell>
                  <TableCell className="text-xs">{l.statusCode ?? "—"}</TableCell>
                  <TableCell className="text-xs max-w-xs truncate" title={l.details ?? ""}>{l.details ? "Voir détails…" : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between text-xs">
          <Button variant="outline" size="sm" disabled={offset === 0 || loading} onClick={() => setOffset(Math.max(0, offset - limit))}>← Précédent</Button>
          <span>{offset + 1} – {Math.min(offset + limit, total)} sur {total}</span>
          <Button variant="outline" size="sm" disabled={offset + limit >= total || loading} onClick={() => setOffset(offset + limit)}>Suivant →</Button>
        </div>
      </Card>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {selected && (() => {
            const parsed = parseDetails(selected.details);
            return (
              <>
                <SheetHeader className="space-y-1">
                  <SheetTitle>{humanAction(selected.action)}{selected.entityType ? ` — ${humanEntity(selected.entityType)}` : ""}</SheetTitle>
                  <SheetDescription>
                    Le {fmt(selected.createdAt)} par <strong>{selected.user ?? "—"}</strong>
                    {selected.userRole ? ` (${roleLabel(selected.userRole)})` : ""}.
                  </SheetDescription>
                </SheetHeader>

                <div className="mt-6 space-y-4 text-sm">
                  <section className="rounded-lg border p-3 space-y-2">
                    <h3 className="font-semibold text-xs uppercase text-muted-foreground">Résumé</h3>
                    <dl className="grid grid-cols-3 gap-x-3 gap-y-2">
                      <dt className="text-muted-foreground">Action</dt><dd className="col-span-2">{humanAction(selected.action)}</dd>
                      {selected.entityType && (<><dt className="text-muted-foreground">Type</dt><dd className="col-span-2">{humanEntity(selected.entityType)}</dd></>)}
                      {selected.entityId && (<><dt className="text-muted-foreground">Identifiant</dt><dd className="col-span-2 font-mono text-xs break-all">{selected.entityId}</dd></>)}
                      <dt className="text-muted-foreground">Adresse IP</dt><dd className="col-span-2 font-mono text-xs">{selected.ip ?? "—"}</dd>
                      {selected.statusCode !== null && (<><dt className="text-muted-foreground">Statut HTTP</dt><dd className="col-span-2">{selected.statusCode}</dd></>)}
                      {selected.action === "login" && (<><dt className="text-muted-foreground">Durée session</dt><dd className="col-span-2">{formatDuration(selected.sessionSeconds)}</dd></>)}
                      {selected.userAgent && (<><dt className="text-muted-foreground">Navigateur</dt><dd className="col-span-2 text-xs break-words">{selected.userAgent}</dd></>)}
                    </dl>
                  </section>

                  {parsed && (
                    <section className="rounded-lg border p-3 space-y-2">
                      <h3 className="font-semibold text-xs uppercase text-muted-foreground">Détails de l'action</h3>
                      {typeof parsed === "string" ? (
                        <p className="text-sm whitespace-pre-wrap">{parsed}</p>
                      ) : (
                        <dl className="grid grid-cols-3 gap-x-3 gap-y-2">
                          {Object.entries(parsed).map(([k, v]) => (
                            <Fragment key={k}>
                              <dt className="text-muted-foreground">{humanField(k)}</dt>
                              <dd className="col-span-2 break-words">
                                {typeof v === "object" && v !== null ? (
                                  <ul className="list-disc list-inside space-y-0.5">
                                    {Object.entries(v as Record<string, unknown>).map(([k2, v2]) => (
                                      <li key={k2}><span className="text-muted-foreground">{humanField(k2)} :</span> {humanValue(v2)}</li>
                                    ))}
                                  </ul>
                                ) : humanValue(v)}
                              </dd>
                            </Fragment>
                          ))}
                        </dl>
                      )}
                    </section>
                  )}
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>
    </AppLayout>
  );
}
