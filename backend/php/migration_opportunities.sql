-- =====================================================================
-- Phase: Opportunités (lead converti) — table séparée des prospects
-- Une opportunité = un lead qualifié, sorti du pipeline "Leads" et entré
-- dans le pipeline "Opportunités". Elle peut être :
--   - reconvertie vers prospect (revert) — l'opportunité disparaît, le
--     prospect réapparaît dans la liste Leads (converted=0).
--   - convertie en contrat — l'opportunité est masquée (converted_to_contract=1)
--     et liée au contrat créé.
-- Statuts gérés via crminternet_opportunity_stages (configurables par Admin).
-- =====================================================================

-- 1. Marqueur sur les prospects : un prospect converti en opportunité
--    n'apparaît plus dans la liste Leads tant que converted=1.
ALTER TABLE crminternet_prospects
  ADD COLUMN IF NOT EXISTS converted TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS converted_at DATETIME NULL,
  ADD COLUMN IF NOT EXISTS opportunity_id VARCHAR(40) NULL,
  ADD INDEX IF NOT EXISTS idx_converted (converted);

-- 2. Étapes (statuts) configurables des opportunités.
CREATE TABLE IF NOT EXISTS crminternet_opportunity_stages (
  id        VARCHAR(40) PRIMARY KEY,
  name      VARCHAR(80) NOT NULL UNIQUE,
  color     VARCHAR(20) NOT NULL DEFAULT 'muted',
  position  INT         NOT NULL DEFAULT 0,
  is_won    TINYINT(1)  NOT NULL DEFAULT 0,
  is_lost   TINYINT(1)  NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO crminternet_opportunity_stages (id, name, color, position, is_won, is_lost) VALUES
  ('OS-1','Qualification', 'info',     1, 0, 0),
  ('OS-2','Proposition',   'primary',  2, 0, 0),
  ('OS-3','Négociation',   'warning',  3, 0, 0),
  ('OS-4','Gagnée',        'success',  4, 1, 0),
  ('OS-5','Perdue',        'destructive', 5, 0, 1);

-- 3. Table Opportunités.
CREATE TABLE IF NOT EXISTS crminternet_opportunities (
  id                       VARCHAR(40)  PRIMARY KEY,
  prospect_id              VARCHAR(40)  NULL,
  -- Snapshot des infos lead au moment de la conversion (édition libre ensuite).
  civility                 ENUM('M','Mme') NOT NULL DEFAULT 'M',
  last_name                VARCHAR(120) NOT NULL,
  first_name               VARCHAR(120) NOT NULL DEFAULT '',
  phone                    VARCHAR(40)  NOT NULL DEFAULT '',
  email                    VARCHAR(160) NOT NULL DEFAULT '',
  city                     VARCHAR(120) NOT NULL DEFAULT '',
  source                   VARCHAR(80)  NOT NULL DEFAULT '',
  -- Données opportunité
  title                    VARCHAR(200) NOT NULL DEFAULT '',
  stage                    VARCHAR(80)  NOT NULL DEFAULT 'Qualification',
  amount                   DECIMAL(10,2) NOT NULL DEFAULT 0,
  probability              TINYINT      NOT NULL DEFAULT 50,
  expected_close_date      DATE         NULL,
  assigned_to              VARCHAR(80)  NULL,
  notes                    TEXT         NULL,
  -- Cycle de vie
  created_at               DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by               VARCHAR(80)  NULL,
  converted_to_contract    TINYINT(1)   NOT NULL DEFAULT 0,
  contract_id              VARCHAR(40)  NULL,
  converted_at             DATETIME     NULL,
  reverted_at              DATETIME     NULL,
  INDEX idx_prospect (prospect_id),
  INDEX idx_stage    (stage),
  INDEX idx_assigned (assigned_to),
  INDEX idx_contract (contract_id),
  INDEX idx_converted_contract (converted_to_contract)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. Permissions (Admin a tout par défaut côté code, on seed pour Manager/Superviseur).
INSERT IGNORE INTO crminternet_role_permissions (role, permission, enabled) VALUES
  ('Administrateur','opportunity.view',     1),
  ('Administrateur','opportunity.edit',     1),
  ('Administrateur','opportunity.convert',  1),
  ('Administrateur','opportunity.revert',   1),
  ('Administrateur','opportunity.stages',   1),
  ('Manager',       'opportunity.view',     1),
  ('Manager',       'opportunity.edit',     1),
  ('Manager',       'opportunity.convert',  1),
  ('Manager',       'opportunity.revert',   1),
  ('Superviseur',   'opportunity.view',     1),
  ('Superviseur',   'opportunity.edit',     1),
  ('AgentSuivi',    'opportunity.view',     1),
  ('AgentSuivi',    'opportunity.edit',     1),
  ('AgentVente',    'opportunity.view',     1),
  ('AgentVente',    'opportunity.edit',     1),
  ('AgentVente',    'opportunity.convert',  1);
