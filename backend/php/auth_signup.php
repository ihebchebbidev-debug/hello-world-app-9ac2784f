<?php
require_once __DIR__ . '/config.php';
require_method('POST');

// Hidden signup. Frontend route: /signup-internal-x7k2
// Anyone with the URL can register, but only as 'Agent' by default.
// Admins should promote roles via /crminternet_users.php afterwards.

$in = json_input();
$username = trim($in['username'] ?? '');
$fullName = trim($in['fullName'] ?? '');
$email    = trim($in['email'] ?? '');
$password = (string)($in['password'] ?? '');
$team     = trim($in['team'] ?? 'Lead-Actifs');

if ($username === '' || $fullName === '' || $email === '' || $password === '') {
    fail('Tous les champs sont requis', 422);
}
if (strlen($username) < 3 || strlen($username) > 80) {
    fail('Identifiant invalide (3 à 80 caractères)', 422);
}
if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 160) {
    fail('Email invalide', 422);
}
if (strlen($password) < 8 || strlen($password) > 200) {
    fail('Mot de passe trop court (min. 8 caractères)', 422);
}
if (strlen($fullName) > 120) {
    fail('Nom complet trop long', 422);
}

$db = (new Database())->getConnection();

// Uniqueness check
$stmt = $db->prepare('SELECT id FROM crminternet_users WHERE username = :u OR email = :e LIMIT 1');
$stmt->execute([':u' => $username, ':e' => $email]);
if ($stmt->fetch()) {
    fail('Identifiant ou email déjà utilisé', 409);
}

$id   = 'U-' . substr(bin2hex(random_bytes(6)), 0, 10);
$hash = password_hash($password, PASSWORD_BCRYPT);
$role = 'Agent'; // forced — never trust the client for role

$ins = $db->prepare(
    'INSERT INTO crminternet_users (id, username, full_name, email, password_hash, role, team, active)
     VALUES (:id, :u, :fn, :e, :h, :r, :t, 1)'
);
$ins->execute([
    ':id' => $id, ':u' => $username, ':fn' => $fullName,
    ':e'  => $email, ':h' => $hash, ':r' => $role, ':t' => $team,
]);

$token = jwt_sign(['sub' => $id, 'username' => $username, 'role' => $role]);

ok([
    'token' => $token,
    'user'  => [
        'id'       => $id,
        'username' => $username,
        'fullName' => $fullName,
        'email'    => $email,
        'role'     => $role,
        'team'     => $team,
        'active'   => true,
    ],
]);
