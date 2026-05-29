import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, Save, Pencil } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { useErp } from "@/lib/erpStore";
import { Can } from "@/components/Can";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  listEntities, createEntity, updateEntity, deleteEntity,
  getDashboard, upsertObjective,
  type GuichetEntity, type GuichetDashboard,
} from "@/lib/guichetApi";

function progressTone(p: number): string {
  if (p >= 100) return "bg-success/15 text-success border-success/30";
  if (p >= 75)  return "bg-primary/10 text-primary border-primary/30";
  if (p >= 40)  return "bg-warning/15 text-warning-foreground border-warning/30";
  return "bg-destructive/10 text-destructive border-destructive/30";
}
function progressBarTint(p: number): string {
  if (p >= 100) return "[&>div]:bg-success";
  if (p >= 75)  return "[&>div]:bg-primary";
  if (p >= 40)  return "[&>div]:bg-warning";
  return "[&>div]:bg-destructive";
}
const fmtDt = (n: number | null | undefined) =>
  n == null ? "—" : `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(n)} DT`;

function KpiGrid({ data, isAdmin = false }: { data: GuichetDashboard | null; isAdmin?: boolean }) {
  const dailyPct   = data?.progress.contractsDaily   ?? 0;
  const monthlyPct = data?.progress.contractsMonthly ?? 0;
  const actRate    = data?.activation.rate ?? 0;
  const actMin     = data?.activation.min ?? 25;
  const actMeets   = data?.activation.meets ?? false;
  const actPctOfMin = actMin > 0 ? Math.min(100, Math.round((actRate / actMin) * 100)) : 0;
  const budgetM = data?.targets.budgetMonthlyDt ?? null;
  const budgetD = data?.targets.budgetDailyDt   ?? null;
  const today = data?.today ? new Date(data.today) : new Date();
  const dayOfMonth = today.getDate();
  const spentEstimate = budgetD != null ? budgetD * dayOfMonth : null;
  const budgetPct = budgetM && budgetM > 0 && spentEstimate != null
    ? Math.min(100, Math.round((spentEstimate / budgetM) * 100)) : 0;

  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 ${isAdmin ? "lg:grid-cols-4" : "lg:grid-cols-3"} gap-3`}>
      <Card><CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm">Contrats aujourd'hui</CardTitle>
        <Badge variant="outline" className={progressTone(dailyPct)}>{dailyPct}%</Badge>
      </CardHeader><CardContent>
        <div className="text-2xl font-bold tabular-nums">{data?.contracts.today ?? 0}<span className="text-muted-foreground text-base font-normal"> / {data?.targets.contractsDaily ?? 25}</span></div>
        <Progress value={dailyPct} className={`mt-2 h-2 ${progressBarTint(dailyPct)}`} />
      </CardContent></Card>
      <Card><CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm">Contrats du mois</CardTitle>
        <Badge variant="outline" className={progressTone(monthlyPct)}>{monthlyPct}%</Badge>
      </CardHeader><CardContent>
        <div className="text-2xl font-bold tabular-nums">{data?.contracts.month ?? 0}<span className="text-muted-foreground text-base font-normal"> / {data?.targets.contractsMonthly ?? 650}</span></div>
        <Progress value={monthlyPct} className={`mt-2 h-2 ${progressBarTint(monthlyPct)}`} />
      </CardContent></Card>
      <Card><CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm">Taux d'activation</CardTitle>
        <Badge variant="outline" className={actMeets ? "bg-success/15 text-success border-success/30" : "bg-destructive/10 text-destructive border-destructive/30"}>{actMeets ? "OK" : "< min"}</Badge>
      </CardHeader><CardContent>
        <div className={`text-2xl font-bold tabular-nums ${actMeets ? "text-success" : "text-destructive"}`}>{actRate.toFixed(1)}%</div>
        <Progress value={actPctOfMin} className={`mt-2 h-2 ${actMeets ? "[&>div]:bg-success" : "[&>div]:bg-destructive"}`} />
        <div className="text-[11px] text-muted-foreground mt-1">Seuil min {actMin}%</div>
      </CardContent></Card>
      {isAdmin && (
        <Card><CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm">Budget</CardTitle>
          {budgetM != null && <Badge variant="outline" className={progressTone(budgetPct)}>{budgetPct}%</Badge>}
        </CardHeader><CardContent>
          <div className="text-2xl font-bold tabular-nums">{fmtDt(budgetM)}<span className="text-muted-foreground text-base font-normal"> / mois</span></div>
          {budgetM != null && <Progress value={budgetPct} className={`mt-2 h-2 ${progressBarTint(budgetPct)}`} />}
          <div className="text-[11px] text-muted-foreground mt-1">Quotidien : {fmtDt(budgetD)}</div>
        </CardContent></Card>
      )}
    </div>
  );
}

export function ObjectivesPanel() {
  const { hasPermission } = useAuth();
  const isAdmin = hasPermission("guichet.manage_objectives") || hasPermission("guichet.read_all");
  const todayStr = new Date().toISOString().slice(0, 10);
  const [month, setMonth] = useState(todayStr.slice(0, 7));
  const [day, setDay] = useState(todayStr);
  const [entityId, setEntityId] = useState("");
  const [entities, setEntities] = useState<GuichetEntity[]>([]);
  const [data, setData] = useState<GuichetDashboard | null>(null);
  useEffect(() => { if (!day.startsWith(month)) { const tm = todayStr.slice(0,7); setDay(month === tm ? todayStr : `${month}-01`); } }, [month]); // eslint-disable-line
  const reload = () => getDashboard({ month, day, entityId: entityId || undefined }).then(setData).catch(() => setData(null));
  useEffect(() => { listEntities(true).then(setEntities).catch(() => {}); }, []);
  useEffect(() => { reload(); }, [month, day, entityId]); // eslint-disable-line
  const [yy, mm] = month.split("-").map(Number);
  const dayMin = `${month}-01`;
  const dayMax = new Date(yy, mm, 0).toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
        <div className="space-y-1.5"><Label>Mois / année</Label><Input type="month" value={month} onChange={(e) => setMonth(e.target.value || todayStr.slice(0,7))} /></div>
        <div className="space-y-1.5"><Label>Jour</Label><Input type="date" value={day} min={dayMin} max={dayMax} onChange={(e) => setDay(e.target.value || dayMin)} /></div>
        <div className="space-y-1.5 sm:col-span-2"><Label>Entité</Label>
          <Select value={entityId || "__all"} onValueChange={(v) => setEntityId(v === "__all" ? "" : v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="__all">Toutes</SelectItem>{entities.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <KpiGrid data={data} isAdmin={isAdmin} />
      <Can perm="guichet.manage_objectives"><ObjectiveEditor month={month} entities={entities} onSaved={reload} /></Can>
    </div>
  );
}

function ObjectiveEditor({ month, entities, onSaved }: { month: string; entities: GuichetEntity[]; onSaved: () => void }) {
  const { users } = useErp();
  const [scope, setScope] = useState<"agent"|"entity"|"global">("global");
  const [agentId, setAgentId] = useState("");
  const [entityId, setEntityId] = useState("");
  const [sim, setSim] = useState(900); const [port, setPort] = useState(90); const [fancy, setFancy] = useState(90);
  const [tcd, setTcd] = useState(25); const [tcm, setTcm] = useState(650); const [wdays, setWdays] = useState(26);
  const [budgetM, setBudgetM] = useState<number | "">(900); const [budgetD, setBudgetD] = useState<number | "">(30);
  const [minAct, setMinAct] = useState<number>(25); const [bonus, setBonus] = useState<number | "">("");
  
  // Get active agents
  const agents = useMemo(
    () => users.filter((u) => (u.role === "Agent" || u.role === "Manager" || u.role === "AgentSuivi" || u.role === "AgentActivation" || u.role === "AgentVente") && u.active !== false),
    [users],
  );

  const save = async () => {
    if (scope === "agent" && !agentId.trim()) {
      toast.error("Veuillez sélectionner un agent");
      return;
    }
    if (scope === "entity" && !entityId.trim()) {
      toast.error("Veuillez sélectionner une entité");
      return;
    }
    try {
      await upsertObjective({
        scope, agentId: scope === "agent" ? agentId : undefined, entityId: scope === "entity" ? entityId : undefined,
        periodMonth: month, targetSim: sim, targetPort: port, targetFancy: fancy,
        targetContractsDaily: tcd, targetContractsMonthly: tcm, workingDays: wdays,
        budgetMonthlyDt: budgetM === "" ? null : Number(budgetM), budgetDailyDt: budgetD === "" ? null : Number(budgetD),
        minActivationPct: Number(minAct), challengeBonusDt: bonus === "" ? null : Number(bonus),
      });
      toast.success("Objectif enregistré"); onSaved();
    } catch (e: any) { toast.error(e?.message ?? "Erreur"); }
  };
  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">Définir un objectif ({month})</CardTitle></CardHeader>
      <CardContent className="grid grid-cols-1 sm:grid-cols-6 gap-2 items-end">
        <div className="space-y-1.5"><Label>Portée</Label>
          <Select value={scope} onValueChange={(v) => setScope(v as any)}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="global">Global</SelectItem><SelectItem value="entity">Par entité</SelectItem><SelectItem value="agent">Par agent</SelectItem></SelectContent>
          </Select>
        </div>
        {scope === "entity" && <div className="space-y-1.5"><Label>Entité</Label>
          <Select value={entityId} onValueChange={setEntityId}><SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
            <SelectContent>{entities.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
          </Select></div>}
        {scope === "agent" && <div className="space-y-1.5"><Label>Agent</Label>
          <Select value={agentId} onValueChange={setAgentId}><SelectTrigger><SelectValue placeholder="Choisir un agent" /></SelectTrigger>
            <SelectContent>{agents.map((a) => <SelectItem key={a.id} value={a.id}>{a.fullName} ({a.username})</SelectItem>)}</SelectContent>
          </Select></div>}
        <div className="space-y-1.5"><Label>Contrats/jour</Label><Input type="number" value={tcd} onChange={(e) => setTcd(+e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Contrats/mois</Label><Input type="number" value={tcm} onChange={(e) => setTcm(+e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Jours ouvrés</Label><Input type="number" value={wdays} onChange={(e) => setWdays(+e.target.value)} /></div>
        <div className="space-y-1.5"><Label>SIM</Label><Input type="number" value={sim} onChange={(e) => setSim(+e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Portabilité</Label><Input type="number" value={port} onChange={(e) => setPort(+e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Fancy</Label><Input type="number" value={fancy} onChange={(e) => setFancy(+e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Budget mensuel</Label><Input type="number" value={budgetM} onChange={(e) => setBudgetM(e.target.value === "" ? "" : +e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Budget quotidien</Label><Input type="number" value={budgetD} onChange={(e) => setBudgetD(e.target.value === "" ? "" : +e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Activation min %</Label><Input type="number" value={minAct} onChange={(e) => setMinAct(+e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Prime DT</Label><Input type="number" value={bonus} onChange={(e) => setBonus(e.target.value === "" ? "" : +e.target.value)} /></div>
        <Button className="sm:col-span-6 w-fit" onClick={save}><Save className="h-4 w-4 mr-1" /> Enregistrer</Button>
      </CardContent>
    </Card>
  );
}

export function EntitiesPanel() {
  const [items, setItems] = useState<GuichetEntity[]>([]);
  const [name, setName] = useState(""); const [type, setType] = useState<"ttshop"|"franchise"|"autre">("ttshop"); const [city, setCity] = useState("");
  const [editing, setEditing] = useState<GuichetEntity | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<GuichetEntity | null>(null);
  const [showInactive, setShowInactive] = useState(true);
  const reload = () => listEntities().then(setItems).catch(() => {});
  useEffect(() => { reload(); }, []);
  const add = async () => {
    if (!name.trim()) return;
    try { await createEntity({ name, type, city, active: true }); toast.success("Entité créée"); setName(""); setCity(""); reload(); }
    catch (e: any) { toast.error(e?.message ?? "Erreur"); }
  };
  const visible = items.filter((e) => showInactive || e.active);
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Entités / points de vente</CardTitle>
        <label className="flex items-center gap-2 text-xs text-muted-foreground"><Switch checked={showInactive} onCheckedChange={setShowInactive} />Afficher inactives</label>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
          <div className="space-y-1.5"><Label>Nom</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex. TTshop" /></div>
          <div className="space-y-1.5"><Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as any)}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="ttshop">TTshop</SelectItem><SelectItem value="franchise">Franchise</SelectItem><SelectItem value="autre">Autre</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Ville</Label><Input value={city} onChange={(e) => setCity(e.target.value)} /></div>
          <Button onClick={add}><Plus className="h-4 w-4 mr-1" /> Ajouter</Button>
        </div>
        <Table>
          <TableHeader><TableRow><TableHead>Nom</TableHead><TableHead>Type</TableHead><TableHead>Ville</TableHead><TableHead>Actif</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {visible.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="font-medium">{e.name}</TableCell>
                <TableCell>{e.type}</TableCell>
                <TableCell>{e.city}</TableCell>
                <TableCell>
                  <Switch checked={e.active} onCheckedChange={async (v) => { try { await updateEntity({ id: e.id, active: v }); toast.success(v ? "Activée" : "Désactivée"); reload(); } catch (er: any) { toast.error(er?.message ?? "Erreur"); } }} />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(e)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(e)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {visible.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">Aucune entité.</TableCell></TableRow>}
          </TableBody>
        </Table>
        <EditEntityDialog entity={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />
        <ConfirmDialog
          open={!!confirmDelete}
          title={confirmDelete ? `Supprimer « ${confirmDelete.name} » ?` : ""}
          description="Cette entité sera définitivement supprimée."
          destructive confirmLabel="Supprimer"
          onConfirm={async () => { const e = confirmDelete; setConfirmDelete(null); if (!e) return; try { await deleteEntity(e.id); toast.success("Entité supprimée"); reload(); } catch (er: any) { toast.error(er?.message ?? "Erreur"); } }}
          onCancel={() => setConfirmDelete(null)}
        />
      </CardContent>
    </Card>
  );
}

function EditEntityDialog({ entity, onClose, onSaved }: { entity: GuichetEntity | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(""); const [type, setType] = useState<"ttshop"|"franchise"|"autre">("ttshop");
  const [city, setCity] = useState(""); const [active, setActive] = useState(true); const [saving, setSaving] = useState(false);
  useEffect(() => { if (entity) { setName(entity.name); setType(entity.type); setCity(entity.city ?? ""); setActive(entity.active); } }, [entity]);
  const save = async () => {
    if (!entity) return; if (!name.trim()) { toast.error("Nom requis"); return; }
    setSaving(true);
    try { await updateEntity({ id: entity.id, name: name.trim(), type, city: city.trim(), active }); toast.success("Modifiée"); onSaved(); }
    catch (e: any) { toast.error(e?.message ?? "Erreur"); } finally { setSaving(false); }
  };
  return (
    <Dialog open={!!entity} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Modifier l'entité</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Nom</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as any)}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="ttshop">TTshop</SelectItem><SelectItem value="franchise">Franchise</SelectItem><SelectItem value="autre">Autre</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Ville</Label><Input value={city} onChange={(e) => setCity(e.target.value)} /></div>
          <label className="flex items-center gap-2 text-sm"><Switch checked={active} onCheckedChange={setActive} /> Active</label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={save} disabled={saving}><Save className="h-4 w-4 mr-1" />Enregistrer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
