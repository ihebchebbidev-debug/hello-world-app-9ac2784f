-- =====================================================================
-- Réclamations — table principale
-- ID auto-généré (BIGINT auto_increment) + reference unique lisible
-- (REC-AAAAMM-XXXX) pour affichage / import.
-- =====================================================================

CREATE TABLE IF NOT EXISTS `crminternet_reclamations` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `reference`       VARCHAR(32)     NOT NULL,                -- REC-202605-0001
  `tel_adsl`        VARCHAR(32)     NULL,
  `ref_demand`      VARCHAR(64)     NULL,
  `cin_client`      VARCHAR(32)     NULL,
  `gsm_client`      VARCHAR(32)     NULL,
  `client_name`     VARCHAR(160)    NULL,
  `service`         ENUM('Technique','Facturation','Commercial','Autre') NOT NULL DEFAULT 'Technique',
  `description`     TEXT            NULL,
  `statut_crm`      VARCHAR(80)     NULL,                    -- ex. "Réclamation TT", "Prise en charge"
  `statut_tt`       VARCHAR(80)     NULL,                    -- statut côté opérateur
  `audit_status`    ENUM('en_cours','resolu','annule') NOT NULL DEFAULT 'en_cours',
  `localisation`    VARCHAR(160)    NULL,
  `etat`            VARCHAR(80)     NULL,
  `remarques`       TEXT            NULL,
  `date_creation`   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `date_resolution` DATETIME        NULL,
  `mois`            TINYINT UNSIGNED GENERATED ALWAYS AS (MONTH(`date_creation`)) STORED,
  `annee`           SMALLINT UNSIGNED GENERATED ALWAYS AS (YEAR(`date_creation`))  STORED,
  `assigned_to`     VARCHAR(80)     NULL,
  `created_by`      VARCHAR(80)     NULL,
  `created_at`      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_rec_reference` (`reference`),
  KEY `idx_rec_audit`  (`audit_status`),
  KEY `idx_rec_service`(`service`),
  KEY `idx_rec_tel`    (`tel_adsl`),
  KEY `idx_rec_cin`    (`cin_client`),
  KEY `idx_rec_gsm`    (`gsm_client`),
  KEY `idx_rec_assigned` (`assigned_to`),
  KEY `idx_rec_period` (`annee`,`mois`),
  KEY `idx_rec_created`(`date_creation`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Compteur séquentiel par mois pour générer les "REC-AAAAMM-XXXX"
CREATE TABLE IF NOT EXISTS `crminternet_reclamation_counter` (
  `period`    CHAR(6) NOT NULL,           -- "202605"
  `last_seq`  INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (`period`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
