-- =====================================================================
-- Protection ERP — Temporary access grants (run once on luccybcdb)
-- Permet à l'Administrateur d'accorder à un utilisateur :
--   * un rôle additionnel temporaire (grant_role)
--   * une permission additionnelle temporaire (grant_permission)
-- Tous les grants ont une date d'expiration.
-- =====================================================================
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS crminternet_user_grants (
  id              VARCHAR(40)  PRIMARY KEY,
  user_username   VARCHAR(80)  NOT NULL,
  grant_type      ENUM('role','permission') NOT NULL,
  grant_value     VARCHAR(120) NOT NULL,           -- nom de rôle OU clé de permission
  reason          VARCHAR(255) NULL,
  granted_by      VARCHAR(80)  NOT NULL,
  starts_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at      DATETIME     NOT NULL,
  revoked         TINYINT(1)   NOT NULL DEFAULT 0,
  revoked_at      DATETIME     NULL,
  revoked_by      VARCHAR(80)  NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user (user_username),
  INDEX idx_active (user_username, expires_at, revoked)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
