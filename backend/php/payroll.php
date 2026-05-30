<?php
// =====================================================================
// CRM MVP — Paie agents internes (mensuelle)
// =====================================================================
require_once __DIR__ . '/config.php';
$me = require_auth();
$db = (new Database())->getConnection();
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

function ensure_payroll(PDO $db): void {
    try {
        $db->exec("CREATE TABLE IF NOT EXISTS crminternet_payroll (
            id VARCHAR(40) PRIMARY KEY,
            user_id VARCHAR(40) NOT NULL,
            username VARCHAR(80) NOT NULL,
            period CHAR(7) NOT NULL,
            base_salary DECIMAL(10,2) NOT NULL DEFAULT 0,
            hours_worked DECIMAL(7,2) NOT NULL DEFAULT 0,
            hourly_rate DECIMAL(8,2) NOT NULL DEFAULT 0,
            bonus DECIMAL(10,2) NOT NULL DEFAULT 0,
            deductions DECIMAL(10,2) NOT NULL DEFAULT 0,
            total DECIMAL(10,2) NOT NULL DEFAULT 0,
            status ENUM('draft','validated','paid') NOT NULL DEFAULT 'draft',
            paid_at DATETIME NULL,
            notes TEXT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_user_period (user_id, period)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    } catch (Throwable $e) {}
}
ensure_payroll($db);

function pay_to_arr(array $r): array {
    return [
        'id'           => $r['id'],
        'userId'       => $r['user_id'],
        'username'     => $r['username'],
        'fullName'     => $r['full_name'] ?? null,
        'period'       => $r['period'],
        'baseSalary'   => (float)$r['base_salary'],
        'hoursWorked'  => (float)$r['hours_worked'],
        'hourlyRate'   => (float)$r['hourly_rate'],
        'bonus'        => (float)$r['bonus'],
        'deductions'   => (float)$r['deductions'],
        'total'        => (float)$r['total'],
        'status'       => $r['status'],
        'paidAt'       => $r['paid_at'],
        'notes'        => $r['notes'],
    ];
}

function calc_total(array $in): float {
    $base = (float)($in['baseSalary'] ?? 0);
    $hours = (float)($in['hoursWorked'] ?? 0);
    $rate  = (float)($in['hourlyRate'] ?? 0);
    $bonus = (float)($in['bonus'] ?? 0);
    $ded   = (float)($in['deductions'] ?? 0);
    return round($base + ($hours * $rate) + $bonus - $ded, 2);
}

if ($method === 'GET') {
    require_permission($db, $me, 'page.hr.payroll');
    $period = $_GET['period'] ?? date('Y-m');
    if (!preg_match('/^\d{4}-\d{2}$/', $period)) fail('period invalide', 422);
    $sql = "SELECT p.*, u.full_name FROM crminternet_payroll p
            LEFT JOIN crminternet_users u ON u.id = p.user_id
            WHERE p.period = :p ORDER BY u.full_name";
    $st = $db->prepare($sql); $st->execute([':p' => $period]);
    $rows = array_map('pay_to_arr', $st->fetchAll());

    // Auto-calc heures depuis attendance pour chaque utilisateur actif
    $hours = [];
    $h = $db->prepare("SELECT user_id, SUM(total_minutes) AS m FROM crminternet_attendance
                       WHERE login_at LIKE :m GROUP BY user_id");
    $h->execute([':m' => $period . '%']);
    foreach ($h->fetchAll() as $r) $hours[$r['user_id']] = round(((int)$r['m'])/60, 2);

    ok(['payroll' => $rows, 'period' => $period, 'attendanceHours' => $hours]);
}

if ($method === 'POST' && ($action === 'upsert' || $action === '')) {
    require_permission($db, $me, 'hr.payroll.edit');
    $in = json_input();
    $userId = $in['userId'] ?? '';
    $period = $in['period'] ?? date('Y-m');
    if ($userId === '' || !preg_match('/^\d{4}-\d{2}$/', $period)) fail('userId/period requis', 422);
    $u = $db->prepare("SELECT username FROM crminternet_users WHERE id=:id");
    $u->execute([':id' => $userId]);
    $username = $u->fetchColumn();
    if (!$username) fail('Utilisateur introuvable', 404);

    $total = calc_total($in);
    $id = 'PR-' . substr(bin2hex(random_bytes(6)), 0, 10);
    $sql = "INSERT INTO crminternet_payroll
        (id, user_id, username, period, base_salary, hours_worked, hourly_rate, bonus, deductions, total, notes)
        VALUES (:id, :uid, :un, :pe, :bs, :hw, :hr, :bo, :de, :to, :no)
        ON DUPLICATE KEY UPDATE
          base_salary=VALUES(base_salary), hours_worked=VALUES(hours_worked),
          hourly_rate=VALUES(hourly_rate), bonus=VALUES(bonus),
          deductions=VALUES(deductions), total=VALUES(total), notes=VALUES(notes)";
    $db->prepare($sql)->execute([
        ':id' => $id, ':uid' => $userId, ':un' => $username, ':pe' => $period,
        ':bs' => (float)($in['baseSalary'] ?? 0),
        ':hw' => (float)($in['hoursWorked'] ?? 0),
        ':hr' => (float)($in['hourlyRate'] ?? 0),
        ':bo' => (float)($in['bonus'] ?? 0),
        ':de' => (float)($in['deductions'] ?? 0),
        ':to' => $total,
        ':no' => trim($in['notes'] ?? '') ?: null,
    ]);
    ok(['message' => 'Enregistré', 'total' => $total]);
}

if ($method === 'POST' && $action === 'mark_paid') {
    require_auth(['Administrateur']);
    $in = json_input();
    $id = $in['id'] ?? '';
    if ($id === '') fail('id requis', 422);
    $db->prepare("UPDATE crminternet_payroll SET status='paid', paid_at=NOW() WHERE id=:id")
       ->execute([':id' => $id]);
    ok(['message' => 'Payé']);
}

if ($method === 'DELETE') {
    require_auth(['Administrateur']);
    $id = $_GET['id'] ?? '';
    $db->prepare("DELETE FROM crminternet_payroll WHERE id = :id")->execute([':id' => $id]);
    ok(['message' => 'Supprimé']);
}

fail('Méthode non supportée', 405);
