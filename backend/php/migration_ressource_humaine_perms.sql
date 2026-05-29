-- Migration: default permissions for RessourceHumaine role.
-- Idempotent (INSERT IGNORE). Does NOT override permissions the admin
-- has already explicitly set — only adds rows that are missing entirely.
INSERT IGNORE INTO crminternet_role_permissions (role, permission, enabled) VALUES
  ('RessourceHumaine', 'page.profile',              1),
  ('RessourceHumaine', 'page.notifications',        1),
  ('RessourceHumaine', 'page.hr.attendance',        1),
  ('RessourceHumaine', 'page.hr.payroll',           1),
  ('RessourceHumaine', 'page.hr.commissions',       1),
  ('RessourceHumaine', 'page.hr.external-agents',   1),
  ('RessourceHumaine', 'hr.attendance.clock',       1),
  ('RessourceHumaine', 'hr.attendance.export',      1),
  ('RessourceHumaine', 'hr.payroll.edit',           1),
  ('RessourceHumaine', 'hr.payroll.export',         1),
  ('RessourceHumaine', 'hr.commissions.edit',       1),
  ('RessourceHumaine', 'hr.commissions.export',     1),
  ('RessourceHumaine', 'hr.external_agents.add',    1),
  ('RessourceHumaine', 'hr.external_agents.edit',   1),
  ('RessourceHumaine', 'hr.external_agents.delete', 1);
