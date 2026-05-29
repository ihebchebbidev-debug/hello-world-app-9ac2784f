# ERP App Deep Analysis: Guichet & Users Module

## Executive Summary

This is an enterprise CRM/ERP application (Tunisian telecom company) with a dedicated **Guichet** (counter/window operations) module that handles counter-service transactions and an integrated **Users** management system with HR capabilities. The architecture combines React frontend with PHP backend, using MySQL for persistence and a permission-based security model.

---

## 1. USERS MODULE ARCHITECTURE

### 1.1 Frontend Components

#### **NewUserDialog.tsx** (`src/components/`)
- **Purpose**: Dialog for creating new users
- **Key Features**:
  - Username validation (2-64 chars, alphanumeric + . _ -)
  - Password field (min 6 chars)
  - Role selection dropdown (filtered: excludes "Backoffice")
  - Team assignment
  - Active/inactive toggle
  - HR fields integration (job title, birth date, CIN, etc.)
  - Custom fields inline support
  - Form validation with toast notifications
  - API call to `/custom_field_values.php` for custom field persistence

#### **EditUserDialog.tsx** (`src/components/`)
- **Purpose**: Modify existing user details
- **Key Features**:
  - Username rename with cascade support (`previousUsername` → triggers backend cascade)
  - Full HR field editing
  - Role/Team/Active status changes
  - Validation for username format
  - Preserves user ID immutability
  - Shows username in description (for context)

#### **UserHrFields.tsx** (`src/components/`)
- **Purpose**: Reusable component for HR/personnel data
- **Managed Fields**:
  - `jobTitle`: job position
  - `birthDate`: YYYY-MM-DD
  - `cin`: CIN ID (alphanumeric, 4-40 chars)
  - `company`: company name
  - `contractType`: CDI/CDD/CIVP/SIVP/Karama/Stage/Freelance
  - `salary`: DECIMAL(10,3) - monthly salary
  - `salaryIncrease`: DECIMAL(10,3) - salary increment
  - `contractStart/End`: contract duration (YYYY-MM-DD)
  - `renewalStart/End`: renewal period (YYYY-MM-DD)
  - `observations`: free-text notes (up to 2000 chars)
  - `phone`: phone number (6-40 chars, regex: `/^[0-9 +()-]{6,40}$/`)
  - `rib`: RIB bank account (10-30 numeric chars)
  - `hireDate`: hire date with company (YYYY-MM-DD)
  - `guichetEntityId`: franchise/counter assignment (OPTIONAL)
  - `teamId`: team assignment (OPTIONAL)

### 1.2 Backend Endpoints

#### **users.php** (PHP/REST API)

**GET /users.php**
- Returns list of all users + computed metrics
- Joins `crminternet_prospects` to calculate:
  - `leadsHandled`: count of prospects assigned to user
  - `contractsWon`: count of prospects with `outcome='won'`
  - `conversionRate`: (won/handled) * 100
- Response structure:
  ```json
  {
    "users": [{
      "id": "U-xxx",
      "username": "john.doe",
      "fullName": "John Doe",
      "email": "john@example.com",
      "role": "Agent",
      "team": "Lead-Actifs",
      "active": true,
      "leadsHandled": 45,
      "contractsWon": 12,
      "conversionRate": 26.7,
      "jobTitle": "Agent activation",
      "birthDate": "1994-10-30",
      "cin": "12345678",
      "company": "height",
      "contractType": "CDI",
      "salary": 850.000,
      "salaryIncrease": 900.000,
      "contractStart": "2025-05-11",
      "contractEnd": null,
      "renewalStart": null,
      "renewalEnd": null,
      "observations": null,
      "phone": "94431140",
      "rib": "11060002351100878837",
      "hireDate": "2022-02-14",
      "guichetEntityId": null,
      "teamId": null
    }]
  }
  ```

**POST /users.php** (Create/Update)
- **Auth**: Requires `Administrateur` role
- **Input**: Single user OR array of users (batch mode)
- **Validation**:
  - `username`: required, format check (2-64 alphanumeric + . _ -)
  - `fullName`: required
  - `email`: required, valid email format (defaults to `username@protection.fr`)
  - `role`: must be in `crminternet_roles` table
  - HR fields: strict type/format validation
    - Dates: strict ISO format (YYYY-MM-DD) with calendar validation
    - Salary/Increase: DECIMAL(10,3), non-negative
    - CIN: alphanumeric + hyphen (4-40 chars)
    - Phone: numeric + spaces/+/parentheses (6-40 chars)
    - RIB: 10-30 numeric chars
  - `guichetEntityId`: FK check against `crminternet_guichet_entities`
  - `teamId`: FK check against `crminternet_teams`

- **Special Logic**:
  - **Username Rename Cascade**: If `previousUsername` ≠ `username`:
    - Renames user (by ID, not username)
    - Cascades to `assigned_to` columns in:
      - `crminternet_prospects`
      - `crminternet_opportunities`
      - `crminternet_contracts`
    - Uses transaction (rollback on error)
  - **Duplicate Prevention**: Returns 409 conflict if:
    - `username` already exists (DUPLICATE_USERNAME)
    - `email` already exists (DUPLICATE_EMAIL)
    - `cin` already exists (DUPLICATE_CIN)
  - **Batch Mode**: Mixed add/update operations with error accumulation

- **Response**:
  ```json
  {
    "added": 5,
    "updated": 3,
    "skipped": 2,
    "errors": [{
      "row": 1,
      "username": "jane.doe",
      "code": "DUPLICATE_EMAIL",
      "errors": ["Email déjà utilisé (jane@example.com)"]
    }]
  }
  ```

**DELETE /users.php?id=USER_ID** (Soft delete simulation)
- **Auth**: Requires `Administrateur` role
- Deletes user by ID
- Audit logged

### 1.3 Database Schema

#### **crminternet_users** (extended)
```sql
CREATE TABLE crminternet_users (
  id              VARCHAR(40) PRIMARY KEY,
  username        VARCHAR(64) NOT NULL UNIQUE,
  full_name       VARCHAR(120) NOT NULL,
  email           VARCHAR(255) NOT NULL UNIQUE,
  password_hash   VARCHAR(255) NOT NULL,
  role            VARCHAR(60) NOT NULL,
  team            VARCHAR(60) NOT NULL DEFAULT 'Lead-Actifs',
  active          TINYINT(1) NOT NULL DEFAULT 1,
  
  -- HR / Personnel fields (from migration_users_hr.sql)
  job_title       VARCHAR(120) NULL,
  birth_date      DATE NULL,
  cin             VARCHAR(40) NULL UNIQUE,
  company         VARCHAR(120) NULL,
  contract_type   VARCHAR(40) NULL,
  salary          DECIMAL(10,3) NULL,
  salary_increase DECIMAL(10,3) NULL,
  contract_start  DATE NULL,
  contract_end    DATE NULL,
  renewal_start   DATE NULL,
  renewal_end     DATE NULL,
  observations    TEXT NULL,
  phone           VARCHAR(40) NULL,
  rib             VARCHAR(40) NULL,
  hire_date       DATE NULL,
  
  -- Guichet assignment (from migration_guichet.sql)
  guichet_entity_id VARCHAR(40) NULL,
  
  -- Team assignment (from migration_teams.sql)
  team_id         VARCHAR(40) NULL,
  
  INDEX idx_users_guichet_entity (guichet_entity_id),
  INDEX idx_users_team (team_id),
  UNIQUE KEY uniq_users_cin (cin),
  KEY idx_users_company (company),
  KEY idx_users_contract_end (contract_end)
);
```

---

## 2. GUICHET MODULE ARCHITECTURE

### 2.1 Frontend Components & Routes

#### **guichet.tsx** (Main Route)
- **Route**: `/guichet`
- **Permissions**: 
  - Requires `guichet.read_own` OR `guichet.read_all`
  - Special handling: `AgentGuichet` users locked to their assigned entity
  - Admin/Manager/read_all users see all entities
  
- **State Management**:
  ```typescript
  const [rows, setRows] = useState<GuichetDossier[]>([]);      // list of dossiers
  const [entities, setEntities] = useState<GuichetEntity[]>([]);
  const [q, setQ] = useState("");                              // search query
  const [entityId, setEntityIdState] = useState("");            // filter by entity
  const [agentFilter, setAgentFilter] = useState("all");       // filter by agent
  const [dateFrom, setDateFrom] = useState("");                // date range filters
  const [dateTo, setDateTo] = useState("");
  ```

- **Tabs**:
  1. **Dossiers Tab**: List view with CRUD
     - Search (client name, CIN, reference, numero)
     - Agent filter (dropdown, admin-only)
     - Date range filter
     - Entity filter (scoped by user permissions)
     - Actions: Create, Edit, Validate, Delete
     - Inline editing for entries
     - Color-coded by entry type (row tint)
  
  2. **Dashboard Tab**: Analytics & objectives
     - KPI cards: Daily/Monthly contracts, Activation rate, Budget tracking
     - Objectives editor (global/entity/agent scope)
     - Monthly targets: SIM, Portabilité, Fancy, Contracts/day, Contracts/month

- **Export Features**:
  - CSV export (`exportCSV`)
  - XLSX export (`exportXLSX`)
  - Includes: Ref, Client, CIN, Type, Montant, Agent, Status, Date

- **Import Features**:
  - Modal dialog with field validation
  - Maps: Entity name → ID, Agent name/username → user ID, Type label → type enum
  - Handles: SIM, Portabilité (aliases: portabilité, portabilite), factures, etc.
  - Batch upsert with error reporting

- **Auto-Refresh**:
  - Polling every 20s
  - On window focus
  - On visibility change (tab switch)
  - Purpose: Real-time sync across agents

#### **GuichetAdmin.tsx** (Administration Component)
- **Panels**:
  1. **ObjectivesPanel**: Set monthly targets by scope (global/entity/agent)
  2. **EntitiesPanel**: CRUD for guichet entities
     - Create: Name, Type (TTshop/Franchise/Autre), City
     - Edit: In-dialog form
     - Delete: With confirmation
     - Toggle active/inactive

#### **guichet_.analytics.tsx**
- **Route**: `/guichet/analytics`
- Advanced reporting & KPI dashboard

### 2.2 Backend Endpoints

#### **guichet_entities.php**

**GET /guichet_entities.php**
- Returns entities (filtered by user's assigned entity if not admin)
- Query param `?active=1` filters to active only
- **Security**: AgentGuichet sees only their assigned entity

**POST /guichet_entities.php**
- Create new entity
- **Auth**: Requires `guichet.manage_entities` permission
- **Input**:
  ```json
  {
    "name": "TTshop Tunis",
    "type": "ttshop|franchise|autre",
    "city": "Tunis",
    "active": true
  }
  ```
- Generates ID: `GE-{10-char hex}`
- Audit logged

**PATCH /guichet_entities.php**
- Update entity (name, type, city, active)

**DELETE /guichet_entities.php?id=ENTITY_ID**
- Delete entity

#### **guichet_dossiers.php** (Core)

**GET /guichet_dossiers.php**
- List dossiers with filters
- **Query params**:
  ```
  ?q=search_term
  ?entity_id=ENTITY_ID
  ?entityId=ENTITY_ID (alias)
  ?status=draft|valide
  ?month=YYYY-MM
  ?type=sim|port|swp|divers|facture_tt|facture_topnet
  ?id=DOSSIER_ID (single fetch with entries)
  ```
- **Returns**:
  ```json
  {
    "dossiers": [{
      "id": "GD-...",
      "ref": "71500500",
      "entityId": "GE-...",
      "agentId": "U-...",
      "clientName": "Ahmed Ali",
      "clientCin": "12345678",
      "status": "draft",
      "validatedAt": null,
      "validatedBy": null,
      "notes": "",
      "createdAt": "2025-05-22T10:30:00",
      "entries": [
        {
          "id": "GE-...",
          "dossierId": "GD-...",
          "type": "sim",
          "cin": "12345678",
          "numero": "29123456",
          "amount": 25.000,
          "offre": "Fancy",
          "operatorSource": "",
          "label": "",
          "opDate": "2025-05-22",
          "status": "draft"
        }
      ]
    }]
  }
  ```

**POST /guichet_dossiers.php**
- Create dossier + entries (atomic transaction)
- **Auth**: Requires `guichet.create` permission
- **Input**:
  ```json
  {
    "entityId": "GE-...",
    "agentId": "U-...",
    "clientName": "Ahmed Ali",
    "clientCin": "12345678",
    "status": "draft",
    "entries": [
      {
        "type": "sim",
        "cin": "12345678",
        "numero": "29123456",
        "amount": 25.0,
        "offre": "Fancy",
        "opDate": "2025-05-22"
      }
    ]
  }
  ```
- Auto-generates: Dossier ID, Reference (seq from 71500500), Entry IDs

**POST /guichet_dossiers.php?action=validate**
- Validate dossier + entries (sets status='valide', timestamps)
- **Auth**: Requires `guichet.validate` permission

**PATCH /guichet_dossiers.php**
- Update dossier metadata (clientName, clientCin, notes, status)

**DELETE /guichet_dossiers.php?id=DOSSIER_ID**
- Delete dossier (cascade deletes entries)

#### **guichet_entries.php** (Individual Entry CRUD)

**POST /guichet_entries.php**
- Create single entry in existing dossier
- **Auth**: Requires `guichet.edit` permission
- **Security**: Entity lock enforced (must be same entity as dossier)

**PATCH /guichet_entries.php**
- Update entry (type, cin, numero, amount, offre, opDate, status)

**DELETE /guichet_entries.php?id=ENTRY_ID**
- Delete entry

#### **guichet_objectives.php**

**GET /guichet_objectives.php**
- List objectives by period/scope

**POST /guichet_objectives.php**
- Upsert objectives (scope: global/entity/agent)
- **Input**:
  ```json
  {
    "scope": "global|entity|agent",
    "agentId": "U-... (if scope=agent)",
    "entityId": "GE-... (if scope=entity)",
    "periodMonth": "2025-05",
    "targetSim": 100,
    "targetPort": 10,
    "targetFancy": 10,
    "targetContractsDaily": 25,
    "targetContractsMonthly": 650,
    "workingDays": 26,
    "budgetMonthlyDt": 900,
    "budgetDailyDt": 30,
    "minActivationPct": 25,
    "challengeBonusDt": null
  }
  ```

#### **guichet_dashboard.php**

**GET /guichet_dashboard.php**
- **Query params**:
  ```
  ?month=2025-05
  ?day=2025-05-22
  ?entityId=GE-... (optional)
  ?agentId=U-... (optional)
  ```
- **Returns** complex KPI object:
  ```json
  {
    "month": "2025-05",
    "today": "2025-05-22T00:00:00",
    "scope": { "agentId": null, "entityId": null },
    "counts": { "sim": 45, "port": 3, "swp": 2, ... },
    "amounts": { "sim": 1125.000, "port": 75.000, ... },
    "targets": { ... },
    "progress": { "sim": 45, "port": 3, "contractsDaily": 18, "contractsMonthly": 450 },
    "contracts": { "today": 18, "month": 450 },
    "activation": { "rate": 95.2, "min": 25, "meets": true, "validated": 342, "totalEntries": 360 },
    "leaderboard": [
      { "agentId": "U-...", "sim": 50, "port": 5, "fancy": 8 },
      ...
    ],
    "bonusDt": null
  }
  ```

### 2.3 Database Schema

#### **crminternet_guichet_entities**
```sql
CREATE TABLE crminternet_guichet_entities (
  id        VARCHAR(40) PRIMARY KEY,
  name      VARCHAR(120) NOT NULL UNIQUE,
  type      ENUM('ttshop','franchise','autre') NOT NULL DEFAULT 'ttshop',
  city      VARCHAR(120) NULL,
  active    TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

#### **crminternet_guichet_dossiers**
```sql
CREATE TABLE crminternet_guichet_dossiers (
  id          VARCHAR(40) PRIMARY KEY,
  ref         VARCHAR(20) NOT NULL UNIQUE,
  entity_id   VARCHAR(40) NOT NULL,
  agent_id    VARCHAR(40) NOT NULL,
  client_name VARCHAR(160) NULL,
  client_cin  VARCHAR(20) NULL,
  status      ENUM('draft','valide') NOT NULL DEFAULT 'draft',
  validated_at DATETIME NULL,
  validated_by VARCHAR(40) NULL,
  notes       TEXT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_gd_entity (entity_id),
  INDEX idx_gd_agent (agent_id),
  INDEX idx_gd_status_date (status, created_at)
);
```

#### **crminternet_guichet_entries**
```sql
CREATE TABLE crminternet_guichet_entries (
  id              VARCHAR(40) PRIMARY KEY,
  dossier_id      VARCHAR(40) NOT NULL,
  type            ENUM('sim','port','swp','divers','facture_tt','facture_topnet') NOT NULL,
  cin             VARCHAR(20) NULL,
  numero          VARCHAR(40) NULL,
  amount          DECIMAL(12,3) NULL,
  offre           VARCHAR(60) NULL,
  operator_source VARCHAR(60) NULL,
  label           VARCHAR(160) NULL,
  op_date         DATE NULL,
  status          ENUM('draft','valide') NOT NULL DEFAULT 'draft',
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_ge_dossier FOREIGN KEY (dossier_id)
    REFERENCES crminternet_guichet_dossiers(id) ON DELETE CASCADE,
  INDEX idx_ge_type_status (type, status),
  INDEX idx_ge_dossier (dossier_id)
);
```

#### **crminternet_guichet_objectives**
```sql
CREATE TABLE crminternet_guichet_objectives (
  id                 VARCHAR(40) PRIMARY KEY,
  scope              ENUM('agent','entity','global') NOT NULL DEFAULT 'agent',
  agent_id           VARCHAR(40) NULL,
  entity_id          VARCHAR(40) NULL,
  period_month       CHAR(7) NOT NULL, -- 'YYYY-MM'
  target_sim         INT NOT NULL DEFAULT 100,
  target_port        INT NOT NULL DEFAULT 10,
  target_fancy       INT NOT NULL DEFAULT 10,
  target_contracts_daily INT NOT NULL DEFAULT 25,
  target_contracts_monthly INT NOT NULL DEFAULT 650,
  working_days       INT NOT NULL DEFAULT 26,
  budget_monthly_dt  DECIMAL(8,2) NULL,
  budget_daily_dt    DECIMAL(8,2) NULL,
  min_activation_pct INT NOT NULL DEFAULT 25,
  challenge_bonus_dt DECIMAL(8,2) NULL,
  notes              TEXT NULL,
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_scope_period (scope, agent_id, entity_id, period_month),
  INDEX idx_period (period_month)
);
```

---

## 3. SECURITY & PERMISSIONS

### 3.1 Permission Model

**Permission Catalog** (`src/lib/permissions.ts`):
```
guichet.read_own           → read own dossiers
guichet.read_all           → read all dossiers (global view)
guichet.create             → create dossier + entries
guichet.edit               → edit entries
guichet.delete             → delete dossiers
guichet.validate           → validate dossiers
guichet.export             → export (CSV/XLSX)
guichet.manage_objectives  → set targets/budgets
guichet.manage_entities    → CRUD entities
```

### 3.2 Role-Based Access

| Role | Permissions | Entity Scope |
|------|-------------|-------------|
| **Administrateur** | All guichet.* | Global (no restriction) |
| **Manager** | read_all, validate, export, manage_objectives | Global (no restriction) |
| **AgentGuichet** | read_own, create, edit, export | **Locked to assigned entity** (guichet_entity_id) |
| **Agent** | None | N/A |

### 3.3 Security Enforcement

**Entity Locking**:
- Users with `guichet_entity_id` assigned are locked to that entity
- Backend: `user_guichet_entity()` function returns assigned entity
- If not admin/read_all, all queries filtered by: `entity_id = :assigned`
- Cannot access dossiers/entries from other entities
- Frontend: `urlEntityId` is replaced with `assignedEntity` for AgentGuichet

**Permission Checks**:
- Backend: `require_permission($db, $me, 'perm.name')`
- Frontend: `<Can perm="guichet.read_all">...</Can>`
- Cascades through component tree

---

## 4. INTEGRATION POINTS

### 4.1 User ↔ Guichet

**Data Flow**:
1. User created with optional `guichetEntityId` assignment
2. User logs in → `auth.tsx` loads permissions + profile
3. Frontend checks `user?.guichetEntityId`:
   - If present + role=AgentGuichet → locked to that entity
   - If absent or admin → no restriction
4. Backend enforces via `user_guichet_entity($db, $me)` on every read/write

**Cascades**:
- If user assigned to entity, then:
  - Can only see/create dossiers for that entity
  - Cannot edit dossiers from other entities
  - Dashboard filtered to entity's metrics

### 4.2 Custom Fields

- Users can have custom fields via `custom_field_values.php`
- Guichet entries can have custom fields (keyed by `guichet_{type}`)
- Frontend: `<CustomFieldsInline />` component

### 4.3 Audit Logging

- Every create/update/delete calls `audit_log($db, $me, 'action', 'entity', id, $details)`
- Tracks: who, what, when, which record, what changed

---

## 5. DATA FLOW EXAMPLES

### 5.1 Creating a Dossier (User Perspective)

```
1. Agent clicks "Nouveau dossier"
2. Modal opens (CreateDossierDialog)
3. Agent selects entity (if not locked)
4. Agent enters client details (name, CIN)
5. Agent clicks "Add entry" → inline entry form
   - Select type (SIM, Portabilité, etc.)
   - Enter numero, amount, offre, opDate
   - Click "Save entry"
6. Agent clicks "Create dossier"
7. Frontend calls POST /guichet_dossiers.php
8. Backend:
   - Generates dossier ID, reference (71500500+)
   - Inserts dossier + all entries in transaction
   - Audit logs creation
9. Success toast, list reloads
10. Dossier visible in list (draft status)
```

### 5.2 Validating a Dossier (Manager)

```
1. Manager views dossier in list
2. Clicks "Validate" (eye icon)
3. ConfirmDialog appears
4. Clicks "Confirm"
5. Frontend calls POST /guichet_dossiers.php?action=validate
6. Backend:
   - Sets status = 'valide'
   - Sets validated_at = NOW()
   - Sets validated_by = $me['id']
   - Audit logs validation
7. List reloads, dossier now shows "valide" badge
```

### 5.3 Editing a User (Admin)

```
1. Admin clicks user "Edit" button
2. EditUserDialog opens, pre-populated with user data
3. Admin changes:
   - guichetEntityId: "GE-xxx" (now assigned to franchise)
   - jobTitle: "Agent Guichet"
4. Clicks "Enregistrer"
5. Frontend calls saveUser() → POST /users.php
6. Backend:
   - Finds user by username
   - If guichetEntityId changed:
     - Validates FK against guichet_entities
   - Updates all columns (full_name, email, role, HR fields, guichet_entity_id, etc.)
   - Audit logs update
7. Success toast, user list reloads
8. Next time user logs in:
   - auth.tsx loads their profile
   - Sees guichetEntityId in user object
   - Guichet page locks them to that entity
```

---

## 6. KEY PATTERNS & CONVENTIONS

### 6.1 ID Generation

| Entity | Format | Example |
|--------|--------|---------|
| User | `U-{8-char hex}` | `U-abc12345` |
| Guichet Entity | `GE-{10-char hex}` | `GE-abc1234567` |
| Dossier | `GD-{10-char hex}` | `GD-def4567890` |
| Entry | `GE-{10-char hex}` | `GE-ghi7890123` |
| Objective | `GO-{10-char hex}` | `GO-jkl0123456` |

### 6.2 Naming Conventions

**Database**:
- Tables: `crminternet_{module}_{entity}` (snake_case)
- Columns: snake_case
- Foreign keys: `fk_{source_table}_{target_table}`

**API**:
- URLs: `/module_entity.php` (snake_case)
- Query params: camelCase
- JSON payloads: camelCase
- Database params: snake_case (mapped in row_to_* functions)

**Frontend**:
- Components: PascalCase
- Props/State: camelCase
- Types: PascalCase
- Constants: UPPER_CASE

### 6.3 Type Mapping

**Backend → Frontend Types**:
```typescript
// guichet_dossiers.php maps:
{
  'id'              => id
  'ref'             => ref
  'entity_id'       => entityId
  'agent_id'        => agentId
  'client_name'     => clientName
  'client_cin'      => clientCin
  'status'          => status ('draft' | 'valide')
  'validated_at'    => validatedAt
  'validated_by'    => validatedBy
  'notes'           => notes
  'created_at'      => createdAt
  'updated_at'      => updatedAt
}
```

### 6.4 Error Handling

**Backend → Frontend**:
- 409 Conflict: Duplicate (username/email/cin)
- 403 Forbidden: Access denied (entity lock, permission)
- 404 Not Found: Resource not found
- 422 Unprocessable Entity: Validation error (required fields, format)
- 500 Internal Server Error: DB errors, unexpected

**Frontend**:
- `toast.error()` for user-facing messages
- `try/catch` with error extraction: `e?.message ?? 'Erreur'`
- No silent failures

---

## 7. MISSING/INCOMPLETE FEATURES

1. **Guichet Analytics** (`/guichet/analytics`) — route exists but component not fully implemented
2. **Dossier Detail View** — no dedicated page to view/edit single dossier with full history
3. **User Roles/Permissions Management UI** — no admin panel to define custom roles/permissions
4. **Bulk Operations** — no bulk edit/validate for multiple dossiers
5. **Reports** — no scheduled/email reports
6. **Offline Support** — all operations require connectivity
7. **File Attachments** — no way to attach documents to dossiers
8. **Workflow/Automation** — no approval workflows or triggers

---

## 8. PERFORMANCE CONSIDERATIONS

### Query Optimization
- Foreign keys indexed (entity_id, agent_id, dossier_id)
- Composite indexes on status + date for filtering
- User queries left-join to prospects for aggregation (potential N+1 in large datasets)

### Caching
- Frontend: ERP store + React state (no persistent cache layer)
- Backend: No caching (all queries fresh)
- Auto-refresh: 20s polling for guichet list

### Potential Bottlenecks
- Large user exports with custom fields
- Dashboard calculations for agents with 10k+ entries
- Batch user import validation

---

## 9. RECOMMENDED IMPROVEMENTS

1. **Add dossier detail page** with full transaction history
2. **Implement caching layer** (Redis) for dashboard KPIs
3. **Add pagination** to user list (currently loads all)
4. **Optimize user aggregation** query (use materialized view or background job)
5. **Separate read/write permissions** (e.g., validate vs. delete)
6. **Add approval workflow** for dossier validation (optional chain)
7. **Implement soft deletes** instead of hard deletes
8. **Add data export scheduling** with email delivery
9. **Create admin analytics dashboard** (KPIs, trends, anomalies)
10. **Add 2FA for admin accounts**

---

## 10. DEPLOYMENT CHECKLIST

- [ ] Run `migration_users_hr.sql` on database
- [ ] Run `migration_guichet.sql` on database
- [ ] Verify `crminternet_roles` has `AgentGuichet` role
- [ ] Set `ROLE_DEFAULT` or ensure new users get appropriate role
- [ ] Test permissions system with test users
- [ ] Verify entity locking works (assign user to entity, verify scope)
- [ ] Test cascade rename (edit user username, verify in prospects/opp/contracts)
- [ ] Backup database before deploying
- [ ] Test export features (CSV/XLSX generation)
- [ ] Verify audit logging works
