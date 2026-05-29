-- Allow duplicate CIN across prospects/opportunities/contracts.
-- Drop UNIQUE constraints; keep a regular index for fast lookup.

-- Prospects
SET @h := (SELECT COUNT(1) FROM information_schema.statistics
           WHERE table_schema=DATABASE() AND table_name='crminternet_prospects' AND index_name='ux_prospect_cin');
SET @sql := IF(@h>0,'ALTER TABLE crminternet_prospects DROP INDEX ux_prospect_cin','SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @h := (SELECT COUNT(1) FROM information_schema.statistics
           WHERE table_schema=DATABASE() AND table_name='crminternet_prospects' AND index_name='ix_prospect_cin');
SET @sql := IF(@h=0,'ALTER TABLE crminternet_prospects ADD INDEX ix_prospect_cin (cin)','SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- Opportunities
SET @h := (SELECT COUNT(1) FROM information_schema.statistics
           WHERE table_schema=DATABASE() AND table_name='crminternet_opportunities' AND index_name='ux_opp_cin');
SET @sql := IF(@h>0,'ALTER TABLE crminternet_opportunities DROP INDEX ux_opp_cin','SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @h := (SELECT COUNT(1) FROM information_schema.statistics
           WHERE table_schema=DATABASE() AND table_name='crminternet_opportunities' AND index_name='ix_opp_cin');
SET @sql := IF(@h=0,'ALTER TABLE crminternet_opportunities ADD INDEX ix_opp_cin (cin)','SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- Contracts
SET @h := (SELECT COUNT(1) FROM information_schema.statistics
           WHERE table_schema=DATABASE() AND table_name='crminternet_contracts' AND index_name='ux_contract_cin');
SET @sql := IF(@h>0,'ALTER TABLE crminternet_contracts DROP INDEX ux_contract_cin','SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @h := (SELECT COUNT(1) FROM information_schema.statistics
           WHERE table_schema=DATABASE() AND table_name='crminternet_contracts' AND index_name='ix_contract_cin');
SET @sql := IF(@h=0,'ALTER TABLE crminternet_contracts ADD INDEX ix_contract_cin (cin)','SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
