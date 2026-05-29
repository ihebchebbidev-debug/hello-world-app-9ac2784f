-- =====================================================================
-- Agent Guichet — affectation par franchise / entité
-- Idempotent : peut être exécuté plusieurs fois sans risque.
-- =====================================================================

-- 1. Garantit la colonne d'affectation sur les utilisateurs
ALTER TABLE crminternet_users
  ADD COLUMN IF NOT EXISTS guichet_entity_id VARCHAR(40) NULL,
  ADD INDEX IF NOT EXISTS idx_users_guichet_entity (guichet_entity_id);

-- 2. Garantit le rôle "AgentGuichet" et ses permissions de base
INSERT IGNORE INTO crminternet_roles (name, label, description, color, is_system, sort_order)
VALUES ('AgentGuichet', 'Agent Guichet', 'Saisie guichet — limité à sa franchise', 'info', 0, 8);

INSERT IGNORE INTO crminternet_role_permissions (role, permission, enabled) VALUES
  ('AgentGuichet', 'page.guichet',     1),
  ('AgentGuichet', 'page.dashboard',   1),
  ('AgentGuichet', 'page.profile',     1),
  ('AgentGuichet', 'page.notifications', 1),
  ('AgentGuichet', 'guichet.read_own', 1),
  ('AgentGuichet', 'guichet.create',   1),
  ('AgentGuichet', 'guichet.edit',     1),
  ('AgentGuichet', 'guichet.export',   1),
  ('AgentGuichet', 'guichet.view_objectives', 1);
