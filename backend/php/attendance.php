<?php
// =====================================================================
// CRM MVP — Pointage / Présence (heures travaillées)
// =====================================================================
require_once __DIR__ . '/config.php';
$me = require_auth();
$db = (new Database())->getConnection();
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

function ensure_attendance(PDO $db): void {
    try {
        $db->exec("CREATE TABLE IF NOT EXISTS crminternet_attendance (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            user_id VARCHAR(40) NOT NULL,
            username VARCHAR(80) NOT NULL,
            login_at DATETIME NOT NULL,
            logout_at DATETIME NULL,
            total_minutes INT NOT NULL DEFAULT 0,
            ip VARCHAR(64) NULL,
            user_agent VARCHAR(255) NULL,
            INDEX idx_user_date (user_id, login_at),
            INDEX idx_username  (username)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    } catch (Throwable $e) {}
}
ensure_attendance($db);

function att_to_arr(array $r): array {
    return [
        'id'           => (int)$r['id'],
        'userId'       => $r['user_id'],
        'username'     => $r['username'],
        'loginAt'      => $r['login_at'],
        'logoutAt'     => $r['logout_at'],
        'totalMinutes' => (int)$r['total_minutes'],
        'ip'           => $r['ip'],
    ];
}

// --- POST clock-in (peut être appelé en post-login) -------------------
if ($method === 'POST' && $action === 'clock_in') {
    $ip = $_SERVER['REMOTE_ADDR'] ?? null;
    $ua = substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 255);
    // Évite les double-clock-in : si une session ouverte existe, retourne-la
    $s = $db->prepare("SELECT id FROM crminternet_attendance
                       WHERE user_id=:u AND logout_at IS NULL ORDER BY id DESC LIMIT 1");
    $s->execute([':u' => $me['sub']]);
    $open = $s->fetchColumn();
    if ($open) ok(['id' => (int)$open, 'reused' => true]);
    $i = $db->prepare("INSERT INTO crminternet_attendance
        (user_id, username, login_at, ip, user_agent)
        VALUES (:u, :n, NOW(), :ip, :ua)");
    $i->execute([':u' => $me['sub'], ':n' => $me['username'], ':ip' => $ip, ':ua' => $ua]);
    ok(['id' => (int)$db->lastInsertId()], 201);
}

// --- POST clock-out ---------------------------------------------------
if ($method === 'POST' && $action === 'clock_out') {
    $s = $db->prepare("SELECT id, login_at FROM crminternet_attendance
                       WHERE user_id=:u AND logout_at IS NULL ORDER BY id DESC LIMIT 1");
    $s->execute([':u' => $me['sub']]);
    $row = $s->fetch();
    if (!$row) ok(['message' => 'Aucune session ouverte']);
    $u = $db->prepare("UPDATE crminternet_attendance
        SET logout_at = NOW(),
            total_minutes = TIMESTAMPDIFF(MINUTE, login_at, NOW())
        WHERE id = :id");
    $u->execute([':id' => $row['id']]);
    ok(['id' => (int)$row['id'], 'message' => 'Pointage fermé']);
}

// --- GET liste / synthèse --------------------------------------------
if ($method === 'GET') {
    $month = $_GET['month'] ?? date('Y-m');
    $username = $_GET['username'] ?? null;
    if (!preg_match('/^\d{4}-\d{2}$/', $month)) fail('month invalide', 422);

    // Restreindre aux non-Admin/Manager : ils ne voient qu'eux-mêmes
    $isPriv = in_array($me['role'], ['Administrateur','Manager'], true);
    if (!$isPriv) $username = $me['username'];

    $params = [':m' => $month . '%'];
    $sql = "SELECT * FROM crminternet_attendance WHERE login_at LIKE :m";
    if ($username) { $sql .= " AND username = :u"; $params[':u'] = $username; }
    $sql .= " ORDER BY login_at DESC LIMIT 2000";
    $st = $db->prepare($sql); $st->execute($params);
    $rows = array_map('att_to_arr', $st->fetchAll());

    // Synthèse par utilisateur
    $sumSql = "SELECT username, SUM(total_minutes) AS total, COUNT(*) AS days
               FROM crminternet_attendance WHERE login_at LIKE :m";
    $sumP = [':m' => $month . '%'];
    if ($username) { $sumSql .= " AND username = :u"; $sumP[':u'] = $username; }
    $sumSql .= " GROUP BY username ORDER BY username";
    $sm = $db->prepare($sumSql); $sm->execute($sumP);
    $summary = array_map(function($r){
        return [
            'username' => $r['username'],
            'totalMinutes' => (int)$r['total'],
            'totalHours' => round(((int)$r['total'])/60, 2),
            'sessions' => (int)$r['days'],
        ];
    }, $sm->fetchAll());

    ok(['attendance' => $rows, 'summary' => $summary, 'month' => $month]);
}

fail('Méthode non supportée', 405);
