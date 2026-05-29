// Shared "100% prospect identity" card.
//
// Customer requirement: every field captured at lead creation (civility,
// contacts, animateur/ancien ligne, CIN, naissance, géo + GPS, code postal,
// observations, type, source…) must remain visible on the prospect,
// opportunity AND contract detail pages.
//
// Backend already snapshots these fields when a prospect is converted
// (cf. backend/php/conversion_helpers.php), so the same component can render
// the data directly off a Prospect, Opportunity or Contract row.

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  User, Phone, Mail, MapPin, Calendar, Hash, Tag, MessageSquare, Sparkles,
  ClipboardList, Building2,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { api, API_ENABLED } from "@/lib/api";
import type { Prospect } from "@/lib/types";

/** Loose shape: every field is optional so the same component works for the 3 entities. */
export type ClientIdentityData = {
  civility?: "M" | "Mme" | string | null;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  phone2?: string | null;
  ancienLigne?: string | null;
  animateur?: string | null;
  cin?: string | null;
  birthDate?: string | null;
  email?: string | null;
  source?: string | null;
  status?: string | null;            // lead status
  city?: string | null;
  zone?: string | null;
  gouvernorat?: string | null;
  delegation?: string | null;
  address?: string | null;
  localisationXy?: string | null;
  codePostal?: string | null;
  comment?: string | null;            // prospect.comment
  comment1?: string | null;           // opportunity / contract snapshot
  comment2?: string | null;
  outcome?: string | null;
  lostReason?: string | null;
  assignedTo?: string | null;
  createdAt?: string | null;
  typeName?: string | null;           // resolved label (optional)
};

function Row({ icon, label, value }: { icon?: ReactNode; label: string; value: ReactNode }) {
  const empty = value === null || value === undefined || value === "";
  return (
    <div className="flex items-start gap-2 py-1.5">
      {icon && <span className="mt-0.5 text-muted-foreground shrink-0">{icon}</span>}
      <div className="min-w-0 flex-1">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-sm font-medium break-words">
          {empty ? <span className="text-muted-foreground">—</span> : value}
        </div>
      </div>
    </div>
  );
}

const fmtDate = (d?: string | null) => {
  if (!d) return "";
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? d : t.toLocaleDateString("fr-FR");
};

export function ClientIdentityCard({
  data,
  title = "Identité du prospect",
  description = "Toutes les informations saisies au lead sont conservées ici",
  showAnimateur = true,
  showAncienLigne = true,
  headerExtra,
  enrichFromProspectId,
}: {
  data: ClientIdentityData;
  title?: string;
  description?: string;
  showAnimateur?: boolean;
  showAncienLigne?: boolean;
  headerExtra?: ReactNode;
  /** When provided, fetches the originating prospect and fills any missing
   *  identity field on top of the local snapshot. Use on opportunity/contract
   *  pages so 100% of the lead info is visible even if the snapshot is
   *  partial (e.g. ancienLigne/animateur/zone/outcome…). */
  enrichFromProspectId?: string | null;
}) {
  const [enrich, setEnrich] = useState<Partial<ClientIdentityData> | null>(null);

  useEffect(() => {
    let cancel = false;
    if (!enrichFromProspectId || !API_ENABLED) { setEnrich(null); return; }
    (async () => {
      try {
        const r = await api<{ prospect: Prospect }>(`/prospects.php?id=${encodeURIComponent(enrichFromProspectId)}`);
        if (cancel || !r?.prospect) return;
        const p = r.prospect;
        setEnrich({
          civility: p.civility, firstName: p.firstName, lastName: p.lastName,
          phone: p.phone, phone2: p.phone2, ancienLigne: p.ancienLigne, animateur: p.animateur,
          cin: p.cin, birthDate: p.birthDate, email: p.email,
          source: p.source, status: p.status,
          city: p.city, zone: p.zone, gouvernorat: p.gouvernorat, delegation: p.delegation,
          address: p.address, localisationXy: p.localisationXy, codePostal: p.codePostal,
          comment: p.comment, comment2: p.comment2,
          outcome: p.outcome, lostReason: p.lostReason,
          assignedTo: p.assignedTo, createdAt: p.createdAt,
        });
      } catch { /* keep local snapshot */ }
    })();
    return () => { cancel = true; };
  }, [enrichFromProspectId]);

  // Merge: local snapshot wins; fallback to prospect for any empty field.
  const pick = <K extends keyof ClientIdentityData>(k: K): ClientIdentityData[K] => {
    const v = data[k];
    if (v !== null && v !== undefined && v !== "") return v;
    return (enrich?.[k] ?? v) as ClientIdentityData[K];
  };
  const m: ClientIdentityData = {
    civility: pick("civility"), firstName: pick("firstName"), lastName: pick("lastName"),
    phone: pick("phone"), phone2: pick("phone2"), ancienLigne: pick("ancienLigne"), animateur: pick("animateur"),
    cin: pick("cin"), birthDate: pick("birthDate"), email: pick("email"),
    source: pick("source"), status: pick("status"),
    city: pick("city"), zone: pick("zone"), gouvernorat: pick("gouvernorat"), delegation: pick("delegation"),
    address: pick("address"), localisationXy: pick("localisationXy"), codePostal: pick("codePostal"),
    comment: pick("comment"), comment1: pick("comment1"), comment2: pick("comment2"),
    outcome: pick("outcome"), lostReason: pick("lostReason"),
    assignedTo: pick("assignedTo"), createdAt: pick("createdAt"), typeName: data.typeName,
  };

  const fullName = [m.civility ? `${m.civility}.` : null, m.firstName, m.lastName]
    .filter(Boolean).join(" ").trim();
  const obs1 = m.comment ?? m.comment1 ?? null;

  return (
    <Card className="shadow-elegant">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardList className="h-4 w-4" />
              {title}
            </CardTitle>
            <CardDescription className="flex flex-wrap items-center gap-1.5">
              <span>{description}</span>
              {m.source && <Badge variant="outline" className="text-[10px]">{m.source}</Badge>}
              {m.status && <Badge variant="outline" className="text-[10px]">{m.status}</Badge>}
              {m.typeName && <Badge variant="secondary" className="text-[10px]">{m.typeName}</Badge>}
            </CardDescription>
          </div>
          {headerExtra}
        </div>
      </CardHeader>
      <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
        {fullName && (
          <div className="sm:col-span-2">
            <Row icon={<User className="h-3.5 w-3.5" />} label="Nom complet" value={fullName} />
          </div>
        )}
        <Row icon={<User className="h-3.5 w-3.5" />} label="Civilité" value={m.civility} />
        <Row icon={<Hash className="h-3.5 w-3.5" />} label="CIN" value={m.cin} />
        <Row icon={<Phone className="h-3.5 w-3.5" />} label="GSM 1" value={m.phone} />
        <Row icon={<Phone className="h-3.5 w-3.5" />} label="GSM 2" value={m.phone2} />
        {showAncienLigne && (
          <Row icon={<Phone className="h-3.5 w-3.5" />} label="Ancien ligne" value={m.ancienLigne} />
        )}
        {showAnimateur && (
          <Row icon={<User className="h-3.5 w-3.5" />} label="Animateur" value={m.animateur} />
        )}
        <Row icon={<Mail className="h-3.5 w-3.5" />} label="Email" value={m.email} />
        <Row icon={<Calendar className="h-3.5 w-3.5" />} label="Date naissance" value={fmtDate(m.birthDate)} />
        <Row icon={<MapPin className="h-3.5 w-3.5" />} label="Gouvernorat" value={m.gouvernorat} />
        <Row icon={<MapPin className="h-3.5 w-3.5" />} label="Délégation" value={m.delegation} />
        <Row icon={<MapPin className="h-3.5 w-3.5" />} label="Ville" value={m.city} />
        <Row icon={<MapPin className="h-3.5 w-3.5" />} label="Zone" value={m.zone} />
        <Row icon={<MapPin className="h-3.5 w-3.5" />} label="Code postal" value={m.codePostal} />
        <Row
          icon={<MapPin className="h-3.5 w-3.5" />}
          label="Localisation GPS"
          value={m.localisationXy ? (
            <a
              className="text-primary hover:underline"
              target="_blank" rel="noreferrer"
              href={`https://www.google.com/maps?q=${encodeURIComponent(m.localisationXy)}`}
            >
              {m.localisationXy}
            </a>
          ) : ""}
        />
        <div className="sm:col-span-2">
          <Row icon={<Building2 className="h-3.5 w-3.5" />} label="Adresse" value={m.address} />
        </div>
        <Row icon={<Tag className="h-3.5 w-3.5" />} label="Source" value={m.source} />
        <Row icon={<User className="h-3.5 w-3.5" />} label="Assigné à" value={m.assignedTo} />
        {m.createdAt && (
          <Row icon={<Calendar className="h-3.5 w-3.5" />} label="Créé le" value={fmtDate(m.createdAt)} />
        )}
        {m.outcome && (
          <Row icon={<Sparkles className="h-3.5 w-3.5" />} label="Résultat" value={m.outcome} />
        )}
        {m.lostReason && (
          <Row icon={<Sparkles className="h-3.5 w-3.5" />} label="Motif perdu" value={m.lostReason} />
        )}
        <div className="sm:col-span-2">
          <Row icon={<MessageSquare className="h-3.5 w-3.5" />} label="Observation 1" value={obs1} />
        </div>
        <div className="sm:col-span-2">
          <Row icon={<MessageSquare className="h-3.5 w-3.5" />} label="Observation 2" value={m.comment2} />
        </div>
      </CardContent>
    </Card>
  );
}
