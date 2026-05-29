-- =====================================================================
-- Backfill : garantit que chaque opportunité et chaque contrat possède
-- sa propre ligne crminternet_contract_info, héritée du parent dans la
-- chaîne prospect → opportunity → contract.
--
-- Idempotent : INSERT IGNORE sur la clé unique (entity_type, entity_id)
-- ne touche pas aux lignes existantes (saisies manuelles préservées).
--
-- NB collation : crminternet_contract_info est en utf8mb4_unicode_ci alors
-- que crminternet_opportunities / crminternet_contracts sont en
-- utf8mb4_0900_ai_ci. On force la collation sur chaque comparaison de
-- VARCHAR pour éviter l'erreur #1267 "Illegal mix of collations".
-- =====================================================================

-- 1) Opportunités sans ligne propre -> hériter du prospect parent.
INSERT IGNORE INTO crminternet_contract_info
    (entity_type, entity_id, type_conn, reference_tt, tel_ligne, date_activation,
     etape, interface_type, fsi, motif_retour_tt, etat, remarque,
     created_by, updated_by, created_at, updated_at)
SELECT
    'opportunity', o.id,
    ci.type_conn, ci.reference_tt, ci.tel_ligne, ci.date_activation,
    ci.etape, ci.interface_type, ci.fsi, ci.motif_retour_tt, ci.etat, ci.remarque,
    COALESCE(ci.updated_by, ci.created_by, 'backfill'),
    COALESCE(ci.updated_by, ci.created_by, 'backfill'),
    NOW(), NOW()
FROM crminternet_opportunities o
JOIN crminternet_contract_info ci
  ON ci.entity_type = 'prospect'
 AND ci.entity_id = o.prospect_id COLLATE utf8mb4_unicode_ci
LEFT JOIN crminternet_contract_info exist
  ON exist.entity_type = 'opportunity'
 AND exist.entity_id = o.id COLLATE utf8mb4_unicode_ci
WHERE exist.id IS NULL;

-- 2) Contrats sans ligne propre -> hériter de l'opportunité parente.
INSERT IGNORE INTO crminternet_contract_info
    (entity_type, entity_id, type_conn, reference_tt, tel_ligne, date_activation,
     etape, interface_type, fsi, motif_retour_tt, etat, remarque,
     created_by, updated_by, created_at, updated_at)
SELECT
    'contract', c.id,
    ci.type_conn, ci.reference_tt, ci.tel_ligne, ci.date_activation,
    ci.etape, ci.interface_type, ci.fsi, ci.motif_retour_tt, ci.etat, ci.remarque,
    COALESCE(ci.updated_by, ci.created_by, 'backfill'),
    COALESCE(ci.updated_by, ci.created_by, 'backfill'),
    NOW(), NOW()
FROM crminternet_contracts c
JOIN crminternet_contract_info ci
  ON ci.entity_type = 'opportunity'
 AND ci.entity_id = c.opportunity_id COLLATE utf8mb4_unicode_ci
LEFT JOIN crminternet_contract_info exist
  ON exist.entity_type = 'contract'
 AND exist.entity_id = c.id COLLATE utf8mb4_unicode_ci
WHERE c.opportunity_id IS NOT NULL
  AND exist.id IS NULL;

-- 3) Contrats sans opportunité (mark_won) -> hériter directement du prospect.
INSERT IGNORE INTO crminternet_contract_info
    (entity_type, entity_id, type_conn, reference_tt, tel_ligne, date_activation,
     etape, interface_type, fsi, motif_retour_tt, etat, remarque,
     created_by, updated_by, created_at, updated_at)
SELECT
    'contract', c.id,
    ci.type_conn, ci.reference_tt, ci.tel_ligne, ci.date_activation,
    ci.etape, ci.interface_type, ci.fsi, ci.motif_retour_tt, ci.etat, ci.remarque,
    COALESCE(ci.updated_by, ci.created_by, 'backfill'),
    COALESCE(ci.updated_by, ci.created_by, 'backfill'),
    NOW(), NOW()
FROM crminternet_contracts c
JOIN crminternet_contract_info ci
  ON ci.entity_type = 'prospect'
 AND ci.entity_id = c.prospect_id COLLATE utf8mb4_unicode_ci
LEFT JOIN crminternet_contract_info exist
  ON exist.entity_type = 'contract'
 AND exist.entity_id = c.id COLLATE utf8mb4_unicode_ci
WHERE (c.opportunity_id IS NULL OR c.opportunity_id = '')
  AND c.prospect_id IS NOT NULL
  AND exist.id IS NULL;

-- 4) Repasse (au cas où l'étape 1 vient juste de créer la ligne opportunity).
INSERT IGNORE INTO crminternet_contract_info
    (entity_type, entity_id, type_conn, reference_tt, tel_ligne, date_activation,
     etape, interface_type, fsi, motif_retour_tt, etat, remarque,
     created_by, updated_by, created_at, updated_at)
SELECT
    'contract', c.id,
    ci.type_conn, ci.reference_tt, ci.tel_ligne, ci.date_activation,
    ci.etape, ci.interface_type, ci.fsi, ci.motif_retour_tt, ci.etat, ci.remarque,
    COALESCE(ci.updated_by, ci.created_by, 'backfill'),
    COALESCE(ci.updated_by, ci.created_by, 'backfill'),
    NOW(), NOW()
FROM crminternet_contracts c
JOIN crminternet_opportunities o
  ON o.id = c.opportunity_id COLLATE utf8mb4_0900_ai_ci
JOIN crminternet_contract_info ci
  ON ci.entity_type = 'opportunity'
 AND ci.entity_id = o.id COLLATE utf8mb4_unicode_ci
LEFT JOIN crminternet_contract_info exist
  ON exist.entity_type = 'contract'
 AND exist.entity_id = c.id COLLATE utf8mb4_unicode_ci
WHERE exist.id IS NULL;
