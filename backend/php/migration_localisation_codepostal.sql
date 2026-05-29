-- Migration : ajout des colonnes "localisation_xy" (coordonnées Google Maps
-- "lat,lng" ex: 36.123456,10.123698) et "code_postal" pour les fiches
-- Prospects, Opportunités et Contrats.
--
-- À exécuter une seule fois sur la base MySQL du backend PHP.

ALTER TABLE crminternet_prospects
  ADD COLUMN localisation_xy VARCHAR(64) NULL AFTER address,
  ADD COLUMN code_postal     VARCHAR(20) NULL AFTER localisation_xy;

ALTER TABLE crminternet_opportunities
  ADD COLUMN localisation_xy VARCHAR(64) NULL AFTER address,
  ADD COLUMN code_postal     VARCHAR(20) NULL AFTER localisation_xy;

ALTER TABLE crminternet_contracts
  ADD COLUMN localisation_xy VARCHAR(64) NULL AFTER address,
  ADD COLUMN code_postal     VARCHAR(20) NULL AFTER localisation_xy;

-- Index optionnel pour rechercher par code postal
CREATE INDEX idx_prospects_code_postal      ON crminternet_prospects (code_postal);
CREATE INDEX idx_opportunities_code_postal  ON crminternet_opportunities (code_postal);
CREATE INDEX idx_contracts_code_postal      ON crminternet_contracts (code_postal);
