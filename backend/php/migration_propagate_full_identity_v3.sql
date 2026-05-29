-- =====================================================================
-- Migration : propagation 100% des infos prospect → opportunité → contrat.
--
-- Objectif : ajouter sur les tables `crminternet_opportunities` et
-- `crminternet_contracts` toutes les colonnes prospect qui manquaient
-- encore (animateur, ancien_ligne, zone, lost_reason, lead_status), plus
-- la référence directe `prospect_id` sur le contrat afin que la chaîne
-- prospect → opportunité → contrat soit traçable même sans passer par
-- l'opportunité.
--
-- Idempotente : peut être rejouée sans risque grâce à la procédure
-- crm_add_col_v3 (ajoute la colonne uniquement si absente).
-- =====================================================================

DROP PROCEDURE IF EXISTS crm_add_col_v3;
DELIMITER $$
CREATE PROCEDURE crm_add_col_v3(IN tbl VARCHAR(64), IN col VARCHAR(64), IN ddl TEXT)
BEGIN
  IF (SELECT COUNT(*) FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = tbl AND column_name = col) = 0 THEN
    SET @sql := CONCAT('ALTER TABLE `', tbl, '` ADD COLUMN ', ddl);
    PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
  END IF;
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS crm_add_idx_v3;
DELIMITER $$
CREATE PROCEDURE crm_add_idx_v3(IN tbl VARCHAR(64), IN idx VARCHAR(64), IN cols VARCHAR(255))
BEGIN
  IF (SELECT COUNT(*) FROM information_schema.statistics
      WHERE table_schema = DATABASE() AND table_name = tbl AND index_name = idx) = 0 THEN
    SET @sql := CONCAT('ALTER TABLE `', tbl, '` ADD INDEX ', idx, ' (', cols, ')');
    PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
  END IF;
END$$
DELIMITER ;

-- ---------- Opportunités ----------
CALL crm_add_col_v3('crminternet_opportunities', 'animateur',    "`animateur`    VARCHAR(120) NULL AFTER phone2");
CALL crm_add_col_v3('crminternet_opportunities', 'ancien_ligne', "`ancien_ligne` VARCHAR(40)  NULL AFTER animateur");
CALL crm_add_col_v3('crminternet_opportunities', 'zone',         "`zone`         VARCHAR(120) NOT NULL DEFAULT '' AFTER delegation");
CALL crm_add_col_v3('crminternet_opportunities', 'lost_reason',  "`lost_reason`  VARCHAR(255) NULL");
CALL crm_add_col_v3('crminternet_opportunities', 'lead_status',  "`lead_status`  VARCHAR(80)  NULL COMMENT 'Statut d''appel du lead source au moment de la conversion'");

-- ---------- Contrats ----------
CALL crm_add_col_v3('crminternet_contracts', 'prospect_id',  "`prospect_id`  VARCHAR(40)  NULL AFTER opportunity_id");
CALL crm_add_col_v3('crminternet_contracts', 'animateur',    "`animateur`    VARCHAR(120) NULL");
CALL crm_add_col_v3('crminternet_contracts', 'ancien_ligne', "`ancien_ligne` VARCHAR(40)  NULL");
CALL crm_add_col_v3('crminternet_contracts', 'zone',         "`zone`         VARCHAR(120) NOT NULL DEFAULT ''");
CALL crm_add_col_v3('crminternet_contracts', 'lead_status',  "`lead_status`  VARCHAR(80)  NULL");

CALL crm_add_idx_v3('crminternet_opportunities', 'idx_opp_animateur',    'animateur');
CALL crm_add_idx_v3('crminternet_opportunities', 'idx_opp_ancien_ligne', 'ancien_ligne');
CALL crm_add_idx_v3('crminternet_contracts',     'idx_contract_prospect','prospect_id');
CALL crm_add_idx_v3('crminternet_contracts',     'idx_contract_animateur','animateur');

-- ---------- Backfill best-effort depuis la chaîne prospect → opportunité → contrat ----------
UPDATE crminternet_opportunities o
  JOIN crminternet_prospects p ON p.id = o.prospect_id
  SET
    o.animateur    = COALESCE(NULLIF(o.animateur, ''),    p.animateur),
    o.ancien_ligne = COALESCE(NULLIF(o.ancien_ligne, ''), p.ancien_ligne),
    o.zone         = COALESCE(NULLIF(o.zone, ''),         p.zone),
    o.lost_reason  = COALESCE(NULLIF(o.lost_reason, ''),  p.lost_reason),
    o.lead_status  = COALESCE(NULLIF(o.lead_status, ''),  p.status)
  WHERE p.id IS NOT NULL;

UPDATE crminternet_contracts c
  JOIN crminternet_opportunities o ON o.id = c.opportunity_id
  LEFT JOIN crminternet_prospects p ON p.id = o.prospect_id
  SET
    c.prospect_id  = COALESCE(NULLIF(c.prospect_id, ''),  o.prospect_id),
    c.animateur    = COALESCE(NULLIF(c.animateur, ''),    o.animateur, p.animateur),
    c.ancien_ligne = COALESCE(NULLIF(c.ancien_ligne, ''), o.ancien_ligne, p.ancien_ligne),
    c.zone         = COALESCE(NULLIF(c.zone, ''),         o.zone, p.zone),
    c.lead_status  = COALESCE(NULLIF(c.lead_status, ''),  o.lead_status, p.status);

DROP PROCEDURE IF EXISTS crm_add_col_v3;
DROP PROCEDURE IF EXISTS crm_add_idx_v3;