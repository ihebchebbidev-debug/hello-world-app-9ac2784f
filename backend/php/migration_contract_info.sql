-- =====================================================================
-- Migration : table polymorphe "Information contrat / Détails Techniques"
-- Une seule ligne par (entity_type, entity_id) : prospect / opportunity / contract.
-- Lecture avec fallback (opportunity → prospect, contract → opportunity → prospect)
-- gérée côté API (contract_info.php).
-- =====================================================================

CREATE TABLE IF NOT EXISTS crminternet_contract_info (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  entity_type     ENUM('prospect','opportunity','contract') NOT NULL,
  entity_id       VARCHAR(40) NOT NULL,

  -- Détails techniques
  type_conn       VARCHAR(255) NOT NULL DEFAULT '', -- JSON array : ["ADSL","VdsL","GPON","Box"]
  reference_tt    VARCHAR(120) NOT NULL DEFAULT '',
  tel_ligne       VARCHAR(60)  NOT NULL DEFAULT '',
  date_activation DATE NULL,
  etape           VARCHAR(60)  NOT NULL DEFAULT '', -- JSON array de "2","3","4"
  interface_type  VARCHAR(255) NOT NULL DEFAULT '', -- JSON array
  fsi             VARCHAR(60)  NOT NULL DEFAULT '', -- pour l'instant : "Topnet"
  motif_retour_tt VARCHAR(255) NOT NULL DEFAULT '', -- JSON array : ["Instance com","Instance Tech"]
  etat            ENUM('','En cours','Basculement','Rejete','Valide') NOT NULL DEFAULT '',
  remarque        TEXT NULL,

  -- Audit
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by      VARCHAR(64) NULL,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by      VARCHAR(64) NULL,

  PRIMARY KEY (id),
  UNIQUE KEY ux_entity (entity_type, entity_id),
  KEY idx_entity_id (entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
