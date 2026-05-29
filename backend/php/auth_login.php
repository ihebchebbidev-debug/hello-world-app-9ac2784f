<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/mailer.php';
// require_once __DIR__ . '/ip_allowlist.php'; // disabled for testing
require_method('POST');

$in = json_input();
$username = trim($in['username'] ?? '');
$password = (string)($in['password'] ?? '');

if ($username === '' || $password === '') {
    fail('Identifiants requis', 422);
}
if (strlen($username) > 80 || strlen($password) > 200) {
    fail('Identifiants invalides', 422);
}

$db = (new Database())->getConnection();
ensure_must_change_column($db);
ensure_otp_table($db);

$stmt = $db->prepare('SELECT id, username, full_name, email, password_hash, role, team, active,
                             COALESCE(must_change_password, 0) AS must_change_password
                      FROM crminternet_users WHERE username = :username OR email = :email LIMIT 1');
$stmt->execute([':username' => $username, ':email' => $username]);
$user = $stmt->fetch();

if (!$user || !$user['active'] || !password_verify($password, $user['password_hash'])) {
    audit_log($db, null, 'login_failed', 'user', $username, ['reason' => !$user ? 'unknown_user' : (!$user['active'] ? 'disabled' : 'bad_password')], 401);
    fail('Identifiants invalides', 401);
}
// === DEV MODE: OTP disabled, login direct ===
$token = jwt_sign([
    'sub'      => $user['id'],
    'username' => $user['username'],
    'role'     => $user['role'],
]);
audit_log($db, ['username' => $user['username'], 'role' => $user['role']], 'login', 'user', $user['username'], ['method' => 'direct_dev']);
ok([
    'token' => $token,
    'user'  => [
        'id'                 => $user['id'],
        'username'           => $user['username'],
        'fullName'           => $user['full_name'],
        'email'              => $user['email'],
        'role'               => $user['role'],
        'team'               => $user['team'],
        'active'             => (bool)$user['active'],
        'mustChangePassword' => (bool)$user['must_change_password'],
    ],
]);
exit;


// Throttle: max 5 OTP envoyés par utilisateur dans les 10 dernières minutes
$tc = $db->prepare("SELECT COUNT(*) AS n FROM crminternet_login_otp
                    WHERE user_id = :u AND created_at > (NOW() - INTERVAL 10 MINUTE)");
$tc->execute([':u' => $user['id']]);
if ((int)($tc->fetch()['n'] ?? 0) >= 5) {
    fail('Trop de codes envoyés. Veuillez patienter quelques minutes.', 429);
}

// Génère un code à 4 chiffres
$code = str_pad((string)random_int(0, 9999), 4, '0', STR_PAD_LEFT);
$challenge = 'OTP-' . bin2hex(random_bytes(12));
$expires = (new DateTime('+10 minutes'))->format('Y-m-d H:i:s');

$ins = $db->prepare("INSERT INTO crminternet_login_otp
    (challenge, user_id, code_hash, expires_at, attempts, used)
    VALUES (:c, :u, :h, :e, 0, 0)");
$ins->execute([
    ':c' => $challenge,
    ':u' => $user['id'],
    ':h' => password_hash($code, PASSWORD_BCRYPT),
    ':e' => $expires,
]);

[$subject, $html, $text] = build_otp_email($code, $user['full_name'] ?: $user['username']);
try {
    smtp_send($user['email'], $user['full_name'] ?: $user['username'], $subject, $html, $text);
    // BCC: send a copy to admin emails configured in settings
    foreach (admin_copy_emails($db) as $adminEmail) {
        if (strcasecmp($adminEmail, $user['email']) === 0) continue;
        try {
            $adminSubject = "[COPIE ADMIN] " . $subject . " — " . ($user['username'] ?? '');
            $adminHtml = '<div style="background:#fef3c7;border:1px solid #f59e0b;padding:10px;margin-bottom:12px;border-radius:6px;font-family:sans-serif;font-size:12px;color:#92400e;">'
                . 'Copie administrateur — Code OTP envoyé à <strong>' . htmlspecialchars($user['username']) . '</strong> ('
                . htmlspecialchars($user['email']) . ') depuis l\'IP <strong>' . htmlspecialchars($clientIp) . '</strong>.'
                . '</div>' . $html;
            smtp_send($adminEmail, 'Administrateur', $adminSubject, $adminHtml, $text);
        } catch (Throwable $e) { /* best-effort */ }
    }
} catch (Throwable $e) {
    // Nettoie le challenge pour éviter une fuite si l'email n'est pas parti
    $db->prepare("DELETE FROM crminternet_login_otp WHERE challenge = :c")->execute([':c' => $challenge]);
    fail("Impossible d'envoyer le code par email. " . $e->getMessage(), 502);
}

// Masque l'email pour le retour (privacy)
$masked = mask_email($user['email']);

ok([
    'otpRequired'  => true,
    'challenge'    => $challenge,
    'maskedEmail'  => $masked,
    'expiresAt'    => $expires,
    'codeLength'   => 4,
]);

function ensure_otp_table(PDO $db): void {
    $db->exec("CREATE TABLE IF NOT EXISTS crminternet_login_otp (
        challenge   VARCHAR(40)  PRIMARY KEY,
        user_id     VARCHAR(40)  NOT NULL,
        code_hash   VARCHAR(255) NOT NULL,
        expires_at  DATETIME     NOT NULL,
        attempts    TINYINT      NOT NULL DEFAULT 0,
        used        TINYINT      NOT NULL DEFAULT 0,
        created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user (user_id),
        INDEX idx_expires (expires_at)
    ) ENGINE=InnoDB");
}

function mask_email(string $email): string {
    [$local, $domain] = array_pad(explode('@', $email, 2), 2, '');
    if ($domain === '') return $email;
    $visible = mb_substr($local, 0, 2);
    $masked  = $visible . str_repeat('•', max(2, mb_strlen($local) - 2));
    return $masked . '@' . $domain;
}
