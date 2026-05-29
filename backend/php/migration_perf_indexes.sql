-- =====================================================================
-- PERF — Indexes for 500k+ rows scenarios.
-- Idempotent : chaque ADD INDEX est protégé via une procédure inline
-- (information_schema check). Ne casse pas si l'index existe déjà.
--
-- À exécuter UNE fois en production. Compatible MySQL 5.7 / 8.0.
-- Sur MySQL 8 : pour minimiser le lock, ajouter manuellement
--   ALGORITHM=INPLACE, LOCK=NONE
-- à chaque ADD INDEX si la table est très volumineuse.
-- =====================================================================

DELIMITER //

DROP PROCEDURE IF EXISTS crm_add_index_if_missing //
CREATE PROCEDURE crm_add_index_if_missing(
    IN p_table   VARCHAR(64),
    IN p_index   VARCHAR(64),
    IN p_def     TEXT
)
BEGIN
    -- Tolerant: skip silently if table/column missing or any other ALTER error
    DECLARE CONTINUE HANDLER FOR SQLEXCEPTION BEGIN END;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME   = p_table
          AND INDEX_NAME   = p_index
    ) AND EXISTS (
        SELECT 1 FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME   = p_table
    ) THEN
        SET @sql = CONCAT('ALTER TABLE ', p_table, ' ADD ', p_def);
        PREPARE stmt FROM @sql;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END //

DELIMITER ;

-- ---------------------------------------------------------------------
-- crminternet_prospects
-- ---------------------------------------------------------------------
CALL crm_add_index_if_missing('crminternet_prospects', 'idx_status_created',
    'INDEX idx_status_created (status, created_at)');
CALL crm_add_index_if_missing('crminternet_prospects', 'idx_assigned_created',
    'INDEX idx_assigned_created (assigned_to, created_at)');
CALL crm_add_index_if_missing('crminternet_prospects', 'idx_converted_created',
    'INDEX idx_converted_created (converted, created_at)');
CALL crm_add_index_if_missing('crminternet_prospects', 'idx_cin',
    'INDEX idx_cin (cin)');
CALL crm_add_index_if_missing('crminternet_prospects', 'idx_phone',
    'INDEX idx_phone (phone)');
CALL crm_add_index_if_missing('crminternet_prospects', 'idx_phone2',
    'INDEX idx_phone2 (phone2)');
CALL crm_add_index_if_missing('crminternet_prospects', 'idx_type_id',
    'INDEX idx_type_id (type_id)');
CALL crm_add_index_if_missing('crminternet_prospects', 'idx_created_at',
    'INDEX idx_created_at (created_at)');
CALL crm_add_index_if_missing('crminternet_prospects', 'idx_updated_at',
    'INDEX idx_updated_at (updated_at)');

-- ---------------------------------------------------------------------
-- crminternet_opportunities
-- ---------------------------------------------------------------------
CALL crm_add_index_if_missing('crminternet_opportunities', 'idx_status_created',
    'INDEX idx_status_created (status, created_at)');
CALL crm_add_index_if_missing('crminternet_opportunities', 'idx_stage_created',
    'INDEX idx_stage_created (stage_id, created_at)');
CALL crm_add_index_if_missing('crminternet_opportunities', 'idx_assigned_created',
    'INDEX idx_assigned_created (assigned_to, created_at)');
CALL crm_add_index_if_missing('crminternet_opportunities', 'idx_prospect',
    'INDEX idx_prospect (prospect_id)');
CALL crm_add_index_if_missing('crminternet_opportunities', 'idx_cin',
    'INDEX idx_cin (cin)');
CALL crm_add_index_if_missing('crminternet_opportunities', 'idx_phone',
    'INDEX idx_phone (phone)');
CALL crm_add_index_if_missing('crminternet_opportunities', 'idx_created_at',
    'INDEX idx_created_at (created_at)');
CALL crm_add_index_if_missing('crminternet_opportunities', 'idx_updated_at',
    'INDEX idx_updated_at (updated_at)');

-- ---------------------------------------------------------------------
-- crminternet_contracts
-- ---------------------------------------------------------------------
CALL crm_add_index_if_missing('crminternet_contracts', 'idx_billing_signature',
    'INDEX idx_billing_signature (billing_status, signature_date)');
CALL crm_add_index_if_missing('crminternet_contracts', 'idx_assigned_signature',
    'INDEX idx_assigned_signature (assigned_to, signature_date)');
CALL crm_add_index_if_missing('crminternet_contracts', 'idx_opportunity',
    'INDEX idx_opportunity (opportunity_id)');
CALL crm_add_index_if_missing('crminternet_contracts', 'idx_prospect',
    'INDEX idx_prospect (prospect_id)');
CALL crm_add_index_if_missing('crminternet_contracts', 'idx_cin',
    'INDEX idx_cin (cin)');
CALL crm_add_index_if_missing('crminternet_contracts', 'idx_phone',
    'INDEX idx_phone (phone)');
CALL crm_add_index_if_missing('crminternet_contracts', 'idx_signature_date',
    'INDEX idx_signature_date (signature_date)');
CALL crm_add_index_if_missing('crminternet_contracts', 'idx_stage_id',
    'INDEX idx_stage_id (stage_id)');

-- ---------------------------------------------------------------------
-- Cleanup
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS crm_add_index_if_missing;
