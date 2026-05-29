<?php
// =====================================================================
// CRM MVP — Commissions (rémunération agents externes par vente)
// =====================================================================
require_once __DIR__ . '/config.php';
$me = require_auth();
$db = (new Database())->getConnection();
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

function ensure_commissions(PDO $db): void {
    try {
        $db->exec("CREATE TABLE IF NOT EXISTS crminternet_commissions (
            id VARCHAR(40) PRIMARY KEY,
            external_agent_id VARCHAR(40) NOT NULL,
            prospect_id VARCHAR(40) NULL,
            contract_id VARCHAR(40) NULL,
            amount DECIMAL(10,2) NOT NULL DEFAULT 0,
            basis  DECIMAL(10,2) NOT NULL DEFAULT 0,
            status ENUM('pending','paid','cancelled') NOT NULL DEFAULT 'pending',
            earned_at DATE NOT NULL,
            paid_at DATETIME NULL,
            paid_by VARCHAR(80) NULL,
            payment_ref VARCHAR(120) NULL,
            notes TEXT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_agent (external_agent_id),
            INDEX idx_status (status),
            INDEX idx_earned (earned_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    } catch (Throwable $e) {}
}
ensure_commissions($db);

function com_to_arr(array $r): array {
    return [
        'id'              => $r['id'],
        'externalAgentId' => $r['external_agent_id'],
        'agentName'       => $r['agent_name'] ?? null,
        'prospectId'      => $r['prospect_id'],
        'contractId'      => $r['contract_id'],
        'amount'          => (float)$r['amount'],
        'basis'           => (float)$r['basis'],
        'status'          => $r['status'],
        'earnedAt'        => $r['earned_at'],
        'paidAt'          => $r['paid_at'],
        'paidBy'          => $r['paid_by'],
        'paymentRef'      => $r['payment_ref'],
        'notes'           => $r['notes'],
    ];
}

if ($method === 'GET') {
    $period = $_GET['period'] ?? null;       // YYYY-MM
    $status = $_GET['status'] ?? null;
    $agent  = $_GET['agentId'] ?? null;
    $sql = "SELECT c.*, ea.full_name AS agent_name
            FROM crminternet_commissions c
            LEFT JOIN crminternet_external_agents ea ON ea.id = c.external_agent_id
            WHERE 1=1";
    $params = [];
    if ($period && preg_match('/^\d{4}-\d{2}$/', $period)) { $sql .= " AND c.earned_at LIKE :p"; $params[':p'] = $period . '%'; }
    if ($status && in_array($status, ['pending','paid','cancelled'], true)) { $sql .= " AND c.status = :s"; $params[':s'] = $status; }
    if ($agent) { $sql .= " AND c.external_agent_id = :a"; $params[':a'] = $agent; }
    $sql .= " ORDER BY c.earned_at DESC, c.id DESC LIMIT 2000";
    $st = $db->prepare($sql); $st->execute($params);
    $rows = array_map('com_to_arr', $st->fetchAll());

    // Synthèse par agent
    $sumSql = "SELECT external_agent_id, ea.full_name AS agent_name,
                      SUM(CASE WHEN c.status='pending' THEN c.amount ELSE 0 END) AS total_pending,
                      SUM(CASE WHEN c.status='paid'    THEN c.amount ELSE 0 END) AS total_paid,
                      COUNT(*) AS n
               FROM crminternet_commissions c
               LEFT JOIN crminternet_external_agents ea ON ea.id = c.external_agent_id
               WHERE 1=1";
    $sP = [];
    if ($period && preg_match('/^\d{4}-\d{2}$/', $period)) { $sumSql .= " AND c.earned_at LIKE :p"; $sP[':p'] = $period . '%'; }
    $sumSql .= " GROUP BY external_agent_id, ea.full_name ORDER BY ea.full_name";
    $sm = $db->prepare($sumSql); $sm->execute($sP);
    $summary = array_map(function($r){
        return [
            'externalAgentId' => $r['external_agent_id'],
            'agentName'       => $r['agent_name'],
            'totalPending'    => (float)$r['total_pending'],
            'totalPaid'       => (float)$r['total_paid'],
            'count'           => (int)$r['n'],
        ];
    }, $sm->fetchAll());

    ok(['commissions' => $rows, 'summary' => $summary]);
}

if ($method === 'POST' && $action === 'create') {
    require_permission($db, $me, 'hr.commissions.edit');
    $in = json_input();
    $agentId = trim($in['externalAgentId'] ?? '');
    if ($agentId === '') fail('externalAgentId requis', 422);
    $earnedAt = $in['earnedAt'] ?? date('Y-m-d');
    $basis = (float)($in['basis'] ?? 0);
    $amount = isset($in['amount']) ? (float)$in['amount'] : null;

    // Auto-calc si non fourni : rate% * basis OU fixedAmount
    if ($amount === null) {
        $a = $db->prepare("SELECT commission_rate, fixed_amount FROM crminternet_external_agents WHERE id=:id");
        $a->execute([':id' => $agentId]);
        $r = $a->fetch();
        if (!$r) fail('Agent introuvable', 404);
        $amount = (float)$r['fixed_amount'] + ($basis * (float)$r['commission_rate'] / 100.0);
    }
    $id = 'CM-' . substr(bin2hex(random_bytes(6)), 0, 10);
    $i = $db->prepare("INSERT INTO crminternet_commissions
        (id, external_agent_id, prospect_id, contract_id, amount, basis, earned_at, notes)
        VALUES (:id, :a, :p, :c, :am, :ba, :ea, :no)");
    $i->execute([
        ':id' => $id, ':a' => $agentId,
        ':p' => $in['prospectId'] ?? null,
        ':c' => $in['contractId'] ?? null,
        ':am' => $amount, ':ba' => $basis, ':ea' => $earnedAt,
        ':no' => trim($in['notes'] ?? '') ?: null,
    ]);
    ok(['id' => $id, 'amount' => $amount], 201);
}

if ($method === 'POST' && $action === 'mark_paid') {
    require_permission($db, $me, 'hr.commissions.edit');
    $in = json_input();
    $id = $in['id'] ?? '';
    if ($id === '') fail('id requis', 422);
    $u = $db->prepare("UPDATE crminternet_commissions
        SET status='paid', paid_at=NOW(), paid_by=:u, payment_ref=:r WHERE id=:id");
    $u->execute([':u' => $me['username'], ':r' => trim($in['paymentRef'] ?? '') ?: null, ':id' => $id]);
    ok(['message' => 'Marqué payé']);
}

if ($method === 'DELETE') {
    require_auth(['Administrateur']);
    $id = $_GET['id'] ?? '';
    $db->prepare("DELETE FROM crminternet_commissions WHERE id = :id")->execute([':id' => $id]);
    ok(['message' => 'Supprimé']);
}

fail('Méthode non supportée', 405);
