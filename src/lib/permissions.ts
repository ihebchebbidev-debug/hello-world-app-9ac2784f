// =====================================================================
// Permission catalog — single source of truth.
// Every page (route) and every key feature button has its own permission
// key. Admin can allow/deny per role AND per user (overrides).
// Keep PERMISSION_SECTIONS in sync between front (UI) and back (seed).
// =====================================================================

export type PermissionDef = { key: string; label: string };
export type PermissionSection = { title: string; perms: PermissionDef[] };

export const PERMISSION_SECTIONS: PermissionSection[] = [
  {
    title: "Pages — Modules principaux",
    perms: [
      { key: "page.dashboard", label: "Page : Tableau de bord (/)" },
      { key: "page.prospects", label: "Page : Prospects" },
      { key: "page.opportunities", label: "Page : Opportunités" },
      { key: "page.contracts", label: "Page : Contrats" },
      { key: "page.reclamations", label: "Page : Réclamations" },
      { key: "page.calendar", label: "Page : Calendrier" },
      { key: "page.tasks", label: "Page : Tâches" },
      { key: "page.notifications", label: "Page : Notifications" },
      { key: "page.dispatch", label: "Page : Dispatch" },
      { key: "page.backoffice", label: "Page : Backoffice" },
      { key: "page.pipelines", label: "Page : Pipelines" },
      { key: "page.stages", label: "Page : Stages" },
      { key: "page.reports", label: "Page : Rapports" },
      { key: "page.reconciliation", label: "Page : Réconciliation" },
      { key: "page.objectives", label: "Page : Objectifs" },
      { key: "page.profile", label: "Page : Profil" },
      { key: "page.documentation", label: "Page : Documentation" },
      { key: "page.configuration", label: "Page : Configuration" },
    ],
  },
  {
    title: "Pages — Guichet",
    perms: [
      { key: "page.guichet", label: "Page : Guichet" },
    ],
  },
  {
    title: "Pages — Administration",
    perms: [
      { key: "page.users", label: "Page : Utilisateurs" },
      { key: "page.roles", label: "Page : Rôles & Permissions" },
      { key: "page.audit", label: "Page : Journal d'audit" },
      { key: "page.security", label: "Page : Sécurité (IP allowlist)" },
    ],
  },
  {
    title: "Pages — Ressources Humaines",
    perms: [
      { key: "page.hr.attendance", label: "Page : Pointage" },
      { key: "page.hr.payroll", label: "Page : Paie" },
      { key: "page.hr.commissions", label: "Page : Commissions" },
      { key: "page.hr.external-agents", label: "Page : Agents externes" },
    ],
  },
  // ---- Action permissions per feature -------------------------------
  {
    title: "Prospects — actions",
    perms: [
      { key: "prospect.view", label: "Voir prospects" },
      { key: "prospect.add", label: "Ajouter prospect" },
      { key: "prospect.edit", label: "Éditer prospect" },
      { key: "prospect.delete", label: "Supprimer prospect" },
      { key: "prospect.assign", label: "Réassigner prospect" },
      { key: "prospect.source", label: "Modifier source" },
      { key: "prospect.status", label: "Modifier statut d'appel" },
      { key: "prospect.export", label: "Exporter prospects" },
      { key: "prospect.import", label: "Importer prospects" },
      { key: "prospect.convert", label: "Convertir → Opportunité" },
    ],
  },
  {
    title: "Opportunités — actions",
    perms: [
      { key: "opportunity.view", label: "Voir opportunités" },
      { key: "opportunity.edit", label: "Éditer opportunité" },
      { key: "opportunity.delete", label: "Supprimer opportunité" },
      { key: "opportunity.convert", label: "Convertir → Contrat" },
      { key: "opportunity.revert", label: "Renvoyer → Lead" },
      { key: "opportunity.export", label: "Exporter opportunités" },
      { key: "opportunity.stages", label: "Gérer les stages" },
    ],
  },
  {
    title: "Contrats — actions",
    perms: [
      { key: "contract.view", label: "Voir contrats" },
      { key: "contract.add", label: "Créer contrat" },
      { key: "contract.edit", label: "Éditer contrat" },
      { key: "contract.validate", label: "Valider contrat" },
      { key: "contract.cancel", label: "Annuler contrat" },
      { key: "contract.delete", label: "Supprimer contrat" },
      { key: "contract.revert", label: "Renvoyer → Opportunité" },
      { key: "contract.export", label: "Exporter contrats" },
      { key: "contract.import", label: "Importer contrats" },
      { key: "contract.stages", label: "Gérer les stages" },
    ],
  },
  {
    title: "Tâches & Calendrier",
    perms: [
      { key: "task.add", label: "Créer tâche" },
      { key: "task.edit", label: "Éditer tâche" },
      { key: "task.complete", label: "Compléter tâche" },
      { key: "task.delete", label: "Supprimer tâche" },
      { key: "calendar.event.add", label: "Créer évènement" },
      { key: "calendar.event.edit", label: "Éditer évènement" },
      { key: "calendar.event.delete", label: "Supprimer évènement" },
    ],
  },
  {
    title: "Utilisateurs & Rôles",
    perms: [
      { key: "user.view", label: "Voir utilisateurs" },
      { key: "user.add", label: "Créer utilisateur" },
      { key: "user.edit", label: "Éditer utilisateur" },
      { key: "user.delete", label: "Supprimer utilisateur" },
      { key: "user.export", label: "Exporter utilisateurs" },
      { key: "user.reset_password", label: "Réinitialiser mot de passe" },
      { key: "user.toggle_active", label: "Activer/désactiver utilisateur" },
      { key: "role.view", label: "Voir rôles" },
      { key: "role.create", label: "Créer rôle" },
      { key: "role.edit", label: "Éditer rôle" },
      { key: "role.delete", label: "Supprimer rôle" },
      { key: "role.assign", label: "Assigner rôle à un utilisateur" },
      { key: "role.permissions.edit", label: "Modifier les permissions d'un rôle" },
      { key: "user.grant", label: "Accorder accès temporaire" },
      { key: "user.override", label: "Modifier overrides utilisateur" },
    ],
  },
  {
    title: "RH — actions",
    perms: [
      { key: "hr.attendance.clock", label: "Pointer entrée/sortie" },
      { key: "hr.attendance.export", label: "Exporter pointages" },
      { key: "hr.payroll.edit", label: "Éditer paie" },
      { key: "hr.payroll.export", label: "Exporter paie" },
      { key: "hr.commissions.edit", label: "Éditer commissions" },
      { key: "hr.commissions.export", label: "Exporter commissions" },
      { key: "hr.external_agents.add", label: "Ajouter agent externe" },
      { key: "hr.external_agents.edit", label: "Éditer agent externe" },
      { key: "hr.external_agents.delete", label: "Supprimer agent externe" },
    ],
  },
  {
    title: "Pipelines, Stages & Backoffice",
    perms: [
      { key: "pipeline.manage", label: "Gérer pipelines" },
      { key: "stage.manage", label: "Gérer stages" },
      { key: "backoffice.validate", label: "Valider depuis Backoffice" },
      { key: "backoffice.reject", label: "Rejeter depuis Backoffice" },
      { key: "lead.history", label: "Voir historique complet d'un lead" },
    ],
  },
  {
    title: "Rapports, Audit & Sécurité",
    perms: [
      { key: "report.view", label: "Consulter rapports" },
      { key: "report.export", label: "Exporter rapports" },
      { key: "audit.view", label: "Voir journal d'audit" },
      { key: "security.ip.manage", label: "Gérer IP allowlist" },
    ],
  },
  {
    title: "Modèles de filtres",
    perms: [
      { key: "filter_preset.manage", label: "Gérer les modèles de filtres (Leads/Opps/Contrats)" },
    ],
  },
  {
    title: "Réclamations — actions",
    perms: [
      { key: "reclamation.view_all", label: "Voir toutes les réclamations (pas seulement les siennes)" },
      { key: "reclamation.add",      label: "Créer une réclamation" },
      { key: "reclamation.edit",     label: "Éditer une réclamation" },
      { key: "reclamation.delete",   label: "Supprimer une réclamation" },
      { key: "reclamation.import",   label: "Importer des réclamations" },
      { key: "reclamation.export",   label: "Exporter des réclamations" },
      { key: "reclamation.manage",   label: "Gérer pleinement les réclamations" },
    ],
  },
  {
    title: "Guichet — actions",
    perms: [
      { key: "guichet.read_own", label: "Voir mes saisies guichet" },
      { key: "guichet.read_all", label: "Voir toutes les saisies guichet" },
      { key: "guichet.create", label: "Créer un dossier / saisir une opération" },
      { key: "guichet.edit", label: "Éditer un dossier / une opération" },
      { key: "guichet.edit_validated", label: "Éditer un dossier / opération déjà validé(e)" },
      { key: "guichet.delete", label: "Supprimer un dossier / une opération" },
      { key: "guichet.validate", label: "Valider un dossier (Brouillon → Validé)" },
      { key: "guichet.export", label: "Exporter le guichet (CSV / Excel)" },
      { key: "guichet.import", label: "Importer des dossiers guichet (CSV / Excel)" },
      { key: "guichet.manage_entities", label: "Gérer les points de vente (entités)" },
      { key: "guichet.view_objectives", label: "Voir les objectifs et le tableau de bord guichet" },
      { key: "guichet.manage_objectives", label: "Gérer les objectifs (SIM / Port / Fancy)" },
      { key: "guichet.manage_filter_presets", label: "Gérer les modèles de filtres guichet" },
    ],
  },
  // Backward-compat keys still referenced in legacy code
  {
    title: "Anciennes clés (compatibilité)",
    perms: [
      { key: "dashboard", label: "(legacy) dashboard" },
      { key: "prospect", label: "(legacy) prospect" },
      { key: "contract", label: "(legacy) contract" },
      { key: "calendar", label: "(legacy) calendar" },
      { key: "users", label: "(legacy) users" },
      { key: "role", label: "(legacy) role" },
      { key: "backoffice", label: "(legacy) backoffice" },
      { key: "dispatch", label: "(legacy) dispatch" },
      { key: "leads.prospection", label: "(legacy) leads.prospection" },
      { key: "leads.opportunite", label: "(legacy) leads.opportunite" },
      { key: "leads.contrat", label: "(legacy) leads.contrat" },
    ],
  },
];

export const ALL_PERMISSION_KEYS: string[] = PERMISSION_SECTIONS.flatMap((s) =>
  s.perms.map((p) => p.key),
);

// ---------------------------------------------------------------------
// Route → permission key mapping
// ---------------------------------------------------------------------
export const ROUTE_PERMISSION: Record<string, string> = {
  "/": "page.dashboard",
  "/prospects": "page.prospects",
  "/opportunities": "page.opportunities",
  "/contracts": "page.contracts",
  "/reclamations": "page.reclamations",
  "/calendar": "page.calendar",
  "/tasks": "page.tasks",
  "/notifications": "page.notifications",
  "/dispatch": "page.dispatch",
  "/backoffice": "page.backoffice",
  "/reports": "page.reports",
  "/reconciliation": "page.reconciliation",
  "/objectives": "page.objectives",
  "/profile": "page.profile",
  "/documentation": "page.documentation",
  "/configuration": "page.configuration",
  "/users": "page.users",
  "/roles": "page.roles",
  "/audit": "page.audit",
  "/security": "page.security",
  "/hr/attendance": "page.hr.attendance",
  "/hr/payroll": "page.hr.payroll",
  "/hr/commissions": "page.hr.commissions",
  "/hr/external-agents": "page.hr.external-agents",
  "/guichet": "page.guichet",
};

// Routes always available (login flow, profile fallback, etc.)
export const PUBLIC_AUTH_ROUTES = new Set<string>([
  "/profile",
  "/notifications",
  "/messaging",
  "/documentation",
]);

export const HR_PRIV_ROUTES = new Set<string>([
  "/hr/payroll",
  "/hr/commissions",
  "/hr/external-agents",
]);

export function permissionForPath(path: string): string | null {
  // longest-prefix match against ROUTE_PERMISSION
  if (path in ROUTE_PERMISSION) return ROUTE_PERMISSION[path];
  const segments = path.split("/").filter(Boolean);
  while (segments.length) {
    const candidate = "/" + segments.join("/");
    if (candidate in ROUTE_PERMISSION) return ROUTE_PERMISSION[candidate];
    segments.pop();
  }
  return ROUTE_PERMISSION["/"] ?? null;
}
