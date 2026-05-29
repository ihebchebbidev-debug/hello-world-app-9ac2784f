-- =====================================================================
-- Repair migration after manual edits on crminternet_opportunity_stages.
--
-- Symptoms fixed:
--   * 'instance  ' had trailing spaces (fragile string match, badges broken)
--   * No stage had is_won / is_lost / auto_action set
--   * 'rejeté' and 'valide' shared position=3
--   * Live opportunities still reference legacy stage names that no longer
--     exist in the stages table (Qualification / Proposition / Négociation /
--     Gagnée / Perdue / new) -> dropdowns and badges render empty.
--   * contracts.billing_status is a fixed ENUM, blocking admin-managed
--     contract stages.
--
-- Safe to run multiple times.
-- =====================================================================

START TRANSACTION;

-- 1. Normalize stage names (trim trailing whitespace, fix duplicates).
UPDATE crminternet_opportunity_stages SET name = TRIM(name);

-- 2. Re-seed the proper flags + auto_action so Won/Lost behave again.
UPDATE crminternet_opportunity_stages
   SET is_initial = 1, is_won = 0, is_lost = 0, auto_action = 'none', position = 1
 WHERE name = 'nouveau';

UPDATE crminternet_opportunity_stages
   SET is_initial = 0, is_won = 0, is_lost = 0, auto_action = 'none', position = 2
 WHERE name = 'instance';

UPDATE crminternet_opportunity_stages
   SET is_initial = 0, is_won = 0, is_lost = 1, color = 'destructive',
       auto_action = 'revert_lead', position = 3
 WHERE name = 'rejeté';

UPDATE crminternet_opportunity_stages
   SET is_initial = 0, is_won = 1, is_lost = 0, color = 'success',
       auto_action = 'convert_contract', position = 4
 WHERE name = 'valide';

-- Guarantee exactly ONE initial stage. If somehow none flagged, force 'nouveau'.
UPDATE crminternet_opportunity_stages SET is_initial = 0
 WHERE name <> 'nouveau';

-- 3. Trim & remap orphan stage values on live opportunities so dropdowns/badges
--    line up with the current stages table.
UPDATE crminternet_opportunities SET stage = TRIM(stage);

UPDATE crminternet_opportunities
   SET stage = 'nouveau'
 WHERE stage IN ('Qualification', 'new', '', 'Nouveau', 'Prospection');

UPDATE crminternet_opportunities
   SET stage = 'instance'
 WHERE stage IN ('Proposition', 'Négociation', 'Negociation', 'Devis');

UPDATE crminternet_opportunities
   SET stage = 'valide'
 WHERE stage IN ('Gagnée', 'Gagne', 'Won', 'Validé');

UPDATE crminternet_opportunities
   SET stage = 'rejeté'
 WHERE stage IN ('Perdue', 'Lost', 'Refusé', 'Refus');

-- Final safety net: anything still not matching a known stage -> initial.
UPDATE crminternet_opportunities o
  LEFT JOIN crminternet_opportunity_stages s ON s.name = o.stage
   SET o.stage = 'nouveau'
 WHERE s.id IS NULL;

-- 4. Backfill contracts.stage_id from billing_status when NULL (defensive).
UPDATE crminternet_contracts SET billing_status = TRIM(billing_status);

UPDATE crminternet_contracts c
  JOIN crminternet_contract_stages s ON s.name = c.billing_status
   SET c.stage_id = s.id
 WHERE c.stage_id IS NULL OR c.stage_id <> s.id;

-- 4b. Repair opportunity ↔ contract links from existing contracts. This fixes
--     rows such as OPP-2/C-2001 where the contract exists but the opportunity
--     still says converted_to_contract = 0, which makes totals drift.
UPDATE crminternet_opportunities o
  JOIN crminternet_contracts c ON c.opportunity_id = o.id
   SET o.converted_to_contract = 1,
       o.contract_id = c.id,
       o.converted_at = COALESCE(o.converted_at, CONCAT(c.signature_date, ' 00:00:00'))
 WHERE o.converted_to_contract = 0
    OR o.contract_id IS NULL
    OR o.contract_id <> c.id;

-- 5. Convert crminternet_contracts.billing_status from a hard ENUM to a free
--    VARCHAR so admin-managed contract stages aren't rejected by MySQL.
ALTER TABLE crminternet_contracts
  MODIFY COLUMN billing_status VARCHAR(80) NOT NULL DEFAULT 'Pré-validé';

COMMIT;
