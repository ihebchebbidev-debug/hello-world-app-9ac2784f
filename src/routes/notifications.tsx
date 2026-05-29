import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { Bell, Check, Trash2, RefreshCw, CheckCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useEffect, useState, useCallback } from "react";
import { api, API_ENABLED } from "@/lib/api";
import { toast } from "sonner";

export const Route = createFileRoute("/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — CRM" },
      { name: "description", content: "Vos notifications: tâches assignées, mises à jour et alertes." },
    ],
  }),
  component: NotificationsPage,
});

type Notif = {
  id: string; user: string; title: string; body: string | null;
  link: string | null; read: boolean; readAt: string | null; createdAt: string;
};

function NotificationsPage() {
  const [items, setItems] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!API_ENABLED) return;
    setLoading(true);
    try {
      const r = await api<{ notifications: Notif[]; unread: number }>("/notifications.php");
      setItems(r.notifications ?? []);
      setUnread(r.unread ?? 0);
    } catch (e: any) { toast.error("Erreur", { description: e?.message }); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const markRead = async (id: string) => {
    try { await api("/notifications.php", { method: "PATCH", body: { id } }); await load(); }
    catch (e: any) { toast.error(e?.message ?? "Erreur"); }
  };
  const markAll = async () => {
    try { await api("/notifications.php", { method: "PATCH", body: { all: true } }); toast.success("Tout marqué comme lu"); await load(); }
    catch (e: any) { toast.error(e?.message ?? "Erreur"); }
  };
  const remove = async (id: string) => {
    try { await api(`/notifications.php?id=${encodeURIComponent(id)}`, { method: "DELETE" }); await load(); }
    catch (e: any) { toast.error(e?.message ?? "Erreur"); }
  };

  return (
    <AppLayout>
      <PageHeader
        icon={<Bell className="h-5 w-5" />}
        title="Notifications"
        description={unread > 0 ? `${unread} non lue(s)` : "Tout est à jour"}
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} /> Actualiser
            </Button>
            <Button size="sm" onClick={markAll} disabled={unread === 0}>
              <CheckCheck className="h-4 w-4 mr-1.5" /> Tout marquer lu
            </Button>
          </div>
        }
      />
      <div className="space-y-2">
        {items.length === 0 && !loading ? (
          <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
            Aucune notification
          </CardContent></Card>
        ) : items.map((n) => (
          <Card key={n.id} className={n.read ? "opacity-70" : ""}>
            <CardContent className="py-3 flex items-start gap-3">
              <div className={`mt-1 h-2 w-2 rounded-full shrink-0 ${n.read ? "bg-muted" : "bg-primary"}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="font-medium text-sm truncate">{n.title}</div>
                  {!n.read && <Badge variant="secondary" className="text-[10px]">Nouveau</Badge>}
                </div>
                {n.body && <div className="text-xs text-muted-foreground mt-0.5 break-words">{n.body}</div>}
                <div className="text-[11px] text-muted-foreground/70 mt-1">{new Date(n.createdAt).toLocaleString("fr-FR")}</div>
              </div>
              <div className="flex gap-1 shrink-0">
                {!n.read && (
                  <Button size="sm" variant="ghost" onClick={() => markRead(n.id)} title="Marquer lu">
                    <Check className="h-4 w-4" />
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => remove(n.id)} title="Supprimer">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </AppLayout>
  );
}