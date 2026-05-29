<?php
// =====================================================================
// Mailer SMTP minimaliste (OVH) — sans dépendance externe.
// Configurez les constantes ci-dessous OU définissez les variables
// d'environnement (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS,
// SMTP_FROM, SMTP_FROM_NAME, SMTP_SECURE = "ssl" | "tls" | "none").
// =====================================================================

// --- OVH defaults (à adapter) ----------------------------------------
defined('SMTP_HOST')      or define('SMTP_HOST',      getenv('SMTP_HOST')      ?: 'ssl0.ovh.net');
defined('SMTP_PORT')      or define('SMTP_PORT',      (int)(getenv('SMTP_PORT') ?: 465));
defined('SMTP_SECURE')    or define('SMTP_SECURE',    getenv('SMTP_SECURE')    ?: 'ssl'); // ssl | tls | none
defined('SMTP_USER')      or define('SMTP_USER',      getenv('SMTP_USER')      ?: 'erp_robot_verification_crm@luccibyey.com.tn');
defined('SMTP_PASS')      or define('SMTP_PASS',      getenv('SMTP_PASS')      ?: 'Dadouhibou2025');
defined('SMTP_FROM')      or define('SMTP_FROM',      getenv('SMTP_FROM')      ?: SMTP_USER);
defined('SMTP_FROM_NAME') or define('SMTP_FROM_NAME', getenv('SMTP_FROM_NAME') ?: 'CRM Internet — Vérification');

class SmtpException extends RuntimeException {}

function smtp_send(string $toEmail, string $toName, string $subject, string $htmlBody, string $textBody = ''): void {
    $host   = SMTP_HOST;
    $port   = SMTP_PORT;
    $secure = strtolower(SMTP_SECURE);
    $user   = SMTP_USER;
    $pass   = SMTP_PASS;
    $from   = SMTP_FROM;
    $fname  = SMTP_FROM_NAME;

    $hostPrefix = ($secure === 'ssl') ? 'ssl://' : '';
    $errno = 0; $errstr = '';
    $fp = @stream_socket_client($hostPrefix . $host . ':' . $port, $errno, $errstr, 15);
    if (!$fp) throw new SmtpException("SMTP connect: $errstr ($errno)");
    stream_set_timeout($fp, 15);

    $read = function() use ($fp) {
        $data = '';
        while (!feof($fp)) {
            $line = fgets($fp, 515);
            if ($line === false) break;
            $data .= $line;
            if (isset($line[3]) && $line[3] === ' ') break;
        }
        return $data;
    };
    $send = function(string $cmd, int $expect) use ($fp, $read) {
        fwrite($fp, $cmd . "\r\n");
        $resp = $read();
        if ((int)substr($resp, 0, 3) !== $expect) {
            throw new SmtpException("SMTP error after '$cmd': " . trim($resp));
        }
        return $resp;
    };

    $read(); // banner
    $ehlo = "EHLO " . ($_SERVER['SERVER_NAME'] ?? 'localhost');
    fwrite($fp, $ehlo . "\r\n"); $read();

    if ($secure === 'tls') {
        $send("STARTTLS", 220);
        if (!stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
            throw new SmtpException("STARTTLS failed");
        }
        fwrite($fp, $ehlo . "\r\n"); $read();
    }

    $send("AUTH LOGIN", 334);
    $send(base64_encode($user), 334);
    $send(base64_encode($pass), 235);

    $send("MAIL FROM:<$from>", 250);
    $send("RCPT TO:<$toEmail>", 250);
    $send("DATA", 354);

    $boundary = 'b_' . bin2hex(random_bytes(8));
    $headers  = "From: " . smtp_encode_header($fname) . " <$from>\r\n";
    $headers .= "To: " . smtp_encode_header($toName) . " <$toEmail>\r\n";
    $headers .= "Subject: " . smtp_encode_header($subject) . "\r\n";
    $headers .= "MIME-Version: 1.0\r\n";
    $headers .= "Date: " . date('r') . "\r\n";
    $headers .= "Message-ID: <" . bin2hex(random_bytes(8)) . "@" . ($_SERVER['SERVER_NAME'] ?? 'localhost') . ">\r\n";
    $headers .= "Content-Type: multipart/alternative; boundary=\"$boundary\"\r\n";

    $text = $textBody !== '' ? $textBody : strip_tags($htmlBody);
    $body  = "--$boundary\r\n";
    $body .= "Content-Type: text/plain; charset=UTF-8\r\n";
    $body .= "Content-Transfer-Encoding: 8bit\r\n\r\n";
    $body .= $text . "\r\n";
    $body .= "--$boundary\r\n";
    $body .= "Content-Type: text/html; charset=UTF-8\r\n";
    $body .= "Content-Transfer-Encoding: 8bit\r\n\r\n";
    $body .= $htmlBody . "\r\n";
    $body .= "--$boundary--\r\n";

    // Dot-stuff
    $payload = preg_replace('/^\./m', '..', $headers . "\r\n" . $body);
    fwrite($fp, $payload . "\r\n.\r\n");
    $resp = $read();
    if ((int)substr($resp, 0, 3) !== 250) {
        throw new SmtpException("SMTP DATA reject: " . trim($resp));
    }
    fwrite($fp, "QUIT\r\n");
    fclose($fp);
}

function smtp_encode_header(string $s): string {
    if (preg_match('/[^\x20-\x7e]/', $s)) {
        return '=?UTF-8?B?' . base64_encode($s) . '?=';
    }
    return $s;
}

/** Construit un email d'OTP propre en français. */
function build_otp_email(string $code, string $fullName): array {
    $safeName = htmlspecialchars($fullName, ENT_QUOTES, 'UTF-8');
    $subject  = "Votre code de connexion CRM : $code";
    $digits   = str_split($code);
    $cells = '';
    foreach ($digits as $d) {
        $cells .= '<td style="padding:0 6px;"><div style="width:54px;height:62px;border-radius:10px;background:#0f172a;color:#ffffff;font-family:\'Segoe UI\',Roboto,Arial,sans-serif;font-size:30px;font-weight:700;line-height:62px;text-align:center;letter-spacing:2px;">' . $d . '</div></td>';
    }
    $html = '<!doctype html><html lang="fr"><body style="margin:0;background:#f3f4f6;font-family:\'Segoe UI\',Roboto,Arial,sans-serif;color:#111827;">'
          . '<div style="max-width:520px;margin:32px auto;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 6px 24px rgba(15,23,42,.08);">'
          . '<div style="background:linear-gradient(135deg,#2563eb,#7c3aed);padding:24px 28px;color:#fff;">'
          . '<div style="font-size:12px;letter-spacing:3px;opacity:.85;text-transform:uppercase;">CRM</div>'
          . '<div style="font-size:22px;font-weight:600;margin-top:4px;">Code de vérification</div>'
          . '</div>'
          . '<div style="padding:28px;">'
          . '<p style="margin:0 0 14px;font-size:15px;">Bonjour <strong>' . $safeName . '</strong>,</p>'
          . '<p style="margin:0 0 18px;font-size:14px;color:#4b5563;line-height:1.55;">Vous tentez de vous connecter au CRM. Pour finaliser votre connexion, saisissez le code de vérification ci-dessous :</p>'
          . '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px auto 18px;"><tr>' . $cells . '</tr></table>'
          . '<p style="margin:0 0 8px;font-size:13px;color:#6b7280;text-align:center;">Ce code est valable <strong>10 minutes</strong> et ne peut être utilisé qu\'une seule fois.</p>'
          . '<hr style="border:none;border-top:1px solid #e5e7eb;margin:22px 0;">'
          . '<p style="margin:0;font-size:12px;color:#6b7280;line-height:1.55;">Si vous n\'êtes pas à l\'origine de cette tentative, ignorez ce message et changez immédiatement votre mot de passe.</p>'
          . '</div>'
          . '<div style="padding:16px 28px;background:#f9fafb;color:#9ca3af;font-size:11px;text-align:center;">© ' . date('Y') . ' CRM — message automatique, ne pas répondre.</div>'
          . '</div></body></html>';
    $text = "Bonjour $fullName,\n\nVotre code de vérification CRM est : $code\nIl est valable 10 minutes.\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez cet email.";
    return [$subject, $html, $text];
}
