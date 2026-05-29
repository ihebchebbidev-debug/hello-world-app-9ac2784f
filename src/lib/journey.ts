// Unified customer journey aggregator.
//
// Merges, for one prospect (and its derived opportunity/contract), every
// recorded event across:
//   - /audit_log.php       (system actions: login, conversions, deletes, etc.)
//   - /activity.php        (field-level changes: assignedTo, stage, premium…)
//   - /lead_actions.php    (sales actions: appel, visite, relance, note…)
//
// Returned items are normalized into a single shape and sorted chronologically
// so the UI can render a "from-first-contact-to-contract-lost" timeline.

import { api, API_ENABLED } from "./api";

export type JourneyKind =
  | "creation"
  | "assignment"
  | "stage_change"
  | "field_change"
  | "conversion"
  | "revert"
  | "lost"
  | "won"
  | "action"        // commercial action (call, visit, note…)
  | "attachment"
  | "auth"
  | "delete"
  | "other";

export type JourneyEntity = "prospect" | "opportunity" | "contract" | "system";

export type JourneyEvent = {
  id: string;
  timestamp: string;             // ISO
  kind: JourneyKind;
  entity: JourneyEntity;
  entityId: string | null;
  user: string | null;           // username
  userRole: string | null;
  title: string;                 // short label (FR)
  description?: string | null;   // longer text or "old → new"
  meta?: Record<string, unknown>;
  ip?: string | null;
};

export type JourneyBundle = {
  prospectId: string;
  opportunityId: string | null;
  contractId: string | null;
  events: JourneyEvent[];
};

// ---------- Label dictionaries (kept in FR to match the rest of the app) ----------

const ACTION_LABELS: Record<string, string> = {
  login: "Connexion",
  logout: "Déconnexion",
  login_failed: "Échec de connexion",
  otp_verify: "Vérification OTP",
  create: "Création",
  update: "Modification",
  delete: "Suppression",
  claim: "Prise en charge",
  assign: "Assignation",
  status_change: "Changement de statut",
  stage_change: "Changement d'étape",
  note_add: "Note ajoutée",
  call_log: "Appel enregistré",
  validate: "Validation",
  cancel: "Annulation",
  convert_opportunity: "Conversion → Opportunité",
  convert_contract: "Conversion → Contrat",
  revert_lead: "Retour → Lead",
  revert_opportunity: "Retour → Opportunité",
  mark_won: "Marqué Gagné",
  mark_lost: "Marqué Perdu",
};

const FIELD_LABELS: Record<string, string> = {
  status: "Statut",
  stage: "Étape",
  stage_id: "Étape",
  stageId: "Étape",
  billingStatus: "Statut facturation",
  billing_status: "Statut facturation",
  assigned_to: "Assigné à",
  assignedTo: "Assigné à",
  partner: "Partenaire",
  cabinet: "Cabinet",
  premium: "Cotisation",
  signature_date: "Date signature",
  effective_date: "Date d'effet",
  validation_date: "Date validation",
  validationDate: "Date validation",
  outcome: "Résultat",
  lost_reason: "Motif de perte",
  lostReason: "Motif de perte",
  comment: "Commentaire",
  comment2: "Commentaire 2",
  source: "Source",
  city: "Ville",
  phone: "Téléphone",
  email: "E-mail",
  amount: "Montant",
  probability: "Probabilité",
  expected_close_date: "Date prévisionnelle",
};

export function fieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key;
}
export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action.replace(/[._]/g, " ");
}

function entityFor(t?: string | null): JourneyEntity {
  switch ((t ?? "").toLowerCase()) {
    case "prospect":
    case "lead":
      return "prospect";
    case "opportunity":
      return "opportunity";
    case "contract":
      return "contract";
    default:
      return "system";
  }
}

function kindFor(action: string, field?: string | null): JourneyKind {
  if (action === "create") return "creation";
  if (action === "delete") return "delete";
  if (action === "claim" || action === "assign" || field === "assigned_to" || field === "assignedTo")
    return "assignment";
  if (action.startsWith("convert")) return "conversion";
  if (action.startsWith("revert")) return "revert";
  if (action === "mark_won") return "won";
  if (action === "mark_lost") return "lost";
  if (action === "status_change" || action === "stage_change" ||
      field === "status" || field === "stage" || field === "billingStatus" || field === "billing_status")
    return "stage_change";
  if (action === "login" || action === "logout" || action === "login_failed" || action === "otp_verify")
    return "auth";
  if (action === "call_log" || action === "note_add") return "action";
  if (field) return "field_change";
  return "other";
}

// ---------- Loaders (independent, parallelizable) ----------

type AuditRow = {
  id: number; createdAt: string; user: string | null; userRole: string | null;
  action: string; entityType: string | null; entityId: string | null;
  ip?: string | null; details?: string | null;
};

type ActivityRow = {
  id: string; entityType?: string; entityId?: string;
  field: string; previousValue: string; newValue: string;
  user: string; timestamp: string;
};

type LeadActionRow = {
  id: string; type: string; note?: string | null;
  user?: string | null; createdAt: string;
};

async function fetchAudit(entity: JourneyEntity, id: string): Promise<JourneyEvent[]> {
  if (!API_ENABLED) return [];
  try {
    const r = await api<{ logs: AuditRow[] }>("/audit_log.php", {
      query: { entity, entity_id: id, limit: 500, sort: "asc" },
    });
    return (r.logs ?? []).map((l) => {
      let parsed: any = null;
      if (l.details) { try { parsed = JSON.parse(l.details); } catch { parsed = l.details; } }
      const field = parsed && typeof parsed === "object" ? (parsed.field ?? null) : null;
      const k = kindFor(l.action, field);
      const desc = parsed && typeof parsed === "object"
        ? (parsed.previousValue !== undefined || parsed.newValue !== undefined
            ? `${parsed.previousValue ?? "—"} → ${parsed.newValue ?? "—"}`
            : (parsed.reason ?? parsed.note ?? null))
        : (typeof parsed === "string" ? parsed : null);
      return {
        id: `audit-${l.id}`,
        timestamp: l.createdAt,
        kind: k,
        entity: entityFor(l.entityType ?? entity),
        entityId: l.entityId ?? id,
        user: l.user, userRole: l.userRole,
        title: actionLabel(l.action) + (field ? ` · ${fieldLabel(field)}` : ""),
        description: desc,
        meta: parsed && typeof parsed === "object" ? parsed : undefined,
        ip: l.ip ?? null,
      } satisfies JourneyEvent;
    });
  } catch { return []; }
}

async function fetchActivity(entity: JourneyEntity, id: string): Promise<JourneyEvent[]> {
  if (!API_ENABLED) return [];
  try {
    const r = await api<{ activity: ActivityRow[] }>(
      `/activity.php?entity=${encodeURIComponent(entity)}&entity_id=${encodeURIComponent(id)}&limit=500`,
    );
    return (r.activity ?? []).map((a) => ({
      id: `act-${a.id}`,
      timestamp: a.timestamp,
      kind: kindFor("update", a.field),
      entity,
      entityId: id,
      user: a.user, userRole: null,
      title: fieldLabel(a.field),
      description: `${a.previousValue || "vide"} → ${a.newValue || "vide"}`,
      meta: { field: a.field, previousValue: a.previousValue, newValue: a.newValue },
    } satisfies JourneyEvent));
  } catch { return []; }
}

async function fetchLeadActions(prospectId: string): Promise<JourneyEvent[]> {
  if (!API_ENABLED) return [];
  try {
    const r = await api<{ actions: LeadActionRow[] }>(
      `/lead_actions.php?prospect_id=${encodeURIComponent(prospectId)}&limit=500`,
    );
    return (r.actions ?? []).map((a) => ({
      id: `la-${a.id}`,
      timestamp: a.createdAt,
      kind: "action",
      entity: "prospect",
      entityId: prospectId,
      user: a.user ?? null, userRole: null,
      title: a.type ? a.type.charAt(0).toUpperCase() + a.type.slice(1) : "Action",
      description: a.note ?? null,
      meta: { type: a.type },
    } satisfies JourneyEvent));
  } catch { return []; }
}

// ---------- Public API ----------

/**
 * Build the full journey for a prospect, walking through any linked
 * opportunity and contract. Returns a chronologically sorted list.
 */
export async function loadProspectJourney(args: {
  prospectId: string;
  opportunityId?: string | null;
  contractId?: string | null;
}): Promise<JourneyBundle> {
  const tasks: Promise<JourneyEvent[]>[] = [
    fetchAudit("prospect", args.prospectId),
    fetchActivity("prospect", args.prospectId),
    fetchLeadActions(args.prospectId),
  ];
  if (args.opportunityId) {
    tasks.push(fetchAudit("opportunity", args.opportunityId));
    tasks.push(fetchActivity("opportunity", args.opportunityId));
  }
  if (args.contractId) {
    tasks.push(fetchAudit("contract", args.contractId));
    tasks.push(fetchActivity("contract", args.contractId));
  }
  const lists = await Promise.all(tasks);
  const all = lists.flat();
  // Dedupe by id (audit + activity may overlap if backend mirrors them)
  const seen = new Set<string>();
  const events = all.filter((e) => {
    const k = `${e.timestamp}|${e.title}|${e.user}|${e.description ?? ""}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  return {
    prospectId: args.prospectId,
    opportunityId: args.opportunityId ?? null,
    contractId: args.contractId ?? null,
    events,
  };
}

/** Convenience: derive linked ids from store before loading. */
export type JourneyLinks = { opportunityId: string | null; contractId: string | null };
