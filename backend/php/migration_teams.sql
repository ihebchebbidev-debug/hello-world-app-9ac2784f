-- =====================================================================
-- Équipes (teams) — regroupement de rôles avec union de permissions.
-- Idempotent : peut être exécuté plusieurs fois sans erreur.
-- Compatible MySQL 5.7+ / MariaDB 10.x (n'utilise PAS "IF NOT EXISTS"
-- sur ALTER/INDEX, qui n'est pas supporté partout).
-- =====================================================================

-- 1) Table des équipes
CREATE TABLE IF NOT EXISTS crminternet_teams (
  id          VARCHAR(40)  NOT NULL PRIMARY KEY,
  name        VARCHAR(120) NOT NULL,
  description TEXT NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_team_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2) Table de liaison équipe ↔ rôles (un rôle peut appartenir à plusieurs équipes)
CREATE TABLE IF NOT EXISTS crminternet_team_roles (
  team_id VARCHAR(40) NOT NULL,
  role    VARCHAR(80) NOT NULL,
  PRIMARY KEY (team_id, role),
  KEY idx_team_roles_team (team_id),
  KEY idx_team_roles_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3) Colonne team_id sur les utilisateurs (idempotent via INFORMATION_SCHEMA)
SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'crminternet_users'
    AND COLUMN_NAME  = 'team_id'
);
SET @sql := IF(@col = 0,
  'ALTER TABLE crminternet_users ADD COLUMN team_id VARCHAR(40) NULL',
  'SELECT 1');
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;

SET @idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'crminternet_users'
    AND INDEX_NAME   = 'idx_users_team'
);
SET @sql := IF(@idx = 0,
  'ALTER TABLE crminternet_users ADD INDEX idx_users_team (team_id)',
  'SELECT 1');
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;

-- 4) Roles manquants éventuellement référencés par les équipes par défaut
INSERT IGNORE INTO crminternet_roles
  (name, label, description, color, is_system, sort_order)
VALUES
  ('AgentTechnicoCommercial', 'Agent Technico-Commercial',
   'Commercial avec compétences techniques (commercial)', 'primary', 0, 50),
  ('RessourceHumaine', 'Ressource Humaine',
   'Gestion des ressources humaines', 'secondary', 0, 60);

-- 5) Équipes par défaut
INSERT IGNORE INTO crminternet_teams (id, name, description) VALUES
  ('team_backoffice', 'Backoffice',
   'Agent Vente + Agent Activation + Agent Suivi'),
  ('team_commercial', 'Commercial',
   'Agent Guichet + Agent Technico-Commercial'),
  ('team_direction', 'Direction',
   'Superviseur + Ressource Humaine');

-- 6) Composition par défaut (rôles membres)
INSERT IGNORE INTO crminternet_team_roles (team_id, role) VALUES
  ('team_backoffice', 'AgentVente'),
  ('team_backoffice', 'AgentActivation'),
  ('team_backoffice', 'AgentSuivi'),
  ('team_commercial', 'AgentGuichet'),
  ('team_commercial', 'AgentTechnicoCommercial'),
  ('team_direction',  'Manager'),
  ('team_direction',  'RessourceHumaine');
