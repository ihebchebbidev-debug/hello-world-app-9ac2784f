// Admin-friendly full-screen view of a customer's journey (lead → opportunity → contract).
// Shows the linked entities header + the unified timeline + print/export.
import { createFileRoute, Link, Navigate, useNavigate } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowLeft, History, Printer, ClipboardList, Target, FileText, Eye, ChevronUp, Phone, Mail, MapPin, Calendar, User, Building2, CreditCard, Hash } from "lucide-react";
import { JourneyTimeline } from "@/components/JourneyTimeline";
import { AttachmentsCard } from "@/components/AttachmentsCard";
import { useErp } from "@/lib/erpStore";
import { useAuth } from "@/lib/auth";
import { api, API_ENABLED } from "@/lib/api";
import { useQueryClient } from "@/lib/queryClient";
import { useEffect, useMemo, useState } from "react";
import type { Opportunity, Prospect } from "@/lib/types";
import { printPage } from "@/lib/exportUtils";
import { toast } from "sonner";
import { FileSignature, Paperclip, ArrowRightCircle } from "lucide-react";
import { confirmDialog } from "@/components/ConfirmDialogProvider";

export const Route = createFileRoute("/journey/$prospectId")({
  head: ({ params }) => ({
    meta: [
      { title: `Parcours client ${params.prospectId} — CRM` },
      { name: "description", content: "Vue complète admin: tous les événements du lead au contrat." },
    ],
  }),
  component: JourneyPage,
});

function JourneyPage() {
  const { prospectId } = Route.useParams();
  const navigate = useNavigate();
  const { user, hasPermission } = useAuth();
  const { prospects, contracts } = useErp();
  const qc = useQueryClient();
  const canView =
    !!user && (user.role === "Administrateur" || hasPermission("lead.history"));
  if (user && !canView) return <Navigate to="/" />;

  const storeProspect = useMemo(() => prospects.find((p) => p.id === prospectId), [prospects, prospectId]);
  const [remoteProspect, setRemoteProspect] = useState<Prospect | null>(null);
  const prospect = storeProspect ?? remoteProspect;
  const [opp, setOpp] = useState<Opportunity | null>(null);
  const [showFullJourney, setShowFullJourney] = useState(false);
  const [converting, setConverting] = useState(false);

  // API fallback when prospect isn't in local store (e.g. admin opens by ID).
  useEffect(() => {
    if (storeProspect || !API_ENABLED) return;
    api<{ prospect: Prospect }>(`/prospects.php?id=${encodeURIComponent(prospectId)}`)
      .then((r) => setRemoteProspect(r.prospect ?? null))
      .catch(() => setRemoteProspect(null));
  }, [storeProspect, prospectId]);

  useEffect(() => {
    if (!API_ENABLED) return;
    if (!prospect?.opportunityId) { setOpp(null); return; }
    api<{ opportunity: Opportunity }>(`/opportunities.php?id=${encodeURIComponent(prospect.opportunityId)}`)
      .then((r) => setOpp(r.opportunity ?? null))
      .catch(() => setOpp(null));
  }, [prospect?.opportunityId]);

  const contract = useMemo(
    () => contracts.find((c) => c.opportunityId === (opp?.id ?? prospect?.opportunityId)) ?? null,
    [contracts, opp?.id, prospect?.opportunityId],
  );

  const convertToOpportunity = async () => {
    if (!prospect) return;
    if (prospect.opportunityId) { navigate({ to: "/opportunities" }); return; }
    if (!(await confirmDialog({ title: "Conversion", description: "Convertir ce prospect en opportunité ?", tone: "info", confirmText: "Convertir" }))) return;
    try {
      setConverting(true);
      const r = await api<{ opportunityId: string }>("/prospects.php", {
        method: "POST", body: { action: "convert_to_opportunity", id: prospect.id },
      });
      toast.success("Opportunité créée", { description: r.opportunityId });
      qc.invalidateQueries({ queryKey: ["opportunities"] });
      qc.invalidateQueries({ queryKey: ["prospects"] });
      navigate({ to: "/opportunities" });
    } catch (e: any) { toast.error(e?.message ?? "Conversion impossible"); }
    finally { setConverting(false); }
  };

  const convertToContract = async () => {
    if (!opp) return;
    if (opp.convertedToContract && opp.contractId) {
      navigate({ to: "/contracts/$contractId", params: { contractId: opp.contractId } });
      return;
    }
    if (!(await confirmDialog({ title: "Conversion", description: "Convertir cette opportunité en contrat ?", tone: "info", confirmText: "Convertir" }))) return;
    try {
      setConverting(true);
      const r = await api<{ contractId: string }>("/opportunities.php", {
        method: "POST", body: { action: "convert_to_contract", id: opp.id },
      });
      toast.success("Contrat créé", { description: r.contractId });
      qc.invalidateQueries({ queryKey: ["contracts"] });
      qc.invalidateQueries({ queryKey: ["opportunities"] });
      navigate({ to: "/contracts/$contractId", params: { contractId: r.contractId } });
    } catch (e: any) { toast.error(e?.message ?? "Conversion impossible"); }
    finally { setConverting(false); }
  };


  return (
    <AppLayout>
      <PageHeader
        title={`Parcours — ${prospect ? `${prospect.firstName} ${prospect.lastName}` : prospectId}`}
        description="Vue admin complète : du premier contact à la signature ou à la perte."
        icon={<History className="h-5 w-5" />}
        actions={
          <div className="flex flex-wrap gap-2">
            {prospect && !prospect.opportunityId && (
              <Button size="sm" variant="outline" className="border-primary/30 text-primary hover:bg-primary/10"
                disabled={converting} onClick={convertToOpportunity}>
                <ArrowRightCircle className="h-4 w-4 mr-1.5" />Convertir en opportunité
              </Button>
            )}
            {opp && !opp.convertedToContract && (
              <Button size="sm" variant="outline" className="border-success/40 text-success hover:bg-success/10"
                disabled={converting} onClick={convertToContract}>
                <FileSignature className="h-4 w-4 mr-1.5" />Convertir en contrat
              </Button>
            )}
            {opp?.convertedToContract && opp.contractId && (
              <Button size="sm" variant="outline" onClick={() => navigate({ to: "/contracts/$contractId", params: { contractId: opp.contractId! } })}>
                <FileText className="h-4 w-4 mr-1.5" />Voir contrat
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => printPage()}>
              <Printer className="h-4 w-4 mr-1.5" />Imprimer
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate({ to: "/prospects/$prospectId", params: { prospectId } })}>
              <ArrowLeft className="h-4 w-4 mr-1.5" />Fiche lead
            </Button>
          </div>
        }
      />


      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
        {/* LEAD details */}
        <Card className="shadow-elegant border-primary/30">
          <CardHeader className="pb-3 bg-primary/5">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-primary" />Lead
              </CardTitle>
              {prospect && (
                <Link to="/prospects/$prospectId" params={{ prospectId }}>
                  <Badge variant="outline" className="text-[10px] cursor-pointer hover:bg-accent">Ouvrir fiche</Badge>
                </Link>
              )}
            </div>
            <CardDescription className="text-xs">
              {prospect ? `${prospect.civility}. ${prospect.firstName} ${prospect.lastName}` : "Lead introuvable"}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-3 space-y-1.5 text-xs">
            {prospect ? (
              <>
                <DetailRow icon={<Hash className="h-3 w-3" />} label="ID" value={prospect.id} />
                <DetailRow icon={<User className="h-3 w-3" />} label="CIN" value={prospect.cin || "—"} />
                <DetailRow icon={<Phone className="h-3 w-3" />} label="Tél" value={prospect.phone + (prospect.phone2 ? ` / ${prospect.phone2}` : "")} />
                <DetailRow icon={<Mail className="h-3 w-3" />} label="Email" value={prospect.email || "—"} />
                <DetailRow icon={<MapPin className="h-3 w-3" />} label="Localisation" value={[prospect.gouvernorat, prospect.delegation, prospect.city].filter(Boolean).join(" · ") || "—"} />
                <DetailRow icon={<Calendar className="h-3 w-3" />} label="Créé le" value={new Date(prospect.createdAt).toLocaleDateString("fr-FR")} />
                <div className="flex flex-wrap gap-1 pt-2 border-t mt-2">
                  <Badge variant="secondary" className="text-[10px]">{prospect.status}</Badge>
                  <Badge variant="outline" className="text-[10px]">Source: {prospect.source}</Badge>
                  <Badge variant="outline" className="text-[10px]">@{prospect.assignedTo ?? "non assigné"}</Badge>
                  {prospect.outcome !== "pending" && (
                    <Badge className={`text-[10px] ${prospect.outcome === "won" ? "bg-success" : "bg-destructive"}`}>
                      {prospect.outcome === "won" ? "Gagné" : "Perdu"}
                    </Badge>
                  )}
                </div>
                {prospect.comment && (
                  <p className="text-muted-foreground italic mt-2 line-clamp-2">"{prospect.comment}"</p>
                )}
              </>
            ) : <p className="text-muted-foreground">Aucune donnée</p>}
          </CardContent>
        </Card>

        {/* OPPORTUNITY details */}
        <Card className="shadow-elegant border-info/30">
          <CardHeader className="pb-3 bg-info/5">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Target className="h-4 w-4 text-info" />Opportunité
              </CardTitle>
              {opp && (
                <Link to="/opportunities">
                  <Badge variant="outline" className="text-[10px] cursor-pointer hover:bg-accent">Ouvrir liste</Badge>
                </Link>
              )}
            </div>
            <CardDescription className="text-xs">
              {opp ? (opp.title || opp.id) : "Non convertie"}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-3 space-y-1.5 text-xs">
            {opp ? (
              <>
                <DetailRow icon={<Hash className="h-3 w-3" />} label="ID" value={opp.id} />
                <DetailRow icon={<CreditCard className="h-3 w-3" />} label="Montant" value={`${opp.amount?.toLocaleString("fr-FR") ?? 0} TND`} />
                <DetailRow icon={<Target className="h-3 w-3" />} label="Probabilité" value={`${opp.probability ?? 0} %`} />
                <DetailRow icon={<Calendar className="h-3 w-3" />} label="Clôture prévue" value={opp.expectedCloseDate ? new Date(opp.expectedCloseDate).toLocaleDateString("fr-FR") : "—"} />
                <DetailRow icon={<Calendar className="h-3 w-3" />} label="Créée le" value={new Date(opp.createdAt).toLocaleDateString("fr-FR")} />
                {opp.convertedAt && <DetailRow icon={<Calendar className="h-3 w-3" />} label="Convertie le" value={new Date(opp.convertedAt).toLocaleDateString("fr-FR")} />}
                <div className="flex flex-wrap gap-1 pt-2 border-t mt-2">
                  <Badge variant="secondary" className="text-[10px]">{opp.stage}</Badge>
                  <Badge variant="outline" className="text-[10px]">Source: {opp.source}</Badge>
                  <Badge variant="outline" className="text-[10px]">@{opp.assignedTo ?? "non assigné"}</Badge>
                  {opp.convertedToContract && <Badge className="text-[10px] bg-success">→ Contrat</Badge>}
                </div>
                {opp.notes && <p className="text-muted-foreground italic mt-2 line-clamp-2">"{opp.notes}"</p>}
              </>
            ) : <p className="text-muted-foreground">Le lead n'a pas encore été converti en opportunité.</p>}
          </CardContent>
        </Card>

        {/* CONTRACT details */}
        <Card className="shadow-elegant border-success/30">
          <CardHeader className="pb-3 bg-success/5">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <FileText className="h-4 w-4 text-success" />Contrat
              </CardTitle>
              {contract && (
                <Link to="/contracts/$contractId" params={{ contractId: contract.id }}>
                  <Badge variant="outline" className="text-[10px] cursor-pointer hover:bg-accent">Ouvrir fiche</Badge>
                </Link>
              )}
            </div>
            <CardDescription className="text-xs">
              {contract ? `${contract.firstName} ${contract.lastName}` : "Aucun contrat"}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-3 space-y-1.5 text-xs">
            {contract ? (
              <>
                <DetailRow icon={<Hash className="h-3 w-3" />} label="ID" value={contract.id} />
                <DetailRow icon={<Building2 className="h-3 w-3" />} label="Partenaire" value={contract.partner || "—"} />
                <DetailRow icon={<Building2 className="h-3 w-3" />} label="Cabinet" value={contract.cabinet || "—"} />
                <DetailRow icon={<CreditCard className="h-3 w-3" />} label="Prime" value={`${contract.premium?.toLocaleString("fr-FR") ?? 0} TND`} />
                <DetailRow icon={<Calendar className="h-3 w-3" />} label="Signature" value={contract.signatureDate ? new Date(contract.signatureDate).toLocaleDateString("fr-FR") : "—"} />
                <DetailRow icon={<Calendar className="h-3 w-3" />} label="Effet" value={contract.effectiveDate ? new Date(contract.effectiveDate).toLocaleDateString("fr-FR") : "—"} />
                {contract.validationDate && <DetailRow icon={<Calendar className="h-3 w-3" />} label="Validé le" value={new Date(contract.validationDate).toLocaleDateString("fr-FR")} />}
                <div className="flex flex-wrap gap-1 pt-2 border-t mt-2">
                  <Badge variant="secondary" className="text-[10px]">{contract.billingStatus}</Badge>
                  <Badge variant="outline" className="text-[10px]">@{contract.assignedTo}</Badge>
                </div>
              </>
            ) : <p className="text-muted-foreground">Aucun contrat lié à ce parcours.</p>}
          </CardContent>
        </Card>
      </div>

      {prospect && (
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="shadow-elegant">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Paperclip className="h-4 w-4" />Pièces jointes — Lead
              </CardTitle>
              <CardDescription className="text-xs">Documents attachés au prospect</CardDescription>
            </CardHeader>
            <CardContent>
              <AttachmentsCard entity="prospect" entityId={prospect.id} />
            </CardContent>
          </Card>
          {contract && (
            <Card className="shadow-elegant">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Paperclip className="h-4 w-4" />Pièces jointes — Contrat
                </CardTitle>
                <CardDescription className="text-xs">Documents attachés au contrat</CardDescription>
              </CardHeader>
              <CardContent>
                <AttachmentsCard entity="contract" entityId={contract.id} />
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <div className="mt-6">
        {!showFullJourney ? (
          <Card className="shadow-elegant">
            <CardContent className="p-6 flex flex-col items-center justify-center gap-3 text-center">
              <div className="rounded-full bg-muted p-3">
                <History className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <div className="font-semibold text-sm">Parcours complet masqué</div>
                <p className="text-xs text-muted-foreground mt-0.5 max-w-md">
                  Consultez d'abord les informations initiales ci-dessus. Cliquez pour charger l'historique détaillé (appels, RDV, étapes pipeline, signatures…).
                </p>
              </div>
              <Button size="sm" onClick={() => setShowFullJourney(true)}>
                <Eye className="h-4 w-4 mr-1.5" />Voir le parcours complet
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowFullJourney(false)}>
                <ChevronUp className="h-4 w-4 mr-1.5" />Masquer le parcours
              </Button>
            </div>
            <JourneyTimeline
              prospectId={prospectId}
              opportunityId={opp?.id ?? prospect?.opportunityId ?? null}
              contractId={contract?.id ?? null}
            />
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-muted-foreground mt-0.5">{icon}</span>
      <span className="text-muted-foreground min-w-[80px]">{label}</span>
      <span className="font-medium text-foreground truncate flex-1">{value}</span>
    </div>
  );
}
