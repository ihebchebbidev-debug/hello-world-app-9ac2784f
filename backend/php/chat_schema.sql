-- =====================================================================
-- Protection ERP — Chat module schema (run once on luccybcdb)
-- Safe to re-run; uses CREATE TABLE IF NOT EXISTS + idempotent ALTERs.
-- =====================================================================
SET NAMES utf8mb4;

-- ---------------------------------------------------------------------
-- Conversations: DM, group or broadcast.
-- post_policy: 'all'    = any member can post
--              'admins' = only conversation admins (or app Administrateur) can post
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crminternet_chat_conversations (
  id              VARCHAR(40)  PRIMARY KEY,
  type            ENUM('dm','group','broadcast') NOT NULL DEFAULT 'group',
  name            VARCHAR(160) NULL,
  created_by      VARCHAR(80)  NULL,
  post_policy     ENUM('all','admins') NOT NULL DEFAULT 'all',
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_message_at DATETIME     NULL,
  INDEX idx_type (type),
  INDEX idx_lastmsg (last_message_at)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Members of each conversation.
-- role: 'admin' = can manage members / rename / change post policy
--       'member' = standard participant
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crminternet_chat_members (
  conversation_id VARCHAR(40)  NOT NULL,
  user_username   VARCHAR(80)  NOT NULL,
  role            ENUM('admin','member') NOT NULL DEFAULT 'member',
  joined_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_read_at    DATETIME     NULL,
  muted           TINYINT(1)   NOT NULL DEFAULT 0,
  hidden          TINYINT(1)   NOT NULL DEFAULT 0,
  PRIMARY KEY (conversation_id, user_username),
  INDEX idx_user (user_username)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Messages, including optional attachment fields (image/PDF/etc).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crminternet_chat_messages (
  id                   VARCHAR(40)  PRIMARY KEY,
  conversation_id      VARCHAR(40)  NOT NULL,
  sender_username      VARCHAR(80)  NULL,
  body                 TEXT         NOT NULL,
  is_system            TINYINT(1)   NOT NULL DEFAULT 0,
  attachment_id        VARCHAR(40)  NULL,
  attachment_filename  VARCHAR(255) NULL,
  attachment_mime      VARCHAR(120) NULL,
  attachment_size      INT          NULL,
  created_at           DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_conv_created (conversation_id, created_at),
  INDEX idx_created (created_at)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Idempotent upgrades for existing installs (safe to run multiple times).
-- MySQL will error if a column already exists; wrap in stored procedure
-- when running manually, or just ignore the duplicate-column errors.
-- ---------------------------------------------------------------------
ALTER TABLE crminternet_chat_conversations
  ADD COLUMN post_policy ENUM('all','admins') NOT NULL DEFAULT 'all';

ALTER TABLE crminternet_chat_messages
  ADD COLUMN attachment_id        VARCHAR(40)  NULL,
  ADD COLUMN attachment_filename  VARCHAR(255) NULL,
  ADD COLUMN attachment_mime      VARCHAR(120) NULL,
  ADD COLUMN attachment_size      INT          NULL;
