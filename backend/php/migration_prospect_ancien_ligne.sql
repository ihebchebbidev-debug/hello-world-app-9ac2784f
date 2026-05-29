-- =====================================================================
-- Ajoute "Ancien Ligne" comme VRAI champ de la table prospects.
-- (Plus un champ personnalisé : colonne dédiée pour requêtes/index.)
-- Idempotent — on ignore l'erreur "Duplicate column" si déjà appliqué.
-- =====================================================================
ALTER TABLE crminternet_prospects
  ADD COLUMN ancien_ligne VARCHAR(40) NULL AFTER phone2;

-- Optionnel : index pour recherche rapide par ancien numéro
CREATE INDEX idx_prospects_ancien_ligne ON crminternet_prospects (ancien_ligne);
