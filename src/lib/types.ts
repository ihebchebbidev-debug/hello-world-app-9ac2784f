// Shared domain types for the CRM frontend.
// Pure TypeScript — no runtime data, no seeds. This file is safe to import
// from anywhere without bloating the production bundle.

export type Outcome = "pending" | "won" | "lost";
export type LeadStatus = string;
export const LEAD_STATUSES: string[] = [
  "Ok","Att cin","Att confirmation","Rappel","refuse","migration","Basculement",
  "Ing","Nrp","Pas de rep","Pas intersse","Déjà connecté","Autr dde encor","Autre",
];
export const LEAD_SOURCES = ["Terrain","Facebook","Base de donné","Technicien"] as const;
export const LEAD_ACTION_TYPES = ["appel","visite","relance","note","terrain","reseaux","technicien"] as const;
export type LeadActionType = typeof LEAD_ACTION_TYPES[number];

export type Prospect = {
  id: string;
  civility: "M" | "Mme";
  lastName: string;
  firstName: string;
  phone: string;
  phone2?: string;
  /** Ancien numéro de ligne (récupération client). */
  ancienLigne?: string | null;
  /** Animateur (uniquement pour les prospects de type "Street"). */
  animateur?: string | null;
  cin?: string;
  birthDate?: string | null;
  email: string;
  source: string;
  status: string;
  assignedTo: string | null;
  createdAt: string;
  city: string;
  address?: string;
  zone?: string;
  gouvernorat?: string;
  delegation?: string;
  /** Coordonnées Google Maps "lat,lng" ex: "36.123456,10.123698". */
  localisationXy?: string | null;
  /** Code postal libre (max 20 caractères). */
  codePostal?: string | null;
  outcome: Outcome;
  lostReason?: string;
  comment?: string;
  comment2?: string | null;
  checkValeur: "valid" | "invalid" | "pending";
  converted?: boolean;
  opportunityId?: string | null;
  lastOpportunityId?: string | null;
  typeId?: string | null;
  /** Set when the lead was reverted from an opportunity/contract back to leads. Cleared once treated. */
  revertedAt?: string | null;
  revertedFrom?: "opportunity" | "contract" | null;
};

export type Opportunity = {
  id: string;
  prospectId: string | null;
  civility: "M" | "Mme";
  lastName: string;
  firstName: string;
  phone: string;
  phone2?: string;
  cin?: string;
  birthDate?: string | null;
  email: string;
  city: string;
  gouvernorat?: string;
  delegation?: string;
  address?: string;
  localisationXy?: string | null;
  codePostal?: string | null;
  comment1?: string | null;
  comment2?: string | null;
  source: string;
  title: string;
  stage: string;
  amount: number;
  probability: number;
  expectedCloseDate: string | null;
  assignedTo: string | null;
  notes: string | null;
  createdAt: string;
  createdBy: string | null;
  convertedToContract: boolean;
  contractId: string | null;
  convertedAt: string | null;
  revertedAt: string | null;
  typeId?: string | null;
};

export type PipelineKey = "lead" | "opportunity" | "contract";

export type LeadAutoAction = "none" | "convert_opportunity" | "convert_contract";
export type OpportunityAutoAction = "none" | "convert_contract" | "revert_lead";
export type ContractAutoAction = "none" | "revert_opportunity";

export type PipelineStage = {
  id: string;
  name: string;
  color: string;
  position: number;
  isInitial: boolean;
  isWon: boolean;
  isLost: boolean;
  autoAction: LeadAutoAction | OpportunityAutoAction | ContractAutoAction;
};

// Backwards-compat alias.
export type OpportunityStage = PipelineStage;

export type PipelineTransition = {
  id: string;
  pipeline: PipelineKey;
  fromStageId: string;
  toStageId: string;
};

export type ExternalAgent = {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  cin: string;
  commissionRate: number;
  fixedAmount: number;
  active: boolean;
  notes?: string | null;
  createdAt: string;
};

export type Commission = {
  id: string;
  externalAgentId: string;
  agentName?: string | null;
  prospectId?: string | null;
  contractId?: string | null;
  amount: number;
  basis: number;
  status: "pending" | "paid" | "cancelled";
  earnedAt: string;
  paidAt?: string | null;
  paidBy?: string | null;
  paymentRef?: string | null;
  notes?: string | null;
};

export type AttendanceEntry = {
  id: number;
  userId: string;
  username: string;
  loginAt: string;
  logoutAt: string | null;
  totalMinutes: number;
  ip?: string | null;
};

export type PayrollEntry = {
  id: string;
  userId: string;
  username: string;
  fullName?: string | null;
  period: string;
  baseSalary: number;
  hoursWorked: number;
  hourlyRate: number;
  bonus: number;
  deductions: number;
  total: number;
  status: "draft" | "validated" | "paid";
  paidAt?: string | null;
  notes?: string | null;
};

export type Contract = {
  id: string;
  civility?: "M" | "Mme";
  lastName: string;
  firstName: string;
  phone?: string;
  phone2?: string;
  cin?: string;
  birthDate?: string | null;
  email?: string;
  city: string;
  gouvernorat?: string;
  delegation?: string;
  address?: string;
  localisationXy?: string | null;
  codePostal?: string | null;
  comment1?: string | null;
  comment2?: string | null;
  partner: string;
  cabinet: string;
  signatureDate: string;
  effectiveDate: string;
  validationDate: string | null;
  premium: number;
  // billingStatus est désormais le NOM du stage courant (table crminternet_contract_stages).
  // Conservé en string pour rester rétro-compatible avec les statuts legacy.
  billingStatus: string;
  stageId?: string | null;
  opportunityId?: string | null;
  source: string;
  assignedTo: string;
  typeId?: string | null;
};

export type ProspectType = {
  id: string;
  name: string;
  description: string;
  color: string;
  position: number;
  active: boolean;
  createdAt?: string | null;
};

export type AppUser = {
  id: string;
  username: string;
  fullName: string;
  email: string;
  role: string;
  team: string;
  active: boolean;
  contractsWon: number;
  leadsHandled: number;
  conversionRate: number;
  // HR / personnel fields (crminternet_users — see migration_users_hr.sql)
  jobTitle?: string | null;
  birthDate?: string | null;       // YYYY-MM-DD
  cin?: string | null;
  company?: string | null;
  contractType?: string | null;     // CDI / CDD / CIVP / SIVP / Karama / Stage / Freelance
  salary?: number | null;
  salaryIncrease?: number | null;
  contractStart?: string | null;    // YYYY-MM-DD
  contractEnd?: string | null;      // YYYY-MM-DD
  renewalStart?: string | null;     // YYYY-MM-DD
  renewalEnd?: string | null;       // YYYY-MM-DD
  observations?: string | null;
  phone?: string | null;
  rib?: string | null;
  hireDate?: string | null;         // YYYY-MM-DD — date début avec nous
  guichetEntityId?: string | null;  // affectation à une franchise / point de vente guichet
  teamId?: string | null;           // équipe (regroupement de rôles)
};

export type AppTeam = {
  id: string;
  name: string;
  description?: string | null;
  roles: string[];
  memberCount?: number;
};

export type CalEvent = {
  id: string;
  title: string;
  date: string; // ISO YYYY-MM-DD
  time: string;
  type: "rdv" | "rappel" | "signature";
  agent: string;
};
