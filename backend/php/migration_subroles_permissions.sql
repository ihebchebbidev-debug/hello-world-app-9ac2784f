-- =====================================================================
-- CRM MVP — Permissions des 3 sous-rôles agents (cahier des charges §3)
-- Agent Suivi      → Prospection + Opportunité + Contrat
-- Agent Activation → Prospection + Opportunité
-- Agent Vente     → Prospection uniquement
-- Idempotent : utilise INSERT IGNORE.
-- =====================================================================

-- Garantit l'existence des 3 rôles (no-op si déjà présents)
INSERT IGNORE INTO crminternet_roles (name, label, description, color, is_system, sort_order) VALUES
  ('AgentSuivi','Agent Suivi','Prospection + Opportunité + Contrat','success',0,5),
  ('AgentActivation','Agent Activation','Prospection + Opportunité','info',0,6),
  ('AgentVente','Agent Vente','Prospection','warning',0,7);

-- ---------- AGENT SUIVI : tout le pipeline commercial ---------------
INSERT IGNORE INTO crminternet_role_permissions (role, permission, enabled) VALUES
  ('AgentSuivi','page.dashboard',1),
  ('AgentSuivi','page.prospects',1),
  ('AgentSuivi','page.opportunities',1),
  ('AgentSuivi','page.contracts',1),
  ('AgentSuivi','page.calendar',1),
  ('AgentSuivi','page.tasks',1),
  ('AgentSuivi','page.notifications',1),
  ('AgentSuivi','page.stages',1),
  ('AgentSuivi','page.profile',1),
  ('AgentSuivi','prospect.view',1),
  ('AgentSuivi','prospect.add',1),
  ('AgentSuivi','prospect.edit',1),
  ('AgentSuivi','prospect.status',1),
  ('AgentSuivi','prospect.source',1),
  ('AgentSuivi','prospect.convert',1),
  ('AgentSuivi','prospect.export',1),
  ('AgentSuivi','opportunity.view',1),
  ('AgentSuivi','opportunity.edit',1),
  ('AgentSuivi','opportunity.convert',1),
  ('AgentSuivi','contract.view',1),
  ('AgentSuivi','contract.edit',1),
  ('AgentSuivi','task.add',1),
  ('AgentSuivi','task.edit',1),
  ('AgentSuivi','task.complete',1),
  ('AgentSuivi','calendar.event.add',1),
  ('AgentSuivi','calendar.event.edit',1),
  ('AgentSuivi','hr.attendance.clock',1);

-- ---------- AGENT ACTIVATION : prospection + opportunité -----------
INSERT IGNORE INTO crminternet_role_permissions (role, permission, enabled) VALUES
  ('AgentActivation','page.dashboard',1),
  ('AgentActivation','page.prospects',1),
  ('AgentActivation','page.opportunities',1),
  ('AgentActivation','page.calendar',1),
  ('AgentActivation','page.tasks',1),
  ('AgentActivation','page.notifications',1),
  ('AgentActivation','page.stages',1),
  ('AgentActivation','page.profile',1),
  ('AgentActivation','prospect.view',1),
  ('AgentActivation','prospect.add',1),
  ('AgentActivation','prospect.edit',1),
  ('AgentActivation','prospect.status',1),
  ('AgentActivation','prospect.source',1),
  ('AgentActivation','prospect.convert',1),
  ('AgentActivation','opportunity.view',1),
  ('AgentActivation','opportunity.edit',1),
  ('AgentActivation','task.add',1),
  ('AgentActivation','task.edit',1),
  ('AgentActivation','task.complete',1),
  ('AgentActivation','calendar.event.add',1),
  ('AgentActivation','calendar.event.edit',1),
  ('AgentActivation','hr.attendance.clock',1);

-- ---------- AGENT VENTE : prospection seulement --------------------
INSERT IGNORE INTO crminternet_role_permissions (role, permission, enabled) VALUES
  ('AgentVente','page.dashboard',1),
  ('AgentVente','page.prospects',1),
  ('AgentVente','page.calendar',1),
  ('AgentVente','page.tasks',1),
  ('AgentVente','page.notifications',1),
  ('AgentVente','page.profile',1),
  ('AgentVente','prospect.view',1),
  ('AgentVente','prospect.add',1),
  ('AgentVente','prospect.edit',1),
  ('AgentVente','prospect.status',1),
  ('AgentVente','task.add',1),
  ('AgentVente','task.edit',1),
  ('AgentVente','task.complete',1),
  ('AgentVente','calendar.event.add',1),
  ('AgentVente','hr.attendance.clock',1);
