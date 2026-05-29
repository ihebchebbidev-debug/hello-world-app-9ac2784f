-- ============================================================
-- CRM MVP-2 : Mise en conformité avec le cahier des charges
-- ============================================================
-- Idempotent : peut être ré-exécuté. À lancer UNE FOIS sur la prod.
-- Couvre :
--   §3.1 nouveaux champs lead (CIN, naissance, phone2, address, zone, comment2)
--   §3.2 statuts harmonisés (Nouveau / En cours / Rappel / Refus / Vendu)
--   §4.2 nouveaux types d'action (terrain, reseaux, technicien)
--   §1   pointage utilisateurs (heures travaillées)
--   §1   agents externes + commissions
--   §1   paie agents internes
--   §2   nouveaux rôles (Agent Suivi / Activation / Vente)
-- ============================================================

-- -------- 1. Champs leads manquants --------------------------
ALTER TABLE crminternet_prospects
  ADD COLUMN IF NOT EXISTS phone2     VARCHAR(40)  NOT NULL DEFAULT '' AFTER phone,
  ADD COLUMN IF NOT EXISTS cin        VARCHAR(40)  NOT NULL DEFAULT '' AFTER phone2,
  ADD COLUMN IF NOT EXISTS birth_date DATE         NULL                AFTER cin,
  ADD COLUMN IF NOT EXISTS address    VARCHAR(255) NOT NULL DEFAULT '' AFTER city,
  ADD COLUMN IF NOT EXISTS zone       VARCHAR(120) NOT NULL DEFAULT '' AFTER address,
  ADD COLUMN IF NOT EXISTS comment2   TEXT         NULL                AFTER comment;

-- (MySQL <8 : si "ADD COLUMN IF NOT EXISTS" non supporté, exécuter à la main)

-- -------- 2. Statuts conformes (réécriture des libellés) -----
UPDATE crminternet_prospects SET status='Nouveau'  WHERE status IN ('Nouveau','A traiter','');
UPDATE crminternet_prospects SET status='En cours' WHERE status IN ('En cours','Contacté','Qualifié','Proposition','A recontacter (Voir Commentaire)');
UPDATE crminternet_prospects SET status='Rappel'   WHERE status IN ('Rappel','A rappeler');
UPDATE crminternet_prospects SET status='Refus'    WHERE status IN ('Refus','Refusé','Sans réponse','Perdu');
UPDATE crminternet_prospects SET status='Vendu'    WHERE status IN ('Vendu','Vente','Gagné');

-- Pipeline kanban aligné
DELETE FROM crminternet_lead_stages;
INSERT INTO crminternet_lead_stages (id, name, color, position) VALUES
  ('S-1','Nouveau','info',1),
  ('S-2','En cours','primary',2),
  ('S-3','Rappel','warning',3),
  ('S-4','Refus','destructive',4),
  ('S-5','Vendu','success',5);

-- -------- 3. Types d'actions commerciales étendus ------------
-- (Ré-applique l'ENUM avec les nouveaux types)
ALTER TABLE crminternet_lead_actions
  MODIFY COLUMN type ENUM('appel','visite','relance','note','terrain','reseaux','technicien')
  NOT NULL DEFAULT 'note';

-- -------- 4. Rôles métier du cahier des charges --------------
INSERT IGNORE INTO crminternet_roles (name, label, description, color, is_system, sort_order) VALUES
  ('AgentSuivi',     'Agent Suivi',     'Prospection + Opportunité + Contrat', 'success', 0, 5),
  ('AgentActivation','Agent Activation','Prospection + Opportunité',           'info',    0, 6),
  ('AgentVente',     'Agent Vente',     'Prospection',                         'warning', 0, 7);

-- Permissions sémantiques par niveau
INSERT IGNORE INTO crminternet_role_permissions (role, permission, enabled) VALUES
  ('AgentSuivi',     'leads.prospection', 1),
  ('AgentSuivi',     'leads.opportunite', 1),
  ('AgentSuivi',     'leads.contrat',     1),
  ('AgentSuivi',     'prospect',          1),
  ('AgentSuivi',     'contract',          1),
  ('AgentSuivi',     'calendar',          1),
  ('AgentActivation','leads.prospection', 1),
  ('AgentActivation','leads.opportunite', 1),
  ('AgentActivation','prospect',          1),
  ('AgentActivation','calendar',          1),
  ('AgentVente',     'leads.prospection', 1),
  ('AgentVente',     'prospect',          1);

-- -------- 5. Pointage / présence -----------------------------
CREATE TABLE IF NOT EXISTS crminternet_attendance (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id       VARCHAR(40)  NOT NULL,
  username      VARCHAR(80)  NOT NULL,
  login_at      DATETIME     NOT NULL,
  logout_at     DATETIME     NULL,
  total_minutes INT          NOT NULL DEFAULT 0,
  ip            VARCHAR(64)  NULL,
  user_agent    VARCHAR(255) NULL,
  INDEX idx_user_date (user_id, login_at),
  INDEX idx_username  (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -------- 6. Agents externes + commissions -------------------
CREATE TABLE IF NOT EXISTS crminternet_external_agents (
  id              VARCHAR(40)  PRIMARY KEY,
  full_name       VARCHAR(160) NOT NULL,
  phone           VARCHAR(40)  NOT NULL DEFAULT '',
  email           VARCHAR(160) NOT NULL DEFAULT '',
  cin             VARCHAR(40)  NOT NULL DEFAULT '',
  commission_rate DECIMAL(6,2) NOT NULL DEFAULT 0.00, -- % par vente
  fixed_amount    DECIMAL(10,2) NOT NULL DEFAULT 0.00, -- ou montant fixe par vente
  active          TINYINT(1)   NOT NULL DEFAULT 1,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notes           TEXT         NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS crminternet_commissions (
  id                 VARCHAR(40)  PRIMARY KEY,
  external_agent_id  VARCHAR(40)  NOT NULL,
  prospect_id        VARCHAR(40)  NULL,
  contract_id        VARCHAR(40)  NULL,
  amount             DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  basis              DECIMAL(10,2) NOT NULL DEFAULT 0.00, -- montant de la vente
  status             ENUM('pending','paid','cancelled') NOT NULL DEFAULT 'pending',
  earned_at          DATE         NOT NULL,
  paid_at            DATETIME     NULL,
  paid_by            VARCHAR(80)  NULL,
  payment_ref        VARCHAR(120) NULL,
  notes              TEXT         NULL,
  created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_agent  (external_agent_id),
  INDEX idx_status (status),
  INDEX idx_earned (earned_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -------- 7. Paie agents internes ----------------------------
CREATE TABLE IF NOT EXISTS crminternet_payroll (
  id             VARCHAR(40)  PRIMARY KEY,
  user_id        VARCHAR(40)  NOT NULL,
  username       VARCHAR(80)  NOT NULL,
  period         CHAR(7)      NOT NULL, -- 'YYYY-MM'
  base_salary    DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  hours_worked   DECIMAL(7,2)  NOT NULL DEFAULT 0.00,
  hourly_rate    DECIMAL(8,2)  NOT NULL DEFAULT 0.00,
  bonus          DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  deductions     DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  total          DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  status         ENUM('draft','validated','paid') NOT NULL DEFAULT 'draft',
  paid_at        DATETIME     NULL,
  notes          TEXT         NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_user_period (user_id, period),
  INDEX idx_period (period),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
