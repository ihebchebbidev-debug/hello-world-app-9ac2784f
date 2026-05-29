-- =====================================================================
-- Module GUICHET — Migration complète (à exécuter sur OVH MySQL)
-- Tables : guichet_entities, guichet_dossiers, guichet_entries,
--          guichet_objectives + extension users.guichet_entity_id
-- =====================================================================

-- 1. Entités / points de vente -----------------------------------------
CREATE TABLE IF NOT EXISTS crminternet_guichet_entities (
  id          VARCHAR(40) PRIMARY KEY,
  name        VARCHAR(120) NOT NULL UNIQUE,
  type        ENUM('ttshop','franchise','autre') NOT NULL DEFAULT 'ttshop',
  city        VARCHAR(120) NULL,
  active      TINYINT(1) NOT NULL DEFAULT 1,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Lien user ↔ entité -------------------------------------------------
ALTER TABLE crminternet_users
  ADD COLUMN IF NOT EXISTS guichet_entity_id VARCHAR(40) NULL,
  ADD INDEX IF NOT EXISTS idx_users_guichet_entity (guichet_entity_id);

-- 3. Dossier parent -----------------------------------------------------
CREATE TABLE IF NOT EXISTS crminternet_guichet_dossiers (
  id            VARCHAR(40) PRIMARY KEY,
  ref           VARCHAR(20) NOT NULL UNIQUE,
  entity_id     VARCHAR(40) NOT NULL,
  agent_id      VARCHAR(40) NOT NULL,
  client_name   VARCHAR(160) NULL,
  client_cin    VARCHAR(20) NULL,
  status        ENUM('draft','valide') NOT NULL DEFAULT 'draft',
  validated_at  DATETIME NULL,
  validated_by  VARCHAR(40) NULL,
  notes         TEXT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_gd_entity      (entity_id),
  INDEX idx_gd_agent       (agent_id),
  INDEX idx_gd_status_date (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. Opérations enfants -------------------------------------------------
CREATE TABLE IF NOT EXISTS crminternet_guichet_entries (
  id              VARCHAR(40) PRIMARY KEY,
  dossier_id      VARCHAR(40) NOT NULL,
  type            ENUM('sim','port','swp','divers','facture_tt','facture_topnet') NOT NULL,
  cin             VARCHAR(20) NULL,
  numero          VARCHAR(40) NULL,
  amount          DECIMAL(12,3) NULL,
  offre           VARCHAR(60) NULL,
  operator_source VARCHAR(60) NULL,
  label           VARCHAR(160) NULL,
  op_date         DATE NULL,
  status          ENUM('draft','valide') NOT NULL DEFAULT 'draft',
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_ge_dossier FOREIGN KEY (dossier_id)
    REFERENCES crminternet_guichet_dossiers(id) ON DELETE CASCADE,
  INDEX idx_ge_type_status (type, status),
  INDEX idx_ge_dossier     (dossier_id),
  INDEX idx_ge_offre       (offre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. Objectifs mensuels -------------------------------------------------
CREATE TABLE IF NOT EXISTS crminternet_guichet_objectives (
  id                  VARCHAR(40) PRIMARY KEY,
  scope               ENUM('agent','entity','global') NOT NULL DEFAULT 'agent',
  agent_id            VARCHAR(40) NULL,
  entity_id           VARCHAR(40) NULL,
  period_month        CHAR(7) NOT NULL, -- 'YYYY-MM'
  target_sim          INT NOT NULL DEFAULT 100,
  target_port         INT NOT NULL DEFAULT 10,
  target_fancy        INT NOT NULL DEFAULT 10,
  challenge_bonus_dt  DECIMAL(8,2) NULL,
  notes               TEXT NULL,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_scope_period (scope, agent_id, entity_id, period_month),
  INDEX idx_period (period_month)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 6. Rôle "Agent Guichet" ---------------------------------------------
-- IMPORTANT : il n'existe PAS de table `crminternet_permissions` dans ce CRM.
-- Le catalogue de permissions vit dans le frontend (src/lib/permissions.ts).
-- Les permissions accordées sont stockées dans crminternet_role_permissions
-- (role VARCHAR PK, permission VARCHAR PK, enabled TINYINT).
INSERT IGNORE INTO crminternet_roles
  (name, label, description, color, is_system, sort_order)
VALUES
  ('AgentGuichet', 'Agent Guichet', 'Saisie des opérations guichet', 'info', 0, 8);

-- 7. Permissions par défaut du rôle Agent Guichet ---------------------
INSERT IGNORE INTO crminternet_role_permissions (role, permission, enabled) VALUES
  ('AgentGuichet', 'page.guichet',     1),
  ('AgentGuichet', 'guichet.read_own', 1),
  ('AgentGuichet', 'guichet.create',   1),
  ('AgentGuichet', 'guichet.edit',     1),
  ('AgentGuichet', 'guichet.export',   1);

-- 8. Permissions complètes pour l'Administrateur ----------------------
INSERT IGNORE INTO crminternet_role_permissions (role, permission, enabled) VALUES
  ('Administrateur', 'page.guichet',              1),
  ('Administrateur', 'guichet.read_all',          1),
  ('Administrateur', 'guichet.create',            1),
  ('Administrateur', 'guichet.edit',              1),
  ('Administrateur', 'guichet.delete',            1),
  ('Administrateur', 'guichet.validate',          1),
  ('Administrateur', 'guichet.export',            1),
  ('Administrateur', 'guichet.manage_objectives', 1),
  ('Administrateur', 'guichet.manage_entities',   1);

-- 9. Permissions de lecture/validation pour Manager (Superviseur) -----
INSERT IGNORE INTO crminternet_role_permissions (role, permission, enabled) VALUES
  ('Manager', 'page.guichet',              1),
  ('Manager', 'guichet.read_all',          1),
  ('Manager', 'guichet.validate',          1),
  ('Manager', 'guichet.export',            1),
  ('Manager', 'guichet.manage_objectives', 1);

-- Données d'exemple (optionnel — décommentez)
-- INSERT IGNORE INTO crminternet_guichet_entities (id, name, type, city) VALUES
--   (UUID(), 'TTshop',             'ttshop',    'Tunis'),
--   (UUID(), 'Franchise Akouda',   'franchise', 'Akouda'),
--   (UUID(), 'Franchise Mahdia',   'franchise', 'Mahdia');