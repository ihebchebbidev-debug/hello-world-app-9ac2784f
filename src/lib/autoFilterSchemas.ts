// Auto-generated filter schemas per scope.
// Single source of truth: pages pass the rows they already loaded plus a few
// dynamic lists (agents, stages, contract billing). Filter SELECT options are
// derived 100% from real data — no hardcoded fallback catalogues. If nothing
// has been configured / saved yet, the field falls back to a free-text input
// so the user can still type a value.
import type { FilterFieldSchema } from "@/components/FilterPresetPicker";
import type { FilterPresetScope } from "@/lib/filterPresets";

// --- helpers ---------------------------------------------------------------
function uniqStr(rows: ReadonlyArray<Record<string, unknown>>, key: string): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    const v = r?.[key];
    if (v == null || v === "") continue;
    set.add(String(v));
  }
  return [...set];
}
const sortFr = (a: string, b: string) => a.localeCompare(b, "fr", { numeric: true });

/** Build a select field from real values only. If no values exist yet,
 *  return a free-text field so the admin can still type a value. */
function realField(
  label: string,
  key: string,
  rows: ReadonlyArray<Record<string, unknown>>,
  rowKey: string,
  extra: Iterable<string> = [],
): FilterFieldSchema {
  const set = new Set<string>();
  for (const v of extra) if (v) set.add(String(v));
  for (const v of uniqStr(rows, rowKey)) set.add(v);
  const vals = [...set].sort(sortFr);
  if (vals.length === 0) return { key, label, type: "text" };
  return { key, label, type: "select", options: vals.map((v) => ({ value: v, label: v })) };
}

export type AutoSchemaInput = {
  /** Rows already loaded by the page — used to derive 100% real values. */
  rows?: ReadonlyArray<Record<string, unknown>>;
  /** Agent usernames (assigne / assignedTo). Merged with values found in rows. */
  agents?: string[];
  /** Opportunity stage names. Merged with values found in rows. */
  opportunityStages?: string[];
  /** Contract billing statuses (configured pipeline). Merged with values found in rows. */
  contractBilling?: string[];
  /** Prospect/Contract types, if available. */
  types?: { id: string; name: string }[];
};

export function autoFilterSchema(
  scope: FilterPresetScope,
  input: AutoSchemaInput = {},
): FilterFieldSchema[] {
  const rows = input.rows ?? [];
  const types = (input.types ?? []).map((t) => ({ value: t.id, label: t.name }));

  switch (scope) {
    case "prospects":
      return [
        { key: "search", label: "Recherche (nom, prénom, tél, email, CIN)", type: "text" },
        realField("Statut", "statut", rows, "status"),
        realField("Source", "source", rows, "source"),
        realField("Assigné à", "assigne", rows, "assignedTo", input.agents ?? []),
        realField("Civilité", "civility", rows, "civility"),
        realField("Issue", "outcome", rows, "outcome"),
        realField("Validation", "checkValeur", rows, "checkValeur"),
        realField("Gouvernorat", "gouvernorat", rows, "gouvernorat"),
        realField("Délégation", "delegation", rows, "delegation"),
        realField("Ville", "city", rows, "city"),
        realField("Zone", "zone", rows, "zone"),
        realField("Code postal", "codePostal", rows, "codePostal"),
        { key: "address", label: "Adresse", type: "text" },
        { key: "phone", label: "Téléphone (GSM)", type: "text" },
        { key: "phone2", label: "Téléphone 2", type: "text" },
        { key: "email", label: "Email", type: "text" },
        { key: "cin", label: "CIN", type: "text" },
        { key: "typeId", label: "Type de prospect", type: "select",
          options: types.length ? types : uniqStr(rows, "typeId").sort(sortFr).map((v) => ({ value: v, label: v })) },
        { key: "converted", label: "Converti", type: "select",
          options: [{ value: "true", label: "Oui" }, { value: "false", label: "Non" }] },
        { key: "createdAt", label: "Date de création", type: "date" },
        { key: "birthDate", label: "Date de naissance", type: "date" },
      ];

    case "opportunities":
      return [
        { key: "search", label: "Recherche (nom, ville, titre)", type: "text" },
        realField("Étape", "stage", rows, "stage", input.opportunityStages ?? []),
        realField("Assigné à", "assigne", rows, "assignedTo", input.agents ?? []),
        realField("Source", "source", rows, "source"),
        realField("Civilité", "civility", rows, "civility"),
        realField("Gouvernorat", "gouvernorat", rows, "gouvernorat"),
        realField("Délégation", "delegation", rows, "delegation"),
        realField("Ville", "city", rows, "city"),
        realField("Code postal", "codePostal", rows, "codePostal"),
        { key: "address", label: "Adresse", type: "text" },
        { key: "phone", label: "Téléphone (GSM)", type: "text" },
        { key: "email", label: "Email", type: "text" },
        { key: "cin", label: "CIN", type: "text" },
        { key: "title", label: "Titre", type: "text" },
        { key: "amountMin", label: "Montant min", type: "text" },
        { key: "amountMax", label: "Montant max", type: "text" },
        { key: "probabilityMin", label: "Probabilité min (%)", type: "text" },
        { key: "typeId", label: "Type", type: "select",
          options: types.length ? types : uniqStr(rows, "typeId").sort(sortFr).map((v) => ({ value: v, label: v })) },
        { key: "convertedToContract", label: "Converti en contrat", type: "select",
          options: [{ value: "true", label: "Oui" }, { value: "false", label: "Non" }] },
        { key: "expectedCloseDate", label: "Date de clôture prévue", type: "date" },
        { key: "createdAt", label: "Date de création", type: "date" },
      ];

    case "contracts":
      return [
        { key: "search", label: "Recherche (nom, prénom, ville)", type: "text" },
        realField("Statut Facturation", "statut", rows, "billingStatus", input.contractBilling ?? []),
        realField("Partenaire", "partenaire", rows, "partner"),
        realField("Cabinet", "cabinet", rows, "cabinet"),
        realField("Source", "source", rows, "source"),
        realField("Assigné à", "assigne", rows, "assignedTo", input.agents ?? []),
        realField("Civilité", "civility", rows, "civility"),
        realField("Gouvernorat", "gouvernorat", rows, "gouvernorat"),
        realField("Délégation", "delegation", rows, "delegation"),
        realField("Ville", "city", rows, "city"),
        realField("Code postal", "codePostal", rows, "codePostal"),
        { key: "address", label: "Adresse", type: "text" },
        { key: "phone", label: "Téléphone (GSM)", type: "text" },
        { key: "email", label: "Email", type: "text" },
        { key: "cin", label: "CIN", type: "text" },
        { key: "premiumMin", label: "Cotisation min", type: "text" },
        { key: "premiumMax", label: "Cotisation max", type: "text" },
        { key: "typeId", label: "Type", type: "select",
          options: types.length ? types : uniqStr(rows, "typeId").sort(sortFr).map((v) => ({ value: v, label: v })) },
        { key: "dateSig", label: "Date Signature", type: "date" },
        { key: "dateEffet", label: "Date Effet", type: "date" },
        { key: "dateVal", label: "Date Validation", type: "date" },
      ];

    case "guichet":
      return [
        { key: "search", label: "Recherche (réf, client, CIN)", type: "text" },
        realField("Entité", "entityId", rows, "entityId"),
        realField("Type d'opération", "type", rows, "type"),
        { key: "status", label: "Statut", type: "select", options: [
          { value: "draft", label: "Brouillon" }, { value: "valide", label: "Validé" },
        ] },
        realField("Agent", "agentId", rows, "agentId", input.agents ?? []),
        { key: "month", label: "Mois (YYYY-MM)", type: "text" },
        { key: "clientName", label: "Client (nom)", type: "text" },
        { key: "clientCin", label: "CIN", type: "text" },
        { key: "phone", label: "Téléphone / Numéro", type: "text" },
        realField("Offre", "offre", rows, "offre"),
        { key: "dateFrom", label: "Date début", type: "date" },
        { key: "dateTo", label: "Date fin", type: "date" },
      ];

    case "reclamations":
      return [
        { key: "search", label: "Recherche (client, tél, CIN, GSM, réf)", type: "text" },
        realField("Service", "service", rows, "service"),
        { key: "audit", label: "Audit", type: "select", options: [
          { value: "en_cours", label: "En cours" },
          { value: "resolu", label: "Résolu" },
          { value: "annule", label: "Annulé" },
        ] },
        realField("Statut CRM", "statut_crm", rows, "statut_crm"),
        realField("Statut TT", "statut_tt", rows, "statut_tt"),
        realField("Localisation", "localisation", rows, "localisation"),
        realField("État", "etat", rows, "etat"),
        realField("Assigné à", "assigned_to", rows, "assigned_to", input.agents ?? []),
        { key: "tel", label: "Tél ADSL", type: "text" },
        { key: "cin", label: "CIN client", type: "text" },
        { key: "gsm", label: "GSM client", type: "text" },
        { key: "ref", label: "Réf demande", type: "text" },
        { key: "client_name", label: "Client (nom)", type: "text" },
        { key: "mois", label: "Mois (1-12)", type: "text" },
        { key: "annee", label: "Année", type: "text" },
        { key: "date_creation", label: "Date création", type: "date" },
        { key: "date_resolution", label: "Date résolution", type: "date" },
      ];
  }
}

/** Convenience: derive `filterKeys` from a generated schema. */
export const schemaKeys = (s: FilterFieldSchema[]) => s.map((f) => f.key);

