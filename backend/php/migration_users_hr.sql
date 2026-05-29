-- =========================================================================
-- Migration: HR / personnel fields on crminternet_users
-- Compatible with MySQL 5.7+ / MariaDB 10.x (no "IF NOT EXISTS" on ADD COLUMN).
-- Safe to re-run: uses a stored procedure to check INFORMATION_SCHEMA first.
--
-- Run:
--   mysql -u <user> -p luccybcdb < backend/php/migration_users_hr.sql
-- or paste into phpMyAdmin → SQL.
-- =========================================================================

-- 1) Schema -----------------------------------------------------------------
DROP PROCEDURE IF EXISTS _add_user_hr_cols;
DELIMITER $$
CREATE PROCEDURE _add_user_hr_cols()
BEGIN
  DECLARE db VARCHAR(64);
  SELECT DATABASE() INTO db;

  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=db AND TABLE_NAME='crminternet_users' AND COLUMN_NAME='job_title') THEN
    ALTER TABLE crminternet_users ADD COLUMN job_title VARCHAR(120) NULL AFTER full_name;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=db AND TABLE_NAME='crminternet_users' AND COLUMN_NAME='birth_date') THEN
    ALTER TABLE crminternet_users ADD COLUMN birth_date DATE NULL AFTER job_title;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=db AND TABLE_NAME='crminternet_users' AND COLUMN_NAME='cin') THEN
    ALTER TABLE crminternet_users ADD COLUMN cin VARCHAR(40) NULL AFTER birth_date;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=db AND TABLE_NAME='crminternet_users' AND COLUMN_NAME='company') THEN
    ALTER TABLE crminternet_users ADD COLUMN company VARCHAR(120) NULL AFTER cin;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=db AND TABLE_NAME='crminternet_users' AND COLUMN_NAME='contract_type') THEN
    ALTER TABLE crminternet_users ADD COLUMN contract_type VARCHAR(40) NULL AFTER company;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=db AND TABLE_NAME='crminternet_users' AND COLUMN_NAME='salary') THEN
    ALTER TABLE crminternet_users ADD COLUMN salary DECIMAL(10,3) NULL AFTER contract_type;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=db AND TABLE_NAME='crminternet_users' AND COLUMN_NAME='salary_increase') THEN
    ALTER TABLE crminternet_users ADD COLUMN salary_increase DECIMAL(10,3) NULL AFTER salary;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=db AND TABLE_NAME='crminternet_users' AND COLUMN_NAME='contract_start') THEN
    ALTER TABLE crminternet_users ADD COLUMN contract_start DATE NULL AFTER salary_increase;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=db AND TABLE_NAME='crminternet_users' AND COLUMN_NAME='contract_end') THEN
    ALTER TABLE crminternet_users ADD COLUMN contract_end DATE NULL AFTER contract_start;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=db AND TABLE_NAME='crminternet_users' AND COLUMN_NAME='renewal_start') THEN
    ALTER TABLE crminternet_users ADD COLUMN renewal_start DATE NULL AFTER contract_end;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=db AND TABLE_NAME='crminternet_users' AND COLUMN_NAME='renewal_end') THEN
    ALTER TABLE crminternet_users ADD COLUMN renewal_end DATE NULL AFTER renewal_start;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=db AND TABLE_NAME='crminternet_users' AND COLUMN_NAME='observations') THEN
    ALTER TABLE crminternet_users ADD COLUMN observations TEXT NULL AFTER renewal_end;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=db AND TABLE_NAME='crminternet_users' AND COLUMN_NAME='phone') THEN
    ALTER TABLE crminternet_users ADD COLUMN phone VARCHAR(40) NULL AFTER observations;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=db AND TABLE_NAME='crminternet_users' AND COLUMN_NAME='rib') THEN
    ALTER TABLE crminternet_users ADD COLUMN rib VARCHAR(40) NULL AFTER phone;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=db AND TABLE_NAME='crminternet_users' AND COLUMN_NAME='hire_date') THEN
    ALTER TABLE crminternet_users ADD COLUMN hire_date DATE NULL AFTER rib;
  END IF;

  -- Indexes
  IF NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=db AND TABLE_NAME='crminternet_users' AND INDEX_NAME='uniq_users_cin') THEN
    ALTER TABLE crminternet_users ADD UNIQUE KEY uniq_users_cin (cin);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=db AND TABLE_NAME='crminternet_users' AND INDEX_NAME='idx_users_company') THEN
    ALTER TABLE crminternet_users ADD KEY idx_users_company (company);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=db AND TABLE_NAME='crminternet_users' AND INDEX_NAME='idx_users_contract_end') THEN
    ALTER TABLE crminternet_users ADD KEY idx_users_contract_end (contract_end);
  END IF;
END$$
DELIMITER ;

CALL _add_user_hr_cols();
DROP PROCEDURE _add_user_hr_cols;

-- 2) Dummy data from personel.xlsx -----------------------------------------
-- password_hash = bcrypt('Passw0rd!') — change after import.
INSERT INTO crminternet_users
  (id, username, full_name, email, password_hash, role, team, active,
   job_title, birth_date, cin, company, contract_type, salary, salary_increase,
   contract_start, contract_end, renewal_start, renewal_end,
   observations, phone, rib, hire_date)
VALUES
  ('U-NADA0001', 'nada.souguir',       'Nada Souguir',       'nadasouguir2@gmail.com',
   '$2y$10$wH5o1m6xQ0o5uJZhE2rL9ePbb6F3hQ2x0xJqGm3hxvY3OxYvKxq6e', 'AgentActivation', 'Lead-Actifs', 1,
   'Agent activation', '1994-10-30', '12345678', 'height',  'CDI',  850.000, 900.000,
   '2025-05-11', NULL, NULL,         NULL,
   NULL, '94431140', '11060002351100878837', '2022-02-14'),

  ('U-ABDR0002', 'abderahmen.souguir', 'Abderahmen Souguir', 'hmayeness123@gmail.com',
   '$2y$10$wH5o1m6xQ0o5uJZhE2rL9ePbb6F3hQ2x0xJqGm3hxvY3OxYvKxq6e', 'Agent',           'Lead-Actifs', 1,
   'Agent guichet',    '1993-09-05', '12345679', 'ahlanet', 'CDI',  800.000, 900.000,
   '2025-08-01', NULL, NULL,         NULL,
   NULL, '94431141', '11060002365500878813', '2023-05-01'),

  ('U-MONT0003', 'montaha.amor',       'Montaha Amor',       'montahaamar1234@gmail.com',
   '$2y$10$wH5o1m6xQ0o5uJZhE2rL9ePbb6F3hQ2x0xJqGm3hxvY3OxYvKxq6e', 'AgentSuivi',      'Lead-Actifs', 1,
   'Agent suivi',      '2000-05-17', '12345680', 'Animacom','CDI',  800.000, 800.000,
   '2026-01-17', NULL, NULL,         NULL,
   NULL, '94431142', '04014102008229437248', '2024-03-04'),

  ('U-AYAB0004', 'aya.boukadida',      'Aya Boukadida',      'eyaboukadida2@gmail.com',
   '$2y$10$wH5o1m6xQ0o5uJZhE2rL9ePbb6F3hQ2x0xJqGm3hxvY3OxYvKxq6e', 'AgentVente',      'Lead-Actifs', 1,
   'Agent vente',      '1999-10-09', '12345681', 'aynet',   'CIVP', 700.000, 750.000,
   '2025-10-30', NULL, '2026-09-21', NULL,
   NULL, '94431143', '12503000000245546929', '2024-09-23'),

  ('U-ISLM0005', 'islem.akkari',       'Islem Akkari',       'akkariislem2@gmail.com',
   '$2y$10$wH5o1m6xQ0o5uJZhE2rL9ePbb6F3hQ2x0xJqGm3hxvY3OxYvKxq6e', 'Manager',         'Direction',   1,
   'Direction',        '2000-11-25', '12345682', 'height',  'CIVP', 700.000, 750.000,
   '2025-09-19', NULL, '2026-09-18', NULL,
   NULL, '94431144', '17503000000349160429', '2024-08-27')
ON DUPLICATE KEY UPDATE
  full_name       = VALUES(full_name),
  job_title       = VALUES(job_title),
  birth_date      = VALUES(birth_date),
  cin             = VALUES(cin),
  company         = VALUES(company),
  contract_type   = VALUES(contract_type),
  salary          = VALUES(salary),
  salary_increase = VALUES(salary_increase),
  contract_start  = VALUES(contract_start),
  contract_end    = VALUES(contract_end),
  renewal_start   = VALUES(renewal_start),
  renewal_end     = VALUES(renewal_end),
  observations    = VALUES(observations),
  phone           = VALUES(phone),
  rib             = VALUES(rib),
  hire_date       = VALUES(hire_date),
  email           = VALUES(email),
  role            = VALUES(role),
  team            = VALUES(team),
  active          = VALUES(active);

-- 3) Verification ----------------------------------------------------------
-- DESCRIBE crminternet_users;
-- SELECT username, job_title, company, contract_type, salary, hire_date FROM crminternet_users WHERE cin IS NOT NULL;
