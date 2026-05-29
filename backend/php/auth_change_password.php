<?php
require_once __DIR__ . '/config.php';
require_method('POST');
$payload = require_auth();

$in = json_input();
$current = (string)($in['currentPassword'] ?? '');
$next    = (string)($in['newPassword'] ?? '');

if ($current === '' || $next === '') {
    fail('Mot de passe actuel et nouveau requis', 422);
}
if (strlen($next) < 8 || strlen($next) > 200) {
    fail('Le nouveau mot de passe doit contenir entre 8 et 200 caractères', 422);
}
if ($current === $next) {
    fail('Le nouveau mot de passe doit être différent', 422);
}

try {
    $db = (new Database())->getConnection();
    $stmt = $db->prepare('SELECT id, password_hash FROM crminternet_users WHERE id = :id LIMIT 1');
    $stmt->execute([':id' => $payload['sub']]);
    $u = $stmt->fetch();
    if (!$u) fail('Utilisateur introuvable', 404);

    if (!password_verify($current, $u['password_hash'])) {
        fail('Mot de passe actuel incorrect', 401);
    }

    ensure_must_change_column($db);
    $hash = password_hash($next, PASSWORD_BCRYPT);
    $up = $db->prepare('UPDATE crminternet_users SET password_hash = :p, must_change_password = 0 WHERE id = :id');
    $up->execute([':p' => $hash, ':id' => $u['id']]);

    ok(['ok' => true]);
} catch (Throwable $e) {
    fail('Erreur serveur: ' . $e->getMessage(), 500);
}
