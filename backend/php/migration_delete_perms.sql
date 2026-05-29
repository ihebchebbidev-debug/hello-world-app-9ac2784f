-- =====================================================================
-- Adds explicit delete permissions for the three pipeline entities so
-- they can be granted/revoked per role (and per user via grants).
-- Administrateur always bypasses, but we still seed it for visibility.
-- Idempotent : safe to run multiple times.
-- =====================================================================

INSERT IGNORE INTO crminternet_role_permissions (role, permission, enabled) VALUES
  ('Administrateur', 'prospect.delete',    1),
  ('Administrateur', 'opportunity.delete', 1),
  ('Administrateur', 'contract.delete',    1),
  ('Administrateur', 'lead.history',       1);
