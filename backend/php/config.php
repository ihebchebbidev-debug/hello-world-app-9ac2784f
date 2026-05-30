<?php
// =====================================================================
// CRM Internet — Shared bootstrap (CORS + DB + JWT helpers + auth)
// Place this folder on a PHP 8+ host with MySQL. Each *.php endpoint
// includes this file as its first line.
// =====================================================================

error_reporting(E_ALL);
ini_set('display_errors', 0);
ini_set('log_errors', 1);
// Bulk imports + large list endpoints (GET prospects/contracts/users) can
// briefly exceed PHP's default 128M/512M when the dataset grows. Bumping the
// limit + execution time prevents the "Allowed memory size exhausted" fatals
// that made the prospects table appear empty after large imports.
@ini_set('memory_limit', '1024M');
@ini_set('max_execution_time', '120');
@ini_set('max_input_time', '120');

// ---------- FATAL → JSON ---------------------------------------------
// Without this, a PHP fatal produces an empty 500 body and the browser
// shows "Failed to fetch". We capture fatals and emit a JSON envelope
// so the frontend (and curl) can see the real error.
set_exception_handler(function ($e) {
    if (!headers_sent()) {
        http_response_code(500);
        header('Content-Type: application/json; charset=UTF-8');
    }
    echo json_encode([
        'success' => false,
        'message' => 'Server exception: ' . $e->getMessage(),
        'where'   => basename($e->getFile()) . ':' . $e->getLine(),
    ]);
    exit;
});
register_shutdown_function(function () {
    $e = error_get_last();
    if ($e && in_array($e['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR, E_USER_ERROR], true)) {
        if (!headers_sent()) {
            http_response_code(500);
            header('Content-Type: application/json; charset=UTF-8');
        }
        echo json_encode([
            'success' => false,
            'message' => 'PHP fatal: ' . $e['message'],
            'where'   => basename($e['file']) . ':' . $e['line'],
        ]);
    }
});

// ---------- CORS ------------------------------------------------------
// Allow access from any origin
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS");
$reqHeaders = $_SERVER['HTTP_ACCESS_CONTROL_REQUEST_HEADERS']
    ?? 'Content-Type, Authorization, X-Requested-With, X-Auth-Token, X-Request-ID, X-Client-Version, Cache-Control, Pragma';
header("Access-Control-Allow-Headers: $reqHeaders");
header("Access-Control-Max-Age: 86400");
header("Content-Type: application/json; charset=UTF-8");
header("Cache-Control: no-store, no-cache, must-revalidate");
header("Pragma: no-cache");

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ---------- DATABASE --------------------------------------------------
class Database {
    private $host = "luccybcdb.mysql.db";
    private $username = "luccybcdb";
    private $password = "Dadouhibou2025";
    private $database = "luccybcdb";
    public $conn;

    public function getConnection() {
        $this->conn = null;
        try {
            $this->conn = new PDO(
                "mysql:host=" . $this->host . ";dbname=" . $this->database . ";charset=utf8mb4",
                $this->username,
                $this->password,
                [
                    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES   => false,
                ]
            );
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => 'Connection error: ' . $e->getMessage()]);
            exit;
        }
        return $this->conn;
    }
}

// ---------- HELPERS ---------------------------------------------------
function json_input(): array {
    $raw = file_get_contents('php://input');
    if (!$raw) return [];
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

// Shared payload normalizer. Kept in config.php so core APIs keep working even
// if a helper file is missing during manual FTP deployments.
if (!function_exists('crm_normalize_row')) {
    function crm_normalize_row(array $r): array {
        static $aliases = [
            'lastName' => ['nom', 'last_name', 'family_name'],
            'firstName' => ['prenom', 'first_name', 'given_name'],
            'civility' => ['civilite'],
            'birthDate' => ['dateNaissance', 'date_naissance', 'birth_date'],
            'cin' => ['CIN', 'numCin', 'num_cin'],
            'phone' => ['telephone', 'tel', 'gsm', 'mobile'],
            'phone2' => ['telephone2', 'tel2', 'gsm2'],
            'email' => ['mail', 'courriel'],
            'address' => ['adresse'],
            'city' => ['ville'],
            'gouvernorat' => ['governorate', 'wilaya'],
            'delegation' => ['delegate'],
            'codePostal' => ['code_postal', 'postalCode', 'postal_code', 'zip', 'cp'],
            'localisationXy' => ['localisation_xy', 'coords', 'gps', 'latlng'],
            'source' => ['origine'],
            'status' => ['statut', 'state'],
            'assignedTo' => ['assigned_to', 'agent', 'commercial'],
            'comment' => ['commentaire', 'note'],
            'comment2' => ['commentaire2', 'note2'],
            'premium' => ['montant', 'price', 'prix'],
            'partner' => ['partenaire'],
            'signatureDate' => ['signature_date', 'dateSignature'],
            'effectiveDate' => ['effective_date', 'dateEffet'],
            'validationDate' => ['validation_date', 'dateValidation'],
        ];
        foreach ($aliases as $canonical => $alts) {
            if (array_key_exists($canonical, $r) && $r[$canonical] !== null && $r[$canonical] !== '') continue;
            foreach ($alts as $alt) {
                if (array_key_exists($alt, $r) && $r[$alt] !== null && $r[$alt] !== '') {
                    $r[$canonical] = $r[$alt];
                    break;
                }
            }
        }
        if (!empty($r['phone']))  $r['phone']  = preg_replace('/\s+/', '', (string)$r['phone']);
        if (!empty($r['phone2'])) $r['phone2'] = preg_replace('/\s+/', '', (string)$r['phone2']);
        if (!empty($r['email']))  $r['email']  = strtolower(trim((string)$r['email']));
        if (isset($r['birthDate']) && $r['birthDate'] === '') $r['birthDate'] = null;
        return $r;
    }
}

function ok($data = [], int $code = 200): void {
    http_response_code($code);
    echo json_encode(['success' => true] + (is_array($data) ? $data : ['data' => $data]));
    exit;
}

function fail(string $message, int $code = 400, array $extra = []): void {
    http_response_code($code);
    echo json_encode(['success' => false, 'message' => $message] + $extra);
    exit;
}

function require_method(string ...$methods): void {
    if (!in_array($_SERVER['REQUEST_METHOD'] ?? '', $methods, true)) {
        fail('Method not allowed', 405);
    }
}

// ---------- JWT (HS256, dependency-free) ------------------------------
const JWT_SECRET = 'change-me-to-a-long-random-string-min-32-chars-9f7c1';
const JWT_TTL_SECONDS = 60 * 60 * 12; // 12h

function b64url_encode(string $s): string {
    return rtrim(strtr(base64_encode($s), '+/', '-_'), '=');
}
function b64url_decode(string $s): string {
    $pad = strlen($s) % 4;
    if ($pad) $s .= str_repeat('=', 4 - $pad);
    return base64_decode(strtr($s, '-_', '+/'));
}

function jwt_sign(array $payload): string {
    $header  = ['alg' => 'HS256', 'typ' => 'JWT'];
    $payload['iat'] = time();
    $payload['exp'] = time() + JWT_TTL_SECONDS;
    $h = b64url_encode(json_encode($header));
    $p = b64url_encode(json_encode($payload));
    $sig = b64url_encode(hash_hmac('sha256', "$h.$p", JWT_SECRET, true));
    return "$h.$p.$sig";
}

function jwt_verify(?string $token): ?array {
    if (!$token) return null;
    $parts = explode('.', $token);
    if (count($parts) !== 3) return null;
    [$h, $p, $sig] = $parts;
    $expected = b64url_encode(hash_hmac('sha256', "$h.$p", JWT_SECRET, true));
    if (!hash_equals($expected, $sig)) return null;
    $payload = json_decode(b64url_decode($p), true);
    if (!is_array($payload)) return null;
    if (($payload['exp'] ?? 0) < time()) return null;
    return $payload;
}

function bearer_token(): ?string {
    $headers = function_exists('getallheaders') ? getallheaders() : [];
    $normalized = [];
    foreach ($headers as $key => $value) {
        $normalized[strtolower((string)$key)] = $value;
    }
    $candidates = [
        $normalized['authorization'] ?? null,
        $_SERVER['HTTP_AUTHORIZATION'] ?? null,
        $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? null,
        getenv('HTTP_AUTHORIZATION') ?: null,
        getenv('REDIRECT_HTTP_AUTHORIZATION') ?: null,
        $_SERVER['HTTP_X_AUTH_TOKEN'] ?? null,
        $normalized['x-auth-token'] ?? null,
        $_GET['token'] ?? null,
    ];
    foreach ($candidates as $auth) {
        $auth = trim((string)$auth);
        if ($auth === '') continue;
        if (stripos($auth, 'Bearer ') === 0) return trim(substr($auth, 7));
        if (substr_count($auth, '.') === 2) return $auth;
    }
    return null;
}

/**
 * Require an authenticated user. Returns the JWT payload (id, username, role).
 * Optional $roles whitelist enforces RBAC.
 */
function require_auth(array $roles = []): array {
    $payload = jwt_verify(bearer_token());
    if (!$payload) fail('Unauthorized', 401);
    if ($roles && !in_array($payload['role'] ?? '', $roles, true)) {
        fail('Forbidden', 403);
    }
    return $payload;
}

/** Insert a notification row for a target user. Soft-fails (no exception) on error. */
function notify_user(PDO $db, string $username, string $title, ?string $body = null, ?string $link = null): void {
    if ($username === '' || $username === '—') return;
    try {
        $s = $db->prepare('INSERT INTO crminternet_notifications (id, user_username, title, body, link)
                           VALUES (:id, :u, :t, :b, :l)');
        $s->execute([
            ':id' => 'N-' . substr(bin2hex(random_bytes(6)), 0, 10),
            ':u'  => $username, ':t' => $title, ':b' => $body, ':l' => $link,
        ]);
    } catch (Throwable $e) { /* swallow — notifications are best-effort */ }
}

/** Ensure the must_change_password column exists (idempotent, soft-fail). */
function ensure_must_change_column(PDO $db): void {
    try {
        $db->exec("ALTER TABLE crminternet_users ADD COLUMN must_change_password TINYINT(1) NOT NULL DEFAULT 0");
    } catch (Throwable $e) { /* column already exists — ignore */ }
}

/**
 * Append a row to crminternet_activity_log. Soft-fails so callers never break
 * a business action because the audit log is unavailable.
 */
function log_action(
    PDO $db,
    string $entityType,
    string $entityId,
    string $field,
    $previous,
    $next,
    string $user
): void {
    if ($user === '') return;
    try {
        $s = $db->prepare('INSERT INTO crminternet_activity_log
            (id, entity_type, entity_id, contract_id, field, previous_value, new_value, user_username)
            VALUES (:id, :et, :eid, :cid, :f, :pv, :nv, :u)');
        $s->execute([
            ':id'  => 'A-' . substr(bin2hex(random_bytes(8)), 0, 14),
            ':et'  => substr($entityType, 0, 32),
            ':eid' => substr($entityId, 0, 40),
            ':cid' => $entityType === 'contract' ? substr($entityId, 0, 40) : '',
            ':f'   => substr($field, 0, 40),
            ':pv'  => substr((string)($previous ?? ''), 0, 255),
            ':nv'  => substr((string)($next ?? ''), 0, 255),
            ':u'   => substr($user, 0, 80),
        ]);
    } catch (Throwable $e) { /* best-effort */ }
}

/**
 * Higher-level audit log used by auth & admin endpoints.
 * Signature: audit_log($db, $userOrPayload, $action, $entityType='', $entityId=null, $meta=[], $statusCode=200)
 */
function audit_log(
    PDO $db,
    $user,
    string $action,
    string $entityType = '',
    $entityId = null,
    array $meta = [],
    int $statusCode = 200
): void {
    try {
        ensure_audit_log_table($db);
        $username = '';
        $role = '';
        if (is_array($user)) {
            $username = (string)($user['username'] ?? $user['sub'] ?? '');
            $role     = (string)($user['role'] ?? '');
        } elseif (is_string($user)) {
            $username = $user;
        }
        $method = $_SERVER['REQUEST_METHOD'] ?? null;
        $path   = $_SERVER['REQUEST_URI']    ?? null;
        $ua     = $_SERVER['HTTP_USER_AGENT'] ?? null;
        $ip     = function_exists('client_ip') ? client_ip() : ($_SERVER['REMOTE_ADDR'] ?? null);
        $details = json_encode($meta, JSON_UNESCAPED_UNICODE) ?: null;
        $s = $db->prepare('INSERT INTO crminternet_audit_log
            (user_username, user_role, action, entity_type, entity_id, method, path, ip, user_agent, status_code, details)
            VALUES (:u, :r, :a, :et, :eid, :m, :p, :ip, :ua, :sc, :d)');
        $s->execute([
            ':u'   => $username !== '' ? substr($username, 0, 80) : null,
            ':r'   => $role !== '' ? substr($role, 0, 40) : null,
            ':a'   => substr($action, 0, 80),
            ':et'  => $entityType !== '' ? substr($entityType, 0, 40) : null,
            ':eid' => $entityId !== null ? substr((string)$entityId, 0, 80) : null,
            ':m'   => $method ? substr($method, 0, 10) : null,
            ':p'   => $path ? substr($path, 0, 255) : null,
            ':ip'  => $ip ? substr($ip, 0, 64) : null,
            ':ua'  => $ua ? substr($ua, 0, 255) : null,
            ':sc'  => $statusCode,
            ':d'   => $details,
        ]);
    } catch (Throwable $e) { /* best-effort */ }
}

/**
 * Returns the list of admin emails to BCC (e.g. for OTP copies).
 * Reads from crminternet_settings if present, otherwise falls back to all
 * active Administrateur users.
 */
function admin_copy_emails(PDO $db): array {
    // 1) Try a settings row: scope='global', key='admin_copy_emails', value=JSON array or comma list.
    try {
        $s = $db->prepare("SELECT value FROM crminternet_settings WHERE scope='global' AND `key`='admin_copy_emails' LIMIT 1");
        $s->execute();
        $val = $s->fetchColumn();
        if ($val) {
            $decoded = json_decode((string)$val, true);
            if (is_array($decoded)) {
                return array_values(array_filter(array_map('trim', $decoded), fn($e) => $e !== ''));
            }
            return array_values(array_filter(array_map('trim', explode(',', (string)$val)), fn($e) => $e !== ''));
        }
    } catch (Throwable $e) { /* table or row missing — fall back */ }

    // 2) Fallback: every active Administrateur with an email.
    try {
        $rows = $db->query("SELECT email FROM crminternet_users
                            WHERE role='Administrateur' AND active=1 AND email IS NOT NULL AND email <> ''")
                   ->fetchAll();
        return array_values(array_filter(array_map(fn($r) => trim((string)$r['email']), $rows)));
    } catch (Throwable $e) { return []; }
}

/** Best-effort client IP, trusts X-Forwarded-For first hop. */
function client_ip(): string {
    $ip = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
    if (strpos($ip, ',') !== false) $ip = trim(explode(',', $ip)[0]);
    return substr($ip, 0, 64);
}

/** Ensure the temporary access grants table exists (idempotent). */
function ensure_grants_table(PDO $db): void {
    $db->exec("CREATE TABLE IF NOT EXISTS crminternet_user_grants (
        id              VARCHAR(40)  PRIMARY KEY,
        user_username   VARCHAR(80)  NOT NULL,
        grant_type      ENUM('role','permission') NOT NULL,
        grant_value     VARCHAR(120) NOT NULL,
        reason          VARCHAR(255) NULL,
        granted_by      VARCHAR(80)  NOT NULL,
        starts_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires_at      DATETIME     NOT NULL,
        revoked         TINYINT(1)   NOT NULL DEFAULT 0,
        revoked_at      DATETIME     NULL,
        revoked_by      VARCHAR(80)  NULL,
        created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user (user_username),
        INDEX idx_active (user_username, expires_at, revoked)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}

/** Ensure the per-user permission overrides table exists (idempotent). */
function ensure_user_overrides_table(PDO $db): void {
    $db->exec("CREATE TABLE IF NOT EXISTS crminternet_user_permission_overrides (
        user_username VARCHAR(80) NOT NULL,
        permission    VARCHAR(80) NOT NULL,
        effect        ENUM('allow','deny') NOT NULL,
        updated_by    VARCHAR(80) NULL,
        updated_at    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (user_username, permission),
        INDEX idx_user (user_username)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}

/**
 * Returns the currently active (non-revoked, non-expired) grants for a user.
 * Shape: [ 'roles' => string[], 'permissions' => string[] ]
 */
function active_grants_for(PDO $db, string $username): array {
    $out = ['roles' => [], 'permissions' => []];
    if ($username === '') return $out;
    try {
        ensure_grants_table($db);
        $s = $db->prepare("SELECT grant_type, grant_value
                           FROM crminternet_user_grants
                           WHERE user_username = :u
                             AND revoked = 0
                             AND expires_at > NOW()");
        $s->execute([':u' => $username]);
        foreach ($s->fetchAll() as $r) {
            if ($r['grant_type'] === 'role')        $out['roles'][]       = $r['grant_value'];
            elseif ($r['grant_type'] === 'permission') $out['permissions'][] = $r['grant_value'];
        }
    } catch (Throwable $e) { /* table missing — return empty */ }
    return $out;
}

/**
 * Returns per-user permission overrides.
 * Shape: [ 'allow' => string[], 'deny' => string[] ]
 */
function user_overrides_for(PDO $db, string $username): array {
    $out = ['allow' => [], 'deny' => []];
    if ($username === '') return $out;
    try {
        ensure_user_overrides_table($db);
        $s = $db->prepare("SELECT permission, effect
                           FROM crminternet_user_permission_overrides
                           WHERE user_username = :u");
        $s->execute([':u' => $username]);
        foreach ($s->fetchAll() as $r) {
            if ($r['effect'] === 'allow') $out['allow'][] = $r['permission'];
            elseif ($r['effect'] === 'deny')  $out['deny'][]  = $r['permission'];
        }
    } catch (Throwable $e) { /* table missing — return empty */ }
    return $out;
}

/** Alias used by user_permissions.php (kept for backwards compatibility). */
function ensure_user_perm_overrides_table(PDO $db): void {
    ensure_user_overrides_table($db);
}

/** Ensure the audit_log table exists (idempotent). */
function ensure_audit_log_table(PDO $db): void {
    $db->exec("CREATE TABLE IF NOT EXISTS crminternet_audit_log (
        id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        created_at    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        user_username VARCHAR(80) NULL,
        user_role     VARCHAR(40) NULL,
        action        VARCHAR(80) NOT NULL,
        entity_type   VARCHAR(40) NULL,
        entity_id     VARCHAR(80) NULL,
        method        VARCHAR(10) NULL,
        path          VARCHAR(255) NULL,
        ip            VARCHAR(64) NULL,
        user_agent    VARCHAR(255) NULL,
        status_code   SMALLINT    NULL,
        details       TEXT        NULL,
        INDEX idx_created (created_at),
        INDEX idx_user (user_username),
        INDEX idx_action (action)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}

/**
 * Diff helper: log every key whose value differs between $before and $after.
 * Each change becomes one row in crminternet_activity_log via log_action().
 */
function log_field_changes(
    PDO $db,
    string $entityType,
    string $entityId,
    array $before,
    array $after,
    string $user
): void {
    if ($user === '') return;
    $keys = array_unique(array_merge(array_keys($before), array_keys($after)));
    foreach ($keys as $k) {
        $b = $before[$k] ?? null;
        $a = $after[$k]  ?? null;
        $bs = is_scalar($b) || $b === null ? (string)($b ?? '') : json_encode($b, JSON_UNESCAPED_UNICODE);
        $as = is_scalar($a) || $a === null ? (string)($a ?? '') : json_encode($a, JSON_UNESCAPED_UNICODE);
        if ($bs === $as) continue;
        log_action($db, $entityType, $entityId, (string)$k, $bs, $as, $user);
    }
}

/**
 * Computes effective permissions for a user (role perms + grants + overrides).
 * Returns true if the user has $permission. Admins always pass.
 */
/**
 * Returns the team_id (équipe) currently assigned to a user, or '' if none.
 * Cached per request to avoid repeated lookups during permission checks.
 */
function user_team_id(PDO $db, string $username): string {
    static $cache = [];
    if ($username === '') return '';
    if (array_key_exists($username, $cache)) return $cache[$username];
    try {
        $s = $db->prepare('SELECT team_id FROM crminternet_users WHERE username = :u LIMIT 1');
        $s->execute([':u' => $username]);
        $tid = (string)($s->fetchColumn() ?: '');
    } catch (Throwable $e) { $tid = ''; }
    return $cache[$username] = $tid;
}

/**
 * Returns the list of role names that compose a team. Empty if team unknown.
 * Cached per request.
 */
function team_role_names(PDO $db, string $teamId): array {
    static $cache = [];
    if ($teamId === '') return [];
    if (isset($cache[$teamId])) return $cache[$teamId];
    try {
        $s = $db->prepare('SELECT role FROM crminternet_team_roles WHERE team_id = :t');
        $s->execute([':t' => $teamId]);
        $rows = $s->fetchAll(PDO::FETCH_COLUMN) ?: [];
    } catch (Throwable $e) { $rows = []; }
    return $cache[$teamId] = array_map('strval', $rows);
}

function role_has_any_permission(PDO $db, string $role): bool {
    static $cache = [];
    if ($role === '') return false;
    if (array_key_exists($role, $cache)) return $cache[$role];
    try {
        $s = $db->prepare('SELECT 1 FROM crminternet_role_permissions WHERE role = :r AND enabled = 1 LIMIT 1');
        $s->execute([':r' => $role]);
        return $cache[$role] = (bool)$s->fetchColumn();
    } catch (Throwable $e) {
        return $cache[$role] = false;
    }
}

function user_has_permission(PDO $db, array $me, string $permission): bool {
    if (($me['role'] ?? '') === 'Administrateur') return true;
    $username = (string)($me['username'] ?? '');
    $role     = (string)($me['role'] ?? '');

    // Per-user deny override always wins — explicit admin action.
    $ov = user_overrides_for($db, $username);
    if (in_array($permission, $ov['deny'], true))  return false;
    if (in_array($permission, $ov['allow'], true)) return true;

    // Temporary grants are explicit admin exceptions.
    $g = active_grants_for($db, $username);
    if (in_array($permission, $g['permissions'], true)) return true;
    foreach ($g['roles'] as $extraRole) {
        try {
            $s = $db->prepare("SELECT enabled FROM crminternet_role_permissions
                               WHERE role = :r AND permission = :p");
            $s->execute([':r' => $extraRole, ':p' => $permission]);
            if ((int)$s->fetchColumn() === 1) return true;
        } catch (Throwable $e) {}
    }

    // Only the user's own assigned role decides access.
    // Team membership is organisational only — it must never bleed permissions
    // from other roles in the team into this user's effective permission set.
    if ($role === '') return false;
    try {
        $s = $db->prepare("SELECT enabled FROM crminternet_role_permissions
                           WHERE role = :r AND permission = :p");
        $s->execute([':r' => $role, ':p' => $permission]);
        return (int)$s->fetchColumn() === 1;
    } catch (Throwable $e) {
        return false;
    }
}

/** Throws 403 if the user lacks the given permission. */
function require_permission(PDO $db, array $me, string $permission): void {
    if (!user_has_permission($db, $me, $permission)) {
        fail("Accès refusé (permission requise : $permission)", 403);
    }
}

