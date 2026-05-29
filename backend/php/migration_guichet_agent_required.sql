-- =====================================================================
-- Guichet — Garantir que chaque dossier a un agent valide
-- ORDRE OBLIGATOIRE : 1 → 2 → 3 → 4 → 5
-- Le CHECK / FK de l'étape 4 ÉCHOUE si des orphelins existent encore
-- (erreur MySQL 3819 : "Check constraint ... is violated").
-- L'étape 3 N'EST PLUS OPTIONNELLE : exécutez-la systématiquement.
-- =====================================================================

-- 1) DIAGNOSTIC : compter les dossiers orphelins -----------------------
SELECT
  COUNT(*)                                                   AS total,
  SUM(agent_id IS NULL OR agent_id = '')                     AS sans_agent,
  SUM(agent_id IS NOT NULL
      AND agent_id <> ''
      AND agent_id NOT IN (SELECT id FROM crminternet_users)) AS agent_inconnu
FROM crminternet_guichet_dossiers;

-- 2) DIAGNOSTIC : lister les dossiers à problème -----------------------
SELECT d.id, d.ref, d.entity_id, d.agent_id, d.client_name, d.created_at,
       CASE
         WHEN d.agent_id IS NULL OR d.agent_id = '' THEN 'VIDE'
         WHEN u.id IS NULL THEN 'INCONNU'
         ELSE 'OK'
       END AS diagnostic
FROM crminternet_guichet_dossiers d
LEFT JOIN crminternet_users u ON u.id = d.agent_id
WHERE d.agent_id IS NULL OR d.agent_id = '' OR u.id IS NULL
ORDER BY d.created_at DESC;

-- 3) CLEANUP — OBLIGATOIRE avant l'étape 4 ----------------------------
-- 3.a) Créer un utilisateur "système" pour absorber les orphelins.
--      INSERT IGNORE = idempotent (re-exécutable sans erreur).
INSERT IGNORE INTO crminternet_users
  (id, username, full_name, email, role, active, created_at)
VALUES
  ('U-SYS-LEGACY', 'systeme.legacy', 'Import Legacy (système)',
   'legacy@local', 'Backoffice', 0, NOW());

-- 3.b) Réassigner TOUS les dossiers orphelins à cet utilisateur.
--      Couvre : agent_id NULL, agent_id = '', agent_id inconnu.
UPDATE crminternet_guichet_dossiers d
LEFT JOIN crminternet_users u ON u.id = d.agent_id
SET d.agent_id = 'U-SYS-LEGACY'
WHERE d.agent_id IS NULL OR d.agent_id = '' OR u.id IS NULL;

-- 3.c) Vérification intermédiaire — DOIT retourner 0 avant l'étape 4.
SELECT COUNT(*) AS orphelins_avant_contraintes
FROM crminternet_guichet_dossiers d
LEFT JOIN crminternet_users u ON u.id = d.agent_id
WHERE d.agent_id IS NULL OR d.agent_id = '' OR u.id IS NULL;

-- 4) CONTRAINTES FINALES ----------------------------------------------
-- ⚠ Si l'étape 3.c renvoie > 0, NE PAS exécuter l'étape 4 :
--   ré-exécutez 3.b puis 3.c jusqu'à obtenir 0.

-- 4.0) Nettoyer d'anciennes contraintes éventuelles (idempotent).
ALTER TABLE crminternet_guichet_dossiers
  DROP CONSTRAINT IF EXISTS chk_gd_agent_nonempty;
ALTER TABLE crminternet_guichet_dossiers
  DROP FOREIGN KEY IF EXISTS fk_gd_agent;

-- 4.a) Forcer la colonne NOT NULL (sécurité au niveau schéma).
ALTER TABLE crminternet_guichet_dossiers
  MODIFY agent_id VARCHAR(40) NOT NULL;

-- 4.b) Empêcher la chaîne vide (MySQL 8.0.16+ requis pour CHECK actif).
ALTER TABLE crminternet_guichet_dossiers
  ADD CONSTRAINT chk_gd_agent_nonempty CHECK (agent_id <> '');

-- 4.c) Foreign key vers crminternet_users (refuse les agents inconnus).
ALTER TABLE crminternet_guichet_dossiers
  ADD CONSTRAINT fk_gd_agent
  FOREIGN KEY (agent_id) REFERENCES crminternet_users(id)
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- 5) VÉRIFICATION post-migration --------------------------------------
SELECT COUNT(*) AS orphelins_restants
FROM crminternet_guichet_dossiers d
LEFT JOIN crminternet_users u ON u.id = d.agent_id
WHERE d.agent_id IS NULL OR d.agent_id = '' OR u.id IS NULL;
-- Doit retourner 0.
