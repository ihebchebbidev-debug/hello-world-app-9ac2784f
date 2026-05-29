<?php
// =====================================================================
// idle_timeouts.php — Per-role idle auto-logout configuration
//
// GET    /idle_timeouts.php           → { success, timeouts: { role: minutes, ... } }
// POST   /idle_timeouts.php           → upsert one  { role, minutes }   (Administrateur)
// PUT    /idle_timeouts.php           → bulk upsert { timeouts: {...} } (Administrateur)
// DELETE /idle_timeouts.php?role=X    → remove one role override        (Administrateur)
//
// Roles are FREE-FORM strings (max 64 chars, [A-Za-z0-9 _-]) so admins can
// register timeouts for any custom role they create later. `minutes`:
//   0      → idle-logout disabled for that role
//   1..720 → minutes of inactivity before auto-logout
//
// The table is created on first call (idempotent). Seed values are inserted
// only if the table is empty, so existing deployments aren't overwritten.
// =====================================================================
require_once __DIR__ . '/config.php';

$me     = require_auth();
$db     = (new Database())->getConnection();
$method = $_SERVER['REQUEST_METHOD'];

// ---------- Schema bootstrap (idempotent, fail-safe) -----------------
// On OVH the DB user may lack CREATE privilege; the migration is meant to
// be applied out-of-band. Never fatal here — just try, swallow, continue.
$tableReady = false;
try {
    $db->exec("
      CREATE TABLE IF NOT EXISTS crminternet_idle_timeouts (
        role             VARCHAR(64) NOT NULL PRIMARY KEY,
        timeout_minutes  SMALLINT UNSIGNED NOT NULL DEFAULT 30,
        updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                         ON UPDATE CURRENT_TIMESTAMP,
        updated_by       VARCHAR(64) NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");
    $tableReady = true;
} catch (Throwable $e) {
    // Likely missing CREATE privilege. Probe whether the table exists anyway.
    try {
        $db->query('SELECT 1 FROM crminternet_idle_timeouts LIMIT 1');
        $tableReady = true;
    } catch (Throwable $e2) {
        $tableReady = false;
    }
}

// Seed defaults only on a fresh table — never fatal.
if ($tableReady) {
    try {
        $count = (int)$db->query('SELECT COUNT(*) FROM crminternet_idle_timeouts')->fetchColumn();
        if ($count === 0) {
            $seed = $db->prepare(
                'INSERT IGNORE INTO crminternet_idle_timeouts (role, timeout_minutes) VALUES (:r, :m)'
            );
            foreach ([
                'Administrateur'   => 0,
                'Manager'          => 30,
                'Agent'            => 30,
                'Backoffice'       => 30,
                'AgentSuivi'       => 30,
                'AgentActivation'  => 30,
                'AgentVente'       => 30,
            ] as $r => $m) {
                try { $seed->execute([':r' => $r, ':m' => $m]); } catch (Throwable $e) { /* ignore */ }
            }
        }
    } catch (Throwable $e) { /* ignore — read path will still work or return {} */ }
}

// ---------- Helpers ---------------------------------------------------
function clean_role(?string $role): string {
    $role = trim((string)$role);
    if ($role === '' || strlen($role) > 64) return '';
    // Allow letters, digits, space, underscore, hyphen (covers existing + custom roles).
    if (!preg_match('/^[A-Za-z0-9 _-]+$/u', $role)) return '';
    return $role;
}
function clamp_minutes($m): int {
    $n = (int)$m;
    if ($n < 0) $n = 0;
    if ($n > 720) $n = 720;
    return $n;
}
function fetch_all_timeouts(PDO $db): object {
    $out = new stdClass();
    try {
        $rows = $db->query(
            'SELECT role, timeout_minutes FROM crminternet_idle_timeouts ORDER BY role'
        )->fetchAll(PDO::FETCH_ASSOC);
        foreach ($rows as $r) {
            $out->{$r['role']} = (int)$r['timeout_minutes'];
        }
    } catch (Throwable $e) {
        // Table missing or unreadable — return empty object so frontend uses defaults.
    }
    return $out;
}
function require_admin(array $me): void {
    if (($me['role'] ?? '') !== 'Administrateur') {
        fail('Accès refusé — réservé aux administrateurs', 403);
    }
}

// ---------- Routes ----------------------------------------------------
if ($method === 'GET') {
    ok(['timeouts' => fetch_all_timeouts($db)]);
}

if ($method === 'POST') {
    // Upsert one role (used by the "Add new role" UI).
    require_admin($me);
    $in      = json_input();
    $role    = clean_role($in['role'] ?? null);
    $minutes = clamp_minutes($in['minutes'] ?? 0);
    if ($role === '') fail('Nom de rôle invalide', 422);

    $stmt = $db->prepare(
        'INSERT INTO crminternet_idle_timeouts (role, timeout_minutes, updated_by)
         VALUES (:r, :m, :u)
         ON DUPLICATE KEY UPDATE
           timeout_minutes = VALUES(timeout_minutes),
           updated_by      = VALUES(updated_by)'
    );
    $stmt->execute([':r' => $role, ':m' => $minutes, ':u' => $me['username'] ?? null]);

    if (function_exists('audit_log')) {
        audit_log($db, $me, 'idle_timeouts', 'upsert', $role, ['minutes' => $minutes]);
    }
    ok(['message' => 'Délai enregistré', 'timeouts' => fetch_all_timeouts($db)]);
}

if ($method === 'PUT' || $method === 'PATCH') {
    // Bulk upsert. Does NOT delete missing roles — use DELETE ?role=X for that.
    require_admin($me);
    $in  = json_input();
    $map = $in['timeouts'] ?? null;
    if (!is_array($map) && !is_object($map)) {
        fail('Payload invalide — { timeouts: { role: minutes, ... } } attendu', 422);
    }
    $stmt = $db->prepare(
        'INSERT INTO crminternet_idle_timeouts (role, timeout_minutes, updated_by)
         VALUES (:r, :m, :u)
         ON DUPLICATE KEY UPDATE
           timeout_minutes = VALUES(timeout_minutes),
           updated_by      = VALUES(updated_by)'
    );
    $count = 0;
    foreach ((array)$map as $role => $minutes) {
        $r = clean_role((string)$role);
        if ($r === '') continue;
        $stmt->execute([
            ':r' => $r,
            ':m' => clamp_minutes($minutes),
            ':u' => $me['username'] ?? null,
        ]);
        $count++;
    }
    if (function_exists('audit_log')) {
        audit_log($db, $me, 'idle_timeouts', 'bulk_upsert', null, ['count' => $count]);
    }
    ok(['message' => "$count rôle(s) mis à jour", 'timeouts' => fetch_all_timeouts($db)]);
}

if ($method === 'DELETE') {
    require_admin($me);
    $role = clean_role($_GET['role'] ?? '');
    if ($role === '') fail('role requis', 422);

    $stmt = $db->prepare('DELETE FROM crminternet_idle_timeouts WHERE role = :r');
    $stmt->execute([':r' => $role]);

    if (function_exists('audit_log')) {
        audit_log($db, $me, 'idle_timeouts', 'delete', $role, []);
    }
    ok(['deleted' => $stmt->rowCount(), 'timeouts' => fetch_all_timeouts($db)]);
}

fail('Method not allowed', 405);
