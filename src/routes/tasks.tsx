import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { CheckSquare, Plus, Trash2, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useEffect, useState } from "react";
import { api, API_ENABLED } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Can } from "@/components/Can";
import { useErp } from "@/lib/erpStore";
import { toast } from "sonner";
import { confirmDialog } from "@/components/ConfirmDialogProvider";

export const Route = createFileRoute("/tasks")({
  head: () => ({
    meta: [
      { title: "Tâches & tâches — CRM" },
      { name: "description", content: "Liste des relances et tâches du jour, par échéance et priorité." },
    ],
  }),
  component: TasksPage,
});

type Task = {
  id: string; title: string; description: string | null; assignedTo: string;
  relatedEntity: string | null; relatedId: string | null; dueDate: string | null;
  priority: "low" | "normal" | "high"; status: "todo" | "in_progress" | "done" | "cancelled";
  createdBy: string; createdAt: string; completedAt: string | null;
};

const PRIO_BADGE: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  normal: "bg-info/15 text-info",
  high: "bg-destructive/15 text-destructive",
};

function TasksPage() {
  const auth = useAuth();
  const isAdmin = auth.user?.role === "Administrateur";
  const canEditTask = isAdmin || auth.hasPermission("task.edit");
  const canDeleteTask = isAdmin || auth.hasPermission("task.delete");
  const { users } = useErp();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [assignee, setAssignee] = useState(auth.user?.username ?? "");
  const [due, setDue] = useState("");
  const [priority, setPriority] = useState<Task["priority"]>("normal");

  const load = async () => {
    if (!API_ENABLED) return;
    setLoading(true);
    try {
      const r = await api<{ tasks: Task[] }>("/tasks.php");
      setTasks(r.tasks);
    } catch (e: any) { toast.error("Erreur", { description: e?.message }); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const create = async () => {
    if (!title.trim()) { toast.error("Titre requis"); return; }
    try {
      await api("/tasks.php", { method: "POST", body: {
        title: title.trim(), description: desc.trim() || null,
        assignedTo: assignee || auth.user?.username, dueDate: due || null, priority,
      }});
      toast.success("Tâche créée");
      setTitle(""); setDesc(""); setDue("");
      await load();
    } catch (e: any) { toast.error(e?.message); }
  };

  const setStatus = async (id: string, status: Task["status"]) => {
    try { await api("/tasks.php", { method: "PATCH", body: { id, status } }); await load(); }
    catch (e: any) { toast.error(e?.message); }
  };
  const remove = async (id: string) => {
    if (!(await confirmDialog({ title: "Suppression", description: "Supprimer cette tâche ?", tone: "destructive", confirmText: "Supprimer" }))) return;
    try { await api(`/tasks.php?id=${id}`, { method: "DELETE" }); await load(); }
    catch (e: any) { toast.error(e?.message); }
  };

  return (
    <AppLayout skeleton="table">
      <PageHeader
        title="Tâches"
        description="Suivi des tâches: échéances, priorités et assignations."
        icon={<CheckSquare className="h-5 w-5" />}
      />

      <Can perm="task.add">
        <Card className="p-4 mt-6 shadow-elegant">
          <div className="font-semibold text-sm mb-3">Nouvelle tâche</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Titre</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ex: Rappeler M. Dupont" />
            </div>
            <div className="space-y-1">
              <Label>Assigné à</Label>
              <Select value={assignee} onValueChange={setAssignee} disabled={auth.user?.role !== "Administrateur"}>
                <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                <SelectContent>
                  {users.map((u) => <SelectItem key={u.username} value={u.username}>{u.fullName} ({u.username})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Échéance</Label>
              <DatePicker value={due} onChange={setDue} placeholder="Choisir une échéance" />
            </div>
            <div className="space-y-1">
              <Label>Priorité</Label>
              <Select value={priority} onValueChange={(v: Task["priority"]) => setPriority(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Basse</SelectItem>
                  <SelectItem value="normal">Normale</SelectItem>
                  <SelectItem value="high">Haute</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2 space-y-1">
              <Label>Description</Label>
              <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} />
            </div>
          </div>
          <div className="flex justify-end mt-3">
            <Button onClick={create} className="bg-primary text-primary-foreground hover:bg-primary/90">
              <Plus className="h-4 w-4 mr-1.5" />Créer
            </Button>
          </div>
        </Card>
      </Can>

      <Card className="mt-6 shadow-elegant">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div className="font-semibold text-sm">{tasks.length} tâche(s)</div>
          <Button variant="ghost" size="sm" onClick={load}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></Button>
        </div>
        <div className="divide-y divide-border">
          {tasks.map((t) => (
            <div key={t.id} className="px-4 py-3 flex items-center gap-3 hover:bg-muted/20">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className={`font-medium text-sm ${t.status === "done" ? "line-through text-muted-foreground" : ""}`}>{t.title}</div>
                  <Badge className={PRIO_BADGE[t.priority]} variant="secondary">{t.priority}</Badge>
                  {t.dueDate && <span className="text-xs text-muted-foreground">échéance: {t.dueDate}</span>}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {t.assignedTo} · créé par {t.createdBy} {t.description ? `· ${t.description}` : ""}
                </div>
              </div>
              {canEditTask ? (
                <Select value={t.status} onValueChange={(v: Task["status"]) => setStatus(t.id, v)}>
                  <SelectTrigger className="w-[140px] h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todo">À faire</SelectItem>
                    <SelectItem value="in_progress">En cours</SelectItem>
                    <SelectItem value="done">Terminée</SelectItem>
                    <SelectItem value="cancelled">Annulée</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Badge variant="outline" className="capitalize">{t.status}</Badge>
              )}
              {canDeleteTask && (
                <Button variant="ghost" size="icon" onClick={() => remove(t.id)} className="text-destructive hover:bg-destructive/10">
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
          {tasks.length === 0 && (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">Aucune tâche pour le moment</div>
          )}
        </div>
      </Card>
    </AppLayout>
  );
}
