<?php
require_once __DIR__ . '/config.php';
require_method('POST');

$in = json_input();
$challenge = trim($in['challenge'] ?? '');
$code = preg_replace('/\D+/', '', (string)($in['code'] ?? ''));

if ($challenge === '' || strlen($challenge) > 40) fail('Requête invalide', 422);
if (strlen($code) !== 4) fail('Code invalide', 422);

$db = (new Database())->getConnection();

$s = $db->prepare("SELECT o.*, u.id AS uid, u.username, u.full_name, u.email, u.role, u.team, u.active,
                          COALESCE(u.must_change_password, 0) AS must_change_password
                   FROM crminternet_login_otp o
                   JOIN crminternet_users u ON u.id = o.user_id
                   WHERE o.challenge = :c LIMIT 1");
$s->execute([':c' => $challenge]);
$row = $s->fetch();

if (!$row) fail('Code expiré ou invalide', 401);
if ((int)$row['used'] === 1) fail('Code déjà utilisé', 401);
if (strtotime($row['expires_at']) < time()) {
    $db->prepare("DELETE FROM crminternet_login_otp WHERE challenge = :c")->execute([':c' => $challenge]);
    fail('Code expiré, veuillez vous reconnecter', 401);
}
if ((int)$row['attempts'] >= 5) {
    $db->prepare("DELETE FROM crminternet_login_otp WHERE challenge = :c")->execute([':c' => $challenge]);
    fail('Trop de tentatives, veuillez vous reconnecter', 429);
}

if (!password_verify($code, $row['code_hash'])) {
    $db->prepare("UPDATE crminternet_login_otp SET attempts = attempts + 1 WHERE challenge = :c")
       ->execute([':c' => $challenge]);
    fail('Code incorrect', 401);
}
if (!$row['active']) fail('Compte désactivé', 403);

$db->prepare("UPDATE crminternet_login_otp SET used = 1 WHERE challenge = :c")->execute([':c' => $challenge]);
// Cleanup vieux challenges (best-effort)
try { $db->exec("DELETE FROM crminternet_login_otp WHERE expires_at < (NOW() - INTERVAL 1 DAY)"); } catch (Throwable $e) {}

$token = jwt_sign([
    'sub'      => $row['uid'],
    'username' => $row['username'],
    'role'     => $row['role'],
]);

audit_log($db, ['username' => $row['username'], 'role' => $row['role']], 'login', 'user', $row['username'], ['method' => 'otp']);


ok([
    'token' => $token,
    'user'  => [
        'id'                 => $row['uid'],
        'username'           => $row['username'],
        'fullName'           => $row['full_name'],
        'email'              => $row['email'],
        'role'               => $row['role'],
        'team'               => $row['team'],
        'active'             => (bool)$row['active'],
        'mustChangePassword' => (bool)$row['must_change_password'],
    ],
]);
