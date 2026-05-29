-- =====================================================================
-- Protection ERP — Database Schema
-- PostgreSQL 14+ compatible. Drop-in starter for the new ERP backend.
-- =====================================================================

BEGIN;

-- ---------- ENUMS ----------------------------------------------------
CREATE TYPE app_role AS ENUM ('admin', 'manager', 'agent', 'backoffice');
CREATE TYPE prospect_status AS ENUM (
  'nouveau','a_recontacter','rdv','devis','vente','sans_reponse','perdu'
);
CREATE TYPE contract_status AS ENUM (
  'pre_validation','en_attente_validation','valide_confirmation',
  'annulee','resiliee'
);
CREATE TYPE custom_field_target AS ENUM ('prospect','contract','user');
CREATE TYPE custom_field_type AS ENUM ('text','number','date','boolean','select','textarea');
CREATE TYPE event_type AS ENUM ('rdv','rappel','signature','autre');

-- ---------- USERS / ROLES / TEAMS -----------------------------------
CREATE TABLE teams (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL UNIQUE,
  description  text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username      text NOT NULL UNIQUE,
  email         text NOT NULL UNIQUE,
  full_name     text NOT NULL,
  password_hash text,                    -- bcrypt/argon2 hash
  team_id       uuid REFERENCES teams(id) ON DELETE SET NULL,
  active        boolean NOT NULL DEFAULT true,
  last_login    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Roles in a separate table to avoid privilege-escalation attacks
CREATE TABLE user_roles (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role     app_role NOT NULL,
  UNIQUE (user_id, role)
);

-- Granular permissions per role (matches the role-toggle screen)
CREATE TABLE role_permissions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role         app_role NOT NULL,
  permission   text NOT NULL,           -- e.g. 'prospect.edit', 'dashboard.view'
  enabled      boolean NOT NULL DEFAULT false,
  UNIQUE (role, permission)
);

-- ---------- BACKOFFICE LOOKUP TABLES --------------------------------
CREATE TABLE cabinets (
  id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name  text NOT NULL UNIQUE,
  address text, city text, postal_code text, phone text
);

CREATE TABLE partners (
  id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name   text NOT NULL UNIQUE,
  type   text,                          -- e.g. 'sante', 'prevoyance'
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE products (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id  uuid REFERENCES partners(id) ON DELETE CASCADE,
  name        text NOT NULL,
  category    text,                     -- e.g. 'sante','complementaire'
  active      boolean NOT NULL DEFAULT true
);

CREATE TABLE warranties (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  uuid REFERENCES products(id) ON DELETE CASCADE,
  name        text NOT NULL,
  level       int
);

CREATE TABLE prospect_sources (
  id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name  text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE call_statuses (
  id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name  text NOT NULL UNIQUE,
  color text                            -- hex/oklch token for UI
);

CREATE TABLE billing_statuses (
  id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name  text NOT NULL UNIQUE,
  color text
);

CREATE TABLE validation_statuses (
  id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name  text NOT NULL UNIQUE,
  color text
);

-- ---------- PROSPECTS (LEADS) ---------------------------------------
CREATE TABLE prospects (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  civility        text,
  last_name       text NOT NULL,
  first_name      text,
  phone           text,
  mobile          text,
  email           text,
  birth_date      date,
  occupation      text,
  children_count  int,
  spouse_age      int,
  -- address
  address         text,
  postal_code     text,
  city            text,
  -- mutuelle actuelle
  current_mutuelle      text,
  current_premium       numeric(10,2),
  current_rate          numeric(5,2),
  -- routing & status
  source_id       uuid REFERENCES prospect_sources(id),
  call_status_id  uuid REFERENCES call_statuses(id),
  status          prospect_status NOT NULL DEFAULT 'nouveau',
  assigned_to     uuid REFERENCES users(id) ON DELETE SET NULL,
  recall_at       timestamptz,
  comments        text,
  request         text,
  created_by      uuid REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_prospects_assigned ON prospects(assigned_to);
CREATE INDEX idx_prospects_status   ON prospects(status);
CREATE INDEX idx_prospects_created  ON prospects(created_at DESC);

-- ---------- CONTRACTS ------------------------------------------------
CREATE TABLE contracts (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id          uuid REFERENCES prospects(id) ON DELETE SET NULL,
  partner_id           uuid REFERENCES partners(id),
  product_id           uuid REFERENCES products(id),
  cabinet_id           uuid REFERENCES cabinets(id),
  -- adherent (denormalized snapshot at signature)
  civility             text,
  last_name            text NOT NULL,
  first_name           text,
  email                text,
  phone                text,
  birth_date           date,
  address              text,
  postal_code          text,
  city                 text,
  -- conjoint
  spouse_civility      text,
  spouse_last_name     text,
  spouse_first_name    text,
  spouse_birth_date    date,
  -- contract details
  signature_date       date,
  effective_date       date,
  validation_date      date,
  premium              numeric(10,2),
  status               contract_status NOT NULL DEFAULT 'pre_validation',
  billing_status_id    uuid REFERENCES billing_statuses(id),
  validation_status_id uuid REFERENCES validation_statuses(id),
  source_id            uuid REFERENCES prospect_sources(id),
  assigned_to          uuid REFERENCES users(id) ON DELETE SET NULL,
  -- SEPA
  sepa_iban            text,
  sepa_bic             text,
  sepa_holder          text,
  comments             text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_contracts_assigned ON contracts(assigned_to);
CREATE INDEX idx_contracts_signdate ON contracts(signature_date DESC);
CREATE INDEX idx_contracts_status   ON contracts(status);

-- ---------- DOCUMENTS / ACTIVITY ------------------------------------
CREATE TABLE contract_documents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  filename    text NOT NULL,
  storage_url text NOT NULL,
  mime_type   text,
  uploaded_by uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE activity_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,            -- 'prospect','contract','user'
  entity_id   uuid NOT NULL,
  action      text NOT NULL,            -- 'created','updated','status_changed'
  payload     jsonb,
  user_id     uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_activity_entity ON activity_log(entity_type, entity_id);

-- ---------- CALENDAR -------------------------------------------------
CREATE TABLE calendar_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  type        event_type NOT NULL DEFAULT 'rdv',
  start_at    timestamptz NOT NULL,
  end_at      timestamptz,
  prospect_id uuid REFERENCES prospects(id) ON DELETE SET NULL,
  contract_id uuid REFERENCES contracts(id) ON DELETE SET NULL,
  user_id     uuid REFERENCES users(id) ON DELETE CASCADE,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_events_user_start ON calendar_events(user_id, start_at);

-- ---------- DISPATCH (LEAD ROUTING) ---------------------------------
CREATE TABLE dispatch_quotas (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   uuid REFERENCES products(id) ON DELETE CASCADE,
  source_id    uuid REFERENCES prospect_sources(id) ON DELETE CASCADE,
  quota        int NOT NULL DEFAULT 0,
  date         date NOT NULL DEFAULT CURRENT_DATE
);

CREATE TABLE dispatch_agents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_id       uuid REFERENCES teams(id),
  daily_quota   int NOT NULL DEFAULT 0,
  dispatched    int NOT NULL DEFAULT 0,
  waiting_lead  int NOT NULL DEFAULT 0,
  active        boolean NOT NULL DEFAULT true,
  date          date NOT NULL DEFAULT CURRENT_DATE
);

-- ---------- CUSTOM FIELDS (CONFIGURATION) ---------------------------
CREATE TABLE custom_fields (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target      custom_field_target NOT NULL,
  field_key   text NOT NULL,
  label       text NOT NULL,
  field_type  custom_field_type NOT NULL,
  options     jsonb,                    -- for select-type fields
  required    boolean NOT NULL DEFAULT false,
  position    int NOT NULL DEFAULT 0,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (target, field_key)
);

CREATE TABLE custom_field_values (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  custom_field_id uuid NOT NULL REFERENCES custom_fields(id) ON DELETE CASCADE,
  entity_id       uuid NOT NULL,
  value           jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (custom_field_id, entity_id)
);

-- ---------- HELPER: has_role (security definer) ---------------------
CREATE OR REPLACE FUNCTION has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = _user_id AND role = _role
  );
$$;

-- ---------- SEED REFERENCE DATA -------------------------------------
INSERT INTO prospect_sources (name) VALUES
 ('Client Existant'),('RDV CHAUD'),('Fiches Qualifie'),('Web'),('Recommandation')
ON CONFLICT DO NOTHING;

INSERT INTO call_statuses (name, color) VALUES
 ('A recontacter', '#f59e0b'),
 ('RDV',           '#3b82f6'),
 ('Vente',         '#10b981'),
 ('Devis',         '#8b5cf6'),
 ('Sans réponse',  '#94a3b8')
ON CONFLICT DO NOTHING;

INSERT INTO billing_statuses (name, color) VALUES
 ('Validé Confirmation',     '#10b981'),
 ('En attente de validation','#f59e0b'),
 ('Annuler la confirmation', '#ef4444'),
 ('Pré-validé',              '#3b82f6')
ON CONFLICT DO NOTHING;

INSERT INTO partners (name, type) VALUES
 ('NEOLIANE','sante'),('SPVIE','sante'),('APRIL','sante'),
 ('APIVIA','sante'),('MALAKOFF','prevoyance')
ON CONFLICT DO NOTHING;

COMMIT;
