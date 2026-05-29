<?php
require_once __DIR__ . '/config.php';
require_method('POST');
require_auth(['Administrateur']);

$in = json_input();
$userId   = trim((string)($in['userId'] ?? ''));
$username = trim((string)($in['username'] ?? ''));
$newPwd   = (string)($in['newPassword'] ?? '');
$mustChange = !empty($in['mustChange']);

if ($userId === '' && $username === '') fail('userId ou username requis', 422);
if (strlen($newPwd) < 8 || strlen($newPwd) > 200) {
    fail('Le mot de passe doit contenir entre 8 et 200 caractères', 422);
}

try {
    $db = (new Database())->getConnection();
    ensure_must_change_column($db);

    $sql = $userId !== ''
        ? 'SELECT id, username FROM crminternet_users WHERE id = :k LIMIT 1'
        : 'SELECT id, username FROM crminternet_users WHERE username = :k LIMIT 1';
    $stmt = $db->prepare($sql);
    $stmt->execute([':k' => $userId !== '' ? $userId : $username]);
    $u = $stmt->fetch();
    if (!$u) fail('Utilisateur introuvable', 404);

    $hash = password_hash($newPwd, PASSWORD_BCRYPT);
    $up = $db->prepare('UPDATE crminternet_users
                        SET password_hash = :p, must_change_password = :m
                        WHERE id = :id');
    $up->execute([
        ':p'  => $hash,
        ':m'  => $mustChange ? 1 : 0,
        ':id' => $u['id'],
    ]);

    notify_user(
        $db,
        $u['username'],
        'Votre mot de passe a été réinitialisé',
        $mustChange
            ? 'Un administrateur a réinitialisé votre mot de passe. Vous devrez le changer à votre prochaine connexion.'
            : 'Un administrateur a réinitialisé votre mot de passe.',
        '/profile'
    );

    ok(['ok' => true, 'username' => $u['username'], 'mustChange' => (bool)$mustChange]);
} catch (Throwable $e) {
    fail('Erreur serveur: ' . $e->getMessage(), 500);
}
