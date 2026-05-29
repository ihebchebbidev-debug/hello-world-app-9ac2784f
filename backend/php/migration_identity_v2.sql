-- =====================================================================
-- Migration : étend les tables Opportunités & Contrats avec le même
-- modèle identité que crminternet_prospects (civilité, nom/prénom, gsm1/2,
-- CIN unique-nullable, date de naissance, gouvernorat, délégation, adresse,
-- observations 1 & 2). Idempotente — peut être rejouée sans risque.
-- =====================================================================

-- ---------- Helper procédure (déjà fournie par install.sql, redéfinie ici
-- pour rendre la migration autonome) ----------
DROP PROCEDURE IF EXISTS crm_add_col_v2;
DELIMITER $$
CREATE PROCEDURE crm_add_col_v2(IN tbl VARCHAR(64), IN col VARCHAR(64), IN ddl TEXT)
BEGIN
  IF (SELECT COUNT(*) FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = tbl AND column_name = col) = 0 THEN
    SET @sql := CONCAT('ALTER TABLE `', tbl, '` ADD COLUMN ', ddl);
    PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
  END IF;
END$$
DELIMITER ;

-- ---------- Opportunités ----------
CALL crm_add_col_v2('crminternet_opportunities', 'phone2',     "`phone2`     VARCHAR(40)  NULL DEFAULT ''");
CALL crm_add_col_v2('crminternet_opportunities', 'cin',        "`cin`        VARCHAR(40)  NULL");
CALL crm_add_col_v2('crminternet_opportunities', 'birth_date', "`birth_date` DATE         NULL");
CALL crm_add_col_v2('crminternet_opportunities', 'address',    "`address`    VARCHAR(255) NOT NULL DEFAULT ''");
CALL crm_add_col_v2('crminternet_opportunities', 'comment1',   "`comment1`   TEXT         NULL");
CALL crm_add_col_v2('crminternet_opportunities', 'comment2',   "`comment2`   TEXT         NULL");

-- ---------- Contrats ----------
CALL crm_add_col_v2('crminternet_contracts', 'civility',   "`civility`   ENUM('M','Mme') NOT NULL DEFAULT 'M'");
CALL crm_add_col_v2('crminternet_contracts', 'phone',      "`phone`      VARCHAR(40)  NOT NULL DEFAULT ''");
CALL crm_add_col_v2('crminternet_contracts', 'phone2',     "`phone2`     VARCHAR(40)  NULL DEFAULT ''");
CALL crm_add_col_v2('crminternet_contracts', 'cin',        "`cin`        VARCHAR(40)  NULL");
CALL crm_add_col_v2('crminternet_contracts', 'birth_date', "`birth_date` DATE         NULL");
CALL crm_add_col_v2('crminternet_contracts', 'email',      "`email`      VARCHAR(160) NOT NULL DEFAULT ''");
CALL crm_add_col_v2('crminternet_contracts', 'address',    "`address`    VARCHAR(255) NOT NULL DEFAULT ''");
CALL crm_add_col_v2('crminternet_contracts', 'comment1',   "`comment1`   TEXT         NULL");
CALL crm_add_col_v2('crminternet_contracts', 'comment2',   "`comment2`   TEXT         NULL");

-- ---------- Normaliser '' → NULL pour CIN (autorise plusieurs NULL en index unique) ----
UPDATE crminternet_opportunities SET cin = NULL WHERE cin = '';
UPDATE crminternet_contracts     SET cin = NULL WHERE cin = '';

-- ---------- Index unique nullable sur CIN ----------
SET @has := (SELECT COUNT(1) FROM information_schema.statistics
             WHERE table_schema = DATABASE() AND table_name = 'crminternet_opportunities'
               AND index_name = 'ux_opp_cin');
SET @sql := IF(@has = 0,
  'ALTER TABLE crminternet_opportunities ADD UNIQUE KEY ux_opp_cin (cin)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has := (SELECT COUNT(1) FROM information_schema.statistics
             WHERE table_schema = DATABASE() AND table_name = 'crminternet_contracts'
               AND index_name = 'ux_contract_cin');
SET @sql := IF(@has = 0,
  'ALTER TABLE crminternet_contracts ADD UNIQUE KEY ux_contract_cin (cin)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------- Backfill identité depuis le prospect lié (best-effort) ----------
UPDATE crminternet_opportunities o
  JOIN crminternet_prospects p ON p.id = o.prospect_id
  SET
    o.phone2     = COALESCE(NULLIF(o.phone2, ''),     p.phone2),
    o.cin        = COALESCE(NULLIF(o.cin, ''),        p.cin),
    o.birth_date = COALESCE(o.birth_date,             p.birth_date),
    o.address    = COALESCE(NULLIF(o.address, ''),    p.address),
    o.comment1   = COALESCE(NULLIF(o.comment1, ''),   p.comment),
    o.comment2   = COALESCE(NULLIF(o.comment2, ''),   p.comment2)
  WHERE p.id IS NOT NULL;

UPDATE crminternet_contracts c
  JOIN crminternet_opportunities o ON o.id = c.opportunity_id
  SET
    c.civility   = IFNULL(o.civility,   'M'),
    c.phone      = COALESCE(NULLIF(c.phone, ''),      o.phone),
    c.phone2     = COALESCE(NULLIF(c.phone2, ''),     o.phone2),
    c.cin        = COALESCE(NULLIF(c.cin, ''),        o.cin),
    c.birth_date = COALESCE(c.birth_date,             o.birth_date),
    c.email      = COALESCE(NULLIF(c.email, ''),      o.email),
    c.address    = COALESCE(NULLIF(c.address, ''),    o.address),
    c.comment1   = COALESCE(NULLIF(c.comment1, ''),   o.comment1),
    c.comment2   = COALESCE(NULLIF(c.comment2, ''),   o.comment2)
  WHERE o.id IS NOT NULL;

DROP PROCEDURE IF EXISTS crm_add_col_v2;