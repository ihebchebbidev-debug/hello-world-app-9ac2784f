-- =====================================================================
-- Ajoute le champ "Animateur" sur la table prospects.
-- Utilisé uniquement quand le type de prospect est "Street" (peut rester
-- NULL pour tous les autres types).
-- Idempotent — on ignore l'erreur "Duplicate column" si déjà appliqué.
-- =====================================================================
ALTER TABLE crminternet_prospects
  ADD COLUMN animateur VARCHAR(120) NULL AFTER ancien_ligne;

-- Index facultatif pour filtrer/rechercher par animateur (Street).
CREATE INDEX idx_prospects_animateur ON crminternet_prospects (animateur);
