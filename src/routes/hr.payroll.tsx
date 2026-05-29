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
import { Wallet, Plus, CheckCircle2, Trash2, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { PayrollEntry } from "@/lib/types";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { useErp } from "@/lib/erpStore";
import { confirmDialog } from "@/components/ConfirmDialogProvider";

export const Route = createFileRoute("/hr/payroll")({
  head: () => ({ meta: [{ title: "Paie — CRM" }] }),
  component: PayrollPage,
});

const emptyForm = { userId: "", baseSalary: 0, hoursWorked: 0, hourlyRate: 0, bonus: 0, deductions: 0, notes: "" };

function PayrollPage() {
  const { user, hasPermission } = useAuth();
  const { users } = useErp();
  const isAdmin = user?.role === "Administrateur";
  const canEdit = hasPermission("hr.payroll.edit");
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [rows, setRows] = useState<PayrollEntry[]>([]);
  const [hours, setHours] = useState<Record<string, number>>({});
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const load = async () => {
    try {
      const r = await api<{ payroll: PayrollEntry[]; attendanceHours: Record<string, number> }>("/payroll.php", { query: { period } });
      setRows(r.payroll);
      setHours(r.attendanceHours ?? {});
    } catch (e: any) { toast.error(e?.message ?? "Erreur"); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [period]);

  const total = (f: typeof form) => +(f.baseSalary + (f.hoursWorked * f.hourlyRate) + f.bonus - f.deductions).toFixed(2);

  const upsert = async () => {
    if (!form.userId) { toast.error("Utilisateur requis"); return; }
    try {
      await api("/payroll.php?action=upsert", { method: "POST", body: { ...form, period } });
      toast.success("Enregistré");
      setOpen(false);
      setForm(emptyForm);
      void load();
    } catch (e: any) { toast.error(e?.message ?? "Erreur"); }
  };

  const markPaid = async (id: string) => {
    try { await api("/payroll.php?action=mark_paid", { method: "POST", body: { id } }); void load(); } catch (e: any) { toast.error(e?.message ?? "Erreur"); }
  };
  const remove = async (id: string) => {
    if (!(await confirmDialog({ title: "Suppression", description: "Supprimer ?", tone: "destructive", confirmText: "Supprimer" }))) return;
    try { await api("/payroll.php", { method: "DELETE", query: { id } }); void load(); } catch (e: any) { toast.error(e?.message ?? "Erreur"); }
  };

  const prefillHours = () => {
    const h = hours[form.userId];
    if (h !== undefined) setForm((f) => ({ ...f, hoursWorked: h }));
    else toast.info("Aucune présence enregistrée pour cet utilisateur ce mois.");
  };

  return (
    <AppLayout skeleton="table">
      <PageHeader
        title="Paie"
        description="Paie mensuelle des agents internes (heures auto depuis le pointage)."
        icon={<Wallet className="h-5 w-5" />}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="h-4 w-4 mr-1.5" /> Actualiser</Button>
            {canEdit && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1.5" /> Bulletin</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Bulletin de paie — {period}</DialogTitle></DialogHeader>
                <div className="grid gap-3">
                  <div>
                    <Label>Utilisateur *</Label>
                    <Select value={form.userId} onValueChange={(v) => setForm({ ...form, userId: v })}>
                      <SelectTrigger><SelectValue placeholder="Choisir…" /></SelectTrigger>
                      <SelectContent>{users.map(u => <SelectItem key={u.id} value={u.id}>{u.fullName} ({u.username})</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Salaire de base</Label><Input type="number" step="0.01" value={form.baseSalary} onChange={(e) => setForm({ ...form, baseSalary: parseFloat(e.target.value) || 0 })} /></div>
                    <div>
                      <Label className="flex items-center justify-between">Heures travaillées <Button type="button" size="sm" variant="ghost" className="h-5 text-xs" onClick={prefillHours}>Auto</Button></Label>
                      <Input type="number" step="0.01" value={form.hoursWorked} onChange={(e) => setForm({ ...form, hoursWorked: parseFloat(e.target.value) || 0 })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div><Label>Taux horaire</Label><Input type="number" step="0.01" value={form.hourlyRate} onChange={(e) => setForm({ ...form, hourlyRate: parseFloat(e.target.value) || 0 })} /></div>
                    <div><Label>Prime</Label><Input type="number" step="0.01" value={form.bonus} onChange={(e) => setForm({ ...form, bonus: parseFloat(e.target.value) || 0 })} /></div>
                    <div><Label>Retenues</Label><Input type="number" step="0.01" value={form.deductions} onChange={(e) => setForm({ ...form, deductions: parseFloat(e.target.value) || 0 })} /></div>
                  </div>
                  <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
                  <div className="text-right text-sm">Total: <span className="font-semibold text-base">{total(form).toFixed(2)}</span></div>
                </div>
                <DialogFooter><Button onClick={upsert}>Enregistrer</Button></DialogFooter>
              </DialogContent>
            </Dialog>
            )}
          </>
        }
      />

      <div className="mt-6 flex flex-wrap gap-3 items-end">
        <div><Label>Période</Label><Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="w-44" /></div>
      </div>

      <Card className="p-0 mt-6 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Utilisateur</TableHead>
              <TableHead>Base</TableHead>
              <TableHead>Heures</TableHead>
              <TableHead>Taux</TableHead>
              <TableHead>Prime</TableHead>
              <TableHead>Retenues</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Aucun bulletin</TableCell></TableRow>}
            {rows.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.fullName ?? p.username}</TableCell>
                <TableCell>{p.baseSalary.toFixed(2)}</TableCell>
                <TableCell>{p.hoursWorked}</TableCell>
                <TableCell>{p.hourlyRate.toFixed(2)}</TableCell>
                <TableCell>{p.bonus.toFixed(2)}</TableCell>
                <TableCell>{p.deductions.toFixed(2)}</TableCell>
                <TableCell className="font-semibold">{p.total.toFixed(2)}</TableCell>
                <TableCell>
                  {p.status === "paid" && <Badge className="bg-success/15 text-success border-success/20">Payé</Badge>}
                  {p.status === "validated" && <Badge>Validé</Badge>}
                  {p.status === "draft" && <Badge variant="outline">Brouillon</Badge>}
                </TableCell>
                <TableCell className="text-right">
                  {canEdit && p.status !== "paid" && <Button size="sm" variant="outline" onClick={() => markPaid(p.id)}><CheckCircle2 className="h-4 w-4" /></Button>}
                  {canEdit && <Button variant="ghost" size="icon" onClick={() => remove(p.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </AppLayout>
  );
}
