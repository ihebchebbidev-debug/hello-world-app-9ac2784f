import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Target, ExternalLink, User, Phone, Mail, MapPin, Calendar, CreditCard, Hash, Tag, MessageSquare } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { api, API_ENABLED } from "@/lib/api";
import type { Opportunity } from "@/lib/types";

function Row({ icon, label, value }: { icon?: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 py-1.5">
      {icon && <span className="mt-0.5 text-muted-foreground">{icon}</span>}
      <div className="min-w-0 flex-1">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-sm font-medium break-words">{value || <span className="text-muted-foreground">—</span>}</div>
      </div>
    </div>
  );
}

/** Read-only snapshot of the originating opportunity, shown on the contract detail page. */
export function OriginOpportunityCard({ opportunityId }: { opportunityId: string | null | undefined }) {
  const [opp, setOpp] = useState<Opportunity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    if (!opportunityId || !API_ENABLED) { setLoading(false); return; }
    setLoading(true); setError(null);
    (async () => {
      try {
        const r = await api<{ opportunity: Opportunity }>(`/opportunities.php?id=${encodeURIComponent(opportunityId)}`);
        if (!cancel) setOpp(r.opportunity ?? null);
      } catch (e: any) { if (!cancel) setError(e?.message ?? "Opportunité introuvable"); }
      finally { if (!cancel) setLoading(false); }
    })();
    return () => { cancel = true; };
  }, [opportunityId]);

  if (!opportunityId) return null;
  if (loading) return <Card className="shadow-elegant"><CardContent className="p-6 space-y-2"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-4 w-2/3" /></CardContent></Card>;
  if (error || !opp) {
    return (
      <Card className="shadow-elegant">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Target className="h-4 w-4" />Opportunité d'origine</CardTitle>
          <CardDescription>{error ?? `Opportunité ${opportunityId} introuvable.`}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const fmt = (d?: string | null) => d ? new Date(d).toLocaleDateString("fr-FR") : "";

  return (
    <Card className="shadow-elegant">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="h-4 w-4" />
              Opportunité d'origine — {opp.title || `${opp.firstName} ${opp.lastName}`}
            </CardTitle>
            <CardDescription>
              ID {opp.id}
              {opp.stage ? <> · <Badge variant="outline" className="ml-1 text-[10px]">{opp.stage}</Badge></> : null}
              {opp.source ? <> · {opp.source}</> : null}
            </CardDescription>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link to="/opportunities/$opportunityId" params={{ opportunityId: opp.id }}>
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />Fiche opportunité
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
        <Row icon={<User className="h-3.5 w-3.5" />} label="Civilité" value={opp.civility} />
        <Row icon={<User className="h-3.5 w-3.5" />} label="CIN" value={opp.cin} />
        <Row icon={<Phone className="h-3.5 w-3.5" />} label="Tél 1" value={opp.phone} />
        <Row icon={<Phone className="h-3.5 w-3.5" />} label="Tél 2" value={opp.phone2} />
        <Row icon={<Mail className="h-3.5 w-3.5" />} label="Email" value={opp.email} />
        <Row icon={<Calendar className="h-3.5 w-3.5" />} label="Date naissance" value={fmt(opp.birthDate)} />
        <Row icon={<MapPin className="h-3.5 w-3.5" />} label="Gouvernorat" value={opp.gouvernorat} />
        <Row icon={<MapPin className="h-3.5 w-3.5" />} label="Délégation" value={opp.delegation} />
        <Row icon={<MapPin className="h-3.5 w-3.5" />} label="Ville" value={opp.city} />
        <Row icon={<MapPin className="h-3.5 w-3.5" />} label="Adresse" value={opp.address} />
        <Row icon={<MapPin className="h-3.5 w-3.5" />} label="Code postal" value={opp.codePostal} />
        <Row
          icon={<MapPin className="h-3.5 w-3.5" />}
          label="Localisation GPS"
          value={opp.localisationXy ? (
            <a className="text-primary hover:underline" target="_blank" rel="noreferrer"
              href={`https://www.google.com/maps?q=${encodeURIComponent(opp.localisationXy)}`}>{opp.localisationXy}</a>
          ) : ""}
        />
        <Row icon={<Hash className="h-3.5 w-3.5" />} label="Stage" value={opp.stage} />
        <Row icon={<CreditCard className="h-3.5 w-3.5" />} label="Montant" value={`${(opp.amount ?? 0).toLocaleString("fr-FR")} TND`} />
        <Row icon={<Target className="h-3.5 w-3.5" />} label="Probabilité" value={opp.probability != null ? `${opp.probability} %` : ""} />
        <Row icon={<Calendar className="h-3.5 w-3.5" />} label="Clôture prévue" value={fmt(opp.expectedCloseDate)} />
        <Row icon={<Calendar className="h-3.5 w-3.5" />} label="Créée le" value={fmt(opp.createdAt)} />
        <Row icon={<User className="h-3.5 w-3.5" />} label="Créée par" value={opp.createdBy} />
        <Row icon={<User className="h-3.5 w-3.5" />} label="Assignée à" value={opp.assignedTo} />
        <Row icon={<Tag className="h-3.5 w-3.5" />} label="Source" value={opp.source} />
        <Row icon={<Calendar className="h-3.5 w-3.5" />} label="Convertie le" value={fmt(opp.convertedAt)} />
        <div className="sm:col-span-2">
          <Row icon={<MessageSquare className="h-3.5 w-3.5" />} label="Notes" value={opp.notes} />
        </div>
        <div className="sm:col-span-2">
          <Row icon={<MessageSquare className="h-3.5 w-3.5" />} label="Observation 1" value={opp.comment1} />
        </div>
        <div className="sm:col-span-2">
          <Row icon={<MessageSquare className="h-3.5 w-3.5" />} label="Observation 2" value={opp.comment2} />
        </div>
      </CardContent>
    </Card>
  );
}