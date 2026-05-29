import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ClipboardList, ExternalLink, History, MapPin, Phone, User, Sparkles, Mail, Calendar, Hash, Tag, MessageSquare } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { api, API_ENABLED } from "@/lib/api";
import type { Prospect, ProspectType } from "@/lib/types";

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

/**
 * Read-only snapshot of the originating prospect — shown on opportunity and
 * contract detail pages so every field captured at lead creation stays visible
 * downstream (customer requirement: "100% des infos prospect dans toutes les
 * étapes").
 */
export function OriginProspectCard({ prospectId }: { prospectId: string | null | undefined }) {
  const [prospect, setProspect] = useState<Prospect | null>(null);
  const [typeName, setTypeName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    if (!prospectId || !API_ENABLED) { setLoading(false); return; }
    setLoading(true); setError(null);
    (async () => {
      try {
        const r = await api<{ prospect: Prospect }>(`/prospects.php?id=${encodeURIComponent(prospectId)}`);
        if (cancel) return;
        setProspect(r.prospect ?? null);
        if (r.prospect?.typeId) {
          try {
            const t = await api<{ types: ProspectType[] }>("/prospect_types.php");
            if (!cancel) setTypeName(t.types?.find((x) => x.id === r.prospect!.typeId)?.name ?? null);
          } catch {}
        }
      } catch (e: any) {
        if (!cancel) setError(e?.message ?? "Lead source introuvable");
      } finally { if (!cancel) setLoading(false); }
    })();
    return () => { cancel = true; };
  }, [prospectId]);

  if (!prospectId) {
    return (
      <Card className="shadow-elegant">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><ClipboardList className="h-4 w-4" />Lead source</CardTitle>
          <CardDescription>Aucun prospect d'origine lié à cette fiche.</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  if (loading) {
    return <Card className="shadow-elegant"><CardContent className="p-6 space-y-2"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-4 w-2/3" /><Skeleton className="h-4 w-1/2" /></CardContent></Card>;
  }
  if (error || !prospect) {
    return (
      <Card className="shadow-elegant">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><ClipboardList className="h-4 w-4" />Lead source</CardTitle>
          <CardDescription>{error ?? `Prospect ${prospectId} introuvable.`}</CardDescription>
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
              <ClipboardList className="h-4 w-4" />
              Lead d'origine — {prospect.civility}. {prospect.firstName} {prospect.lastName}
            </CardTitle>
            <CardDescription>
              ID {prospect.id} · {prospect.source}
              {prospect.status ? <> · <Badge variant="outline" className="ml-1 text-[10px]">{prospect.status}</Badge></> : null}
              {typeName ? <> · <Badge variant="secondary" className="ml-1 text-[10px]">{typeName}</Badge></> : null}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button asChild size="sm" variant="outline">
              <Link to="/journey/$prospectId" params={{ prospectId: prospect.id }}>
                <History className="h-3.5 w-3.5 mr-1.5" />Parcours
              </Link>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
        <Row icon={<User className="h-3.5 w-3.5" />} label="Civilité" value={prospect.civility} />
        <Row icon={<User className="h-3.5 w-3.5" />} label="CIN" value={prospect.cin} />
        <Row icon={<Phone className="h-3.5 w-3.5" />} label="Tél 1" value={prospect.phone} />
        <Row icon={<Phone className="h-3.5 w-3.5" />} label="Tél 2" value={prospect.phone2} />
        <Row icon={<Phone className="h-3.5 w-3.5" />} label="Ancien ligne" value={prospect.ancienLigne} />
        <Row icon={<User className="h-3.5 w-3.5" />} label="Animateur" value={prospect.animateur} />
        <Row icon={<Mail className="h-3.5 w-3.5" />} label="Email" value={prospect.email} />
        <Row icon={<Calendar className="h-3.5 w-3.5" />} label="Date naissance" value={fmt(prospect.birthDate)} />
        <Row icon={<MapPin className="h-3.5 w-3.5" />} label="Gouvernorat" value={prospect.gouvernorat} />
        <Row icon={<MapPin className="h-3.5 w-3.5" />} label="Délégation" value={prospect.delegation} />
        <Row icon={<MapPin className="h-3.5 w-3.5" />} label="Ville" value={prospect.city} />
        <Row icon={<MapPin className="h-3.5 w-3.5" />} label="Zone" value={prospect.zone} />
        <Row icon={<MapPin className="h-3.5 w-3.5" />} label="Adresse" value={prospect.address} />
        <Row icon={<MapPin className="h-3.5 w-3.5" />} label="Code postal" value={prospect.codePostal} />
        <Row
          icon={<MapPin className="h-3.5 w-3.5" />}
          label="Localisation GPS"
          value={prospect.localisationXy ? (
            <a className="text-primary hover:underline" target="_blank" rel="noreferrer"
              href={`https://www.google.com/maps?q=${encodeURIComponent(prospect.localisationXy)}`}>
              {prospect.localisationXy}
            </a>
          ) : ""}
        />
        <Row icon={<Tag className="h-3.5 w-3.5" />} label="Source" value={prospect.source} />
        <Row icon={<Hash className="h-3.5 w-3.5" />} label="Statut d'appel" value={prospect.status} />
        <Row icon={<User className="h-3.5 w-3.5" />} label="Assigné à" value={prospect.assignedTo} />
        <Row icon={<Calendar className="h-3.5 w-3.5" />} label="Créé le" value={fmt(prospect.createdAt)} />
        <Row icon={<Sparkles className="h-3.5 w-3.5" />} label="Résultat" value={prospect.outcome} />
        {prospect.lostReason && <Row icon={<Sparkles className="h-3.5 w-3.5" />} label="Motif perdu" value={prospect.lostReason} />}
        <div className="sm:col-span-2">
          <Row icon={<MessageSquare className="h-3.5 w-3.5" />} label="Observation 1" value={prospect.comment} />
        </div>
        <div className="sm:col-span-2">
          <Row icon={<MessageSquare className="h-3.5 w-3.5" />} label="Observation 2" value={prospect.comment2} />
        </div>
      </CardContent>
    </Card>
  );
}