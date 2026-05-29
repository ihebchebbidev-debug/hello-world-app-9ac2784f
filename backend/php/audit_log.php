<?php
// Admin endpoint: read audit log entries.
// GET /audit_log.php?from=YYYY-MM-DD&to=YYYY-MM-DD&user=&role=&action=&entity=&q=&sort=desc&limit=200&offset=0
require_once __DIR__ . '/config.php';
$me = require_auth();
require_method('GET');
$db = (new Database())->getConnection();
ensure_audit_log_table($db);
ensure_grants_table($db);

// Authorization: Admin always allowed. Otherwise need 'audit.view' permission
// (granted via role permission OR temporary user grant).
function user_has_audit_view(PDO $db, array $me): bool {
    if (($me['role'] ?? '') === 'Administrateur') return true;
    try {
        $s = $db->prepare("SELECT enabled FROM crminternet_role_permissions
                           WHERE role = :r AND permission = 'audit.view'");
        $s->execute([':r' => $me['role'] ?? '']);
        if ((int)$s->fetchColumn() === 1) return true;
    } catch (Throwable $e) {}
    $g = active_grants_for($db, $me['username'] ?? '');
    if (in_array('audit.view', $g['permissions'], true)) return true;
    foreach ($g['roles'] as $extraRole) {
        try {
            $s = $db->prepare("SELECT enabled FROM crminternet_role_permissions
                               WHERE role = :r AND permission = 'audit.view'");
            $s->execute([':r' => $extraRole]);
            if ((int)$s->fetchColumn() === 1) return true;
        } catch (Throwable $e) {}
    }
    return false;
}
if (!user_has_audit_view($db, $me)) fail('Forbidden', 403);

$where = []; $params = [];
if (!empty($_GET['from']))   { $where[] = 'a.created_at >= :from'; $params[':from'] = $_GET['from'] . ' 00:00:00'; }
if (!empty($_GET['to']))     { $where[] = 'a.created_at <= :to';   $params[':to']   = $_GET['to']   . ' 23:59:59'; }
if (!empty($_GET['user']))   { $where[] = 'a.user_username = :u';  $params[':u']    = $_GET['user']; }
if (!empty($_GET['role']))   { $where[] = 'a.user_role = :r';      $params[':r']    = $_GET['role']; }
if (!empty($_GET['action'])) { $where[] = 'a.action = :a';         $params[':a']    = $_GET['action']; }
if (!empty($_GET['entity'])) { $where[] = 'a.entity_type = :e';    $params[':e']    = $_GET['entity']; }
if (!empty($_GET['q']))      {
    // Native PDO prepares forbid reusing the same named placeholder.
    $where[] = '(a.action LIKE :q1 OR a.path LIKE :q2 OR a.entity_id LIKE :q3 OR a.details LIKE :q4 OR a.user_username LIKE :q5 OR a.ip LIKE :q6)';
    $like = '%' . $_GET['q'] . '%';
    $params[':q1'] = $like; $params[':q2'] = $like; $params[':q3'] = $like;
    $params[':q4'] = $like; $params[':q5'] = $like; $params[':q6'] = $like;
}
$sqlWhere = $where ? ('WHERE ' . implode(' AND ', $where)) : '';

$sort   = (strtolower($_GET['sort'] ?? 'desc') === 'asc') ? 'ASC' : 'DESC';
$limit  = max(1, min(1000, (int)($_GET['limit']  ?? 200)));
$offset = max(0, (int)($_GET['offset'] ?? 0));

try {
    $countStmt = $db->prepare("SELECT COUNT(*) FROM crminternet_audit_log a $sqlWhere");
    $countStmt->execute($params);
    $total = (int)$countStmt->fetchColumn();

    // For login rows, compute session duration by finding next logout for same user.
    $sql = "SELECT a.id, a.created_at, a.user_username, a.user_role, a.action, a.entity_type, a.entity_id,
                   a.method, a.path, a.ip, a.user_agent, a.status_code, a.details,
                   CASE WHEN a.action = 'login' THEN (
                       SELECT TIMESTAMPDIFF(SECOND, a.created_at, l.created_at)
                         FROM crminternet_audit_log l
                        WHERE l.user_username = a.user_username
                          AND l.action IN ('logout')
                          AND l.created_at > a.created_at
                        ORDER BY l.created_at ASC LIMIT 1
                   ) ELSE NULL END AS session_seconds
            FROM crminternet_audit_log a
            $sqlWhere
            ORDER BY a.id $sort
            LIMIT $limit OFFSET $offset";
    $s = $db->prepare($sql);
    $s->execute($params);
    $rows = array_map(fn($r) => [
        'id'             => (int)$r['id'],
        'createdAt'      => str_replace(' ', 'T', $r['created_at']) . 'Z',
        'user'           => $r['user_username'],
        'userRole'       => $r['user_role'],
        'action'         => $r['action'],
        'entityType'     => $r['entity_type'],
        'entityId'       => $r['entity_id'],
        'method'         => $r['method'],
        'path'           => $r['path'],
        'ip'             => $r['ip'],
        'userAgent'      => $r['user_agent'],
        'statusCode'     => $r['status_code'] !== null ? (int)$r['status_code'] : null,
        'details'        => $r['details'],
        'sessionSeconds' => $r['session_seconds'] !== null ? (int)$r['session_seconds'] : null,
    ], $s->fetchAll());

    // Distinct values for filters — include ALL known users (not only those with logs)
    $actions  = $db->query("SELECT DISTINCT action FROM crminternet_audit_log ORDER BY action LIMIT 200")->fetchAll(PDO::FETCH_COLUMN);
    $entities = $db->query("SELECT DISTINCT entity_type FROM crminternet_audit_log WHERE entity_type IS NOT NULL ORDER BY entity_type LIMIT 100")->fetchAll(PDO::FETCH_COLUMN);
    $usersInLogs = $db->query("SELECT DISTINCT user_username FROM crminternet_audit_log WHERE user_username IS NOT NULL")->fetchAll(PDO::FETCH_COLUMN);
    $usersAll    = [];
    try { $usersAll = $db->query("SELECT username FROM crminternet_users ORDER BY username")->fetchAll(PDO::FETCH_COLUMN); } catch (Throwable $e) {}
    $users = array_values(array_unique(array_filter(array_merge($usersAll ?: [], $usersInLogs ?: []))));
    sort($users);
    $rolesAll = [];
    try { $rolesAll = $db->query("SELECT DISTINCT role FROM crminternet_users WHERE role IS NOT NULL ORDER BY role")->fetchAll(PDO::FETCH_COLUMN); } catch (Throwable $e) {}
    $rolesInLogs = $db->query("SELECT DISTINCT user_role FROM crminternet_audit_log WHERE user_role IS NOT NULL")->fetchAll(PDO::FETCH_COLUMN);
    $roles = array_values(array_unique(array_filter(array_merge($rolesAll ?: [], $rolesInLogs ?: []))));
    sort($roles);

    ok([
        'total'   => $total,
        'limit'   => $limit,
        'offset'  => $offset,
        'sort'    => strtolower($sort),
        'logs'    => $rows,
        'filters' => [
            'actions'  => $actions,
            'users'    => $users,
            'roles'    => $roles,
            'entities' => $entities,
        ],
    ]);
} catch (Throwable $e) {
    fail('Erreur lecture audit: ' . $e->getMessage(), 500);
}
