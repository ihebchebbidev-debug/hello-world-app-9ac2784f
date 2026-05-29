<?php
require_once __DIR__ . '/config.php';
$me = require_auth();
$db = (new Database())->getConnection();
$method = $_SERVER['REQUEST_METHOD'];

function ensure_contract_stages_runtime_schema(PDO $db): void {
    try { $db->exec("CREATE TABLE IF NOT EXISTS crminternet_contract_stages (id VARCHAR(40) PRIMARY KEY, name VARCHAR(80) NOT NULL UNIQUE, color VARCHAR(20) NOT NULL DEFAULT 'muted', position INT NOT NULL DEFAULT 0) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"); } catch (Throwable $e) {}
    foreach ([
        "ALTER TABLE crminternet_contract_stages ADD COLUMN is_initial TINYINT(1) NOT NULL DEFAULT 0",
        "ALTER TABLE crminternet_contract_stages ADD COLUMN is_won TINYINT(1) NOT NULL DEFAULT 0",
        "ALTER TABLE crminternet_contract_stages ADD COLUMN is_lost TINYINT(1) NOT NULL DEFAULT 0",
        "ALTER TABLE crminternet_contract_stages ADD COLUMN auto_action VARCHAR(40) NOT NULL DEFAULT 'none'",
    ] as $sql) { try { $db->exec($sql); } catch (Throwable $e) {} }
}
ensure_contract_stages_runtime_schema($db);

function row_to_cstage(array $r): array {
    return [
        'id'         => $r['id'],
        'name'       => $r['name'],
        'color'      => $r['color'],
        'position'   => (int)$r['position'],
        'isInitial'  => !empty($r['is_initial']),
        'isWon'      => !empty($r['is_won']),
        'isLost'     => !empty($r['is_lost']),
        'autoAction' => $r['auto_action'] ?? 'none',
    ];
}

if ($method === 'GET') {
    $rows = $db->query('SELECT * FROM crminternet_contract_stages ORDER BY position, id')->fetchAll();
    ok(['stages' => array_map('row_to_cstage', $rows)]);
}

require_permission($db, $me, 'contract.stages');

if ($method === 'POST') {
    $in = json_input();
    $name = trim($in['name'] ?? '');
    if ($name === '') fail('name requis', 422);
    $id = 'CS-' . substr(bin2hex(random_bytes(6)), 0, 8);
    $auto = $in['autoAction'] ?? 'none';
    if (!in_array($auto, ['none','revert_opportunity'], true)) $auto = 'none';
    try {
        $s = $db->prepare('INSERT INTO crminternet_contract_stages
            (id,name,color,position,is_initial,is_won,is_lost,auto_action)
            VALUES (:id,:n,:c,:p,:i,:w,:l,:a)');
        $s->execute([
            ':id'=>$id, ':n'=>$name,
            ':c'=>$in['color'] ?? 'muted', ':p'=>(int)($in['position'] ?? 0),
            ':i'=> !empty($in['isInitial']) ? 1 : 0,
            ':w'=> !empty($in['isWon']) ? 1 : 0,
            ':l'=> !empty($in['isLost']) ? 1 : 0,
            ':a'=> $auto,
        ]);
        ok(['id'=>$id], 201);
    } catch (PDOException $e) {
        if ($e->getCode() === '23000') fail('Étape déjà existante', 409);
        fail('Erreur: '.$e->getMessage(), 500);
    }
}

if ($method === 'PUT' || $method === 'PATCH') {
    $in = json_input();
    $id = $in['id'] ?? ($_GET['id'] ?? '');
    if (!$id) fail('id requis', 422);
    $map = [
        'name'=>'name','color'=>'color','position'=>'position',
        'isInitial'=>'is_initial','isWon'=>'is_won','isLost'=>'is_lost',
        'autoAction'=>'auto_action',
    ];
    $sets = []; $params = [':id'=>$id];
    foreach ($map as $k=>$col) {
        if (!array_key_exists($k,$in)) continue;
        $v = $in[$k];
        if ($k==='position') $v = (int)$v;
        elseif (in_array($k, ['isInitial','isWon','isLost'], true)) $v = $v ? 1 : 0;
        elseif ($k==='autoAction' && !in_array($v, ['none','revert_opportunity'], true)) continue;
        $sets[] = "$col = :$k"; $params[":$k"] = $v;
    }
    if (!$sets) fail('Aucun champ', 422);
    $db->prepare('UPDATE crminternet_contract_stages SET '.implode(',', $sets).' WHERE id = :id')
       ->execute($params);
    ok(['message'=>'Étape mise à jour']);
}

if ($method === 'DELETE') {
    $id = $_GET['id'] ?? '';
    if (!$id) fail('id requis', 422);
    $s = $db->prepare('DELETE FROM crminternet_contract_stages WHERE id = :id');
    $s->execute([':id'=>$id]);
    ok(['deleted'=>$s->rowCount()]);
}

fail('Method not allowed', 405);
