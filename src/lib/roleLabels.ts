// Mapping des rôles techniques (DB) vers les libellés CRM affichés.
export const ROLE_LABEL: Record<string, string> = {
  Administrateur: "Administrateur",
  Manager: "Superviseur",
  Agent: "Commercial",
  Backoffice: "Backoffice",
  AgentSuivi: "Agent Suivi",
  AgentActivation: "Agent Activation",
  AgentVente: "Agent Vente",
  AgentGuichet: "Agent Guichet",
};

export function roleLabel(role?: string | null): string {
  if (!role) return "—";
  return ROLE_LABEL[role] ?? role;
}

// Tous les rôles "commercial terrain" (gèrent leurs propres leads).
// Utilisé pour filtrer le dashboard / pipeline aux leads assignés à l'utilisateur.
export const AGENT_ROLES = new Set<string>([
  "Agent",
  "AgentSuivi",
  "AgentActivation",
  "AgentVente",
  "AgentGuichet",
]);
export function isAgentRole(role?: string | null): boolean {
  return !!role && AGENT_ROLES.has(role);
}

export const MVP_ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: "Administrateur", label: "Administrateur" },
  { value: "Manager", label: "Superviseur" },
  { value: "AgentSuivi", label: "Agent Suivi" },
  { value: "AgentActivation", label: "Agent Activation" },
  { value: "AgentVente", label: "Agent Vente" },
  { value: "AgentGuichet", label: "Agent Guichet" },
  { value: "Agent", label: "Commercial (legacy)" },
];
