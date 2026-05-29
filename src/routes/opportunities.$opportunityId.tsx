import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import {
  Target, ArrowLeft, User, Phone, Mail, MapPin, Calendar, CreditCard,
  LayoutGrid, Paperclip, Sparkles, History, FileSignature, RotateCcw, Hash, Pencil,
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
import { JourneyTimeline } from "@/components/JourneyTimeline";
import { ClientIdentityCard } from "@/components/ClientIdentityCard";
import { LeadHistoryCard } from "@/components/LeadHistoryCard";
import { api, API_ENABLED } from "@/lib/api";
import { useQueryClient } from "@/lib/queryClient";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { Opportunity, PipelineStage } from "@/lib/types";
import { confirmDialog } from "@/components/ConfirmDialogProvider";
import { LastModifiedInfo } from "@/components/LastModifiedInfo";

export const Route = createFileRoute("/opportunities/$opportunityId")({
  head: ({ params }) => ({
    meta: [
      { title: `Opportunité ${params.opportunityId} — CRM` },
      { name: "description", content: "Fiche opportunité : montant, statut, conversion en contrat et pièces jointes." },
    ],
  }),
  component: OpportunityDetailPage,
});

function OpportunityDetailPage() {
  const { opportunityId } = Route.useParams();
  const navigate = useNavigate();
  const { users, refresh } = useErp();
  const qc = useQueryClient();
  const { user, hasPermission } = useAuth();
  const isAdmin = user?.role === "Administrateur";
  const canEdit = hasPermission("opportunity.edit");
  const canConvert = hasPermission("opportunity.convert");
  const canRevert = hasPermission("opportunity.revert");
  const canViewJourney = hasPermission("lead.history");

  const [opp, setOpp] = useState<Opportunity | null>(null);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    if (!API_ENABLED) { setLoading(false); return; }
    try {
      const r = await api<{ opportunity: Opportunity }>(`/opportunities.php?id=${encodeURIComponent(opportunityId)}`);
      setOpp(r.opportunity ?? null);
      setNotes(r.opportunity?.notes ?? "");
    } catch { setOpp(null); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    setLoading(true);
    reload();
    if (API_ENABLED) {
      api<{ stages: PipelineStage[] }>("/opportunity_stages.php")
        .then((r) => setStages([...(r.stages ?? [])].sort((a, b) => a.position - b.position)))
        .catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opportunityId]);

  const agent = useMemo(() => users.find((u) => u.username === opp?.assignedTo), [users, opp]);

  if (loading) {
    return <AppLayout skeleton="detail"><div className="p-10 text-center text-muted-foreground">Chargement…</div></AppLayout>;
  }
  if (!opp) {
    return (
      <AppLayout skeleton="detail">
        <div className="p-10 text-center">
          <h2 className="text-xl font-semibold">Opportunité introuvable</h2>
          <Button className="mt-4" onClick={() => navigate({ to: "/opportunities" })}>
            <ArrowLeft className="h-4 w-4 mr-1.5" />Retour
          </Button>
        </div>
      </AppLayout>
    );
  }

  const patch = async (body: Record<string, any>) => {
    try {
      setBusy(true);
      await api("/opportunities.php", { method: "PATCH", body: { id: opp.id, ...body } });
      await reload();
      toast.success("Mise à jour enregistrée");
    } catch (e: any) { toast.error(e?.message ?? "Échec"); }
    finally { setBusy(false); }
  };

  const convertContract = async () => {
    if (opp.convertedToContract && opp.contractId) {
      navigate({ to: "/contracts/$contractId", params: { contractId: opp.contractId } });
      return;
    }
    if (!(await confirmDialog({ title: "Conversion", description: "Convertir cette opportunité en contrat ?", tone: "info", confirmText: "Convertir" }))) return;
    try {
      setBusy(true);
      const r = await api<{ contractId: string }>("/opportunities.php", { method: "POST", body: { action: "convert_to_contract", id: opp.id } });
      toast.success("Contrat créé", { description: r.contractId });
      try { await refresh?.(); } catch {}
      qc.invalidateQueries({ queryKey: ["contracts"] });
      qc.invalidateQueries({ queryKey: ["opportunities"] });
      navigate({ to: "/contracts/$contractId", params: { contractId: r.contractId } });
    } catch (e: any) { toast.error(e?.message ?? "Échec"); }
    finally { setBusy(false); }
  };

  const revertToLead = async () => {
    if (!(await confirmDialog({ title: "Confirmer l'action", description: "Renvoyer cette opportunité en lead ?", tone: "warning", confirmText: "Continuer" }))) return;
    try {
      setBusy(true);
      const r = await api<{ prospectId?: string | null }>("/opportunities.php", { method: "POST", body: { action: "revert_to_prospect", id: opp.id } });
      // Refresh ERP store so the un-converted prospect shows back up in /prospects.
      try { await refresh?.(); } catch {}
      const restoredAt = new Date().toISOString();
      try {
        sessionStorage.setItem("crm:reverted-prospect", JSON.stringify({ prospectId: r.prospectId, opportunityId: opp.id, restoredAt }));
      } catch {}
      toast.success("Renvoyée en lead", { description: r.prospectId ? `Fiche prospect ${r.prospectId}` : undefined });
      if (r.prospectId) {
        navigate({ to: "/prospects/$prospectId", params: { prospectId: r.prospectId } });
      } else {
        navigate({ to: "/prospects" });
      }
    } catch (e: any) { toast.error(e?.message ?? "Échec"); }
    finally { setBusy(false); }
  };

  return (
    <AppLayout skeleton="detail">
      <PageHeader
        title={opp.title || `${opp.firstName} ${opp.lastName}`}
        description={`Opportunité ${opp.id} — ${opp.city || "—"}`}
        icon={<Target className="h-5 w-5" />}
        actions={
          <div className="flex flex-wrap gap-2">
            {canEdit && !opp.convertedToContract && (
              <Button size="sm" variant="outline" asChild>
                <Link to="/opportunities/$opportunityId/edit" params={{ opportunityId: opp.id }}>
                  <Pencil className="h-4 w-4 mr-1.5" />Modifier
                </Link>
              </Button>
            )}
            {canConvert && !opp.convertedToContract && (
              <Button size="sm" variant="outline" className="border-success/40 text-success hover:bg-success/10" disabled={busy} onClick={convertContract}>
                <FileSignature className="h-4 w-4 mr-1.5" />Convertir en contrat
              </Button>
            )}
            {opp.convertedToContract && opp.contractId && (
              <Button size="sm" variant="outline" onClick={() => navigate({ to: "/contracts/$contractId", params: { contractId: opp.contractId! } })}>
                <FileSignature className="h-4 w-4 mr-1.5" />Voir le contrat
              </Button>
            )}
            {canRevert && !opp.convertedToContract && (
              <Button size="sm" variant="outline" disabled={busy} onClick={revertToLead}>
                <RotateCcw className="h-4 w-4 mr-1.5" />Renvoyer en lead
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => navigate({ to: "/opportunities" })}>
              <ArrowLeft className="h-4 w-4 mr-1.5" />Retour
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
        <div className="lg:col-span-2">
          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList className="h-auto flex-wrap justify-start gap-1 bg-muted/60 p-1">
              <TabsTrigger value="overview" className="gap-1.5"><LayoutGrid className="h-3.5 w-3.5" />Vue d'ensemble</TabsTrigger>
              <TabsTrigger value="attachments" className="gap-1.5"><Paperclip className="h-3.5 w-3.5" />Pièces jointes</TabsTrigger>
              <TabsTrigger value="custom" className="gap-1.5"><Sparkles className="h-3.5 w-3.5" />Champs perso</TabsTrigger>
              <TabsTrigger value="contract-info" className="gap-1.5"><Network className="h-3.5 w-3.5" />Information contrat</TabsTrigger>
              {canViewJourney && (
                <TabsTrigger value="journey" className="gap-1.5"><History className="h-3.5 w-3.5" />Parcours complet</TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="overview" className="space-y-4 mt-0">
              <ClientIdentityCard
                data={opp as any}
                title="Identité du prospect"
                description="Snapshot complet du lead — propagé sur l'opportunité"
                enrichFromProspectId={opp.prospectId}
              />

              <Card className="shadow-elegant">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Détails de l'opportunité</CardTitle>
                  <CardDescription>Montant, statut et probabilité</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <InfoLine icon={<Hash className="h-3.5 w-3.5" />} label="ID" value={opp.id} />
                    <InfoLine icon={<Target className="h-3.5 w-3.5" />} label="Titre" value={opp.title || "—"} />
                    <InfoLine icon={<CreditCard className="h-3.5 w-3.5" />} label="Montant" value={`${opp.amount?.toLocaleString("fr-FR") ?? 0} TND`} />
                    <InfoLine icon={<Target className="h-3.5 w-3.5" />} label="Probabilité" value={`${opp.probability ?? 0} %`} />
                    <InfoLine icon={<Calendar className="h-3.5 w-3.5" />} label="Clôture prévue" value={opp.expectedCloseDate ? new Date(opp.expectedCloseDate).toLocaleDateString("fr-FR") : "—"} />
                    <InfoLine icon={<Calendar className="h-3.5 w-3.5" />} label="Créée le" value={new Date(opp.createdAt).toLocaleDateString("fr-FR")} />
                    <InfoLine icon={<User className="h-3.5 w-3.5" />} label="Créer par" value={opp.createdBy || "—"} />
                    {/* Source retirée — déduite du type de prospect. */}
                    {opp.convertedAt && <InfoLine icon={<Calendar className="h-3.5 w-3.5" />} label="Convertie le" value={new Date(opp.convertedAt).toLocaleDateString("fr-FR")} />}
                    {opp.prospectId && (
                      <InfoLine icon={<User className="h-3.5 w-3.5" />} label="Lead source" value={opp.prospectId} />
                    )}
                  </div>

                  <LastModifiedInfo kind="opportunity" id={opp.id} createdAt={opp.createdAt} createdBy={opp.createdBy} />


                  {canEdit && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Statut</Label>
                        <Select value={opp.stage} onValueChange={(v) => patch({ stage: v })} disabled={busy}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {stages.length > 0 ? stages.map((s) => (
                              <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                            )) : <SelectItem value={opp.stage}>{opp.stage}</SelectItem>}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Assigné à</Label>
                        <Select value={opp.assignedTo ?? "__none__"} onValueChange={(v) => patch({ assignedTo: v === "__none__" ? null : v })} disabled={busy}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Non attribué</SelectItem>
                            {users.map((u) => <SelectItem key={u.username} value={u.username}>{u.fullName} (@{u.username})</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Montant (TND)</Label>
                        <Input type="number" defaultValue={opp.amount} onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (!Number.isNaN(v) && v !== opp.amount) patch({ amount: v });
                        }} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Probabilité (%)</Label>
                        <Input type="number" min={0} max={100} defaultValue={opp.probability} onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (!Number.isNaN(v) && v !== opp.probability) patch({ probability: v });
                        }} />
                      </div>
                    </div>
                  )}

                  <div className="space-y-1.5 pt-3 border-t">
                    <Label className="text-xs">Notes</Label>
                    <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!canEdit} />
                    {canEdit && (
                      <div className="flex justify-end">
                        <Button size="sm" disabled={busy || notes === (opp.notes ?? "")} onClick={() => patch({ notes })}>
                          Enregistrer
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="attachments" className="mt-0">
              <AttachmentsCard
                entity="opportunity"
                entityId={opp.id}
                extraSources={opp.prospectId ? [{ entity: "prospect", entityId: opp.prospectId, label: "Prospect" }] : []}
              />
            </TabsContent>

            <TabsContent value="custom" className="mt-0">
              <CustomFieldsCard entity="opportunity" entityId={opp.id} typeId={opp.typeId ?? null} />
            </TabsContent>

            <TabsContent value="contract-info" className="mt-0">
              <ContractInfoCard entity="opportunity" entityId={opp.id} />
            </TabsContent>


            {canViewJourney && (
              <TabsContent value="journey" className="mt-0">
                <JourneyTimeline
                  prospectId={opp.prospectId ?? opp.id}
                  opportunityId={opp.id}
                  contractId={opp.contractId ?? null}
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
                <Badge variant="secondary">{opp.stage}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Montant</span>
                <span className="font-medium">{(opp.amount ?? 0).toLocaleString("fr-FR")} TND</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Probabilité</span>
                <span className="font-medium">{opp.probability ?? 0} %</span>
              </div>
              {/* Source retirée — déduite du type de prospect. */}
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Créée le</span>
                <span>{new Date(opp.createdAt).toLocaleDateString("fr-FR")}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Conversion</span>
                {opp.convertedToContract
                  ? <Badge className="bg-success">Convertie</Badge>
                  : <Badge variant="outline">En cours</Badge>}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Agent</span>
                <span>{agent ? agent.fullName : <span className="italic text-muted-foreground">Non assigné</span>}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-elegant">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Agent assigné</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              {agent ? (
                <div className="space-y-1">
                  <div className="font-medium">{agent.fullName}</div>
                  <div className="text-xs text-muted-foreground">@{agent.username} · {agent.role}</div>
                  <div className="text-xs text-muted-foreground">{agent.email}</div>
                </div>
              ) : <p className="text-muted-foreground">Non attribué</p>}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}

function InfoLine({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-muted-foreground mt-0.5">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="font-medium truncate">{value}</div>
      </div>
    </div>
  );
}
