<?php
// =====================================================================
// Temporary access grants — Admin only
// GET    /user_grants.php?user=<username>   list grants for a user
// GET    /user_grants.php                   list ALL active grants
// POST   /user_grants.php                   create a grant
//        body: { user, type:'role'|'permission', value, expiresAt, reason? }
// DELETE /user_grants.php?id=<id>           revoke a grant
// =====================================================================
require_once __DIR__ . '/config.php';
$me = require_auth();
$db = (new Database())->getConnection();
ensure_grants_table($db);
$method = $_SERVER['REQUEST_METHOD'];

function grant_row(array $r): array {
    return [
        'id'           => $r['id'],
        'user'         => $r['user_username'],
        'type'         => $r['grant_type'],
        'value'        => $r['grant_value'],
        'reason'       => $r['reason'],
        'grantedBy'    => $r['granted_by'],
        'startsAt'     => str_replace(' ', 'T', $r['starts_at']) . 'Z',
        'expiresAt'    => str_replace(' ', 'T', $r['expires_at']) . 'Z',
        'revoked'      => (bool)$r['revoked'],
        'revokedAt'    => $r['revoked_at'] ? str_replace(' ', 'T', $r['revoked_at']) . 'Z' : null,
        'revokedBy'    => $r['revoked_by'],
        'createdAt'    => str_replace(' ', 'T', $r['created_at']) . 'Z',
        'active'       => !$r['revoked'] && strtotime($r['expires_at']) > time(),
    ];
}

if ($method === 'GET') {
    $user = trim((string)($_GET['user'] ?? ''));
    if ($user !== '') {
        // Self or admin
        if ($user !== $me['username'] && ($me['role'] ?? '') !== 'Administrateur') {
            fail('Accès refusé', 403);
        }
        $s = $db->prepare("SELECT * FROM crminternet_user_grants
                           WHERE user_username = :u
                           ORDER BY revoked ASC, expires_at DESC");
        $s->execute([':u' => $user]);
    } else {
        require_auth(['Administrateur']);
        $s = $db->query("SELECT * FROM crminternet_user_grants
                         ORDER BY revoked ASC, expires_at DESC LIMIT 500");
    }
    ok(['grants' => array_map('grant_row', $s->fetchAll())]);
}

if ($method === 'POST') {
    require_auth(['Administrateur']);
    $in = json_input();
    $user      = trim((string)($in['user']  ?? ''));
    $type      = (string)($in['type']       ?? '');
    $value     = trim((string)($in['value'] ?? ''));
    $expiresAt = trim((string)($in['expiresAt'] ?? ''));
    $reason    = trim((string)($in['reason'] ?? ''));

    if ($user === '' || $value === '') fail('user et value requis', 422);
    if (!in_array($type, ['role','permission'], true)) fail('type invalide', 422);
    if (strlen($user) > 80 || strlen($value) > 120) fail('Valeur trop longue', 422);

    // Validate user exists
    $u = $db->prepare("SELECT 1 FROM crminternet_users WHERE username = :u");
    $u->execute([':u' => $user]);
    if (!$u->fetchColumn()) fail('Utilisateur introuvable', 404);

    // Validate role exists when granting a role
    if ($type === 'role') {
        $r = $db->prepare("SELECT 1 FROM crminternet_roles WHERE name = :n");
        $r->execute([':n' => $value]);
        if (!$r->fetchColumn()) fail('Rôle introuvable', 404);
    }

    // Validate expiresAt: ISO datetime, must be in the future, max 1 year
    $ts = strtotime($expiresAt);
    if (!$ts) fail('Date d\'expiration invalide (format ISO requis)', 422);
    if ($ts <= time()) fail("La date d'expiration doit être dans le futur", 422);
    if ($ts > time() + 366 * 86400) fail("Durée maximale: 1 an", 422);
    $expiresFmt = date('Y-m-d H:i:s', $ts);

    $id = 'G-' . substr(bin2hex(random_bytes(8)), 0, 12);
    $ins = $db->prepare("INSERT INTO crminternet_user_grants
        (id, user_username, grant_type, grant_value, reason, granted_by, expires_at)
        VALUES (:id, :u, :t, :v, :r, :gb, :e)");
    $ins->execute([
        ':id' => $id, ':u' => $user, ':t' => $type, ':v' => $value,
        ':r' => $reason !== '' ? $reason : null,
        ':gb' => $me['username'], ':e' => $expiresFmt,
    ]);

    notify_user($db, $user, 'Accès temporaire accordé',
        "Vous avez reçu " . ($type === 'role' ? "le rôle « $value »" : "la permission « $value »") .
        " jusqu'au " . date('d/m/Y H:i', $ts), null);

    $row = $db->prepare("SELECT * FROM crminternet_user_grants WHERE id = :id");
    $row->execute([':id' => $id]);
    ok(['message' => 'Accès temporaire accordé', 'grant' => grant_row($row->fetch())]);
}

if ($method === 'DELETE') {
    require_auth(['Administrateur']);
    $id = trim((string)($_GET['id'] ?? ''));
    if ($id === '') fail('id requis', 422);
    $u = $db->prepare("UPDATE crminternet_user_grants
                       SET revoked = 1, revoked_at = NOW(), revoked_by = :gb
                       WHERE id = :id AND revoked = 0");
    $u->execute([':id' => $id, ':gb' => $me['username']]);
    if ($u->rowCount() === 0) fail('Grant introuvable ou déjà révoqué', 404);
    ok(['message' => 'Accès révoqué']);
}

fail('Method not allowed', 405);
