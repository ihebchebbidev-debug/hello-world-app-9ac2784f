<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/mailer.php';
require_once __DIR__ . '/ip_allowlist.php';
require_method('POST');

$in = json_input();
$challenge = trim($in['challenge'] ?? '');
if ($challenge === '' || strlen($challenge) > 40) fail('Requête invalide', 422);

$db = (new Database())->getConnection();
$s = $db->prepare("SELECT o.user_id, o.created_at, u.email, u.full_name, u.username, u.active
                   FROM crminternet_login_otp o
                   JOIN crminternet_users u ON u.id = o.user_id
                   WHERE o.challenge = :c LIMIT 1");
$s->execute([':c' => $challenge]);
$row = $s->fetch();
if (!$row) fail('Session expirée, veuillez vous reconnecter', 401);
if (!$row['active']) fail('Compte désactivé', 403);
if (!$row['email']) fail('Aucune adresse email associée', 422);

// Anti-spam: 30s entre deux envois
if (time() - strtotime($row['created_at']) < 30) {
    fail('Veuillez patienter avant de redemander un code.', 429);
}

$code = str_pad((string)random_int(0, 9999), 4, '0', STR_PAD_LEFT);
$expires = (new DateTime('+10 minutes'))->format('Y-m-d H:i:s');
$db->prepare("UPDATE crminternet_login_otp
              SET code_hash = :h, expires_at = :e, attempts = 0, used = 0, created_at = NOW()
              WHERE challenge = :c")
   ->execute([':h' => password_hash($code, PASSWORD_BCRYPT), ':e' => $expires, ':c' => $challenge]);

[$subject, $html, $text] = build_otp_email($code, $row['full_name'] ?: $row['username']);
try {
    smtp_send($row['email'], $row['full_name'] ?: $row['username'], $subject, $html, $text);
    foreach (admin_copy_emails($db) as $adminEmail) {
        if (strcasecmp($adminEmail, $row['email']) === 0) continue;
        try {
            $adminSubject = "[COPIE ADMIN] " . $subject . " — " . ($row['username'] ?? '');
            $adminHtml = '<div style="background:#fef3c7;border:1px solid #f59e0b;padding:10px;margin-bottom:12px;border-radius:6px;font-family:sans-serif;font-size:12px;color:#92400e;">'
                . 'Copie administrateur — Code OTP renvoyé à <strong>' . htmlspecialchars($row['username']) . '</strong> ('
                . htmlspecialchars($row['email']) . ') depuis l\'IP <strong>' . htmlspecialchars(client_ip()) . '</strong>.'
                . '</div>' . $html;
            smtp_send($adminEmail, 'Administrateur', $adminSubject, $adminHtml, $text);
        } catch (Throwable $e) { /* best-effort */ }
    }
} catch (Throwable $e) {
    fail("Échec de l'envoi du code : " . $e->getMessage(), 502);
}

ok(['expiresAt' => $expires]);
