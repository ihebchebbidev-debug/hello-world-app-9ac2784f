import { useEffect, useState } from "react";
import { User, Clock, Pencil } from "lucide-react";
import { api, API_ENABLED } from "@/lib/api";

type ActivityRow = {
  id: string;
  user?: string | null;
  timestamp?: string | null;
  field?: string | null;
  previousValue?: string | null;
  newValue?: string | null;
};

type AuditRow = {
  id: number;
  createdAt: string;
  user: string | null;
  userRole?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
};

type Props =
  | { kind: "contract"; id: string; createdAt?: string | null; createdBy?: string | null }
  | { kind: "opportunity"; id: string; createdAt?: string | null; createdBy?: string | null };

// Field/action labels FR
const FIELD_FR: Record<string, string> = {
  status: "Statut", stage: "Étape", billing_status: "Statut facturation",
  billingStatus: "Statut facturation", assigned_to: "Assigné à", assignedTo: "Assigné à",
  partner: "Partenaire", cabinet: "Cabinet", premium: "Cotisation",
  signature_date: "Date signature", effective_date: "Date d'effet",
  validation_date: "Date validation", amount: "Montant", probability: "Probabilité",
  expected_close_date: "Date prévisionnelle", phone: "Téléphone", email: "E-mail",
  city: "Ville", notes: "Notes", comment1: "Commentaire", comment2: "Commentaire 2",
  source: "Source", title: "Titre",
};
const ACTION_FR: Record<string, string> = {
  create: "Création", update: "Modification", delete: "Suppression",
  status_change: "Changement de statut", stage_change: "Changement d'étape",
  convert_opportunity: "Converti en opportunité", convert_contract: "Converti en contrat",
  mark_won: "Marqué gagné", mark_lost: "Marqué perdu",
};

/**
 * "Modifié par X · le DATE HH:MM:SS · Champ"
 * Croise activity_log (changements de champ) + audit_log (actions) et garde
 * l'événement le plus récent — c'est la trace exacte de qui a touché quoi.
 */
export function LastModifiedInfo(props: Props) {
  const [act, setAct] = useState<ActivityRow | null>(null);
  const [aud, setAud] = useState<AuditRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    if (!API_ENABLED) { setLoading(false); return; }
    setLoading(true);

    const actQs = props.kind === "contract"
      ? `?contractId=${encodeURIComponent(props.id)}&limit=1`
      : `?entity=opportunity&entity_id=${encodeURIComponent(props.id)}&limit=1`;
    const audQs = `?entity=${props.kind}&entity_id=${encodeURIComponent(props.id)}&limit=1&sort=desc`;

    Promise.allSettled([
      api<{ activity: ActivityRow[] }>(`/activity.php${actQs}`),
      api<{ logs: AuditRow[] }>(`/audit_log.php${audQs}`),
    ]).then(([a, b]) => {
      if (cancel) return;
      setAct(a.status === "fulfilled" ? (a.value.activity?.[0] ?? null) : null);
      setAud(b.status === "fulfilled" ? (b.value.logs?.[0] ?? null) : null);
    }).finally(() => { if (!cancel) setLoading(false); });

    return () => { cancel = true; };
  }, [props.kind, props.id]);

  // Pick most recent of the two sources
  const actTs = act?.timestamp ? new Date(act.timestamp).getTime() : 0;
  const audTs = aud?.createdAt ? new Date(aud.createdAt).getTime() : 0;
  const useAct = actTs >= audTs;

  const modifiedAtRaw =
    (useAct ? act?.timestamp : aud?.createdAt) ?? props.createdAt ?? null;
  const modifiedBy =
    (useAct ? act?.user : aud?.user) ?? props.createdBy ?? null;

  const changedLabel = useAct && act?.field
    ? (FIELD_FR[act.field] ?? act.field)
    : aud?.action
      ? (ACTION_FR[aud.action] ?? aud.action)
      : null;

  const changedDetail = useAct && act && (act.previousValue || act.newValue)
    ? `${act.previousValue || "vide"} → ${act.newValue || "vide"}`
    : null;

  const fmtFull = (d?: string | null) =>
    d ? new Date(d).toLocaleString("fr-FR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }) : "—";

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm rounded-md border bg-muted/30 px-3 py-2">
      <div className="flex items-center gap-2 min-w-0">
        <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Modifié par</div>
          <div className="font-medium truncate" title={modifiedBy || ""}>
            {loading ? "…" : (modifiedBy || "—")}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 min-w-0">
        <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Modifié le</div>
          <div className="font-medium truncate" title={modifiedAtRaw || ""}>
            {loading ? "…" : fmtFull(modifiedAtRaw)}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 min-w-0">
        <Pencil className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Dernier changement</div>
          <div className="font-medium truncate" title={changedDetail || changedLabel || ""}>
            {loading ? "…" : (changedLabel ? (changedDetail ? `${changedLabel} · ${changedDetail}` : changedLabel) : "—")}
          </div>
        </div>
      </div>
    </div>
  );
}
