// CRM MVP — Timeline d'actions commerciales horodatées sur la fiche lead.
// Cf. cahier des charges §4.2 (appels, visites, relances, notes).
import { useCallback, useEffect, useState } from "react";
import { Phone, MapPin, BellRing, StickyNote, Plus, Trash2, RefreshCw, Users2, Share2, Wrench } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { api, API_ENABLED } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import type { LeadActionType } from "@/lib/types";
import { confirmDialog } from "@/components/ConfirmDialogProvider";

type LeadAction = {
  id: string;
  prospectId: string;
  agentUsername: string;
  type: LeadActionType;
  comment: string | null;
  createdAt: string;
};

const TYPE_META: Record<LeadActionType, { label: string; icon: any; tone: string }> = {
  appel:      { label: "Appel",            icon: Phone,      tone: "bg-info/15 text-info border-info/20" },
  visite:     { label: "Visite",           icon: MapPin,     tone: "bg-primary/10 text-primary border-primary/20" },
  relance:    { label: "Relance",          icon: BellRing,   tone: "bg-warning/15 text-warning-foreground border-warning/20" },
  note:       { label: "Note",             icon: StickyNote, tone: "bg-muted text-muted-foreground border-border" },
  terrain:    { label: "Action terrain",   icon: Users2,     tone: "bg-success/15 text-success border-success/20" },
  reseaux:    { label: "Réseaux sociaux",  icon: Share2,     tone: "bg-info/15 text-info border-info/20" },
  technicien: { label: "Technicien terrain", icon: Wrench,   tone: "bg-accent/40 text-accent-foreground border-accent" },
};

export function LeadActionsTimeline({ prospectId }: { prospectId: string }) {
  const { user, hasPermission } = useAuth();
  const isAdmin = user?.role === "Administrateur";
  const canEdit = hasPermission("prospect.edit");
  const [actions, setActions] = useState<LeadAction[]>([]);
  const [loading, setLoading] = useState(false);
  const [type, setType] = useState<LeadAction["type"]>("appel");
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!API_ENABLED) return;
    setLoading(true);
    try {
      const r = await api<{ actions: LeadAction[] }>("/lead_actions.php", { query: { prospectId } });
      setActions(r.actions ?? []);
    } catch (e: any) {
      toast.error(e?.message ?? "Erreur chargement actions");
    } finally { setLoading(false); }
  }, [prospectId]);

  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (type === "note" && !comment.trim()) {
      toast.error("Commentaire requis pour une note");
      return;
    }
    setSaving(true);
    try {
      await api("/lead_actions.php", { method: "POST", body: { prospectId, type, comment: comment.trim() } });
      setComment("");
      toast.success("Action enregistrée");
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Échec");
    } finally { setSaving(false); }
  };

  const remove = async (id: string) => {
    if (!(await confirmDialog({ title: "Suppression", description: "Supprimer cette action ?", tone: "destructive", confirmText: "Supprimer" }))) return;
    try {
      await api(`/lead_actions.php?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      toast.success("Supprimée");
      await load();
    } catch (e: any) { toast.error(e?.message ?? "Échec"); }
  };




  return (
    <Card className="shadow-elegant">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">Historique des actions</CardTitle>
            <CardDescription>Appels, visites, relances et notes — horodatés automatiquement</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Saisie rapide */}
        {canEdit && (
        <div className="rounded-lg border border-dashed p-3 space-y-2 bg-muted/30">
          <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr_auto] gap-2 items-start">
            <Select value={type} onValueChange={(v) => setType(v as LeadAction["type"])}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(TYPE_META) as LeadAction["type"][]).map((k) => (
                  <SelectItem key={k} value={k}>{TYPE_META[k].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Textarea
              rows={1}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={type === "note" ? "Note (obligatoire)…" : "Commentaire (optionnel)…"}
              className="min-h-9 resize-none"
            />
            <Button size="sm" onClick={submit} disabled={saving}>
              <Plus className="h-4 w-4 mr-1" />Ajouter
            </Button>
          </div>
        </div>
        )}

        {/* Timeline */}
        {actions.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-6">
            Aucune action pour ce lead.
          </div>
        ) : (
          <ol className="relative border-l border-border pl-4 space-y-3">
            {actions.map((a) => {
              const meta = TYPE_META[a.type];
              const Icon = meta.icon;
              const canDelete = isAdmin || a.agentUsername === user?.username;
              return (
                <li key={a.id} className="relative">
                  <span className="absolute -left-[22px] top-1 h-3 w-3 rounded-full bg-background ring-2 ring-primary/40" />
                  <div className="flex items-start gap-2">
                    <Badge variant="outline" className={`${meta.tone} font-normal text-[11px] gap-1`}>
                      <Icon className="h-3 w-3" />{meta.label}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] text-muted-foreground">
                        {a.agentUsername} • {new Date(a.createdAt.replace(" ", "T")).toLocaleString("fr-FR")}
                      </div>
                      {a.comment && <div className="text-sm mt-0.5 whitespace-pre-wrap">{a.comment}</div>}
                    </div>
                    {canDelete && (
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => remove(a.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
