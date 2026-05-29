import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Briefcase, Plus, Trash2, Pencil } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { ExternalAgent } from "@/lib/types";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { confirmDialog } from "@/components/ConfirmDialogProvider";

export const Route = createFileRoute("/hr/external-agents")({
  head: () => ({ meta: [{ title: "Agents externes — CRM" }] }),
  component: ExternalAgentsPage,
});

const empty: Partial<ExternalAgent> = { fullName: "", phone: "", email: "", cin: "", commissionRate: 0, fixedAmount: 0, active: true, notes: "" };

function ExternalAgentsPage() {
  const { user, hasPermission } = useAuth();
  const isAdmin = user?.role === "Administrateur";
  const canAdd = hasPermission("hr.external_agents.add");
  const canEditAgent = hasPermission("hr.external_agents.edit");
  const canDelete = hasPermission("hr.external_agents.delete");
  const canEdit = canAdd || canEditAgent; // controls action column visibility
  const [agents, setAgents] = useState<ExternalAgent[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<ExternalAgent>>(empty);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = async () => {
    try {
      const r = await api<{ agents: ExternalAgent[] }>("/external_agents.php");
      setAgents(r.agents);
    } catch (e: any) { toast.error(e?.message ?? "Erreur"); }
  };
  useEffect(() => { void load(); }, []);

  const save = async () => {
    if (!form.fullName?.trim()) { toast.error("Nom requis"); return; }
    try {
      if (editingId) {
        await api("/external_agents.php", { method: "PATCH", body: { id: editingId, ...form } });
      } else {
        await api("/external_agents.php", { method: "POST", body: form });
      }
      toast.success("Enregistré");
      setOpen(false);
      setForm(empty);
      setEditingId(null);
      void load();
    } catch (e: any) { toast.error(e?.message ?? "Erreur"); }
  };

  const remove = async (id: string) => {
    if (!(await confirmDialog({ title: "Suppression", description: "Supprimer cet agent ?", tone: "destructive", confirmText: "Supprimer" }))) return;
    try {
      await api("/external_agents.php", { method: "DELETE", query: { id } });
      void load();
    } catch (e: any) { toast.error(e?.message ?? "Erreur"); }
  };

  const startEdit = (a: ExternalAgent) => { setForm(a); setEditingId(a.id); setOpen(true); };

  return (
    <AppLayout skeleton="table">
      <PageHeader
        title="Agents externes"
        description="Référentiel des agents externes (commission par vente)."
        icon={<Briefcase className="h-5 w-5" />}
        actions={canAdd && (
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setForm(empty); setEditingId(null); } }}>
            <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1.5" /> Nouvel agent</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editingId ? "Modifier l'agent" : "Nouvel agent externe"}</DialogTitle></DialogHeader>
              <div className="grid gap-3">
                <div><Label>Nom complet *</Label><Input value={form.fullName ?? ""} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Téléphone</Label><Input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                  <div><Label>CIN</Label><Input value={form.cin ?? ""} onChange={(e) => setForm({ ...form, cin: e.target.value })} /></div>
                </div>
                <div><Label>Email</Label><Input type="email" value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Commission (%)</Label><Input type="number" step="0.01" value={form.commissionRate ?? 0} onChange={(e) => setForm({ ...form, commissionRate: parseFloat(e.target.value) || 0 })} /></div>
                  <div><Label>Montant fixe / vente</Label><Input type="number" step="0.01" value={form.fixedAmount ?? 0} onChange={(e) => setForm({ ...form, fixedAmount: parseFloat(e.target.value) || 0 })} /></div>
                </div>
                <div className="flex items-center gap-2"><Switch checked={!!form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} /><Label>Actif</Label></div>
                <div><Label>Notes</Label><Textarea value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
              </div>
              <DialogFooter><Button onClick={save}>Enregistrer</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      />

      <Card className="p-0 mt-6 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead>Téléphone</TableHead>
              <TableHead>CIN</TableHead>
              <TableHead>Commission</TableHead>
              <TableHead>Statut</TableHead>
              {canEdit && <TableHead></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {agents.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Aucun agent</TableCell></TableRow>}
            {agents.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="font-medium">{a.fullName}</TableCell>
                <TableCell className="text-sm">{a.phone || "—"}</TableCell>
                <TableCell className="text-sm">{a.cin || "—"}</TableCell>
                <TableCell className="text-sm">
                  {a.commissionRate > 0 && <span>{a.commissionRate}%</span>}
                  {a.commissionRate > 0 && a.fixedAmount > 0 && " + "}
                  {a.fixedAmount > 0 && <span>{a.fixedAmount} fixe</span>}
                  {!a.commissionRate && !a.fixedAmount && "—"}
                </TableCell>
                <TableCell>{a.active ? <Badge>Actif</Badge> : <Badge variant="secondary">Inactif</Badge>}</TableCell>
                {canEdit && (
                  <TableCell className="text-right">
                    {canEditAgent && <Button variant="ghost" size="icon" onClick={() => startEdit(a)}><Pencil className="h-4 w-4" /></Button>}
                    {canDelete && <Button variant="ghost" size="icon" onClick={() => remove(a.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </AppLayout>
  );
}
