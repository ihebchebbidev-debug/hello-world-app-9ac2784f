-- =====================================================================
-- Guichet — v2 : objectifs quotidiens, budget, taux d'activation cible
-- Idempotent (utilise INFORMATION_SCHEMA pour ajouter les colonnes manquantes)
-- =====================================================================

SET @db := DATABASE();

-- target_contracts_daily ----------------------------------------------
SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crminternet_guichet_objectives'
     AND COLUMN_NAME='target_contracts_daily')=0,
  'ALTER TABLE crminternet_guichet_objectives ADD COLUMN target_contracts_daily INT NOT NULL DEFAULT 25 AFTER target_fancy',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- target_contracts_monthly --------------------------------------------
SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crminternet_guichet_objectives'
     AND COLUMN_NAME='target_contracts_monthly')=0,
  'ALTER TABLE crminternet_guichet_objectives ADD COLUMN target_contracts_monthly INT NOT NULL DEFAULT 650 AFTER target_contracts_daily',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- working_days --------------------------------------------------------
SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crminternet_guichet_objectives'
     AND COLUMN_NAME='working_days')=0,
  'ALTER TABLE crminternet_guichet_objectives ADD COLUMN working_days INT NOT NULL DEFAULT 26 AFTER target_contracts_monthly',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- budget_monthly_dt ---------------------------------------------------
SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crminternet_guichet_objectives'
     AND COLUMN_NAME='budget_monthly_dt')=0,
  'ALTER TABLE crminternet_guichet_objectives ADD COLUMN budget_monthly_dt DECIMAL(10,2) NULL AFTER working_days',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- budget_daily_dt -----------------------------------------------------
SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crminternet_guichet_objectives'
     AND COLUMN_NAME='budget_daily_dt')=0,
  'ALTER TABLE crminternet_guichet_objectives ADD COLUMN budget_daily_dt DECIMAL(10,2) NULL AFTER budget_monthly_dt',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- min_activation_pct --------------------------------------------------
SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=@db AND TABLE_NAME='crminternet_guichet_objectives'
     AND COLUMN_NAME='min_activation_pct')=0,
  'ALTER TABLE crminternet_guichet_objectives ADD COLUMN min_activation_pct DECIMAL(5,2) NOT NULL DEFAULT 25.00 AFTER budget_daily_dt',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
