<?php
// =====================================================================
// CRM MVP — Agents externes (référentiel)
// =====================================================================
require_once __DIR__ . '/config.php';
$me = require_auth();
$db = (new Database())->getConnection();
$method = $_SERVER['REQUEST_METHOD'];

function ensure_external_agents(PDO $db): void {
    try {
        $db->exec("CREATE TABLE IF NOT EXISTS crminternet_external_agents (
            id VARCHAR(40) PRIMARY KEY,
            full_name VARCHAR(160) NOT NULL,
            phone VARCHAR(40) NOT NULL DEFAULT '',
            email VARCHAR(160) NOT NULL DEFAULT '',
            cin VARCHAR(40) NOT NULL DEFAULT '',
            commission_rate DECIMAL(6,2) NOT NULL DEFAULT 0.00,
            fixed_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            active TINYINT(1) NOT NULL DEFAULT 1,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            notes TEXT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    } catch (Throwable $e) {}
}
ensure_external_agents($db);

function ea_to_arr(array $r): array {
    return [
        'id'             => $r['id'],
        'fullName'       => $r['full_name'],
        'phone'          => $r['phone'],
        'email'          => $r['email'],
        'cin'            => $r['cin'],
        'commissionRate' => (float)$r['commission_rate'],
        'fixedAmount'    => (float)$r['fixed_amount'],
        'active'         => (bool)$r['active'],
        'notes'          => $r['notes'],
        'createdAt'      => $r['created_at'],
    ];
}

if ($method === 'GET') {
    $r = $db->query("SELECT * FROM crminternet_external_agents ORDER BY active DESC, full_name")->fetchAll();
    ok(['agents' => array_map('ea_to_arr', $r)]);
}

if ($method === 'POST') {
    require_permission($db, $me, 'hr.external_agents.add');
    $in = json_input();
    $name = trim($in['fullName'] ?? '');
    if ($name === '') fail('Nom requis', 422);
    $id = 'EA-' . substr(bin2hex(random_bytes(6)), 0, 10);
    $s = $db->prepare("INSERT INTO crminternet_external_agents
        (id, full_name, phone, email, cin, commission_rate, fixed_amount, active, notes)
        VALUES (:id, :n, :p, :e, :c, :cr, :fa, :a, :no)");
    $s->execute([
        ':id' => $id, ':n' => $name,
        ':p'  => trim($in['phone'] ?? ''),
        ':e'  => trim($in['email'] ?? ''),
        ':c'  => trim($in['cin'] ?? ''),
        ':cr' => (float)($in['commissionRate'] ?? 0),
        ':fa' => (float)($in['fixedAmount'] ?? 0),
        ':a'  => !empty($in['active']) ? 1 : 1,
        ':no' => trim($in['notes'] ?? '') ?: null,
    ]);
    ok(['id' => $id], 201);
}

if ($method === 'PATCH' || $method === 'PUT') {
    require_permission($db, $me, 'hr.external_agents.edit');
    $in = json_input();
    // Accept id from query string OR JSON body for consistency with other endpoints.
    $id = (string)($_GET['id'] ?? $in['id'] ?? '');
    if ($id === '') fail('id requis', 422);
    $map = [
        'fullName' => 'full_name', 'phone' => 'phone', 'email' => 'email', 'cin' => 'cin',
        'commissionRate' => 'commission_rate', 'fixedAmount' => 'fixed_amount',
        'active' => 'active', 'notes' => 'notes',
    ];
    $sets = []; $params = [':id' => $id];
    foreach ($map as $k => $col) {
        if (array_key_exists($k, $in)) {
            $sets[] = "$col = :$col";
            $params[":$col"] = ($k === 'active') ? (!empty($in[$k]) ? 1 : 0) : $in[$k];
        }
    }
    if (!$sets) fail('Aucun changement', 422);
    $sql = "UPDATE crminternet_external_agents SET " . implode(',', $sets) . " WHERE id = :id";
    $db->prepare($sql)->execute($params);
    ok(['message' => 'Mis à jour']);
}

if ($method === 'DELETE') {
    require_permission($db, $me, 'hr.external_agents.delete');
    $id = $_GET['id'] ?? '';
    if ($id === '') fail('id requis', 422);
    $db->prepare("DELETE FROM crminternet_external_agents WHERE id = :id")->execute([':id' => $id]);
    ok(['message' => 'Supprimé']);
}

fail('Méthode non supportée', 405);
