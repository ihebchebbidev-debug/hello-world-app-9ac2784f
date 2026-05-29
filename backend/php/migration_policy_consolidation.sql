-- =====================================================================
-- MIGRATION : Consolidation des politiques (CIN, Réclamations, Activity Log)
-- Idempotente — peut être rejouée sans risque.
--
-- Décisions actées :
--   1. CIN : doublons AUTORISÉS sur prospects/opportunities/contracts
--      (la déduplication est gérée côté UI via CinDuplicatesCard).
--      Les UNIQUE legacy sont supprimés ; un index simple est garanti.
--   2. Réclamations : `audit_status` (ENUM en_cours/resolu/annule) est la
--      SEULE source de vérité pour l'état. Les colonnes `status`,
--      `statut_crm`, `statut_tt`, `priority`, `subject` deviennent du
--      texte libre / historique et ne sont plus écrites par le backend.
--   3. activity_log.entity_type : DEFAULT supprimé (déjà fait en hygiene).
--      Cette migration ne fait que vérifier l'état et le re-supprimer si
--      jamais quelqu'un l'a remis.
-- =====================================================================

-- Outil idempotent : drop d'index si présent
DROP PROCEDURE IF EXISTS crm_drop_index_if_exists;
DELIMITER $$
CREATE PROCEDURE crm_drop_index_if_exists(IN tbl VARCHAR(64), IN idx VARCHAR(64))
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.statistics
             WHERE table_schema=DATABASE() AND table_name=tbl AND index_name=idx) THEN
    SET @s := CONCAT('ALTER TABLE `', tbl, '` DROP INDEX `', idx, '`');
    PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
  END IF;
END$$
DELIMITER ;

-- Outil idempotent : add index si absent
DROP PROCEDURE IF EXISTS crm_add_index_if_missing;
DELIMITER $$
CREATE PROCEDURE crm_add_index_if_missing(IN tbl VARCHAR(64), IN idx VARCHAR(64), IN cols VARCHAR(255))
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.statistics
                 WHERE table_schema=DATABASE() AND table_name=tbl AND index_name=idx) THEN
    SET @s := CONCAT('ALTER TABLE `', tbl, '` ADD INDEX `', idx, '` (', cols, ')');
    PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
  END IF;
END$$
DELIMITER ;

-- ---------------------------------------------------------------------
-- 1. CIN : politique DOUBLONS AUTORISÉS (canonique)
-- ---------------------------------------------------------------------

-- Drop tous les UNIQUE legacy connus
CALL crm_drop_index_if_exists('crminternet_prospects',     'ux_prospect_cin');
CALL crm_drop_index_if_exists('crminternet_prospects',     'uniq_prospects_cin');
CALL crm_drop_index_if_exists('crminternet_opportunities', 'ux_opp_cin');
CALL crm_drop_index_if_exists('crminternet_opportunities', 'uniq_opp_cin');
CALL crm_drop_index_if_exists('crminternet_contracts',     'ux_contract_cin');
CALL crm_drop_index_if_exists('crminternet_contracts',     'uniq_contract_cin');

-- Garantir un index simple pour les recherches (CinDuplicatesCard, lookups)
CALL crm_add_index_if_missing('crminternet_prospects',     'ix_prospect_cin', '`cin`');
CALL crm_add_index_if_missing('crminternet_opportunities', 'ix_opp_cin',      '`cin`');
CALL crm_add_index_if_missing('crminternet_contracts',     'ix_contract_cin', '`cin`');

-- Normaliser '' → NULL pour cohérence (NULL = pas de CIN renseigné)
UPDATE crminternet_prospects     SET cin = NULL WHERE cin = '';
UPDATE crminternet_opportunities SET cin = NULL WHERE cin = '';
UPDATE crminternet_contracts     SET cin = NULL WHERE cin = '';

-- NB : crminternet_users.cin reste UNIQUE (uniq_users_cin) — un user ne
-- peut pas avoir un CIN partagé. C'est volontaire et ne change pas ici.

-- ---------------------------------------------------------------------
-- 2. Réclamations : audit_status canonique
-- ---------------------------------------------------------------------

-- Backfill : si une ligne historique a un `status` mais pas d'audit_status
-- cohérent, on tente de mapper (best-effort, ne casse rien si déjà bon).
UPDATE crminternet_reclamations
   SET audit_status = CASE
       WHEN LOWER(status) IN ('closed','resolved','done','resolu','résolu') THEN 'resolu'
       WHEN LOWER(status) IN ('cancelled','canceled','annule','annulé')      THEN 'annule'
       ELSE 'en_cours'
     END
 WHERE audit_status IS NULL OR audit_status = '';

-- Index pour les dashboards (déjà présent normalement, on s'assure)
CALL crm_add_index_if_missing('crminternet_reclamations', 'idx_rec_audit', '`audit_status`');

-- Les colonnes `status`, `priority`, `subject`, `statut_crm`, `statut_tt`
-- sont conservées pour compatibilité (lecture seule, libre, historique).
-- Le backend (reclamations.php) n'écrit plus que `audit_status`.

-- ---------------------------------------------------------------------
-- 3. Activity log : entity_type sans default (re-vérification)
-- ---------------------------------------------------------------------

-- MySQL ne propose pas de "DROP DEFAULT IF EXISTS" portable ;
-- on re-applique sans risque (no-op si déjà sans default).
ALTER TABLE crminternet_activity_log
  MODIFY COLUMN entity_type VARCHAR(32) NOT NULL;

-- ---------------------------------------------------------------------
-- 4. Tracking
-- ---------------------------------------------------------------------
INSERT IGNORE INTO crminternet_schema_migrations (filename)
VALUES ('migration_policy_consolidation.sql');

-- Cleanup procédures
DROP PROCEDURE IF EXISTS crm_drop_index_if_exists;
DROP PROCEDURE IF EXISTS crm_add_index_if_missing;
