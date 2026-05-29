-- =====================================================================
-- CRM Protection — INSTALL COMPLET (un seul fichier)
-- Base : luccybcdb (MySQL 5.7+ / 8.x compatible)
-- Idempotent : peut être exécuté plusieurs fois sans risque.
-- Couvre : Auth, Leads, Contrats, Calendrier, Tâches, Notifications,
--          Pièces jointes, Activité, Rôles + permissions, Champs
--          personnalisés, Pipeline, Suivi commercial, Pointage,
--          Agents externes, Commissions, Paie, Chat interne,
--          Réglages, Octrois temporaires (grants).
-- =====================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS=0;

-- =====================================================================
-- HELPER : ajout idempotent de colonne (MySQL 5.7 / 8.0 < 8.0.29)
-- =====================================================================
DROP PROCEDURE IF EXISTS crm_add_col;
DELIMITER //
CREATE PROCEDURE crm_add_col(
  IN p_table  VARCHAR(64),
  IN p_column VARCHAR(64),
  IN p_ddl    VARCHAR(1024)
)
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = p_table
      AND COLUMN_NAME  = p_column
  ) THEN
    SET @sql = CONCAT('ALTER TABLE `', p_table, '` ADD COLUMN ', p_ddl);
    PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
  END IF;
END //
DELIMITER ;


-- NOTE: ce projet utilise EXCLUSIVEMENT le prefixe `crminternet_`.
-- Aucun rename de tables non-prefixees ni d'un autre projet (extraneterp_*, etc.).
-- Toutes les tables sont creees fraichement via CREATE TABLE IF NOT EXISTS.

-- =====================================================================
-- 1. UTILISATEURS
-- =====================================================================
CREATE TABLE IF NOT EXISTS crminternet_users (
  id              VARCHAR(40)  PRIMARY KEY,
  username        VARCHAR(80)  NOT NULL UNIQUE,
  full_name       VARCHAR(120) NOT NULL,
  job_title       VARCHAR(120) NULL,
  birth_date      DATE         NULL,
  cin             VARCHAR(40)  NULL UNIQUE,
  company         VARCHAR(120) NULL,
  contract_type   VARCHAR(40)  NULL,
  salary          DECIMAL(10,3) NULL,
  salary_increase DECIMAL(10,3) NULL,
  contract_start  DATE         NULL,
  contract_end    DATE         NULL,
  renewal_start   DATE         NULL,
  renewal_end     DATE         NULL,
  observations    TEXT         NULL,
  phone           VARCHAR(40)  NULL,
  rib             VARCHAR(40)  NULL,
  hire_date       DATE         NULL,
  email           VARCHAR(160) NOT NULL UNIQUE,
  password_hash   VARCHAR(255) NOT NULL,
  role            VARCHAR(64)  NOT NULL DEFAULT 'Agent',
  team            VARCHAR(80)  NOT NULL DEFAULT 'Lead-Actifs',
  active          TINYINT(1)   NOT NULL DEFAULT 1,
  must_change_password TINYINT(1) NOT NULL DEFAULT 0,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_users_company (company),
  KEY idx_users_contract_end (contract_end)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
-- 2. RÔLES & PERMISSIONS
-- =====================================================================
CREATE TABLE IF NOT EXISTS crminternet_roles (
  name        VARCHAR(64)  NOT NULL PRIMARY KEY,
  label       VARCHAR(120) NOT NULL,
  description VARCHAR(255) NOT NULL DEFAULT '',
  color       VARCHAR(32)  NOT NULL DEFAULT 'primary',
  is_system   TINYINT(1)   NOT NULL DEFAULT 0,
  sort_order  INT          NOT NULL DEFAULT 100,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO crminternet_roles (name, label, description, color, is_system, sort_order) VALUES
  ('Administrateur','Administrateur','Accès complet','primary',1,1),
  ('Manager','Superviseur',"Pilotage d'équipe",'info',0,2),
  ('Agent','Commercial','Gestion des leads','success',0,3),
  ('Backoffice','Backoffice','Validation contrats','warning',0,4),
  ('AgentSuivi','Agent Suivi','Prospection + Opportunité + Contrat','success',0,5),
  ('AgentActivation','Agent Activation','Prospection + Opportunité','info',0,6),
  ('AgentVente','Agent Vente','Prospection','warning',0,7);

CREATE TABLE IF NOT EXISTS crminternet_role_permissions (
  role        VARCHAR(64) NOT NULL,
  permission  VARCHAR(80) NOT NULL,
  enabled     TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (role, permission)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO crminternet_role_permissions (role, permission, enabled) VALUES
  ('AgentSuivi','leads.prospection',1),
  ('AgentSuivi','leads.opportunite',1),
  ('AgentSuivi','leads.contrat',1),
  ('AgentSuivi','prospect',1),
  ('AgentSuivi','contract',1),
  ('AgentSuivi','calendar',1),
  ('AgentActivation','leads.prospection',1),
  ('AgentActivation','leads.opportunite',1),
  ('AgentActivation','prospect',1),
  ('AgentActivation','calendar',1),
  ('AgentVente','leads.prospection',1),
  ('AgentVente','prospect',1),
  -- Lead change history (Admin always has all permissions; explicit row for Manager/Superviseur).
  ('Administrateur','lead.history',1),
  ('Manager','lead.history',1);

-- Octrois temporaires de rôle/permission
CREATE TABLE IF NOT EXISTS crminternet_user_grants (
  id              VARCHAR(40)  PRIMARY KEY,
  user_username   VARCHAR(80)  NOT NULL,
  grant_type      ENUM('role','permission') NOT NULL,
  grant_value     VARCHAR(120) NOT NULL,
  reason          VARCHAR(255) NULL,
  granted_by      VARCHAR(80)  NOT NULL,
  starts_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at      DATETIME     NOT NULL,
  revoked         TINYINT(1)   NOT NULL DEFAULT 0,
  revoked_at      DATETIME     NULL,
  revoked_by      VARCHAR(80)  NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user (user_username),
  INDEX idx_active (user_username, expires_at, revoked)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Overrides individuels persistants par utilisateur (allow/deny)
CREATE TABLE IF NOT EXISTS crminternet_user_permission_overrides (
  user_username VARCHAR(80) NOT NULL,
  permission    VARCHAR(80) NOT NULL,
  effect        ENUM('allow','deny') NOT NULL,
  updated_by    VARCHAR(80) NULL,
  updated_at    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_username, permission),
  INDEX idx_user (user_username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
-- 3. PROSPECTS / LEADS
-- =====================================================================
CREATE TABLE IF NOT EXISTS crminternet_prospects (
  id            VARCHAR(40)  PRIMARY KEY,
  civility      ENUM('M','Mme') NOT NULL DEFAULT 'M',
  last_name     VARCHAR(120) NOT NULL,
  first_name    VARCHAR(120) NOT NULL DEFAULT '',
  phone         VARCHAR(40)  NOT NULL DEFAULT '',
  phone2        VARCHAR(40)  NOT NULL DEFAULT '',
  cin           VARCHAR(40)  NOT NULL DEFAULT '',
  birth_date    DATE         NULL,
  email         VARCHAR(160) NOT NULL DEFAULT '',
  source        VARCHAR(80)  NOT NULL DEFAULT 'Terrain',
  status        VARCHAR(80)  NOT NULL DEFAULT 'Nouveau',
  stage         VARCHAR(80)  NULL,
  assigned_to   VARCHAR(80)  NULL,
  created_at    DATE         NOT NULL,
  city          VARCHAR(120) NOT NULL DEFAULT '',
  address       VARCHAR(255) NOT NULL DEFAULT '',
  zone          VARCHAR(120) NOT NULL DEFAULT '',
  outcome       ENUM('pending','won','lost') NOT NULL DEFAULT 'pending',
  lost_reason   VARCHAR(255) NULL,
  comment       TEXT         NULL,
  comment2      TEXT         NULL,
  check_valeur  ENUM('valid','invalid','pending') NOT NULL DEFAULT 'pending',
  INDEX idx_assigned (assigned_to),
  INDEX idx_status   (status),
  INDEX idx_outcome  (outcome),
  INDEX idx_created  (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Pipeline configurable
CREATE TABLE IF NOT EXISTS crminternet_lead_stages (
  id        VARCHAR(40) PRIMARY KEY,
  name      VARCHAR(80) NOT NULL UNIQUE,
  color     VARCHAR(20) NOT NULL DEFAULT 'muted',
  position  INT         NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO crminternet_lead_stages (id, name, color, position) VALUES
  ('S-1','Nouveau','info',1),
  ('S-2','En cours','primary',2),
  ('S-3','Rappel','warning',3),
  ('S-4','Refus','destructive',4),
  ('S-5','Vendu','success',5);

-- Suivi commercial (actions)
CREATE TABLE IF NOT EXISTS crminternet_lead_actions (
  id              VARCHAR(40)  PRIMARY KEY,
  prospect_id     VARCHAR(40)  NOT NULL,
  agent_username  VARCHAR(80)  NOT NULL,
  type            ENUM('appel','visite','relance','note','terrain','reseaux','technicien') NOT NULL DEFAULT 'note',
  comment         TEXT         NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_prospect (prospect_id),
  INDEX idx_created  (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
-- 4. CONTRATS
-- =====================================================================
CREATE TABLE IF NOT EXISTS crminternet_contracts (
  id               VARCHAR(40)  PRIMARY KEY,
  last_name        VARCHAR(120) NOT NULL,
  first_name       VARCHAR(120) NOT NULL DEFAULT '',
  city             VARCHAR(120) NOT NULL DEFAULT '',
  partner          VARCHAR(80)  NOT NULL DEFAULT 'NEOLIANE',
  cabinet          VARCHAR(120) NOT NULL DEFAULT 'Cabinet Paris 1',
  signature_date   DATE         NOT NULL,
  effective_date   DATE         NOT NULL,
  validation_date  DATE         NULL,
  premium          DECIMAL(10,2) NOT NULL DEFAULT 0,
  billing_status   ENUM('Validé Confirmation','En attente de validation','Annuler la confirmation','Pré-validé') NOT NULL DEFAULT 'Pré-validé',
  source           VARCHAR(80)  NOT NULL DEFAULT 'Web',
  assigned_to      VARCHAR(80)  NOT NULL DEFAULT '',
  INDEX idx_assigned (assigned_to),
  INDEX idx_signdate (signature_date),
  INDEX idx_billing  (billing_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
-- 5. CALENDRIER & TÂCHES
-- =====================================================================
CREATE TABLE IF NOT EXISTS crminternet_calendar_events (
  id     VARCHAR(40) PRIMARY KEY,
  title  VARCHAR(160) NOT NULL,
  date   DATE NOT NULL,
  time   VARCHAR(8) NOT NULL,
  type   ENUM('rdv','rappel','signature') NOT NULL DEFAULT 'rdv',
  agent  VARCHAR(80) NOT NULL,
  INDEX idx_date (date),
  INDEX idx_agent (agent)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS crminternet_tasks (
  id              VARCHAR(40)  PRIMARY KEY,
  title           VARCHAR(200) NOT NULL,
  description     TEXT         NULL,
  assigned_to     VARCHAR(80)  NOT NULL,
  related_entity  VARCHAR(20)  NULL,
  related_id      VARCHAR(40)  NULL,
  due_date        DATE         NULL,
  priority        ENUM('low','normal','high') NOT NULL DEFAULT 'normal',
  status          ENUM('todo','in_progress','done','cancelled') NOT NULL DEFAULT 'todo',
  created_by      VARCHAR(80)  NOT NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at    DATETIME     NULL,
  INDEX idx_assigned (assigned_to, status),
  INDEX idx_due (due_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
-- 6. ACTIVITÉ / NOTIFICATIONS / PIÈCES JOINTES
-- =====================================================================
CREATE TABLE IF NOT EXISTS crminternet_activity_log (
  id              VARCHAR(40) PRIMARY KEY,
  entity_type     VARCHAR(32) NOT NULL DEFAULT 'contract',
  entity_id       VARCHAR(40) NOT NULL,
  contract_id     VARCHAR(40) NOT NULL DEFAULT '',
  field           VARCHAR(40) NOT NULL,
  previous_value  VARCHAR(255) NOT NULL,
  new_value       VARCHAR(255) NOT NULL,
  user_username   VARCHAR(80) NOT NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_entity   (entity_type, entity_id),
  INDEX idx_contract (contract_id),
  INDEX idx_created  (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS crminternet_notifications (
  id            VARCHAR(40)  PRIMARY KEY,
  user_username VARCHAR(80) NOT NULL,
  title         VARCHAR(200) NOT NULL,
  body          TEXT         NULL,
  link          VARCHAR(500) NULL,
  read_at       DATETIME     NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_read (user_username, read_at),
  INDEX idx_created  (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS crminternet_attachments (
  id           VARCHAR(40)  PRIMARY KEY,
  entity       VARCHAR(20)  NOT NULL,
  entity_id    VARCHAR(40)  NOT NULL,
  filename     VARCHAR(255) NOT NULL,
  mime_type    VARCHAR(120) NOT NULL DEFAULT 'application/octet-stream',
  size_bytes   BIGINT       NOT NULL DEFAULT 0,
  storage_path VARCHAR(500) NOT NULL,
  uploaded_by  VARCHAR(80)  NOT NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_entity (entity, entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
-- 7. CHAMPS PERSONNALISÉS
-- =====================================================================
CREATE TABLE IF NOT EXISTS crminternet_custom_fields (
  id          VARCHAR(40)  PRIMARY KEY,
  entity      VARCHAR(20)  NOT NULL,
  field_key   VARCHAR(80)  NOT NULL,
  label       VARCHAR(160) NOT NULL,
  type        VARCHAR(20)  NOT NULL DEFAULT 'text',
  options     TEXT         NULL,
  required    TINYINT(1)   NOT NULL DEFAULT 0,
  position    INT          NOT NULL DEFAULT 0,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_entity_key (entity, field_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS crminternet_custom_field_values (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  entity        VARCHAR(20) NOT NULL,
  entity_id     VARCHAR(40) NOT NULL,
  field_key     VARCHAR(80) NOT NULL,
  value         TEXT        NULL,
  updated_at    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_entity_field (entity, entity_id, field_key),
  INDEX idx_entity (entity, entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
-- 8. POINTAGE / AGENTS EXTERNES / COMMISSIONS / PAIE
-- =====================================================================
CREATE TABLE IF NOT EXISTS crminternet_attendance (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id       VARCHAR(40)  NOT NULL,
  username      VARCHAR(80)  NOT NULL,
  login_at      DATETIME     NOT NULL,
  logout_at     DATETIME     NULL,
  total_minutes INT          NOT NULL DEFAULT 0,
  ip            VARCHAR(64)  NULL,
  user_agent    VARCHAR(255) NULL,
  INDEX idx_user_date (user_id, login_at),
  INDEX idx_username  (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS crminternet_external_agents (
  id              VARCHAR(40)  PRIMARY KEY,
  full_name       VARCHAR(160) NOT NULL,
  phone           VARCHAR(40)  NOT NULL DEFAULT '',
  email           VARCHAR(160) NOT NULL DEFAULT '',
  cin             VARCHAR(40)  NOT NULL DEFAULT '',
  commission_rate DECIMAL(6,2) NOT NULL DEFAULT 0.00,
  fixed_amount    DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  active          TINYINT(1)   NOT NULL DEFAULT 1,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notes           TEXT         NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS crminternet_commissions (
  id                 VARCHAR(40)  PRIMARY KEY,
  external_agent_id  VARCHAR(40)  NOT NULL,
  prospect_id        VARCHAR(40)  NULL,
  contract_id        VARCHAR(40)  NULL,
  amount             DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  basis              DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  status             ENUM('pending','paid','cancelled') NOT NULL DEFAULT 'pending',
  earned_at          DATE         NOT NULL,
  paid_at            DATETIME     NULL,
  paid_by            VARCHAR(80)  NULL,
  payment_ref        VARCHAR(120) NULL,
  notes              TEXT         NULL,
  created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_agent  (external_agent_id),
  INDEX idx_status (status),
  INDEX idx_earned (earned_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS crminternet_payroll (
  id            VARCHAR(40)  PRIMARY KEY,
  user_id       VARCHAR(40)  NOT NULL,
  username      VARCHAR(80)  NOT NULL,
  period        CHAR(7)      NOT NULL,
  base_salary   DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  hours_worked  DECIMAL(7,2)  NOT NULL DEFAULT 0.00,
  hourly_rate   DECIMAL(8,2)  NOT NULL DEFAULT 0.00,
  bonus         DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  deductions    DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  total         DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  status        ENUM('draft','validated','paid') NOT NULL DEFAULT 'draft',
  paid_at       DATETIME     NULL,
  notes         TEXT         NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_user_period (user_id, period),
  INDEX idx_period (period),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
-- 9. CHAT INTERNE
-- =====================================================================
CREATE TABLE IF NOT EXISTS crminternet_chat_conversations (
  id              VARCHAR(40)  PRIMARY KEY,
  type            ENUM('dm','group','broadcast') NOT NULL DEFAULT 'group',
  name            VARCHAR(160) NULL,
  created_by      VARCHAR(80)  NULL,
  post_policy     ENUM('all','admins') NOT NULL DEFAULT 'all',
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_message_at DATETIME     NULL,
  INDEX idx_type (type),
  INDEX idx_lastmsg (last_message_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS crminternet_chat_members (
  conversation_id VARCHAR(40)  NOT NULL,
  user_username   VARCHAR(80)  NOT NULL,
  role            ENUM('admin','member') NOT NULL DEFAULT 'member',
  joined_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_read_at    DATETIME     NULL,
  muted           TINYINT(1)   NOT NULL DEFAULT 0,
  hidden          TINYINT(1)   NOT NULL DEFAULT 0,
  PRIMARY KEY (conversation_id, user_username),
  INDEX idx_user (user_username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS crminternet_chat_messages (
  id                   VARCHAR(40)  PRIMARY KEY,
  conversation_id      VARCHAR(40)  NOT NULL,
  sender_username      VARCHAR(80)  NULL,
  body                 TEXT         NOT NULL,
  is_system            TINYINT(1)   NOT NULL DEFAULT 0,
  attachment_id        VARCHAR(40)  NULL,
  attachment_filename  VARCHAR(255) NULL,
  attachment_mime      VARCHAR(120) NULL,
  attachment_size      INT          NULL,
  created_at           DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_conv_created (conversation_id, created_at),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
-- 10. RÉGLAGES (clé/valeur, par scope)
-- =====================================================================
CREATE TABLE IF NOT EXISTS crminternet_settings (
  scope        VARCHAR(80)  NOT NULL DEFAULT 'global',
  setting_key  VARCHAR(120) NOT NULL,
  value        LONGTEXT     NOT NULL,
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (scope, setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
-- 10b. JOURNAL D'AUDIT (toutes les actions utilisateurs)
-- =====================================================================
CREATE TABLE IF NOT EXISTS crminternet_audit_log (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  user_username VARCHAR(80)  NULL,
  user_role     VARCHAR(64)  NULL,
  action        VARCHAR(80)  NOT NULL,
  entity_type   VARCHAR(40)  NULL,
  entity_id     VARCHAR(80)  NULL,
  method        VARCHAR(8)   NULL,
  path          VARCHAR(255) NULL,
  ip            VARCHAR(64)  NULL,
  user_agent    VARCHAR(255) NULL,
  status_code   SMALLINT     NULL,
  details       TEXT         NULL,
  INDEX idx_user (user_username, created_at),
  INDEX idx_action (action, created_at),
  INDEX idx_entity (entity_type, entity_id),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
-- 10c. CHALLENGES OTP (codes de connexion par email)
-- =====================================================================
CREATE TABLE IF NOT EXISTS crminternet_login_otp (
  challenge   VARCHAR(40)  PRIMARY KEY,
  user_id     VARCHAR(40)  NOT NULL,
  code_hash   VARCHAR(255) NOT NULL,
  expires_at  DATETIME     NOT NULL,
  attempts    TINYINT      NOT NULL DEFAULT 0,
  used        TINYINT      NOT NULL DEFAULT 0,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user (user_id),
  INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
-- 11. UTILISATEUR ADMIN PAR DÉFAUT  (mot de passe : Admin@2026)
-- =====================================================================
INSERT IGNORE INTO crminternet_users (id, username, full_name, email, password_hash, role, team, active)
VALUES (
  'U-ADMIN-1',
  'FrancisAdmin',
  'Francis Admin',
  'francis@protection.fr',
  '$2b$10$eGu2YMEeP3aWBnZUOsMQruJ/nVchiEF0Sht0UiaHn8l82P4B4Apka',
  'Administrateur',
  'Direction',
  1
);

-- =====================================================================
-- 12. OPPORTUNITÉS (lead converti -> pipeline opportunités -> contrat)
-- =====================================================================
CALL crm_add_col('crminternet_prospects','converted','`converted` TINYINT(1) NOT NULL DEFAULT 0');
CALL crm_add_col('crminternet_prospects','converted_at','`converted_at` DATETIME NULL');
CALL crm_add_col('crminternet_prospects','opportunity_id','`opportunity_id` VARCHAR(40) NULL');
CREATE TABLE IF NOT EXISTS crminternet_opportunity_stages (
  id        VARCHAR(40) PRIMARY KEY,
  name      VARCHAR(80) NOT NULL UNIQUE,
  color     VARCHAR(20) NOT NULL DEFAULT 'muted',
  position  INT         NOT NULL DEFAULT 0,
  is_won    TINYINT(1)  NOT NULL DEFAULT 0,
  is_lost   TINYINT(1)  NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO crminternet_opportunity_stages (id,name,color,position,is_won,is_lost) VALUES
  ('OS-1','Qualification','info',1,0,0),
  ('OS-2','Proposition','primary',2,0,0),
  ('OS-3','Négociation','warning',3,0,0),
  ('OS-4','Gagnée','success',4,1,0),
  ('OS-5','Perdue','destructive',5,0,1);

CREATE TABLE IF NOT EXISTS crminternet_opportunities (
  id                       VARCHAR(40)  PRIMARY KEY,
  prospect_id              VARCHAR(40)  NULL,
  civility                 ENUM('M','Mme') NOT NULL DEFAULT 'M',
  last_name                VARCHAR(120) NOT NULL,
  first_name               VARCHAR(120) NOT NULL DEFAULT '',
  phone                    VARCHAR(40)  NOT NULL DEFAULT '',
  email                    VARCHAR(160) NOT NULL DEFAULT '',
  city                     VARCHAR(120) NOT NULL DEFAULT '',
  source                   VARCHAR(80)  NOT NULL DEFAULT '',
  title                    VARCHAR(200) NOT NULL DEFAULT '',
  stage                    VARCHAR(80)  NOT NULL DEFAULT 'Qualification',
  amount                   DECIMAL(10,2) NOT NULL DEFAULT 0,
  probability              TINYINT      NOT NULL DEFAULT 50,
  expected_close_date      DATE         NULL,
  assigned_to              VARCHAR(80)  NULL,
  notes                    TEXT         NULL,
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

INSERT IGNORE INTO crminternet_role_permissions (role, permission, enabled) VALUES
  ('Administrateur','opportunity.view',1),('Administrateur','opportunity.edit',1),
  ('Administrateur','opportunity.convert',1),('Administrateur','opportunity.revert',1),
  ('Administrateur','opportunity.stages',1),
  ('Manager','opportunity.view',1),('Manager','opportunity.edit',1),
  ('Manager','opportunity.convert',1),('Manager','opportunity.revert',1),
  ('AgentSuivi','opportunity.view',1),('AgentSuivi','opportunity.edit',1),
  ('AgentVente','opportunity.view',1),('AgentVente','opportunity.edit',1),
  ('AgentVente','opportunity.convert',1);

-- =====================================================================
-- 13. PIPELINES UNIFIÉS (étapes contrats + transitions configurables)
-- =====================================================================
CREATE TABLE IF NOT EXISTS crminternet_contract_stages (
  id          VARCHAR(40) PRIMARY KEY,
  name        VARCHAR(80) NOT NULL UNIQUE,
  color       VARCHAR(20) NOT NULL DEFAULT 'muted',
  position    INT         NOT NULL DEFAULT 0,
  is_initial  TINYINT(1)  NOT NULL DEFAULT 0,
  is_won      TINYINT(1)  NOT NULL DEFAULT 0,
  is_lost     TINYINT(1)  NOT NULL DEFAULT 0,
  auto_action ENUM('none','revert_opportunity') NOT NULL DEFAULT 'none'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO crminternet_contract_stages (id, name, color, position, is_initial, is_won, is_lost, auto_action) VALUES
  ('CS-1','Pré-validé',               'info',        1, 1, 0, 0, 'none'),
  ('CS-2','En attente de validation', 'warning',     2, 0, 0, 0, 'none'),
  ('CS-3','Validé Confirmation',      'success',     3, 0, 1, 0, 'none'),
  ('CS-4','Annuler la confirmation',  'destructive', 4, 0, 0, 1, 'revert_opportunity');

CALL crm_add_col('crminternet_contracts','stage_id','`stage_id` VARCHAR(40) NULL');
CALL crm_add_col('crminternet_contracts','opportunity_id','`opportunity_id` VARCHAR(40) NULL');
CALL crm_add_col('crminternet_lead_stages','is_initial','`is_initial` TINYINT(1) NOT NULL DEFAULT 0');
CALL crm_add_col('crminternet_lead_stages','is_won','`is_won` TINYINT(1) NOT NULL DEFAULT 0');
CALL crm_add_col('crminternet_lead_stages','is_lost','`is_lost` TINYINT(1) NOT NULL DEFAULT 0');
CALL crm_add_col('crminternet_lead_stages','auto_action','`auto_action` ENUM(''none'',''convert_opportunity'',''convert_contract'') NOT NULL DEFAULT ''none''');
UPDATE crminternet_lead_stages SET is_initial=1 WHERE name='Nouveau';
UPDATE crminternet_lead_stages SET is_won=1, auto_action='convert_contract' WHERE name='Vendu';
UPDATE crminternet_lead_stages SET is_lost=1 WHERE name='Refus';

CALL crm_add_col('crminternet_opportunity_stages','is_initial','`is_initial` TINYINT(1) NOT NULL DEFAULT 0');
CALL crm_add_col('crminternet_opportunity_stages','auto_action','`auto_action` ENUM(''none'',''convert_contract'',''revert_lead'') NOT NULL DEFAULT ''none''');
UPDATE crminternet_opportunity_stages SET is_initial=1 WHERE name='Qualification';
UPDATE crminternet_opportunity_stages SET auto_action='convert_contract' WHERE is_won=1;
UPDATE crminternet_opportunity_stages SET auto_action='revert_lead'      WHERE is_lost=1;

CREATE TABLE IF NOT EXISTS crminternet_pipeline_transitions (
  id            VARCHAR(40) PRIMARY KEY,
  pipeline      ENUM('lead','opportunity','contract') NOT NULL,
  from_stage_id VARCHAR(40) NOT NULL,
  to_stage_id   VARCHAR(40) NOT NULL,
  UNIQUE KEY uq_transition (pipeline, from_stage_id, to_stage_id),
  INDEX idx_pipeline (pipeline)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO crminternet_role_permissions (role, permission, enabled) VALUES
  ('Administrateur','pipeline.manage',1),
  ('Administrateur','contract.stages',1),
  ('Administrateur','contract.revert',1),
  ('Manager','contract.revert',1);

-- =====================================================================
-- 14. DUMMY DATA (jeu de démo — sûr à ré-exécuter grâce à INSERT IGNORE)
-- Mot de passe pour tous les utilisateurs de démo : Admin@2026
-- =====================================================================
INSERT IGNORE INTO crminternet_users (id, username, full_name, email, password_hash, role, team, active) VALUES
  ('U-MGR-1', 'sophie.manager',  'Sophie Manager',   'sophie@protection.fr',  '$2b$10$eGu2YMEeP3aWBnZUOsMQruJ/nVchiEF0Sht0UiaHn8l82P4B4Apka', 'Manager',         'Direction',       1),
  ('U-BO-1',  'leila.backoffice','Leila Backoffice', 'leila@protection.fr',   '$2b$10$eGu2YMEeP3aWBnZUOsMQruJ/nVchiEF0Sht0UiaHn8l82P4B4Apka', 'Backoffice',      'Backoffice',      1),
  ('U-AS-1',  'karim.suivi',     'Karim Suivi',      'karim@protection.fr',   '$2b$10$eGu2YMEeP3aWBnZUOsMQruJ/nVchiEF0Sht0UiaHn8l82P4B4Apka', 'AgentSuivi',      'Agence Tunis',    1),
  ('U-AA-1',  'nadia.activation','Nadia Activation', 'nadia@protection.fr',   '$2b$10$eGu2YMEeP3aWBnZUOsMQruJ/nVchiEF0Sht0UiaHn8l82P4B4Apka', 'AgentActivation', 'Agence Tunis',    1),
  ('U-AV-1',  'omar.vente',      'Omar Vente',       'omar@protection.fr',    '$2b$10$eGu2YMEeP3aWBnZUOsMQruJ/nVchiEF0Sht0UiaHn8l82P4B4Apka', 'AgentVente',      'Agence Sousse',   1),
  ('U-AV-2',  'ines.vente',      'Inès Vente',       'ines@protection.fr',    '$2b$10$eGu2YMEeP3aWBnZUOsMQruJ/nVchiEF0Sht0UiaHn8l82P4B4Apka', 'AgentVente',      '',                1);

INSERT IGNORE INTO crminternet_prospects
  (id, civility, last_name, first_name, phone, phone2, cin, birth_date, email, source, status, stage, assigned_to, created_at, city, address, zone, outcome, comment) VALUES
  ('P-1001','M',  'Ben Ali',   'Hatem',   '+216 22 111 222','+216 71 000 001','01234567','1985-04-12','hatem@example.tn',  'Terrain',  'Nouveau','Nouveau', 'omar.vente',     CURDATE(),                  'Tunis',  '12 Av. H. Bourguiba','Centre',     'pending','Lead reçu via campagne porte-à-porte'),
  ('P-1002','Mme','Trabelsi',  'Sana',    '+216 50 333 444','',               '02345678','1990-09-23','sana@example.tn',   'Facebook', 'En cours','En cours','karim.suivi',    DATE_SUB(CURDATE(),INTERVAL 2 DAY),'Sousse', '5 Rue de la Paix',  'Sahloul',    'pending','RDV programmé jeudi 14h'),
  ('P-1003','M',  'Gharbi',    'Mehdi',   '+216 99 555 666','',               '03456789','1978-01-30','mehdi@example.tn',  'Autre',    'Rappel','Rappel',  'nadia.activation',DATE_SUB(CURDATE(),INTERVAL 5 DAY),'Sfax',  '22 Av. Habib Thameur','Nord',      'pending','Rappeler après 17h'),
  ('P-1004','Mme','Khelifi',   'Amira',   '+216 27 777 888','',               '04567890','1995-06-14','amira@example.tn',  'Facebook', 'Vendu','Vendu',     'ines.vente',     DATE_SUB(CURDATE(),INTERVAL 7 DAY),'Tunis', '8 Rue Ibn Khaldoun','Lac 2',      'won',    'Contrat signé le 03/05'),
  ('P-1005','M',  'Mansour',   'Ayoub',   '+216 24 999 000','',               '05678901','1982-11-02','ayoub@example.tn',  'Terrain',  'Refus','Refus',     'omar.vente',     DATE_SUB(CURDATE(),INTERVAL 9 DAY),'Bizerte','3 Av. Taïeb Mehiri','Zarzouna',   'lost',   'Pas intéressé');

INSERT IGNORE INTO crminternet_lead_actions (id, prospect_id, agent_username, type, comment, created_at) VALUES
  ('LA-1','P-1001','omar.vente',     'terrain','Premier contact en porte-à-porte', NOW()),
  ('LA-2','P-1002','karim.suivi',    'appel',  'Appel de qualification, intéressé',NOW()),
  ('LA-3','P-1003','nadia.activation','relance','Laissé message vocal',            NOW()),
  ('LA-4','P-1004','ines.vente',     'visite', 'RDV signature OK',                 NOW()),
  ('LA-5','P-1005','omar.vente',     'note',   'Demande de ne plus être contacté', NOW());

INSERT IGNORE INTO crminternet_opportunities
  (id, prospect_id, civility, last_name, first_name, phone, email, city, source, title, stage, amount, probability, expected_close_date, assigned_to, created_at, created_by) VALUES
  ('OPP-1','P-1002','Mme','Trabelsi','Sana','+216 50 333 444','sana@example.tn','Sousse','Facebook','Pack Famille Confort','Proposition',   1200.00, 60, DATE_ADD(CURDATE(),INTERVAL 7 DAY),  'karim.suivi',  NOW(), 'karim.suivi'),
  ('OPP-2','P-1004','Mme','Khelifi','Amira','+216 27 777 888','amira@example.tn','Tunis', 'Facebook','Pack Premium',         'Gagnée',        1850.00, 100,DATE_SUB(CURDATE(),INTERVAL 3 DAY), 'ines.vente',   NOW(), 'ines.vente');

INSERT IGNORE INTO crminternet_contracts
  (id, last_name, first_name, city, partner, cabinet, signature_date, effective_date, validation_date, premium, billing_status, source, assigned_to, stage_id, opportunity_id) VALUES
  ('C-2001','Khelifi','Amira','Tunis','NEOLIANE','Cabinet Tunis 1', DATE_SUB(CURDATE(),INTERVAL 3 DAY), CURDATE(),                              CURDATE(),                              1850.00,'Validé Confirmation',     'Facebook','ines.vente',  'CS-3','OPP-2'),
  ('C-2002','Trabelsi','Sana','Sousse','SPVIE',  'Cabinet Sousse',  DATE_SUB(CURDATE(),INTERVAL 1 DAY), DATE_ADD(CURDATE(),INTERVAL 14 DAY), NULL,                                   1200.00,'En attente de validation','Facebook','karim.suivi','CS-2', NULL);

INSERT IGNORE INTO crminternet_calendar_events (id, title, date, time, type, agent) VALUES
  ('EV-1','RDV Trabelsi Sana',  DATE_ADD(CURDATE(),INTERVAL 2 DAY),'14:00','rdv',      'karim.suivi'),
  ('EV-2','Rappel Gharbi Mehdi',DATE_ADD(CURDATE(),INTERVAL 1 DAY),'17:30','rappel',   'nadia.activation'),
  ('EV-3','Signature Khelifi',  CURDATE(),                          '10:00','signature','ines.vente');

INSERT IGNORE INTO crminternet_tasks (id, title, description, assigned_to, related_entity, related_id, due_date, priority, status, created_by, created_at) VALUES
  ('T-1','Relancer Hatem Ben Ali',    'Confirmer disponibilité pour visite','omar.vente',     'prospect','P-1001',DATE_ADD(CURDATE(),INTERVAL 1 DAY),'high','todo',       'sophie.manager',NOW()),
  ('T-2','Préparer devis Pack Famille','Devis pour OPP-1',                  'karim.suivi',    'opportunity','OPP-1',DATE_ADD(CURDATE(),INTERVAL 3 DAY),'normal','in_progress','sophie.manager',NOW()),
  ('T-3','Valider contrat C-2002',     'Vérifier dossier complet',          'leila.backoffice','contract','C-2002',CURDATE(),                          'high','todo',       'sophie.manager',NOW());

INSERT IGNORE INTO crminternet_notifications (id, user_username, title, body, link, created_at) VALUES
  ('N-1','omar.vente',     'Nouveau lead assigné',      'Hatem Ben Ali vous a été assigné.', '/prospects/P-1001', NOW()),
  ('N-2','karim.suivi',    'RDV demain 14:00',          'Trabelsi Sana — Sousse',            '/calendar',         NOW()),
  ('N-3','leila.backoffice','Contrat à valider',         'C-2002 en attente de validation',   '/contracts/C-2002', NOW());

INSERT IGNORE INTO crminternet_external_agents (id, full_name, phone, email, cin, commission_rate, fixed_amount, active) VALUES
  ('EA-1','Mounir Apporteur','+216 98 100 200','mounir@partners.tn','11223344', 5.00,  0.00, 1),
  ('EA-2','Salma Réseau',    '+216 97 300 400','salma@partners.tn', '55667788', 0.00, 50.00, 1);

INSERT IGNORE INTO crminternet_commissions (id, external_agent_id, prospect_id, contract_id, amount, basis, status, earned_at) VALUES
  ('CM-1','EA-1','P-1004','C-2001', 92.50, 1850.00,'pending', CURDATE()),
  ('CM-2','EA-2','P-1002','C-2002', 50.00, 1200.00,'pending', CURDATE());

INSERT IGNORE INTO crminternet_attendance (user_id, username, login_at, logout_at, total_minutes, ip) VALUES
  ('U-AV-1','omar.vente',     DATE_SUB(NOW(),INTERVAL 8 HOUR), DATE_SUB(NOW(),INTERVAL 1 HOUR), 420,'10.0.0.21'),
  ('U-AS-1','karim.suivi',    DATE_SUB(NOW(),INTERVAL 7 HOUR), DATE_SUB(NOW(),INTERVAL 30 MINUTE), 390,'10.0.0.22'),
  ('U-AA-1','nadia.activation',DATE_SUB(NOW(),INTERVAL 6 HOUR), NULL, 0,'10.0.0.23');

INSERT IGNORE INTO crminternet_payroll (id, user_id, username, period, base_salary, hours_worked, hourly_rate, bonus, deductions, total, status) VALUES
  ('PAY-1','U-AV-1','omar.vente',     DATE_FORMAT(CURDATE(),'%Y-%m'), 800.00, 160, 5.00, 100.00, 0.00, 1700.00,'draft'),
  ('PAY-2','U-AS-1','karim.suivi',    DATE_FORMAT(CURDATE(),'%Y-%m'),1000.00, 160, 6.25, 150.00,50.00, 2100.00,'validated');

INSERT IGNORE INTO crminternet_chat_conversations (id, type, name, created_by, post_policy, created_at, last_message_at) VALUES
  ('CONV-1','group','Équipe Commerciale','sophie.manager','all',    NOW(), NOW()),
  ('CONV-2','dm',   NULL,                'sophie.manager','all',    NOW(), NOW()),
  ('CONV-3','broadcast','Annonces Direction','FrancisAdmin','admins',NOW(), NOW());

INSERT IGNORE INTO crminternet_chat_members (conversation_id, user_username, role) VALUES
  ('CONV-1','sophie.manager','admin'),
  ('CONV-1','karim.suivi','member'),
  ('CONV-1','nadia.activation','member'),
  ('CONV-1','omar.vente','member'),
  ('CONV-1','ines.vente','member'),
  ('CONV-2','sophie.manager','admin'),
  ('CONV-2','leila.backoffice','member'),
  ('CONV-3','FrancisAdmin','admin'),
  ('CONV-3','sophie.manager','member'),
  ('CONV-3','karim.suivi','member'),
  ('CONV-3','nadia.activation','member'),
  ('CONV-3','omar.vente','member'),
  ('CONV-3','ines.vente','member'),
  ('CONV-3','leila.backoffice','member');

INSERT IGNORE INTO crminternet_chat_messages (id, conversation_id, sender_username, body, is_system, created_at) VALUES
  ('MSG-1','CONV-1','sophie.manager',  'Bonjour équipe, on fait le point à 17h.', 0, NOW()),
  ('MSG-2','CONV-1','karim.suivi',     'OK pour moi.',                            0, NOW()),
  ('MSG-3','CONV-2','sophie.manager',  'Leila, peux-tu valider C-2002 ?',         0, NOW()),
  ('MSG-4','CONV-3','FrancisAdmin',    'Nouvelle politique de commissions en vigueur le 01/06.', 0, NOW());

INSERT IGNORE INTO crminternet_settings (scope, setting_key, value) VALUES
  ('global','company.name',      'Protection CRM'),
  ('global','company.currency',  'TND'),
  ('global','otp.enabled',       '1'),
  ('global','otp.code_length',   '4'),
  ('global','otp.ttl_minutes',   '10');

INSERT IGNORE INTO crminternet_custom_fields (id, entity, field_key, label, type, required, position) VALUES
  ('CF-1','prospect','budget_estime','Budget estimé (TND)','number',0,1),
  ('CF-2','prospect','canal_prefere','Canal de contact préféré','select',0,2),
  ('CF-3','contract','mode_paiement','Mode de paiement','select',1,1);

UPDATE crminternet_custom_fields SET options='["Téléphone","Email","WhatsApp","Visite"]' WHERE id='CF-2';
UPDATE crminternet_custom_fields SET options='["Carte","Virement","Espèces","Prélèvement"]' WHERE id='CF-3';

INSERT IGNORE INTO crminternet_custom_field_values (entity, entity_id, field_key, value) VALUES
  ('prospect','P-1002','budget_estime','1500'),
  ('prospect','P-1002','canal_prefere','WhatsApp'),
  ('contract','C-2001','mode_paiement','Prélèvement');

-- =====================================================================
-- 14. PROSPECT TYPES (campagnes / catégories) — type unique partagé
--     entre Prospect, Opportunité et Contrat. Les champs personnalisés
--     peuvent être liés à un type (type_id) ou partagés (type_id NULL).
-- =====================================================================
CREATE TABLE IF NOT EXISTS crminternet_prospect_types (
  id           VARCHAR(40)  PRIMARY KEY,
  name         VARCHAR(120) NOT NULL UNIQUE,
  description  VARCHAR(255) NOT NULL DEFAULT '',
  color        VARCHAR(32)  NOT NULL DEFAULT 'primary',
  position     INT          NOT NULL DEFAULT 100,
  active       TINYINT(1)   NOT NULL DEFAULT 1,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_active_pos (active, position)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO crminternet_prospect_types (id, name, description, color, position, active) VALUES
  ('PT-DEFAULT','Standard','Type par défaut pour tous les prospects','primary',1,1);

-- type_id sur prospects / opportunités / contrats (carry-through Prospect → Opp → Contract)
CALL crm_add_col('crminternet_prospects',     'type_id', '`type_id` VARCHAR(40) NULL');
CALL crm_add_col('crminternet_opportunities', 'type_id', '`type_id` VARCHAR(40) NULL');
CALL crm_add_col('crminternet_contracts',     'type_id', '`type_id` VARCHAR(40) NULL');

-- type_id sur custom_fields : NULL = champ partagé pour toute l'entité,
-- sinon scope au type donné.
CALL crm_add_col('crminternet_custom_fields', 'type_id', '`type_id` VARCHAR(40) NULL');

-- Permissions par défaut
INSERT IGNORE INTO crminternet_role_permissions (role, permission, enabled) VALUES
  ('Administrateur','prospect_type.view',1), ('Administrateur','prospect_type.edit',1),
  ('Administrateur','prospect_type.delete',1),
  ('Manager','prospect_type.view',1), ('Manager','prospect_type.edit',1),
  ('Agent','prospect_type.view',1),
  ('AgentSuivi','prospect_type.view',1),
  ('AgentActivation','prospect_type.view',1),
  ('AgentVente','prospect_type.view',1),
  ('Backoffice','prospect_type.view',1);

SET FOREIGN_KEY_CHECKS=1;

-- =====================================================================
-- 15. CLEANUP — drop orphan permission rows (role 'Superviseur' n'existe pas
--     dans crminternet_roles ; le rôle réel est 'Manager' avec label
--     'Superviseur'). Idempotent.
-- =====================================================================
DELETE FROM crminternet_role_permissions
 WHERE role NOT IN (SELECT name FROM crminternet_roles);

-- =====================================================================
-- 16. SEED — catalogue de permissions étendu (page.* + actions)
--     Toutes lignes idempotentes (INSERT IGNORE). Admin a déjà tout via
--     bypass code-side, mais on enregistre pour la matrice UI.
-- =====================================================================
INSERT IGNORE INTO crminternet_role_permissions (role, permission, enabled) VALUES
  -- Admin: tout activé (la matrice UI affichera coché)
  ('Administrateur','page.dashboard',1),('Administrateur','page.prospects',1),
  ('Administrateur','page.opportunities',1),('Administrateur','page.contracts',1),
  ('Administrateur','page.calendar',1),('Administrateur','page.tasks',1),
  ('Administrateur','page.notifications',1),('Administrateur','page.dispatch',1),
  ('Administrateur','page.backoffice',1),('Administrateur','page.pipelines',1),
  ('Administrateur','page.stages',1),('Administrateur','page.reports',1),
  ('Administrateur','page.reconciliation',1),('Administrateur','page.objectives',1),
  ('Administrateur','page.profile',1),('Administrateur','page.documentation',1),
  ('Administrateur','page.configuration',1),('Administrateur','page.users',1),
  ('Administrateur','page.roles',1),('Administrateur','page.audit',1),
  ('Administrateur','page.security',1),('Administrateur','page.hr.attendance',1),
  ('Administrateur','page.hr.payroll',1),('Administrateur','page.hr.commissions',1),
  ('Administrateur','page.hr.external-agents',1),
  -- Manager: pilotage complet sauf admin/sécurité
  ('Manager','page.dashboard',1),('Manager','page.prospects',1),
  ('Manager','page.opportunities',1),('Manager','page.contracts',1),
  ('Manager','page.calendar',1),('Manager','page.tasks',1),
  ('Manager','page.notifications',1),('Manager','page.dispatch',1),
  ('Manager','page.backoffice',1),('Manager','page.pipelines',1),
  ('Manager','page.stages',1),('Manager','page.reports',1),
  ('Manager','page.reconciliation',1),('Manager','page.objectives',1),
  ('Manager','page.profile',1),('Manager','page.documentation',1),
  ('Manager','page.users',1),('Manager','page.audit',1),
  ('Manager','page.hr.attendance',1),('Manager','page.hr.commissions',1),
  -- Agents: opérationnel
  ('Agent','page.dashboard',1),('Agent','page.prospects',1),
  ('Agent','page.opportunities',1),('Agent','page.contracts',1),
  ('Agent','page.calendar',1),('Agent','page.tasks',1),
  ('Agent','page.notifications',1),('Agent','page.profile',1),
  ('Agent','page.documentation',1),('Agent','page.hr.attendance',1),
  ('AgentSuivi','page.dashboard',1),('AgentSuivi','page.prospects',1),
  ('AgentSuivi','page.opportunities',1),('AgentSuivi','page.contracts',1),
  ('AgentSuivi','page.calendar',1),('AgentSuivi','page.tasks',1),
  ('AgentSuivi','page.notifications',1),('AgentSuivi','page.profile',1),
  ('AgentSuivi','page.hr.attendance',1),
  ('AgentActivation','page.dashboard',1),('AgentActivation','page.prospects',1),
  ('AgentActivation','page.opportunities',1),('AgentActivation','page.calendar',1),
  ('AgentActivation','page.tasks',1),('AgentActivation','page.notifications',1),
  ('AgentActivation','page.profile',1),('AgentActivation','page.hr.attendance',1),
  ('AgentVente','page.dashboard',1),('AgentVente','page.prospects',1),
  ('AgentVente','page.calendar',1),('AgentVente','page.tasks',1),
  ('AgentVente','page.notifications',1),('AgentVente','page.profile',1),
  ('AgentVente','page.hr.attendance',1),
  ('Backoffice','page.dashboard',1),('Backoffice','page.contracts',1),
  ('Backoffice','page.backoffice',1),('Backoffice','page.tasks',1),
  ('Backoffice','page.notifications',1),('Backoffice','page.profile',1),
  ('Backoffice','page.documentation',1),('Backoffice','page.hr.attendance',1);

-- Actions par défaut (les agents peuvent voir/éditer leurs leads, créer tâches, etc.)
INSERT IGNORE INTO crminternet_role_permissions (role, permission, enabled) VALUES
  ('Manager','prospect.view',1),('Manager','prospect.add',1),('Manager','prospect.edit',1),
  ('Manager','prospect.assign',1),('Manager','prospect.export',1),('Manager','prospect.import',1),
  ('Manager','prospect.convert',1),('Manager','prospect.source',1),('Manager','prospect.status',1),
  ('Manager','opportunity.view',1),('Manager','opportunity.edit',1),('Manager','opportunity.convert',1),
  ('Manager','opportunity.export',1),
  ('Manager','contract.view',1),('Manager','contract.add',1),('Manager','contract.edit',1),
  ('Manager','contract.validate',1),('Manager','contract.export',1),
  ('Manager','task.add',1),('Manager','task.edit',1),('Manager','task.complete',1),
  ('Manager','calendar.event.add',1),('Manager','calendar.event.edit',1),
  ('Manager','user.view',1),('Manager','role.view',1),('Manager','report.view',1),
  ('Manager','report.export',1),('Manager','audit.view',1),('Manager','lead.history',1),
  -- HR : le Manager garde l'accès historique aux modules RH
  ('Manager','page.hr.payroll',1),('Manager','page.hr.external-agents',1),
  ('Manager','hr.attendance.clock',1),('Manager','hr.attendance.export',1),
  ('Manager','hr.payroll.edit',1),('Manager','hr.payroll.export',1),
  ('Manager','hr.commissions.edit',1),('Manager','hr.commissions.export',1),
  ('Manager','hr.external_agents.add',1),('Manager','hr.external_agents.edit',1),
  ('Agent','prospect.view',1),('Agent','prospect.add',1),('Agent','prospect.edit',1),
  ('Agent','prospect.convert',1),('Agent','opportunity.view',1),('Agent','opportunity.edit',1),
  ('Agent','opportunity.convert',1),('Agent','contract.view',1),('Agent','contract.add',1),
  ('Agent','contract.edit',1),('Agent','task.add',1),('Agent','task.edit',1),
  ('Agent','task.complete',1),('Agent','calendar.event.add',1),('Agent','calendar.event.edit',1),
  ('Agent','hr.attendance.clock',1),
  ('AgentSuivi','prospect.view',1),('AgentSuivi','prospect.edit',1),('AgentSuivi','prospect.convert',1),
  ('AgentSuivi','opportunity.view',1),('AgentSuivi','opportunity.edit',1),
  ('AgentSuivi','opportunity.convert',1),('AgentSuivi','contract.view',1),('AgentSuivi','contract.edit',1),
  ('AgentSuivi','task.add',1),('AgentSuivi','task.edit',1),('AgentSuivi','task.complete',1),
  ('AgentSuivi','calendar.event.add',1),('AgentSuivi','hr.attendance.clock',1),
  ('AgentActivation','prospect.view',1),('AgentActivation','prospect.edit',1),
  ('AgentActivation','prospect.convert',1),('AgentActivation','opportunity.view',1),
  ('AgentActivation','opportunity.edit',1),('AgentActivation','task.add',1),
  ('AgentActivation','task.edit',1),('AgentActivation','task.complete',1),
  ('AgentActivation','calendar.event.add',1),('AgentActivation','hr.attendance.clock',1),
  ('AgentVente','prospect.view',1),('AgentVente','prospect.add',1),('AgentVente','prospect.edit',1),
  ('AgentVente','task.add',1),('AgentVente','task.complete',1),
  ('AgentVente','calendar.event.add',1),('AgentVente','hr.attendance.clock',1),
  ('Backoffice','contract.view',1),('Backoffice','contract.validate',1),
  ('Backoffice','contract.cancel',1),('Backoffice','contract.export',1),
  ('Backoffice','backoffice.validate',1),('Backoffice','backoffice.reject',1),
  ('Backoffice','task.add',1),('Backoffice','task.complete',1),
  ('Backoffice','hr.attendance.clock',1);

-- =====================================================================
-- FIN — installation complète
-- =====================================================================
DROP PROCEDURE IF EXISTS crm_add_col;

-- =====================================================================
-- 13. Migration v2 prospects : gouvernorat / délégation + CIN unique
-- =====================================================================
CALL crm_add_col('crminternet_prospects',    'gouvernorat', "`gouvernorat` VARCHAR(120) NOT NULL DEFAULT ''");
CALL crm_add_col('crminternet_prospects',    'delegation',  "`delegation`  VARCHAR(120) NOT NULL DEFAULT ''");
CALL crm_add_col('crminternet_opportunities','gouvernorat', "`gouvernorat` VARCHAR(120) NOT NULL DEFAULT ''");
CALL crm_add_col('crminternet_opportunities','delegation',  "`delegation`  VARCHAR(120) NOT NULL DEFAULT ''");
CALL crm_add_col('crminternet_contracts',    'gouvernorat', "`gouvernorat` VARCHAR(120) NOT NULL DEFAULT ''");
CALL crm_add_col('crminternet_contracts',    'delegation',  "`delegation`  VARCHAR(120) NOT NULL DEFAULT ''");
UPDATE crminternet_prospects SET cin = NULL WHERE cin = '';
ALTER TABLE crminternet_prospects MODIFY cin VARCHAR(40) NULL;
-- CIN doublons autorisés : on conserve uniquement un index simple (lookup rapide).
SET @has_ux := (SELECT COUNT(1) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='crminternet_prospects' AND index_name='ux_prospect_cin');
SET @sql := IF(@has_ux>0,'ALTER TABLE crminternet_prospects DROP INDEX ux_prospect_cin','SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @h := (SELECT COUNT(1) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='crminternet_prospects' AND index_name='ix_prospect_cin');
SET @sql := IF(@h=0,'ALTER TABLE crminternet_prospects ADD INDEX ix_prospect_cin (cin)','SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- =====================================================================
-- 14. Migration v2 identité — opportunités & contrats alignés sur les
--     champs prospects (civilité, GSM2, CIN unique, naissance, adresse,
--     observations 1 & 2). Idempotent.
-- =====================================================================
CALL crm_add_col('crminternet_opportunities','phone2',     "`phone2`     VARCHAR(40)  NULL DEFAULT ''");
CALL crm_add_col('crminternet_opportunities','cin',        "`cin`        VARCHAR(40)  NULL");
CALL crm_add_col('crminternet_opportunities','birth_date', "`birth_date` DATE         NULL");
CALL crm_add_col('crminternet_opportunities','address',    "`address`    VARCHAR(255) NOT NULL DEFAULT ''");
CALL crm_add_col('crminternet_opportunities','comment1',   "`comment1`   TEXT         NULL");
CALL crm_add_col('crminternet_opportunities','comment2',   "`comment2`   TEXT         NULL");

CALL crm_add_col('crminternet_contracts','civility',   "`civility`   ENUM('M','Mme') NOT NULL DEFAULT 'M'");
CALL crm_add_col('crminternet_contracts','phone',      "`phone`      VARCHAR(40)  NOT NULL DEFAULT ''");
CALL crm_add_col('crminternet_contracts','phone2',     "`phone2`     VARCHAR(40)  NULL DEFAULT ''");
CALL crm_add_col('crminternet_contracts','cin',        "`cin`        VARCHAR(40)  NULL");
CALL crm_add_col('crminternet_contracts','birth_date', "`birth_date` DATE         NULL");
CALL crm_add_col('crminternet_contracts','email',      "`email`      VARCHAR(160) NOT NULL DEFAULT ''");
CALL crm_add_col('crminternet_contracts','address',    "`address`    VARCHAR(255) NOT NULL DEFAULT ''");
CALL crm_add_col('crminternet_contracts','comment1',   "`comment1`   TEXT         NULL");
CALL crm_add_col('crminternet_contracts','comment2',   "`comment2`   TEXT         NULL");

UPDATE crminternet_opportunities SET cin = NULL WHERE cin = '';
UPDATE crminternet_contracts     SET cin = NULL WHERE cin = '';

-- CIN doublons autorisés sur opps & contrats : index simple uniquement.
SET @h := (SELECT COUNT(1) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='crminternet_opportunities' AND index_name='ux_opp_cin');
SET @sql := IF(@h>0,'ALTER TABLE crminternet_opportunities DROP INDEX ux_opp_cin','SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @h := (SELECT COUNT(1) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='crminternet_opportunities' AND index_name='ix_opp_cin');
SET @sql := IF(@h=0,'ALTER TABLE crminternet_opportunities ADD INDEX ix_opp_cin (cin)','SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @h := (SELECT COUNT(1) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='crminternet_contracts' AND index_name='ux_contract_cin');
SET @sql := IF(@h>0,'ALTER TABLE crminternet_contracts DROP INDEX ux_contract_cin','SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @h := (SELECT COUNT(1) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='crminternet_contracts' AND index_name='ix_contract_cin');
SET @sql := IF(@h=0,'ALTER TABLE crminternet_contracts ADD INDEX ix_contract_cin (cin)','SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
