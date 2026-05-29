-- =====================================================================
-- Migration: Pipelines unifiés (Leads / Opportunités / Contrats)
--
-- Objectifs :
--  1. Aligner les 3 tables d'étapes : ajout de is_initial / is_won / is_lost
--     et d'un champ auto_action qui pilote l'auto-conversion.
--  2. Créer une table contract_stages (avant : ENUM figé).
--  3. Créer une table pipeline_transitions pour configurer les passages
--     forward/back autorisés par l'admin (par pipeline).
--  4. Conserver l'existant ENUM billing_status sur les contrats : on ajoute
--     une colonne stage_id qui devient la source de vérité.
-- =====================================================================

-- ---- 1. Lead stages : nouveaux flags + auto_action ------------------
ALTER TABLE crminternet_lead_stages
  ADD COLUMN IF NOT EXISTS is_initial TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_won     TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_lost    TINYINT(1) NOT NULL DEFAULT 0,
  -- auto_action : déclenché quand un lead atteint cette étape.
  --   'none'                  : rien
  --   'convert_opportunity'   : auto-convertit lead -> opportunité
  --   'convert_contract'      : auto-convertit lead -> contrat (raccourci)
  ADD COLUMN IF NOT EXISTS auto_action ENUM('none','convert_opportunity','convert_contract')
                                       NOT NULL DEFAULT 'none';

UPDATE crminternet_lead_stages SET is_initial = 1 WHERE name = 'Nouveau';
UPDATE crminternet_lead_stages SET is_won = 1, auto_action = 'convert_contract' WHERE name = 'Vendu';
UPDATE crminternet_lead_stages SET is_lost = 1 WHERE name = 'Refus';

-- ---- 2. Opportunity stages : ajout is_initial + auto_action ---------
ALTER TABLE crminternet_opportunity_stages
  ADD COLUMN IF NOT EXISTS is_initial  TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS auto_action ENUM('none','convert_contract','revert_lead')
                                       NOT NULL DEFAULT 'none';

UPDATE crminternet_opportunity_stages SET is_initial = 1 WHERE name = 'Qualification';
UPDATE crminternet_opportunity_stages SET auto_action = 'convert_contract' WHERE is_won = 1;
UPDATE crminternet_opportunity_stages SET auto_action = 'revert_lead'      WHERE is_lost = 1;

-- ---- 3. Contract stages : nouvelle table dédiée ---------------------
CREATE TABLE IF NOT EXISTS crminternet_contract_stages (
  id          VARCHAR(40) PRIMARY KEY,
  name        VARCHAR(80) NOT NULL UNIQUE,
  color       VARCHAR(20) NOT NULL DEFAULT 'muted',
  position    INT         NOT NULL DEFAULT 0,
  is_initial  TINYINT(1)  NOT NULL DEFAULT 0,
  is_won      TINYINT(1)  NOT NULL DEFAULT 0,
  is_lost     TINYINT(1)  NOT NULL DEFAULT 0,
  -- auto_action : 'none' | 'revert_opportunity' (renvoie le contrat -> opportunité)
  auto_action ENUM('none','revert_opportunity') NOT NULL DEFAULT 'none'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO crminternet_contract_stages (id, name, color, position, is_initial, is_won, is_lost, auto_action) VALUES
  ('CS-1', 'Pré-validé',                'info',        1, 1, 0, 0, 'none'),
  ('CS-2', 'En attente de validation',  'warning',     2, 0, 0, 0, 'none'),
  ('CS-3', 'Validé Confirmation',       'success',     3, 0, 1, 0, 'none'),
  ('CS-4', 'Annuler la confirmation',   'destructive', 4, 0, 0, 1, 'revert_opportunity');

-- Lien stage_id sur le contrat (la colonne ENUM billing_status reste pour
-- compat ; on la maintient en miroir côté backend).
ALTER TABLE crminternet_contracts
  ADD COLUMN IF NOT EXISTS stage_id VARCHAR(40) NULL,
  ADD COLUMN IF NOT EXISTS opportunity_id VARCHAR(40) NULL,
  ADD INDEX IF NOT EXISTS idx_contract_stage (stage_id),
  ADD INDEX IF NOT EXISTS idx_contract_opp   (opportunity_id);

-- Backfill : mappe l'ENUM existant vers le nouveau stage_id.
UPDATE crminternet_contracts c
  JOIN crminternet_contract_stages s ON s.name = c.billing_status
  SET c.stage_id = s.id
  WHERE c.stage_id IS NULL;

-- ---- 4. Pipeline transitions (forward / back autorisés) -------------
-- pipeline : 'lead' | 'opportunity' | 'contract'
-- from_stage_id / to_stage_id : ids des stages du même pipeline
-- Si AUCUNE ligne n'existe pour un pipeline donné, le backend autorise
-- toutes les transitions (mode "ouvert" par défaut).
CREATE TABLE IF NOT EXISTS crminternet_pipeline_transitions (
  id            VARCHAR(40) PRIMARY KEY,
  pipeline      ENUM('lead','opportunity','contract') NOT NULL,
  from_stage_id VARCHAR(40) NOT NULL,
  to_stage_id   VARCHAR(40) NOT NULL,
  UNIQUE KEY uq_transition (pipeline, from_stage_id, to_stage_id),
  INDEX idx_pipeline (pipeline)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---- 5. Permissions -----------------------------------------------
INSERT IGNORE INTO crminternet_role_permissions (role, permission, enabled) VALUES
  ('Administrateur','pipeline.manage', 1),
  ('Administrateur','contract.stages', 1),
  ('Administrateur','contract.revert', 1),
  ('Manager',       'contract.revert', 1);

-- ---- 6. Lien retour opportunité -> lead pour le revert contrat ------
-- (déjà couvert par opportunity.prospect_id)
