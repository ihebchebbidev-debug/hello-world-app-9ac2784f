import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import {
  FileText, ArrowLeft, Download, Printer, FileJson, FileSpreadsheet,
  Calendar as CalendarIcon, PhoneCall, FileSignature, CheckCircle2, Clock,
  Mail, Phone, MapPin, User, Building2, Euro, Pencil, History, Activity, ArrowRight, X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { useErp } from "@/lib/erpStore";
import { useAuth } from "@/lib/auth";
import { formatAmount, useCurrency, type Currency } from "@/lib/currency";
import { api, API_ENABLED } from "@/lib/api";
import type { PipelineStage } from "@/lib/types";

import { exportCSV, exportJSON, exportXLSX, printPage } from "@/lib/exportUtils";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AttachmentsCard } from "@/components/AttachmentsCard";
import { CustomFieldsCard } from "@/components/CustomFieldsCard";
import { ContractInfoCard } from "@/components/ContractInfoCard";
import { Network } from "lucide-react";
import { JourneyTimeline } from "@/components/JourneyTimeline";
import { ClientIdentityCard } from "@/components/ClientIdentityCard";
import { OriginOpportunityCard } from "@/components/OriginOpportunityCard";
import { LeadHistoryCard } from "@/components/LeadHistoryCard";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { LayoutGrid, Paperclip, ListChecks, Sparkles, RotateCcw } from "lucide-react";
import { confirmDialog } from "@/components/ConfirmDialogProvider";
import { LastModifiedInfo } from "@/components/LastModifiedInfo";

export const Route = createFileRoute("/contracts/$contractId")({
  head: ({ params }) => ({
    meta: [
      { title: `Contrat ${params.contractId} — CRM` },
      { name: "description", content: "Détail du contrat: parcours client, cotisation, facturation et export." },
    ],
  }),
  component: ContractDetailsPage,
  notFoundComponent: () => (
    <AppLayout skeleton="detail">
      <div className="p-10 text-center">
        <h2 className="text-xl font-semibold">Contrat introuvable</h2>
        <Link to="/contracts" className="text-primary text-sm mt-2 inline-block">← Retour aux contrats</Link>
      </div>
    </AppLayout>
  ),
});

// Couleurs par défaut pour les libellés legacy ; les nouveaux statuts héritent
// de la couleur configurée côté admin via /pipelines.
const billingColor: Record<string, string> = {
  "Validé Confirmation": "bg-success/15 text-success border-success/20",
  "En attente de validation": "bg-warning/15 text-warning-foreground border-warning/20",
  "Annuler la confirmation": "bg-destructive/15 text-destructive border-destructive/20",
  "Pré-validé": "bg-info/15 text-info border-info/20",
};
const colorClass = (c?: string) =>
  c ? `bg-${c}/15 text-${c} border-${c}/20` : "bg-muted text-muted-foreground border-border";

type TimelineItem = {
  id: string;
  date: string;
  time?: string;
  type: "rdv" | "rappel" | "signature" | "validation" | "creation";
  title: string;
  description?: string;
  done: boolean;
};

function ContractDetailsPage() {
  const { contractId } = Route.useParams();
  const navigate = useNavigate();
  const { contracts, refresh } = useErp();

  const storeContract = contracts.find((c) => c.id === contractId);

  // If the contract is missing from the local store (e.g. just created via
  // "Convertir en opportunité" → "Convertir en contrat", or filtered out by
  // pagination/role scope), fetch it directly by ID from the API and trigger
  // a background store refresh. This avoids a false 404 right after conversion
  // even if the global list does not include the new row.
  const [remoteContract, setRemoteContract] = useState<import("@/lib/types").Contract | null>(null);
  const [lookupState, setLookupState] = useState<"idle" | "loading" | "missing">("idle");
  useEffect(() => {
    if (storeContract) { setLookupState("idle"); setRemoteContract(null); return; }
    if (!API_ENABLED) { setLookupState("missing"); return; }
    let cancelled = false;
    setLookupState("loading");
    Promise.resolve(refresh?.()).catch(() => {});
    api<{ contract: import("@/lib/types").Contract }>(`/contracts.php?id=${encodeURIComponent(contractId)}`)
      .then((r) => { if (!cancelled) { setRemoteContract(r.contract ?? null); setLookupState(r.contract ? "idle" : "missing"); } })
      .catch(() => { if (!cancelled) setLookupState("missing"); });
    return () => { cancelled = true; };
  }, [storeContract, contractId, refresh]);

  const contract = storeContract ?? remoteContract;

  if (!contract) {
    if (lookupState !== "missing") {
      return <AppLayout skeleton="detail"><div /></AppLayout>;
    }
    return (
      <AppLayout skeleton="detail">
        <div className="p-10 text-center">
          <h2 className="text-xl font-semibold">Contrat introuvable</h2>
          <p className="text-sm text-muted-foreground mt-2">L'identifiant {contractId} n'existe pas dans la base.</p>
          <Button className="mt-4" onClick={() => navigate({ to: "/contracts" })}>
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Retour aux contrats
          </Button>
        </div>
      </AppLayout>
    );
  }

  // Render the actual content in a dedicated component so its hook order is
  // stable across renders (only mounted once `contract` is non-null).
  return <ContractDetailsView contract={contract} />;
}

function ContractDetailsView({ contract }: { contract: import("@/lib/types").Contract }) {
  const navigate = useNavigate();
  const { prospects, users, events: calendarEvents, updateContractBilling, updateContractPremium, getContractActivity, logActivity, refresh } = useErp();
  const { user, hasPermission } = useAuth();
  const isAgent = user?.role === "Agent" || user?.role === "AgentSuivi" || user?.role === "AgentActivation" || user?.role === "AgentVente";
  const isAdmin = user?.role === "Administrateur";
  const canRevert = hasPermission("contract.revert");
  const canEdit = hasPermission("contract.edit");
  const currency = useCurrency();
  const [reverting, setReverting] = useState<null | "opportunity" | "prospect">(null);

  const [stages, setStages] = useState<PipelineStage[]>([]);
  useEffect(() => {
    if (!API_ENABLED) return;
    api<{ stages: PipelineStage[] }>("/contract_stages.php")
      .then((r) => setStages([...(r.stages ?? [])].sort((a, b) => a.position - b.position)))
      .catch(() => {});
  }, []);
  const stageByName = useMemo(() => Object.fromEntries(stages.map((s) => [s.name, s])), [stages]);

  if (isAgent && contract.assignedTo !== user?.username) {
    return (
      <AppLayout skeleton="detail">
        <div className="p-10 text-center">
          <h2 className="text-xl font-semibold">Accès restreint</h2>
          <p className="text-sm text-muted-foreground mt-2">Ce contrat n'est pas dans votre portefeuille.</p>
          <Button className="mt-4" onClick={() => navigate({ to: "/contracts" })}>
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Retour aux contrats
          </Button>
        </div>
      </AppLayout>
    );
  }


  const linkedProspect = useMemo(
    () => prospects.find((p) => p.lastName === contract.lastName && p.firstName === contract.firstName),
    [prospects, contract],
  );
  const agent = useMemo(() => users.find((u) => u.username === contract.assignedTo), [users, contract]);

  const timeline: TimelineItem[] = useMemo(() => {
    const items: TimelineItem[] = [];
    // Lead creation
    if (linkedProspect) {
      items.push({
        id: "creation",
        date: linkedProspect.createdAt,
        type: "creation",
        title: "Lead créé",
        description: "",
        done: true,
      });
    }
    // Related calendar events for this contact's last name
    const related = calendarEvents
      .filter((e) => e.title.toLowerCase().includes(contract.lastName.toLowerCase()))
      .slice(0, 4);
    related.forEach((e) =>
      items.push({
        id: e.id,
        date: e.date,
        time: e.time,
        type: e.type,
        title: e.type === "rdv" ? "Rendez-vous" : e.type === "rappel" ? "Rappel client" : "Signature programmée",
        description: `Avec @${e.agent}`,
        done: new Date(e.date) <= new Date(),
      }),
    );
    // Signature
    items.push({
      id: "sig",
      date: contract.signatureDate,
      type: "signature",
      title: "Contrat signé",
      description: contract.partner,
      done: true,
    });
    // Validation
    if (contract.validationDate) {
      items.push({
        id: "val",
        date: contract.validationDate,
        type: "validation",
        title: "Validation backoffice",
        description: contract.billingStatus,
        done: contract.billingStatus === "Validé Confirmation",
      });
    } else {
      items.push({
        id: "val",
        date: "—",
        type: "validation",
        title: "Validation backoffice",
        description: "En attente de traitement",
        done: false,
      });
    }
    // Sort by date asc
    return items.sort((a, b) => (a.date === "—" ? 1 : b.date === "—" ? -1 : a.date.localeCompare(b.date)));
  }, [contract, linkedProspect]);

  const handleExportCSV = () => {
    exportCSV(`contrat-${contract.id}.csv`, [
      {
        id: contract.id,
        nom: contract.lastName,
        prenom: contract.firstName,
        partenaire: contract.partner,
        cotisation: contract.premium,
        statut: contract.billingStatus,
        date_signature: contract.signatureDate,
        date_validation: contract.validationDate ?? "",
        source: contract.source,
        agent: contract.assignedTo,
      },
    ]);
    toast.success("Export Excel généré");
  };

  const handleExportJSON = () => {
    exportJSON(`contrat-${contract.id}.json`, { contract, timeline, agent: agent?.fullName, prospect: linkedProspect });
    toast.success("Export JSON généré");
  };

  const handleStatusChange = (status: string) => {
    updateContractBilling(contract.id, status as typeof contract.billingStatus);
    toast.success("Statut mis à jour", { description: status });
  };

  return (
    <AppLayout skeleton="detail">
      <PageHeader
        title={`${contract.firstName} ${contract.lastName}`}
        description={`Contrat ${contract.id}${contract.partner ? ` — ${contract.partner}` : ""}`}
        icon={<FileText className="h-5 w-5" />}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => navigate({ to: "/contracts" })}>
              <ArrowLeft className="h-4 w-4 mr-1.5" />Retour
            </Button>
            {canEdit && (
              <Button variant="outline" size="sm" asChild>
                <Link to="/contracts/$contractId/edit" params={{ contractId: contract.id }}>
                  <Pencil className="h-4 w-4 mr-1.5" />Modifier
                </Link>
              </Button>
            )}
            {canRevert && (
              <Button
                size="sm"
                variant="outline"
                disabled={reverting !== null}
                className="border-warning/30 text-warning-foreground hover:bg-warning/10"
                onClick={async () => {
                  if (reverting) return;
                  if (!(await confirmDialog({ title: "Suppression", description: "Renvoyer ce contrat dans la liste des opportunités ? Le contrat sera supprimé.", tone: "destructive", confirmText: "Supprimer" }))) return;
                  setReverting("opportunity");
                  try {
                    await api<{ opportunityId: string }>("/contracts.php", {
                      method: "POST",
                      body: { action: "revert_to_opportunity", id: contract.id },
                    });
                    toast.success("Contrat retourné en opportunité");
                    await refresh();
                    navigate({ to: "/opportunities" });
                  } catch (e: any) { toast.error(e?.message ?? "Échec"); setReverting(null); }
                }}
              >
                <RotateCcw className={`h-4 w-4 mr-1.5 ${reverting === "opportunity" ? "animate-spin" : ""}`} />Retour opportunité
              </Button>
            )}
            {canRevert && (
              <Button
                size="sm"
                variant="outline"
                disabled={reverting !== null}
                className="border-warning/30 text-warning-foreground hover:bg-warning/10"
                onClick={async () => {
                  if (reverting) return;
                  if (!(await confirmDialog({ title: "Suppression", description: "Renvoyer ce contrat directement dans la liste des leads ? Le contrat (et son opportunité d'origine) seront supprimés.", tone: "destructive", confirmText: "Supprimer" }))) return;
                  setReverting("prospect");
                  try {
                    await api<{ prospectId: string }>("/contracts.php", {
                      method: "POST",
                      body: { action: "revert_to_prospect", id: contract.id },
                    });
                    toast.success("Contrat retourné en lead");
                    await refresh();
                    navigate({ to: "/prospects" });
                  } catch (e: any) { toast.error(e?.message ?? "Échec"); setReverting(null); }
                }}
              >
                <RotateCcw className={`h-4 w-4 mr-1.5 ${reverting === "prospect" ? "animate-spin" : ""}`} />Retour lead
              </Button>
            )}
            {hasPermission("contract.export") && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm"><Download className="h-4 w-4 mr-1.5" />Exporter</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuLabel className="text-xs">Format</DropdownMenuLabel>
                  <DropdownMenuItem onClick={handleExportCSV}>
                    <FileSpreadsheet className="h-4 w-4 mr-2" />Excel
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExportJSON}>
                    <FileJson className="h-4 w-4 mr-2" />JSON
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={printPage}>
                    <Printer className="h-4 w-4 mr-2" />Imprimer / PDF
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
        {/* Left column — summary */}
        <div className="lg:col-span-2">
          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList className="h-auto flex-wrap justify-start gap-1 bg-muted/60 p-1">
              <TabsTrigger value="overview" className="gap-1.5"><LayoutGrid className="h-3.5 w-3.5" />Vue d'ensemble</TabsTrigger>
              {contract.opportunityId && (
                <TabsTrigger value="sources" className="gap-1.5"><User className="h-3.5 w-3.5" />Opportunité source</TabsTrigger>
              )}
              <TabsTrigger value="activity" className="gap-1.5"><Activity className="h-3.5 w-3.5" />Activité</TabsTrigger>
              {(hasPermission("lead.history")) && (
                <TabsTrigger value="journey" className="gap-1.5"><History className="h-3.5 w-3.5" />Parcours complet</TabsTrigger>
              )}
              <TabsTrigger value="attachments" className="gap-1.5"><Paperclip className="h-3.5 w-3.5" />Pièces jointes</TabsTrigger>
              <TabsTrigger value="custom" className="gap-1.5"><Sparkles className="h-3.5 w-3.5" />Champs perso</TabsTrigger>
              <TabsTrigger value="contract-info" className="gap-1.5"><Network className="h-3.5 w-3.5" />Information contrat</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4 mt-0">
              <ClientIdentityCard
                data={contract as any}
                title="Identité du prospect"
                description="Snapshot complet du lead — propagé sur le contrat"
                enrichFromProspectId={(contract as any).prospectId ?? null}
              />
              <Card className="shadow-elegant">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <CardTitle className="text-base">Résumé du contrat</CardTitle>
                      <CardDescription>Partenaire et statut de facturation</CardDescription>
                    </div>
                    <Badge variant="outline" className={billingColor[contract.billingStatus] ?? colorClass(stageByName[contract.billingStatus]?.color)}>
                      {contract.billingStatus}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Field label="Partenaire" icon={<Building2 className="h-3.5 w-3.5" />} value={contract.partner} />
                    <Field label="Date signature" icon={<FileSignature className="h-3.5 w-3.5" />} value={contract.signatureDate} />
                    <Field label="Date validation" icon={<CheckCircle2 className="h-3.5 w-3.5" />} value={contract.validationDate ?? "—"} />
                  </div>
                  <LastModifiedInfo
                    kind="contract"
                    id={contract.id}
                    createdAt={(contract as any).createdAt ?? (contract as any).signatureDate ?? null}
                    createdBy={(contract as any).createdBy ?? null}
                  />
                </CardContent>
              </Card>

              {/* Actions */}
              {canEdit && (
                <Card className="shadow-elegant">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Actions facturation</CardTitle>
                    <CardDescription>Changer le statut de facturation</CardDescription>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Statut de facturation</Label>
                      <Select value={contract.billingStatus} onValueChange={handleStatusChange}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(stages.length ? stages.map((s) => s.name) : [contract.billingStatus]).map((s) => (
                            <SelectItem key={s} value={s}>{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="md:col-span-2 flex flex-wrap gap-2 pt-2 border-t border-border">
                      {stages.filter((s) => s.isWon).slice(0, 1).map((s) => (
                        <Button key={s.id} size="sm" variant="outline" onClick={() => handleStatusChange(s.name)} className="border-success/30 text-success hover:bg-success/10">
                          <CheckCircle2 className="h-4 w-4 mr-1.5" />{s.name}
                        </Button>
                      ))}
                      {stages.filter((s) => s.isLost).slice(0, 1).map((s) => (
                        <Button key={s.id} size="sm" variant="outline" onClick={() => handleStatusChange(s.name)} className="border-destructive/30 text-destructive hover:bg-destructive/10">
                          <X className="h-4 w-4 mr-1.5" />{s.name}
                        </Button>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Timeline */}
              <Card className="shadow-elegant">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Parcours client</CardTitle>
                  <CardDescription>RDV, rappels et signature de l'adhérent</CardDescription>
                </CardHeader>
                <CardContent>
                  <ol className="relative border-l border-border ml-3 space-y-5">
                    {timeline.map((t) => (
                      <li key={t.id} className="ml-6">
                        <span
                          className={`absolute -left-3 flex h-6 w-6 items-center justify-center rounded-full ring-4 ring-background ${
                            t.done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                          }`}
                        >
                          <TimelineIcon type={t.type} />
                        </span>
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <h4 className="text-sm font-semibold">{t.title}</h4>
                          <span className="text-xs text-muted-foreground">
                            {t.date}{t.time ? ` • ${t.time}` : ""}
                          </span>
                          {!t.done && <Badge variant="outline" className="bg-muted text-muted-foreground text-[10px] py-0">à venir</Badge>}
                        </div>
                        {t.description && <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>}
                      </li>
                    ))}
                  </ol>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="activity" className="mt-0">
              <ActivityLogCard entries={getContractActivity(contract.id)} />
            </TabsContent>

            {(hasPermission("lead.history")) && (
              <TabsContent value="journey" className="mt-0">
                <JourneyTimeline
                  prospectId={(contract as any).prospectId ?? contract.opportunityId ?? contract.id}
                  opportunityId={contract.opportunityId ?? null}
                  contractId={contract.id}
                />
              </TabsContent>
            )}

            <TabsContent value="attachments" className="mt-0">
              <AttachmentsCard
                entity="contract"
                entityId={contract.id}
                extraSources={[
                  ...((contract as any).prospectId ? [{ entity: "prospect" as const, entityId: (contract as any).prospectId as string, label: "Prospect" }] : []),
                  ...(contract.opportunityId ? [{ entity: "opportunity" as const, entityId: contract.opportunityId, label: "Opportunité" }] : []),
                ]}
                onAdded={(a) => logActivity(contract.id, "attachment_added", "", `${a.filename} (${(a.sizeBytes/1024).toFixed(1)} Ko)`)}
                onRemoved={(a) => logActivity(contract.id, "attachment_removed", `${a.filename} (${(a.sizeBytes/1024).toFixed(1)} Ko)`, "")}
              />
            </TabsContent>

            <TabsContent value="custom" className="mt-0">
              <CustomFieldsCard entity="contract" entityId={contract.id} />
            </TabsContent>

            <TabsContent value="contract-info" className="mt-0">
              <ContractInfoCard entity="contract" entityId={contract.id} />
            </TabsContent>

            {contract.opportunityId && (
              <TabsContent value="sources" className="mt-0 space-y-4">
                <OriginOpportunityCard opportunityId={contract.opportunityId} />
                <CustomFieldsCard entity="opportunity" entityId={contract.opportunityId} />
              </TabsContent>
            )}
          </Tabs>
        </div>


        {/* Right column — synthèse + adhérent + agent (mirrors prospect detail layout) */}
        <div className="space-y-4">
          <Card className="shadow-elegant">
            <CardHeader className="pb-3"><CardTitle className="text-base">Synthèse</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Statut</span>
                <Badge variant="outline" className={billingColor[contract.billingStatus] ?? colorClass(stageByName[contract.billingStatus]?.color)}>
                  {contract.billingStatus}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Partenaire</span>
                <span className="font-medium truncate">{contract.partner || "—"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Prime</span>
                <span className="font-medium">{formatAmount(contract.premium ?? 0, currency as Currency)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Signature</span>
                <span>{contract.signatureDate ? new Date(contract.signatureDate).toLocaleDateString("fr-FR") : "—"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Agent</span>
                <span>{agent ? agent.fullName : <span className="italic text-muted-foreground">Non assigné</span>}</span>
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-elegant">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Adhérent</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold">
                  {contract.firstName[0]}{contract.lastName[0]}
                </div>
                <div>
                  <div className="font-semibold">{contract.firstName} {contract.lastName}</div>
                  <div className="text-xs text-muted-foreground">Adhérent #{contract.id}</div>
                </div>
              </div>
              {linkedProspect && (
                <div className="space-y-2 pt-2 border-t border-border text-sm">
                  <InfoLine icon={<Phone className="h-3.5 w-3.5" />} value={linkedProspect.phone} />
                  <InfoLine icon={<Mail className="h-3.5 w-3.5" />} value={linkedProspect.email} />
                  <InfoLine icon={<MapPin className="h-3.5 w-3.5" />} value={linkedProspect.city} />
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-elegant">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Agent</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {agent ? (
                <>
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-accent text-accent-foreground flex items-center justify-center font-semibold text-sm">
                      {agent.fullName.split(" ").map((n) => n[0]).join("")}
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{agent.fullName}</div>
                      <div className="text-xs text-muted-foreground truncate">@{agent.username} • {agent.team}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border text-center">
                    <Stat label="Contrats" value={agent.contractsWon} />
                    <Stat label="Leads" value={agent.leadsHandled} />
                    <Stat label="Conv." value={`${agent.conversionRate.toFixed(1)}%`} />
                  </div>
                </>
              ) : (
                <div className="text-sm text-muted-foreground flex items-center gap-2">
                  <User className="h-4 w-4" />Non assigné
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}

function TimelineIcon({ type }: { type: TimelineItem["type"] }) {
  switch (type) {
    case "rdv": return <CalendarIcon className="h-3 w-3" />;
    case "rappel": return <PhoneCall className="h-3 w-3" />;
    case "signature": return <FileSignature className="h-3 w-3" />;
    case "validation": return <CheckCircle2 className="h-3 w-3" />;
    case "creation": return <User className="h-3 w-3" />;
  }
}

function Field({ label, value, icon, highlight }: { label: string; value: string; icon?: React.ReactNode; highlight?: boolean }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">{icon}{label}</div>
      <div className={`mt-1 ${highlight ? "text-lg font-semibold" : "text-sm font-medium"}`}>{value}</div>
    </div>
  );
}

function InfoLine({ icon, value }: { icon: React.ReactNode; value: string }) {
  return (
    <div className="flex items-center gap-2 text-muted-foreground">
      {icon}<span className="truncate text-foreground">{value}</span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <div className="text-base font-semibold">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}

function PremiumEditor({ value, currency, onSave }: { value: number; currency: Currency; onSave: (v: number) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(String(value));
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setDraft(String(value)); }}>
      <div className="flex items-center gap-2">
        <Input value={formatAmount(value, currency)} readOnly className="bg-muted/30" />
        <DialogTrigger asChild>
          <Button variant="outline" size="icon"><Pencil className="h-4 w-4" /></Button>
        </DialogTrigger>
      </div>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Modifier la cotisation</DialogTitle>
          <DialogDescription>Saisissez le nouveau montant annuel.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5 py-2">
          <Label htmlFor="premium-edit">Montant ({currency.symbol})</Label>
          <Input id="premium-edit" type="number" value={draft} onChange={(e) => setDraft(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => { onSave(Number(draft) || 0); setOpen(false); }}>Enregistrer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ActivityLogCard({ entries }: { entries: import("@/lib/erpStore").ActivityEntry[] }) {
  const [fieldFilter, setFieldFilter] = useState<"all" | "billingStatus" | "premium" | "attachment_added" | "attachment_removed">("all");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const fieldLabel = (f: string) =>
    f === "billingStatus" ? "Statut facturation"
      : f === "premium" ? "Cotisation"
      : f === "attachment_added" ? "Pièce jointe ajoutée"
      : f === "attachment_removed" ? "Pièce jointe supprimée"
      : f;
  const fieldKind = (f: string) =>
    f === "premium" ? "montant"
      : f === "billingStatus" ? "statut"
      : f === "attachment_added" ? "ajout"
      : f === "attachment_removed" ? "suppression"
      : "";
  const formatTs = (iso: string) => {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (fieldFilter !== "all" && e.field !== fieldFilter) return false;
      if (from && e.timestamp.slice(0, 10) < from) return false;
      if (to && e.timestamp.slice(0, 10) > to) return false;
      if (search) {
        const q = search.toLowerCase();
        const hay = `${e.previousValue} ${e.newValue} ${e.user}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [entries, fieldFilter, from, to, search]);

  const exportRows = () =>
    filtered.map((e) => ({
      Date: formatTs(e.timestamp),
      Utilisateur: e.user,
      Champ: fieldLabel(e.field),
      "Ancienne valeur": e.previousValue,
      "Nouvelle valeur": e.newValue,
    }));

  const handleExportCSV = () => {
    if (filtered.length === 0) { toast.error("Aucune entrée à exporter"); return; }
    exportCSV(`activite-${new Date().toISOString().slice(0, 10)}.csv`, exportRows());
    toast.success("Journal exporté en Excel");
  };
  const handleExportXLSX = async () => {
    if (filtered.length === 0) { toast.error("Aucune entrée à exporter"); return; }
    await exportXLSX(`activite-${new Date().toISOString().slice(0, 10)}.xlsx`, exportRows(), "Activité");
    toast.success("Journal exporté en Excel");
  };

  const reset = () => { setFieldFilter("all"); setSearch(""); setFrom(""); setTo(""); };

  return (
    <Card className="shadow-elegant">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <History className="h-4 w-4" />Journal d'activité
            </CardTitle>
            <CardDescription>Historique des changements de statut et de cotisation</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-muted text-muted-foreground">
              {filtered.length} / {entries.length}
            </Badge>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={entries.length === 0}>
                  <Download className="h-4 w-4 mr-1.5" />Exporter
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel className="text-xs">Format</DropdownMenuLabel>
                <DropdownMenuItem onClick={handleExportCSV}>
                  <FileSpreadsheet className="h-4 w-4 mr-2" />Excel
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportXLSX}>
                  <FileSpreadsheet className="h-4 w-4 mr-2" />Excel (.xlsx)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 pt-3">
          <div className="md:col-span-2">
            <Input
              placeholder="Rechercher (valeur, utilisateur)…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <Select value={fieldFilter} onValueChange={(v) => setFieldFilter(v as typeof fieldFilter)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les champs</SelectItem>
              <SelectItem value="billingStatus">Statut facturation</SelectItem>
              <SelectItem value="premium">Cotisation</SelectItem>
              <SelectItem value="attachment_added">Pièces jointes — ajout</SelectItem>
              <SelectItem value="attachment_removed">Pièces jointes — suppression</SelectItem>
            </SelectContent>
          </Select>
          <DatePicker value={from} onChange={setFrom} placeholder="Du" size="sm" />
          <div className="flex gap-1">
            <DatePicker value={to} onChange={setTo} placeholder="Au" size="sm" />
            {(fieldFilter !== "all" || search || from || to) && (
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={reset} aria-label="Réinitialiser">
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
            <Activity className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-sm">Aucune activité enregistrée pour le moment.</p>
            <p className="text-xs mt-1">Les modifications de statut ou de cotisation apparaîtront ici.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            Aucune entrée ne correspond aux filtres.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((e) => {
              const isAttach = e.field === "attachment_added" || e.field === "attachment_removed";
              const isRemove = e.field === "attachment_removed";
              return (
                <li key={e.id} className="py-3 flex items-start gap-3">
                  <div className="h-8 w-8 rounded-full bg-accent text-accent-foreground flex items-center justify-center text-[11px] font-semibold shrink-0">
                    {e.user.split(".").map((p) => p[0]).join("").slice(0, 2)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="text-sm font-medium">{fieldLabel(e.field)}</span>
                      <Badge variant="outline" className="text-[10px] py-0 bg-muted/50">{fieldKind(e.field)}</Badge>
                      <span className="text-xs text-muted-foreground ml-auto">{formatTs(e.timestamp)}</span>
                    </div>
                    {isAttach ? (
                      <div className="mt-1 flex items-center gap-2 text-xs flex-wrap">
                        <span className={`px-2 py-0.5 rounded-md font-medium ${isRemove ? "bg-destructive/10 text-destructive line-through" : "bg-success/10 text-success"}`}>
                          {e.newValue || e.previousValue}
                        </span>
                      </div>
                    ) : (
                      <div className="mt-1 flex items-center gap-2 text-xs flex-wrap">
                        <span className="px-2 py-0.5 rounded-md bg-muted text-muted-foreground line-through">{e.previousValue}</span>
                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                        <span className="px-2 py-0.5 rounded-md bg-success/10 text-success font-medium">{e.newValue}</span>
                      </div>
                    )}
                    <div className="text-[11px] text-muted-foreground mt-1">par @{e.user}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
