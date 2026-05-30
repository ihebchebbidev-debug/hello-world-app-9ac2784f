<?php
// =====================================================================
// Per-user permission overrides — Admin only
//   GET  /user_permissions.php?user=<username>  -> overrides + effective
//   PUT  /user_permissions.php  body: { user, overrides: { perm: 'allow'|'deny'|'inherit' } }
// =====================================================================
require_once __DIR__ . '/config.php';
$me = require_auth();
$db = (new Database())->getConnection();
ensure_user_perm_overrides_table($db);
$method = $_SERVER['REQUEST_METHOD'];

function effective_perms_for(PDO $db, string $username, string $role): array {
    // Build full effective map: role perms + granted roles + grants + allow overrides - deny overrides.
    $effective = [];
    try {
        if ($role === 'Administrateur') {
            // Admin: signal full access (frontend already short-circuits).
            return ['__admin__' => true];
        }
        // Base role
        $st = $db->prepare("SELECT permission FROM crminternet_role_permissions WHERE role = :r AND enabled = 1");
        $st->execute([':r' => $role]);
        foreach ($st->fetchAll() as $r) $effective[$r['permission']] = true;

        $g = active_grants_for($db, $username);
        foreach ($g['roles'] as $extraRole) {
            $st->execute([':r' => $extraRole]);
            foreach ($st->fetchAll() as $r) $effective[$r['permission']] = true;
        }
        foreach ($g['permissions'] as $p) $effective[$p] = true;

        $ov = user_overrides_for($db, $username);
        foreach ($ov['allow'] as $p) $effective[$p] = true;
        foreach ($ov['deny']  as $p) $effective[$p] = false;
    } catch (Throwable $e) {}
    return $effective;
}

if ($method === 'GET') {
    $user = trim((string)($_GET['user'] ?? ''));
    if ($user === '') fail('user requis', 422);
    if ($user !== $me['username'] && ($me['role'] ?? '') !== 'Administrateur') fail('Accès refusé', 403);

    $u = $db->prepare("SELECT username, role FROM crminternet_users WHERE username = :u");
    $u->execute([':u' => $user]);
    $row = $u->fetch();
    if (!$row) fail('Utilisateur introuvable', 404);

    $ov = user_overrides_for($db, $user);
    $overrides = [];
    foreach ($ov['allow'] as $p) $overrides[$p] = 'allow';
    foreach ($ov['deny']  as $p) $overrides[$p] = 'deny';

    ok([
        'user'       => $user,
        'role'       => $row['role'],
        'overrides'  => $overrides,
        'effective'  => effective_perms_for($db, $user, $row['role']),
    ]);
}

if ($method === 'PUT') {
    require_auth(['Administrateur']);
    $in = json_input();
    $user = trim((string)($in['user'] ?? ''));
    $overrides = $in['overrides'] ?? [];
    if ($user === '') fail('user requis', 422);
    if (!is_array($overrides)) fail('overrides invalide', 422);

    $u = $db->prepare("SELECT role FROM crminternet_users WHERE username = :u");
    $u->execute([':u' => $user]);
    $row = $u->fetch();
    if (!$row) fail('Utilisateur introuvable', 404);
    if ($row['role'] === 'Administrateur') fail("Le rôle Administrateur ignore les overrides.", 423);

    $db->beginTransaction();
    try {
        $del = $db->prepare("DELETE FROM crminternet_user_permission_overrides
                              WHERE user_username = :u AND permission = :p");
        $ins = $db->prepare("INSERT INTO crminternet_user_permission_overrides
                              (user_username, permission, effect, updated_by)
                              VALUES (:u, :p, :e, :b)
                              ON DUPLICATE KEY UPDATE effect = VALUES(effect), updated_by = VALUES(updated_by)");
        foreach ($overrides as $perm => $effect) {
            $perm = (string)$perm;
            if ($perm === '' || strlen($perm) > 80) continue;
            if ($effect === 'inherit' || $effect === null || $effect === '') {
                $del->execute([':u' => $user, ':p' => $perm]);
            } elseif ($effect === 'allow' || $effect === 'deny') {
                $ins->execute([':u' => $user, ':p' => $perm, ':e' => $effect, ':b' => $me['username']]);
            } else {
                // Unknown effect — skip silently
            }
        }
        $db->commit();

        notify_user($db, $user, 'Vos permissions ont été mises à jour',
            "Un administrateur a modifié vos permissions individuelles.", null);
        audit_log($db, $me, 'permissions.override.update', 'user', $user, ['count' => count($overrides)], 200);

        ok([
            'message'   => 'Permissions individuelles mises à jour',
            'effective' => effective_perms_for($db, $user, $row['role']),
        ]);
    } catch (Throwable $e) {
        $db->rollBack();
        fail('Erreur: ' . $e->getMessage(), 500);
    }
}

fail('Method not allowed', 405);
