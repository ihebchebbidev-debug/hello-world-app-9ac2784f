<?php
require_once __DIR__ . '/config.php';
$me = require_auth();
$db = (new Database())->getConnection();
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

// Auto-seed des rôles MVP manquants (idempotent).
function ensure_mvp_roles(PDO $db): void {
    try {
        $seed = [
            ['AgentSuivi',      'Agent Suivi',      'Prospection + Opportunité + Contrat', 'success', 0, 5],
            ['AgentActivation', 'Agent Activation', 'Prospection + Opportunité',            'info',    0, 6],
            ['AgentVente',      'Agent Vente',      'Prospection',                          'warning', 0, 7],
            ['AgentGuichet',    'Agent Guichet',    'Saisie guichet — limité à sa franchise','info',   0, 8],
        ];
        $ins = $db->prepare('INSERT IGNORE INTO crminternet_roles
            (name,label,description,color,is_system,sort_order)
            VALUES (:n,:l,:d,:c,:s,:o)');
        foreach ($seed as $r) {
            $ins->execute([
                ':n'=>$r[0], ':l'=>$r[1], ':d'=>$r[2],
                ':c'=>$r[3], ':s'=>$r[4], ':o'=>$r[5],
            ]);
        }

        $defaultPerms = [
            'RessourceHumaine' => [
                // Core pages always needed
                'page.dashboard', 'page.profile', 'page.notifications',
                // HR pages
                'page.hr.attendance', 'page.hr.payroll',
                'page.hr.commissions', 'page.hr.external-agents',
                // HR actions
                'hr.attendance.clock', 'hr.attendance.export',
                'hr.payroll.edit', 'hr.payroll.export',
                'hr.commissions.edit', 'hr.commissions.export',
                'hr.external_agents.add', 'hr.external_agents.edit', 'hr.external_agents.delete',
                // Prospects read access (HR needs to consult leads)
                'page.prospects', 'prospect.view',
            ],
            'AgentGuichet' => [
                'page.guichet', 'page.profile',
                'guichet.read_own', 'guichet.create', 'guichet.edit',
                'guichet.export', 'guichet.view_objectives',
            ],
            'AgentSuivi' => [
                'page.dashboard','page.prospects','page.opportunities','page.contracts',
                'page.calendar','page.tasks','page.notifications','page.profile',
                'prospect.view','prospect.add','prospect.edit','prospect.status',
                'opportunity.view','opportunity.edit','contract.view','contract.edit',
                'task.add','task.edit','task.complete','calendar.event.add',
            ],
            'AgentActivation' => [
                'page.dashboard','page.prospects','page.opportunities','page.calendar',
                'page.tasks','page.notifications','page.profile',
                'prospect.view','prospect.add','prospect.edit','prospect.status',
                'opportunity.view','opportunity.edit',
                'task.add','task.edit','task.complete','calendar.event.add',
            ],
            'AgentVente' => [
                'page.dashboard','page.prospects','page.calendar','page.tasks',
                'page.notifications','page.profile',
                'prospect.view','prospect.add','prospect.edit','prospect.status',
                'task.add','task.edit','task.complete','calendar.event.add',
            ],
        ];
        // Always INSERT IGNORE (not only when count=0) so missing default permissions
        // are filled in without overwriting permissions the admin has explicitly set.
        $insP = $db->prepare('INSERT IGNORE INTO crminternet_role_permissions
            (role,permission,enabled) VALUES (:r,:p,1)');
        foreach ($defaultPerms as $role => $perms) {
            foreach ($perms as $perm) {
                $insP->execute([':r' => $role, ':p' => $perm]);
            }
        }
    } catch (Throwable $e) { /* non bloquant */ }
}

function load_roles(PDO $db): array {
    ensure_mvp_roles($db);
    return $db->query('SELECT name, label, description, color, is_system, sort_order
                       FROM crminternet_roles
                       ORDER BY sort_order, name')->fetchAll(PDO::FETCH_ASSOC);
}

function role_exists(PDO $db, string $name): bool {
    $s = $db->prepare('SELECT 1 FROM crminternet_roles WHERE name=:n');
    $s->execute([':n' => $name]);
    return (bool)$s->fetchColumn();
}

// ---------------- GET: list roles + permissions ----------------------
if ($method === 'GET') {
    $roles = load_roles($db);
    $rows = $db->query('SELECT role, permission, enabled FROM crminternet_role_permissions')->fetchAll();
    $out = [];
    foreach ($roles as $r) $out[$r['name']] = [];
    foreach ($rows as $r) {
        if (!isset($out[$r['role']])) $out[$r['role']] = [];
        $out[$r['role']][$r['permission']] = (bool)$r['enabled'];
    }

    $usersByRole = [];
    $u = $db->query("SELECT id, username, full_name, email, role, team, active
                     FROM crminternet_users ORDER BY full_name")->fetchAll(PDO::FETCH_ASSOC);
    foreach ($u as $row) {
        $usersByRole[$row['role']] = $usersByRole[$row['role']] ?? [];
        $usersByRole[$row['role']][] = [
            'id'       => $row['id'],
            'username' => $row['username'],
            'fullName' => $row['full_name'],
            'email'    => $row['email'],
            'team'     => $row['team'],
            'active'   => (bool)$row['active'],
        ];
    }

    // Effective permissions: use user_has_permission() as the single source of
    // truth — same logic the backend enforces on every API call. This avoids
    // the team-union bug where a RessourceHumaine user in team_direction
    // would inherit all Manager permissions despite having them explicitly
    // disabled on their own role.
    $myGrants = active_grants_for($db, $me['username'] ?? '');
    $effective = [];
    if (($me['role'] ?? '') === 'Administrateur') {
        // Admin gets every known key.
        foreach ($out as $rolePerms) {
            foreach (array_keys($rolePerms) as $k) $effective[$k] = true;
        }
    } else {
        // Collect every permission key known in the DB, then ask user_has_permission
        // for each one. Static caches inside that function keep this fast.
        $allKeys = [];
        foreach ($out as $rolePerms) {
            foreach (array_keys($rolePerms) as $k) $allKeys[$k] = true;
        }
        // Also include keys from grants/overrides that might not be in any role yet.
        foreach ($myGrants['permissions'] as $p) $allKeys[$p] = true;
        $myOv = user_overrides_for($db, $me['username'] ?? '');
        foreach (array_merge($myOv['allow'], $myOv['deny']) as $p) $allKeys[$p] = true;

        foreach (array_keys($allKeys) as $perm) {
            if (user_has_permission($db, $me, $perm)) $effective[$perm] = true;
        }
    }

    ok([
        'roles' => array_map(function($r) {
            return [
                'name'        => $r['name'],
                'label'       => $r['label'],
                'description' => $r['description'],
                'color'       => $r['color'],
                'isSystem'    => (bool)$r['is_system'],
                'sortOrder'   => (int)$r['sort_order'],
            ];
        }, $roles),
        'permissions'          => $out,
        'usersByRole'          => $usersByRole,
        'effectivePermissions' => $effective,
        'myGrants'             => $myGrants,
    ]);
}

// ---------------- POST: create role ----------------------------------
if ($method === 'POST' && $action === 'create') {
    require_permission($db, $me, 'role.create');
    $in = json_input();
    $name        = trim((string)($in['name']        ?? ''));
    $label       = trim((string)($in['label']       ?? $name));
    $description = trim((string)($in['description'] ?? ''));
    $color       = trim((string)($in['color']       ?? 'primary'));
    if (!preg_match('/^[A-Za-z0-9_\- ]{2,64}$/', $name)) fail('Nom de rôle invalide (2-64 caractères)', 422);
    if ($label === '') $label = $name;
    if (role_exists($db, $name)) fail('Ce rôle existe déjà', 409);
    $maxOrder = (int)$db->query('SELECT COALESCE(MAX(sort_order),0) FROM crminternet_roles')->fetchColumn();
    $ins = $db->prepare('INSERT INTO crminternet_roles (name,label,description,color,is_system,sort_order)
                         VALUES (:n,:l,:d,:c,0,:o)');
    $ins->execute([':n'=>$name, ':l'=>$label, ':d'=>$description, ':c'=>$color, ':o'=>$maxOrder + 1]);
    ok(['message' => 'Rôle créé', 'role' => [
        'name'=>$name, 'label'=>$label, 'description'=>$description,
        'color'=>$color, 'isSystem'=>false,
    ]]);
}

// ---------------- PUT: update role meta ------------------------------
if ($method === 'PUT' && $action === 'update') {
    require_permission($db, $me, 'role.edit');
    $in   = json_input();
    $name = (string)($in['name'] ?? '');
    if ($name === 'Administrateur') fail("Le rôle Administrateur est protégé.", 423);
    if (!role_exists($db, $name)) fail('Rôle introuvable', 404);
    $label       = trim((string)($in['label']       ?? ''));
    $description = trim((string)($in['description'] ?? ''));
    $color       = trim((string)($in['color']       ?? 'primary'));
    if ($label === '') fail('Libellé requis', 422);
    $u = $db->prepare('UPDATE crminternet_roles SET label=:l, description=:d, color=:c WHERE name=:n');
    $u->execute([':l'=>$label, ':d'=>$description, ':c'=>$color, ':n'=>$name]);
    ok(['message' => 'Rôle mis à jour']);
}

// ---------------- DELETE: remove role --------------------------------
if ($method === 'DELETE' && $action === 'delete') {
    require_permission($db, $me, 'role.delete');
    $name     = (string)($_GET['name']     ?? '');
    $fallback = (string)($_GET['fallback'] ?? 'Agent');
    if ($name === 'Administrateur') fail("Le rôle Administrateur est protégé.", 423);
    $row = $db->prepare('SELECT name FROM crminternet_roles WHERE name=:n');
    $row->execute([':n'=>$name]);
    if (!$row->fetchColumn()) fail('Rôle introuvable', 404);
    if (!role_exists($db, $fallback)) fail('Rôle de remplacement invalide', 422);
    if ($fallback === $name) fail('Choisissez un rôle de remplacement différent', 422);

    $db->beginTransaction();
    try {
        $up = $db->prepare('UPDATE crminternet_users SET role=:f WHERE role=:n');
        $up->execute([':f'=>$fallback, ':n'=>$name]);
        $db->prepare('DELETE FROM crminternet_role_permissions WHERE role=:n')->execute([':n'=>$name]);
        $db->prepare('DELETE FROM crminternet_roles WHERE name=:n')->execute([':n'=>$name]);
        $db->commit();
        ok(['message' => 'Rôle supprimé', 'reassigned' => $up->rowCount()]);
    } catch (Throwable $e) {
        $db->rollBack();
        fail('Erreur: ' . $e->getMessage(), 500);
    }
}

// ---------------- POST: assign user to role --------------------------
if ($method === 'POST' && $action === 'assign') {
    require_permission($db, $me, 'role.assign');
    $in     = json_input();
    $userId = (string)($in['userId'] ?? '');
    $role   = (string)($in['role']   ?? '');
    if (!$userId || !role_exists($db, $role)) fail('Paramètres invalides', 422);
    $u = $db->prepare('UPDATE crminternet_users SET role=:r WHERE id=:id');
    $u->execute([':r'=>$role, ':id'=>$userId]);
    ok(['message' => 'Utilisateur réassigné']);
}

// ---------------- PUT (no action): save permissions ------------------
if ($method === 'PUT') {
    require_permission($db, $me, 'role.permissions.edit');
    $in   = json_input();
    $role = $in['role'] ?? '';
    $perms = $in['permissions'] ?? [];
    if (!role_exists($db, $role)) fail('Rôle invalide', 422);
    if (!is_array($perms)) fail('permissions invalide', 422);

    $db->beginTransaction();
    try {
        $db->prepare('DELETE FROM crminternet_role_permissions WHERE role = :r')->execute([':r' => $role]);
        $ins = $db->prepare('INSERT INTO crminternet_role_permissions (role,permission,enabled) VALUES (:r,:p,:e)');
        foreach ($perms as $key => $val) {
            $ins->execute([':r' => $role, ':p' => (string)$key, ':e' => $val ? 1 : 0]);
        }
        $db->commit();
        ok(['message' => 'Permissions mises à jour']);
    } catch (Throwable $e) {
        $db->rollBack();
        fail('Erreur: ' . $e->getMessage(), 500);
    }
}

fail('Method not allowed', 405);
