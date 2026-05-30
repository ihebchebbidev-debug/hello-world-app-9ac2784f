import { api } from "./api";

export type GuichetEntryType =
  | "sim" | "port" | "swp" | "divers" | "facture_tt" | "facture_topnet";

export const ENTRY_TYPE_LABEL: Record<GuichetEntryType, string> = {
  sim: "SIM",
  port: "Portabilité",
  swp: "SWP",
  divers: "Divers",
  facture_tt: "Facture TT",
  facture_topnet: "Facture Topnet",
};

export const SIM_OFFRES = ["Trankil", "Big Bonus", "Fancy", "Ess", "Est"] as const;

/** Custom-fields entity key for a given guichet entry type. */
export const cfEntityForType = (t: GuichetEntryType) => `guichet_${t}` as const;

export type GuichetEntity = {
  id: string;
  name: string;
  type: "ttshop" | "franchise" | "autre";
  city: string;
  active: boolean;
  createdAt?: string | null;
};

export type GuichetEntry = {
  id: string;
  dossierId: string;
  type: GuichetEntryType;
  cin: string;
  numero: string;
  amount: number | null;
  offre: string;
  operatorSource: string;
  label: string;
  opDate: string | null;
  status: "draft" | "valide";
  createdAt?: string | null;
};

export type GuichetDossier = {
  id: string;
  ref: string;
  entityId: string;
  agentId: string;
  clientName: string;
  clientCin: string;
  status: "draft" | "valide";
  validatedAt: string | null;
  validatedBy: string | null;
  notes: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  entries?: GuichetEntry[];
};

export type GuichetObjective = {
  id: string;
  scope: "agent" | "entity" | "global";
  agentId: string | null;
  entityId: string | null;
  periodMonth: string;
  targetSim: number;
  targetPort: number;
  targetFancy: number;
  targetContractsDaily: number;
  targetContractsMonthly: number;
  workingDays: number;
  budgetMonthlyDt: number | null;
  budgetDailyDt: number | null;
  minActivationPct: number;
  challengeBonusDt: number | null;
  notes: string;
};

export type GuichetDashboard = {
  month: string;
  today: string;
  scope: { agentId: string | null; entityId: string | null };
  counts: Record<string, number>;
  amounts: Record<string, number>;
  targets: {
    sim: number; port: number; fancy: number;
    contractsDaily: number; contractsMonthly: number; workingDays: number;
    budgetMonthlyDt: number | null; budgetDailyDt: number | null;
    minActivationPct: number;
  };
  progress: {
    sim: number; port: number; fancy: number;
    contractsDaily: number; contractsMonthly: number;
  };
  contracts: { today: number; month: number };
  activation: { rate: number; min: number; meets: boolean; validated: number; totalEntries: number };
  leaderboard: { agentId: string; sim: number; port: number; fancy: number }[];
  perAgent?: { agentId: string; counts: Record<string, number>; amounts: Record<string, number>; revenue: number }[];
  bonusDt: number | null;
  todayRecap?: {
    date: string;
    counts: Record<string, number>;
    amounts: Record<string, number>;
    dossierCounts?: Record<string, number>;
    dossiersTotal?: number;
    operations: number;
    facturesCount: number;
    facturesAmount: number;
    totalAmount?: number;
  };
};

/* --------------- Entities --------------- */
export async function listEntities(active = false): Promise<GuichetEntity[]> {
  const r = await api<{ entities: GuichetEntity[] }>("/guichet_entities.php", {
    query: active ? { active: 1 } : {},
  });
  return r.entities ?? [];
}
export const createEntity = (body: Partial<GuichetEntity>) =>
  api<{ entity: GuichetEntity }>("/guichet_entities.php", { method: "POST", body });
export const updateEntity = (body: Partial<GuichetEntity> & { id: string }) =>
  api("/guichet_entities.php", { method: "PATCH", body });
export const deleteEntity = (id: string) =>
  api("/guichet_entities.php", { method: "DELETE", query: { id } });

/* --------------- Dossiers --------------- */
export async function listDossiers(query: Record<string, string | undefined> = {}): Promise<GuichetDossier[]> {
  const all: GuichetDossier[] = [];
  const pageSize = query.limit ?? "5000";
  let offset = Number(query.offset ?? 0);
  const cacheBust = String(Date.now());

  for (let guard = 0; guard < 2000; guard++) {
    const r = await api<{ dossiers: GuichetDossier[]; truncated?: boolean; nextOffset?: number }>("/guichet_dossiers.php", {
      query: { ...query, limit: pageSize, offset: String(offset), _t: cacheBust },
    });
    const page = r.dossiers ?? [];
    all.push(...page);
    if (query.limit || !r.truncated || page.length === 0) break;
    offset = Number.isFinite(r.nextOffset) ? Number(r.nextOffset) : offset + page.length;
  }

  return all;
}
export async function getDossier(id: string): Promise<{ dossier: GuichetDossier; entries: GuichetEntry[] }> {
  return api("/guichet_dossiers.php", { query: { id } });
}
export const createDossier = (body: {
  entityId: string;
  agentId?: string;
  clientName?: string;
  clientCin?: string;
  notes?: string;
  status?: "draft" | "valide";
  entries: Partial<GuichetEntry>[];
}) => api<{ dossier: GuichetDossier; entries: GuichetEntry[] }>("/guichet_dossiers.php", { method: "POST", body });

export const updateDossier = (body: Partial<GuichetDossier> & { id: string }) =>
  api("/guichet_dossiers.php", { method: "PATCH", body });
export const validateDossier = (id: string) =>
  api("/guichet_dossiers.php", { method: "POST", query: { action: "validate" }, body: { id } });
export const deleteDossier = (id: string) =>
  api("/guichet_dossiers.php", { method: "DELETE", query: { id } });

/* --------------- Entries --------------- */
export const upsertEntry = (body: Partial<GuichetEntry> & { dossierId: string; type: GuichetEntryType }) =>
  api("/guichet_entries.php", { method: "POST", body });
export const updateEntry = (body: Partial<GuichetEntry> & { id: string }) =>
  api("/guichet_entries.php", { method: "PATCH", body });
export const deleteEntry = (id: string) =>
  api("/guichet_entries.php", { method: "DELETE", query: { id } });

/* --------------- Objectives + Dashboard --------------- */
export async function listObjectives(query: Record<string, string | undefined> = {}): Promise<GuichetObjective[]> {
  const r = await api<{ objectives: GuichetObjective[] }>("/guichet_objectives.php", { query });
  return r.objectives ?? [];
}
export const upsertObjective = (body: Partial<GuichetObjective>) =>
  api("/guichet_objectives.php", { method: "POST", body });
export const deleteObjective = (id: string) =>
  api("/guichet_objectives.php", { method: "DELETE", query: { id } });

export const getDashboard = (query: {
  month: string;
  day?: string;
  from?: string;
  to?: string;
  entityId?: string;
  agentId?: string;
}) =>
  api<GuichetDashboard>("/guichet_dashboard.php", { query });