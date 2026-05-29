-- =====================================================================
-- Migration : alignement de la table crminternet_prospects sur la fiche
-- métier (civilité, Nom, Prénom, Gsm1, Gsm2, Cin, Date de naissance, Mail,
-- Source, Statu, Assigné a, cree le, Gouvernorat, Adresse, Delegation,
-- Observ1, Observ2). Tous les champs sauf last_name peuvent être NULL ;
-- CIN doit être unique lorsqu'il est renseigné mais peut rester NULL.
-- =====================================================================

-- 1) Nouvelles colonnes : gouvernorat + delegation (alimentées depuis
--    city / zone pour compatibilité ascendante).
ALTER TABLE crminternet_prospects
  ADD COLUMN IF NOT EXISTS gouvernorat VARCHAR(120) NOT NULL DEFAULT '' AFTER address,
  ADD COLUMN IF NOT EXISTS delegation  VARCHAR(120) NOT NULL DEFAULT '' AFTER gouvernorat;

UPDATE crminternet_prospects SET gouvernorat = UPPER(city) WHERE (gouvernorat IS NULL OR gouvernorat = '') AND city <> '';
UPDATE crminternet_prospects SET delegation  = zone        WHERE (delegation  IS NULL OR delegation  = '') AND zone  <> '';

-- 2) CIN : '' → NULL puis index unique idempotent.
UPDATE crminternet_prospects SET cin = NULL WHERE cin = '';
ALTER TABLE crminternet_prospects MODIFY cin VARCHAR(40) NULL;

SET @has_ux := (
  SELECT COUNT(1) FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name   = 'crminternet_prospects'
    AND index_name   = 'ux_prospect_cin'
);
SET @sql := IF(@has_ux = 0,
  'ALTER TABLE crminternet_prospects ADD UNIQUE KEY ux_prospect_cin (cin)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3) Snapshot équivalent côté Opportunités / Contrats (les conversions
--    propagent gouvernorat / delegation comme elles le font déjà pour city).
ALTER TABLE crminternet_opportunities
  ADD COLUMN IF NOT EXISTS gouvernorat VARCHAR(120) NOT NULL DEFAULT '' AFTER city,
  ADD COLUMN IF NOT EXISTS delegation  VARCHAR(120) NOT NULL DEFAULT '' AFTER gouvernorat;

ALTER TABLE crminternet_contracts
  ADD COLUMN IF NOT EXISTS gouvernorat VARCHAR(120) NOT NULL DEFAULT '' AFTER city,
  ADD COLUMN IF NOT EXISTS delegation  VARCHAR(120) NOT NULL DEFAULT '' AFTER gouvernorat;
