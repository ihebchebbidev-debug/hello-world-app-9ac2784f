import { DatePicker } from "@/components/ui/date-picker";
import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Coins, Plus, CheckCircle2, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Commission, ExternalAgent } from "@/lib/types";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { confirmDialog } from "@/components/ConfirmDialogProvider";

export const Route = createFileRoute("/hr/commissions")({
  head: () => ({ meta: [{ title: "Commissions — CRM" }] }),
  component: CommissionsPage,
});

type Summary = { externalAgentId: string; agentName: string | null; totalPending: number; totalPaid: number; count: number };

function CommissionsPage() {
  const { user, hasPermission } = useAuth();
  const isAdmin = user?.role === "Administrateur";
  const canEdit = hasPermission("hr.commissions.edit");
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [statusF, setStatusF] = useState<string>("all");
  const [rows, setRows] = useState<Commission[]>([]);
  const [summary, setSummary] = useState<Summary[]>([]);
  const [agents, setAgents] = useState<ExternalAgent[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{ externalAgentId: string; basis: number; amount?: number; earnedAt: string; notes: string; prospectId?: string }>(
    { externalAgentId: "", basis: 0, earnedAt: new Date().toISOString().slice(0, 10), notes: "" }
  );
  const [payRef, setPayRef] = useState<Record<string, string>>({});

  const load = async () => {
    try {
      const r = await api<{ commissions: Commission[]; summary: Summary[] }>("/commissions.php", {
        query: { period, ...(statusF !== "all" ? { status: statusF } : {}) },
      });
      setRows(r.commissions);
      setSummary(r.summary);
    } catch (e: any) { toast.error(e?.message ?? "Erreur"); }
  };
  const loadAgents = async () => {
    try { const r = await api<{ agents: ExternalAgent[] }>("/external_agents.php"); setAgents(r.agents.filter(a => a.active)); } catch {}
  };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [period, statusF]);
  useEffect(() => { void loadAgents(); }, []);

  const create = async () => {
    if (!form.externalAgentId) { toast.error("Sélectionner un agent"); return; }
    try {
      await api("/commissions.php?action=create", { method: "POST", body: form });
      toast.success("Commission créée");
      setOpen(false);
      setForm({ externalAgentId: "", basis: 0, earnedAt: new Date().toISOString().slice(0, 10), notes: "" });
      void load();
    } catch (e: any) { toast.error(e?.message ?? "Erreur"); }
  };

  const markPaid = async (id: string) => {
    try {
      await api("/commissions.php?action=mark_paid", { method: "POST", body: { id, paymentRef: payRef[id] ?? "" } });
      toast.success("Marqué payé");
      void load();
    } catch (e: any) { toast.error(e?.message ?? "Erreur"); }
  };

  const remove = async (id: string) => {
    if (!(await confirmDialog({ title: "Suppression", description: "Supprimer ?", tone: "destructive", confirmText: "Supprimer" }))) return;
    try { await api("/commissions.php", { method: "DELETE", query: { id } }); void load(); } catch (e: any) { toast.error(e?.message ?? "Erreur"); }
  };

  return (
    <AppLayout skeleton="table">
      <PageHeader
        title="Commissions"
        description="Rémunération des agents externes par vente."
        icon={<Coins className="h-5 w-5" />}
        actions={canEdit && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1.5" /> Nouvelle commission</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Nouvelle commission</DialogTitle></DialogHeader>
              <div className="grid gap-3">
                <div>
                  <Label>Agent externe *</Label>
                  <Select value={form.externalAgentId} onValueChange={(v) => setForm({ ...form, externalAgentId: v })}>
                    <SelectTrigger><SelectValue placeholder="Choisir…" /></SelectTrigger>
                    <SelectContent>
                      {agents.map((a) => <SelectItem key={a.id} value={a.id}>{a.fullName}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Montant vente (basis)</Label><Input type="number" step="0.01" value={form.basis} onChange={(e) => setForm({ ...form, basis: parseFloat(e.target.value) || 0 })} /></div>
                  <div><Label>Montant commission (auto si vide)</Label><Input type="number" step="0.01" value={form.amount ?? ""} onChange={(e) => setForm({ ...form, amount: e.target.value ? parseFloat(e.target.value) : undefined })} /></div>
                </div>
                <div><Label>Date</Label><DatePicker value={form.earnedAt} onChange={(v: string) => setForm({ ...form, earnedAt: v })} /></div>
                <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
              </div>
              <DialogFooter><Button onClick={create}>Créer</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      />

      <div className="mt-6 flex flex-wrap gap-3 items-end">
        <div><Label>Période</Label><Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="w-44" /></div>
        <div>
          <Label>Statut</Label>
          <Select value={statusF} onValueChange={setStatusF}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous</SelectItem>
              <SelectItem value="pending">En attente</SelectItem>
              <SelectItem value="paid">Payés</SelectItem>
              <SelectItem value="cancelled">Annulés</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mt-6">
        <Card className="p-4">
          <h3 className="font-semibold mb-3 text-sm">Synthèse par agent</h3>
          <div className="space-y-2">
            {summary.length === 0 && <div className="text-sm text-muted-foreground">Aucune donnée</div>}
            {summary.map((s) => (
              <div key={s.externalAgentId} className="border-b border-border/60 pb-2 last:border-0">
                <div className="font-medium text-sm">{s.agentName ?? s.externalAgentId}</div>
                <div className="flex gap-2 mt-1 text-xs">
                  <Badge variant="outline" className="text-warning-foreground">À payer: {s.totalPending.toFixed(2)}</Badge>
                  <Badge variant="outline" className="text-success">Payé: {s.totalPaid.toFixed(2)}</Badge>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-0 lg:col-span-2 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead>Vente</TableHead>
                <TableHead>Commission</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Aucune commission</TableCell></TableRow>}
              {rows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="text-sm">{c.earnedAt}</TableCell>
                  <TableCell>{c.agentName ?? c.externalAgentId}</TableCell>
                  <TableCell>{c.basis.toFixed(2)}</TableCell>
                  <TableCell className="font-medium">{c.amount.toFixed(2)}</TableCell>
                  <TableCell>
                    {c.status === "paid" && <Badge className="bg-success/15 text-success border-success/20">Payé</Badge>}
                    {c.status === "pending" && <Badge variant="outline">En attente</Badge>}
                    {c.status === "cancelled" && <Badge variant="secondary">Annulé</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    {canEdit && c.status === "pending" && (
                      <div className="flex items-center gap-1 justify-end">
                        <Input placeholder="Réf paiement" className="h-8 w-32" value={payRef[c.id] ?? ""} onChange={(e) => setPayRef({ ...payRef, [c.id]: e.target.value })} />
                        <Button size="sm" variant="outline" onClick={() => markPaid(c.id)}><CheckCircle2 className="h-4 w-4" /></Button>
                      </div>
                    )}
                    {canEdit && (
                      <Button variant="ghost" size="icon" onClick={() => remove(c.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>
    </AppLayout>
  );
}
