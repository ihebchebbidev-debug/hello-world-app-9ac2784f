-- Migration: per-user permission overrides (allow/deny).
-- Safe to run multiple times.
CREATE TABLE IF NOT EXISTS crminternet_user_permission_overrides (
  user_username VARCHAR(80) NOT NULL,
  permission    VARCHAR(80) NOT NULL,
  effect        ENUM('allow','deny') NOT NULL,
  updated_by    VARCHAR(80) NULL,
  updated_at    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_username, permission),
  INDEX idx_user (user_username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
