-- Migration: ensure Manager keeps HR module access after switching
-- backend HR endpoints from hardcoded role list to permission-based gates.
-- Idempotent (INSERT IGNORE on UNIQUE (role, permission)).
INSERT IGNORE INTO crminternet_role_permissions (role, permission, enabled) VALUES
  ('Manager','page.hr.payroll',1),
  ('Manager','page.hr.external-agents',1),
  ('Manager','hr.attendance.clock',1),
  ('Manager','hr.attendance.export',1),
  ('Manager','hr.payroll.edit',1),
  ('Manager','hr.payroll.export',1),
  ('Manager','hr.commissions.edit',1),
  ('Manager','hr.commissions.export',1),
  ('Manager','hr.external_agents.add',1),
  ('Manager','hr.external_agents.edit',1);
