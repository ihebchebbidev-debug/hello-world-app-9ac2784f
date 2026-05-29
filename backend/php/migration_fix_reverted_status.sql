-- =====================================================================
-- FIX : Leads "réveltés" invisibles parce que status='Nouveau' n'est plus
-- un statut actif depuis la migration v3.
--
-- 1. Diagnostic — compter combien de leads sont "perdus" sous 'Nouveau'.
-- 2. Réparation — repasser ces leads sur le 1er statut actif (is_initial,
--    sinon plus petite position), avec fallback final sur 'Nrp'.
-- 3. Vérification — lister les leads remontés.
--
-- Idempotent : ne touche que les rows non-converties dont le statut n'est
-- plus dans crminternet_lead_stages OU vaut littéralement 'Nouveau'.
-- =====================================================================

-- 1. DIAGNOSTIC ------------------------------------------------------
SELECT 'Leads avec statut Nouveau (probablement issus d''un revert)' AS info,
       COUNT(*) AS nb
  FROM crminternet_prospects
 WHERE (converted IS NULL OR converted = 0)
   AND status = 'Nouveau';

SELECT 'Leads avec un statut absent de crminternet_lead_stages' AS info,
       COUNT(*) AS nb
  FROM crminternet_prospects p
 WHERE (p.converted IS NULL OR p.converted = 0)
   AND p.status NOT IN (SELECT name FROM crminternet_lead_stages);

-- 2. RÉPARATION ------------------------------------------------------
-- Choisit le statut cible : initial (is_initial=1) sinon plus petite
-- position, sinon 'Nrp'. Stocké dans une variable de session MySQL.
SET @fallback_status := COALESCE(
    (SELECT name FROM crminternet_lead_stages
      WHERE is_initial = 1
      ORDER BY position ASC, name ASC LIMIT 1),
    (SELECT name FROM crminternet_lead_stages
      ORDER BY position ASC, name ASC LIMIT 1),
    'Nrp'
);

SELECT @fallback_status AS statut_cible_pour_revert;

-- Note : si la colonne is_initial n'existe pas dans ton install, exécute
-- plutôt la requête courte ci-dessous à la place du SET ci-dessus :
-- SET @fallback_status := COALESCE(
--   (SELECT name FROM crminternet_lead_stages ORDER BY position ASC LIMIT 1),
--   'Nrp');

-- Repasse tous les leads "Nouveau" non-convertis sur le statut cible.
-- On marque aussi reverted_at = NOW() s'il était NULL pour qu'ils
-- remontent en haut de la liste avec le surlignage warning.
UPDATE crminternet_prospects
   SET status = @fallback_status,
       reverted_at = COALESCE(reverted_at, NOW()),
       reverted_from = COALESCE(reverted_from, 'manual_repair')
 WHERE (converted IS NULL OR converted = 0)
   AND status = 'Nouveau';

-- Et tout autre statut orphelin (typos, anciens statuts supprimés, etc.).
UPDATE crminternet_prospects
   SET status = @fallback_status
 WHERE (converted IS NULL OR converted = 0)
   AND status NOT IN (SELECT name FROM crminternet_lead_stages);

-- 3. VÉRIFICATION ----------------------------------------------------
SELECT 'Total leads visibles après fix' AS info, COUNT(*) AS nb
  FROM crminternet_prospects
 WHERE converted IS NULL OR converted = 0;

SELECT 'Répartition par statut (leads visibles)' AS info,
       status, COUNT(*) AS nb
  FROM crminternet_prospects
 WHERE converted IS NULL OR converted = 0
 GROUP BY status
 ORDER BY nb DESC;

-- Liste des leads récemment réveltés (à retraiter en priorité).
SELECT id, last_name, first_name, status, reverted_from, reverted_at, created_at
  FROM crminternet_prospects
 WHERE reverted_at IS NOT NULL
   AND (converted IS NULL OR converted = 0)
 ORDER BY reverted_at DESC
 LIMIT 50;
