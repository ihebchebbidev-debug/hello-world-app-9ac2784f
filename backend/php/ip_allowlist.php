<?php
// Helpers for OTP IP allowlist + admin BCC config (stored in crminternet_settings).
// Settings keys (scope=global):
//   otp_ip_allowlist     -> JSON array of strings: "1.2.3.4", "1.2.3.0/24", "1.2.3.10-1.2.3.20"
//   otp_admin_copy_emails-> JSON array of admin email addresses to BCC OTP codes to

function get_setting_json(PDO $db, string $key, $default) {
    try {
        $s = $db->prepare('SELECT value FROM crminternet_settings WHERE scope = "global" AND setting_key = :k');
        $s->execute([':k' => $key]);
        $v = $s->fetchColumn();
        if ($v === false) return $default;
        $d = json_decode($v, true);
        return $d === null ? $default : $d;
    } catch (Throwable $e) { return $default; }
}

function client_ip(): string {
    foreach (['HTTP_CF_CONNECTING_IP','HTTP_X_FORWARDED_FOR','HTTP_X_REAL_IP','REMOTE_ADDR'] as $k) {
        if (!empty($_SERVER[$k])) {
            $ip = trim(explode(',', $_SERVER[$k])[0]);
            if (filter_var($ip, FILTER_VALIDATE_IP)) return $ip;
        }
    }
    return '';
}

function ip_matches_rule(string $ip, string $rule): bool {
    $rule = trim($rule);
    if ($rule === '' || $ip === '') return false;
    // Range a.b.c.d-e.f.g.h
    if (strpos($rule, '-') !== false) {
        [$a, $b] = array_map('trim', explode('-', $rule, 2));
        if (!filter_var($a, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4) || !filter_var($b, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) return false;
        $ipL = ip2long($ip); $aL = ip2long($a); $bL = ip2long($b);
        if ($ipL === false || $aL === false || $bL === false) return false;
        return $ipL >= min($aL, $bL) && $ipL <= max($aL, $bL);
    }
    // CIDR a.b.c.d/n
    if (strpos($rule, '/') !== false) {
        [$subnet, $bits] = explode('/', $rule, 2);
        $bits = (int)$bits;
        if (strpos($ip, ':') !== false || strpos($subnet, ':') !== false) {
            // IPv6 (basic)
            $ipBin = @inet_pton($ip); $netBin = @inet_pton($subnet);
            if (!$ipBin || !$netBin || $bits < 0 || $bits > 128) return false;
            $bytes = intdiv($bits, 8); $rem = $bits % 8;
            if ($bytes && substr($ipBin, 0, $bytes) !== substr($netBin, 0, $bytes)) return false;
            if ($rem === 0) return true;
            $mask = chr((0xff << (8 - $rem)) & 0xff);
            return (ord($ipBin[$bytes]) & ord($mask)) === (ord($netBin[$bytes]) & ord($mask));
        }
        if ($bits < 0 || $bits > 32) return false;
        $ipL = ip2long($ip); $netL = ip2long($subnet);
        if ($ipL === false || $netL === false) return false;
        $mask = $bits === 0 ? 0 : (~((1 << (32 - $bits)) - 1) & 0xFFFFFFFF);
        return ($ipL & $mask) === ($netL & $mask);
    }
    // Exact match
    return $ip === $rule;
}

function ip_is_allowlisted(PDO $db, string $ip): bool {
    if ($ip === '') return false;
    $rules = get_setting_json($db, 'otp_ip_allowlist', []);
    if (!is_array($rules)) return false;
    foreach ($rules as $rule) {
        if (is_string($rule) && ip_matches_rule($ip, $rule)) return true;
    }
    return false;
}

function admin_copy_emails(PDO $db): array {
    $list = get_setting_json($db, 'otp_admin_copy_emails', []);
    if (!is_array($list)) return [];
    return array_values(array_filter(array_map('strval', $list), fn($e) => filter_var($e, FILTER_VALIDATE_EMAIL)));
}
