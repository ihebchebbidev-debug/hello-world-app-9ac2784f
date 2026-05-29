-- =====================================================================
-- One-shot migration: turn roles into a dynamic table.
-- Safe to re-run.
-- =====================================================================

SET NAMES utf8mb4;

-- 1) Create the dynamic roles table
CREATE TABLE IF NOT EXISTS crminternet_roles (
  name        VARCHAR(64)  NOT NULL PRIMARY KEY,
  label       VARCHAR(120) NOT NULL,
  description VARCHAR(255) NOT NULL DEFAULT '',
  color       VARCHAR(32)  NOT NULL DEFAULT 'primary',
  is_system   TINYINT(1)   NOT NULL DEFAULT 0,
  sort_order  INT          NOT NULL DEFAULT 100,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 2) Seed the 4 system roles
INSERT IGNORE INTO crminternet_roles (name, label, description, color, is_system, sort_order) VALUES
  ('Administrateur','Administrateur','Accès complet','primary',1,1),
  ('Manager','Manager',"Pilotage d'équipe",'info',0,2),
  ('Agent','Agent','Gestion des leads','success',0,3),
  ('Backoffice','Backoffice','Validation contrats','warning',0,4);

-- Ensure only Administrateur is locked as system
UPDATE crminternet_roles SET is_system = 1 WHERE name = 'Administrateur';
UPDATE crminternet_roles SET is_system = 0 WHERE name <> 'Administrateur';

-- 3) Convert ENUM columns to VARCHAR(64)
ALTER TABLE crminternet_users
  MODIFY COLUMN role VARCHAR(64) NOT NULL DEFAULT 'Agent';

ALTER TABLE crminternet_role_permissions
  MODIFY COLUMN role VARCHAR(64) NOT NULL;
