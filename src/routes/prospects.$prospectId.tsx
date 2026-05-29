import { DatePicker } from "@/components/ui/date-picker";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import {
  ClipboardList, ArrowLeft, User, Phone, MapPin, MessageSquare,
  LayoutGrid, Paperclip, Sparkles, BellRing, History, ArrowRightCircle, Pencil,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useErp } from "@/lib/erpStore";
import { useAuth } from "@/lib/auth";
import { AttachmentsCard } from "@/components/AttachmentsCard";
import { CustomFieldsCard } from "@/components/CustomFieldsCard";
import { ContractInfoCard } from "@/components/ContractInfoCard";
import { Network } from "lucide-react";
import { LeadActionsTimeline } from "@/components/LeadActionsTimeline";
import { LeadHistoryCard } from "@/components/LeadHistoryCard";
import { JourneyTimeline } from "@/components/JourneyTimeline";

import { CinDuplicatesCard } from "@/components/CinDuplicatesCard";
import { ClientIdentityCard } from "@/components/ClientIdentityCard";
import { api, API_ENABLED } from "@/lib/api";
import { useQueryClient } from "@/lib/queryClient";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { PipelineStage } from "@/lib/types";
import type { ProspectType } from "@/lib/types";
import { confirmDialog } from "@/components/ConfirmDialogProvider";

export const Route = createFileRoute("/prospects/$prospectId")({
  head: ({ params }) => ({
    meta: [
      { title: `Lead ${params.prospectId} — CRM` },
      { name: "description", content: "Fiche lead: coordonnées, statut, historique des actions et pièces jointes." },
    ],
  }),
  component: ProspectDetailPage,
});

const STATUS_FALLBACK = [
  "Ok","Att cin","Att confirmation","Rappel","refuse","migration","Basculement",
  "Ing","Nrp","Pas de rep","Pas intersse","Déjà connecté","Autr dde encor","Autre",
];

function ProspectDetailPage() {
  const { prospectId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { prospects, users, updateProspect } = useErp();
  const { user, hasPermission } = useAuth();
  const isAgent = user?.role === "Agent" || user?.role === "AgentSuivi" || user?.role === "AgentActivation" || user?.role === "AgentVente";
  const canConvert = hasPermission("opportunity.convert");
  // Lead change history: Admin always granted; others need the explicit `lead.history` permission.
  const canViewHistory = hasPermission("lead.history");
  const isAdmin = user?.role === "Administrateur";
  const canEdit = hasPermission("prospect.edit");
  const canChangeStatus = canEdit || hasPermission("prospect.status");
  const canChangeSource = canEdit || hasPermission("prospect.source");
  const canAssign = canEdit || hasPermission("prospect.assign");

  const prospect = useMemo(() => prospects.find((p) => p.id === prospectId), [prospects, prospectId]);
  const agent = useMemo(() => users.find((u) => u.username === prospect?.assignedTo), [users, prospect]);

  const [comment, setComment] = useState(prospect?.comment ?? "");
  const [comment2, setComment2] = useState(prospect?.comment2 ?? "");


  const [leadStages, setLeadStages] = useState<PipelineStage[]>([]);
  const [types, setTypes] = useState<ProspectType[]>([]);
  const [restoredMeta, setRestoredMeta] = useState<{ prospectId: string; opportunityId?: string | null; restoredAt?: string } | null>(null);
  useEffect(() => { setComment(prospect?.comment ?? ""); setComment2(prospect?.comment2 ?? ""); }, [prospect?.comment, prospect?.comment2]);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("crm:reverted-prospect");
      if (!raw) return;
      const parsed = JSON.parse(raw) as { prospectId?: string; opportunityId?: string | null; restoredAt?: string };
      if (parsed?.prospectId === prospectId && parsed.prospectId) {
        setRestoredMeta({ prospectId: parsed.prospectId, opportunityId: parsed.opportunityId ?? null, restoredAt: parsed.restoredAt });
      }
    } catch {}
  }, [prospectId]);
  useEffect(() => {
    if (!API_ENABLED) return;
    api<{ stages: PipelineStage[] }>("/stages.php")
      .then((r) => setLeadStages([...(r.stages ?? [])].sort((a, b) => a.position - b.position)))
      .catch(() => {});
    api<{ types: ProspectType[] }>("/prospect_types.php")
      .then((r) => setTypes((r.types ?? []).slice().sort((a, b) => a.position - b.position)))
      .catch(() => {});
  }, []);
  const STATUS_OPTIONS = leadStages.length ? leadStages.map((s) => s.name) : STATUS_FALLBACK;
  const currentTypeName = (types.find((t) => t.id === prospect?.typeId)?.name ?? "").trim().toLowerCase();
  const isStreetType = currentTypeName === "street";
  const showAncienLigne = currentTypeName === "résiliation" || currentTypeName === "resiliation" || currentTypeName === "migration";

  if (!prospect) {
    return (
      <AppLayout skeleton="detail">
        <div className="p-10 text-center">
          <h2 className="text-xl font-semibold">Prospect introuvable</h2>
          <p className="text-sm text-muted-foreground mt-2">L'identifiant {prospectId} n'existe pas.</p>
          <Button className="mt-4" onClick={() => navigate({ to: "/prospects" })}>
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Retour aux prospects
          </Button>
        </div>
      </AppLayout>
    );
  }

  // Agents cannot view leads not assigned to them
  if (isAgent && prospect.assignedTo && prospect.assignedTo !== user?.username) {
    return (
      <AppLayout skeleton="detail">
        <div className="p-10 text-center">
          <h2 className="text-xl font-semibold">Accès restreint</h2>
          <p className="text-sm text-muted-foreground mt-2">
            Ce prospect n'est pas dans votre portefeuille.
          </p>
          <Button className="mt-4" onClick={() => navigate({ to: "/prospects" })}>
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Retour aux prospects
          </Button>
        </div>
      </AppLayout>
    );
  }

  const saveComments = async () => {
    await updateProspect(prospect.id, { comment, comment2 });
    toast.success("Commentaires enregistrés");
  };
  const changeStatus = async (status: string) => {
    await updateProspect(prospect.id, { status });
    toast.success("Statut mis à jour", { description: status });
  };
  const changeAssignee = async (assignedTo: string) => {
    await updateProspect(prospect.id, { assignedTo: assignedTo === "__none__" ? null : assignedTo });
    toast.success("Assignation mise à jour");
  };
  const changeType = async (typeId: string) => {
    const next = typeId === "__none__" ? null : typeId;
    try {
      await updateProspect(prospect.id, { typeId: next } as any);
      const label = next ? (types.find((t) => t.id === next)?.name ?? next) : "Aucun type";
      toast.success("Type mis à jour", { description: `« ${label} » — les champs personnalisés ont été adaptés` });
    } catch (e: any) {
      toast.error(e?.message ?? "Échec du changement de type");
    }
  };

  const convertToOpportunity = async () => {
    if (prospect.opportunityId) {
      navigate({ to: "/opportunities" });
      return;
    }
    if (!(await confirmDialog({ title: "Conversion", description: "Convertir ce prospect en opportunité ?", tone: "info", confirmText: "Convertir" }))) return;
    try {
      const r = await api<{ opportunityId: string }>("/prospects.php", {
        method: "POST",
        body: { action: "convert_to_opportunity", id: prospect.id },
      });
      toast.success("Opportunité créée", { description: r.opportunityId });
      qc.invalidateQueries({ queryKey: ["opportunities"] });
      qc.invalidateQueries({ queryKey: ["prospects"] });
      navigate({ to: "/opportunities" });
    } catch (e: any) {
      toast.error(e?.message ?? "Conversion impossible");
    }
  };

  return (
    <AppLayout skeleton="detail">
      <PageHeader
        title={`${prospect.firstName} ${prospect.lastName}`}
        description={`Prospect ${prospect.id} — ${prospect.city || "—"}`}
        icon={<ClipboardList className="h-5 w-5" />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canEdit && (
              <Button size="sm" variant="outline" asChild>
                <Link to="/prospects/$prospectId/edit" params={{ prospectId: prospect.id }}>
                  <Pencil className="h-4 w-4 mr-1.5" />Modifier
                </Link>
              </Button>
            )}
            {canConvert && (
              <Button
                size="sm"
                variant="outline"
                className="border-primary/30 text-primary hover:bg-primary/10"
                onClick={convertToOpportunity}
              >
                <ArrowRightCircle className="h-4 w-4 mr-1.5" />
                {prospect.opportunityId ? "Voir l'opportunité" : "Convertir en opportunité"}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => navigate({ to: "/prospects" })}>
              <ArrowLeft className="h-4 w-4 mr-1.5" />Retour
            </Button>
          </div>
        }
      />

      {restoredMeta && (
        <Card className="mt-4 border-warning/30 bg-warning/10 shadow-elegant">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
            <div>
              <div className="font-medium text-foreground">Prospect restauré depuis une opportunité</div>
              <div className="text-muted-foreground">
                Revenu en file des leads comme nouvelle fiche non attribuée{restoredMeta.restoredAt ? ` · ${new Date(restoredMeta.restoredAt).toLocaleString("fr-FR")}` : ""}
              </div>
            </div>
            <Badge variant="outline" className="border-warning/40 bg-warning/15 text-warning-foreground">À réaffecter</Badge>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
        <div className="lg:col-span-2">
          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList className="h-auto flex-wrap justify-start gap-1 bg-muted/60 p-1">
              <TabsTrigger value="overview" className="gap-1.5"><LayoutGrid className="h-3.5 w-3.5" />Vue d'ensemble</TabsTrigger>
              <TabsTrigger value="attachments" className="gap-1.5"><Paperclip className="h-3.5 w-3.5" />Pièces jointes</TabsTrigger>
              <TabsTrigger value="custom" className="gap-1.5"><Sparkles className="h-3.5 w-3.5" />Champs perso</TabsTrigger>
              <TabsTrigger value="contract-info" className="gap-1.5"><Network className="h-3.5 w-3.5" />Information contrat</TabsTrigger>
              {canViewHistory && (
                <TabsTrigger value="history" className="gap-1.5"><History className="h-3.5 w-3.5" />Historique</TabsTrigger>
              )}
              {canViewHistory && (
                <TabsTrigger value="journey" className="gap-1.5"><History className="h-3.5 w-3.5" />Parcours complet</TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="overview" className="space-y-4 mt-0">
              <ClientIdentityCard
                data={{ ...prospect, typeName: types.find((t) => t.id === prospect.typeId)?.name ?? null }}
                showAncienLigne={showAncienLigne || !!prospect.ancienLigne}
                showAnimateur={isStreetType || !!prospect.animateur}
              />

              <CinDuplicatesCard cin={prospect.cin} currentId={prospect.id} />

              {/* Suivi commercial — historique des actions horodatées */}
              <LeadActionsTimeline prospectId={prospect.id} />

              <Card className="shadow-elegant">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Suivi</CardTitle>
                  <CardDescription>Statut, commentaire et résultat</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Statut d'appel</Label>
                      <Select value={prospect.status} onValueChange={changeStatus} disabled={!canChangeStatus}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {STATUS_FALLBACK.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Assigné à</Label>
                      <Select value={prospect.assignedTo ?? "__none__"} onValueChange={changeAssignee} disabled={!canAssign}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Non attribué</SelectItem>
                          {users.filter((u) => u.role === "Agent" || u.role === "Manager" || u.role === "AgentSuivi" || u.role === "AgentActivation" || u.role === "AgentVente").map((u) => (
                            <SelectItem key={u.username} value={u.username}>{u.fullName} (@{u.username})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {types.length > 0 && (
                      <div className="space-y-1.5">
                        <Label className="text-xs">Type de prospect</Label>
                        <Select value={prospect.typeId ?? "__none__"} onValueChange={changeType} disabled={!canEdit}>
                          <SelectTrigger><SelectValue placeholder="Aucun type" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Aucun type</SelectItem>
                            {types.map((t) => (
                              <SelectItem key={t.id} value={t.id} disabled={!t.active}>
                                {t.name}{!t.active ? " (inactif)" : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs flex items-center gap-1.5"><MessageSquare className="h-3.5 w-3.5" />Observation 1</Label>
                    <Textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Notes de suivi…" disabled={!canEdit} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs flex items-center gap-1.5"><MessageSquare className="h-3.5 w-3.5" />Observation 2</Label>
                    <Textarea rows={3} value={comment2} onChange={(e) => setComment2(e.target.value)} placeholder="Notes complémentaires…" disabled={!canEdit} />
                    {canEdit && (
                      <div className="flex justify-end">
                        <Button size="sm" onClick={saveComments}>Enregistrer les commentaires</Button>
                      </div>
                    )}
                  </div>

                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="attachments" className="mt-0">
              <AttachmentsCard entity="prospect" entityId={prospect.id} />
            </TabsContent>

            <TabsContent value="custom" className="mt-0">
              <CustomFieldsCard
                entity="prospect"
                entityId={prospect.id}
                typeId={prospect.typeId ?? null}
              />
            </TabsContent>

            <TabsContent value="contract-info" className="mt-0">
              <ContractInfoCard entity="prospect" entityId={prospect.id} />
            </TabsContent>

            {canViewHistory && (
              <TabsContent value="history" className="mt-0">
                <LeadHistoryCard prospectId={prospect.id} />
              </TabsContent>
            )}
            {canViewHistory && (
              <TabsContent value="journey" className="mt-0">
                <JourneyTimeline
                  prospectId={prospect.id}
                  opportunityId={prospect.opportunityId ?? restoredMeta?.opportunityId ?? null}
                />
              </TabsContent>
            )}
          </Tabs>
        </div>

        <div className="space-y-4">
          <Card className="shadow-elegant">
            <CardHeader className="pb-3"><CardTitle className="text-base">Synthèse</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Statut</span>
                <Badge variant="outline">{prospect.status}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Créé le</span>
                <span>{prospect.createdAt}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Agent</span>
                <span>{agent ? agent.fullName : <span className="italic text-muted-foreground">Non assigné</span>}</span>
              </div>
            </CardContent>
          </Card>

          {/* Planifier une relance — crée une tâche liée au lead. */}
          <Card className="shadow-elegant">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><BellRing className="h-4 w-4" />Relance</CardTitle>
              <CardDescription>Planifier un rappel pour ce lead</CardDescription>
            </CardHeader>
            <CardContent>
              <PlanRelanceForm prospectId={prospect.id} prospectName={`${prospect.firstName} ${prospect.lastName}`} />
            </CardContent>
          </Card>
        </div>
      </div>

    </AppLayout>
  );
}

function PlanRelanceForm({ prospectId, prospectName }: { prospectId: string; prospectName: string }) {
  const [date, setDate] = useState<string>(() => {
    const d = new Date(); d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!date) { toast.error("Date requise"); return; }
    if (!API_ENABLED) { toast.error("API indisponible"); return; }
    setSaving(true);
    try {
      await api("/tasks.php", {
        method: "POST",
        body: {
          title: `Relance — ${prospectName}`,
          description: note.trim() || null,
          relatedEntity: "prospect",
          relatedId: prospectId,
          dueDate: date,
          priority: "normal",
        },
      });
      // Trace côté actions aussi (best-effort).
      api("/lead_actions.php", {
        method: "POST",
        body: { prospectId, type: "relance", comment: `Relance planifiée le ${date}${note ? " — " + note : ""}` },
      }).catch(() => {});
      toast.success("Relance planifiée");
      setNote("");
    } catch (e: any) {
      toast.error(e?.message ?? "Échec");
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-2">
      <div className="space-y-1.5">
        <Label className="text-xs">Date</Label>
        <DatePicker value={date} onChange={setDate} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Note (optionnel)</Label>
        <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Objet du rappel…" />
      </div>
      <Button size="sm" className="w-full" onClick={submit} disabled={saving}>
        <BellRing className="h-4 w-4 mr-1.5" />{saving ? "…" : "Planifier"}
      </Button>
    </div>
  );
}

function InfoLine({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">{icon}{label}</div>
      <div className="mt-0.5 font-medium truncate">{value}</div>
    </div>
  );
}
