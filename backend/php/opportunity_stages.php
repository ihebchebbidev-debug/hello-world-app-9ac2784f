<?php
require_once __DIR__ . '/config.php';
$me = require_auth();
$db = (new Database())->getConnection();
$method = $_SERVER['REQUEST_METHOD'];

function ensure_opportunity_stages_schema(PDO $db): void {
    try {
        $db->exec("CREATE TABLE IF NOT EXISTS crminternet_opportunity_stages (
            id          VARCHAR(40)  PRIMARY KEY,
            name        VARCHAR(80)  NOT NULL UNIQUE,
            color       VARCHAR(20)  NOT NULL DEFAULT 'muted',
            position    INT          NOT NULL DEFAULT 0,
            is_initial  TINYINT(1)   NOT NULL DEFAULT 0,
            is_won      TINYINT(1)   NOT NULL DEFAULT 0,
            is_lost     TINYINT(1)   NOT NULL DEFAULT 0,
            auto_action VARCHAR(40)  NOT NULL DEFAULT 'none'
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    } catch (Throwable $e) {}

    // Idempotent column additions for servers that created the table earlier
    foreach ([
        "ALTER TABLE crminternet_opportunity_stages ADD COLUMN is_initial  TINYINT(1) NOT NULL DEFAULT 0",
        "ALTER TABLE crminternet_opportunity_stages ADD COLUMN is_won      TINYINT(1) NOT NULL DEFAULT 0",
        "ALTER TABLE crminternet_opportunity_stages ADD COLUMN is_lost     TINYINT(1) NOT NULL DEFAULT 0",
        "ALTER TABLE crminternet_opportunity_stages ADD COLUMN auto_action VARCHAR(40) NOT NULL DEFAULT 'none'",
    ] as $sql) {
        try { $db->exec($sql); } catch (Throwable $e) {}
    }

    // Seed default stages if the table is empty
    try {
        $count = (int)$db->query('SELECT COUNT(*) FROM crminternet_opportunity_stages')->fetchColumn();
        if ($count === 0) {
            $ins = $db->prepare('INSERT IGNORE INTO crminternet_opportunity_stages
                (id, name, color, position, is_initial, is_won, is_lost, auto_action) VALUES
                (:id, :n, :c, :p, :i, :w, :l, :a)');
            $defaults = [
                ['OS-default-01', 'Découverte',   'info',        0, 1, 0, 0, 'none'],
                ['OS-default-02', 'Qualification', 'primary',    1, 0, 0, 0, 'none'],
                ['OS-default-03', 'Proposition',  'warning',     2, 0, 0, 0, 'none'],
                ['OS-default-04', 'Négociation',  'chart-3',     3, 0, 0, 0, 'none'],
                ['OS-default-05', 'Signature',    'success',     4, 0, 1, 0, 'convert_contract'],
                ['OS-default-06', 'Perdue',       'destructive', 5, 0, 0, 1, 'revert_lead'],
            ];
            foreach ($defaults as $d) {
                $ins->execute([
                    ':id' => $d[0], ':n' => $d[1], ':c' => $d[2], ':p' => $d[3],
                    ':i'  => $d[4], ':w' => $d[5], ':l' => $d[6], ':a' => $d[7],
                ]);
            }
        }
    } catch (Throwable $e) {}
}
ensure_opportunity_stages_schema($db);

function row_to_ostage(array $r): array {
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
    $rows = $db->query('SELECT * FROM crminternet_opportunity_stages ORDER BY position, id')->fetchAll();
    ok(['stages' => array_map('row_to_ostage', $rows)]);
}

require_permission($db, $me, 'opportunity.stages');

if ($method === 'POST') {
    $in = json_input();
    $name = trim($in['name'] ?? '');
    if ($name === '') fail('name requis', 422);
    $id = 'OS-' . substr(bin2hex(random_bytes(6)), 0, 8);
    $auto = $in['autoAction'] ?? 'none';
    if (!in_array($auto, ['none', 'convert_contract', 'revert_lead'], true)) $auto = 'none';
    try {
        $s = $db->prepare('INSERT INTO crminternet_opportunity_stages
            (id, name, color, position, is_initial, is_won, is_lost, auto_action)
            VALUES (:id, :n, :c, :p, :i, :w, :l, :a)');
        $s->execute([
            ':id' => $id,
            ':n'  => $name,
            ':c'  => $in['color']    ?? 'muted',
            ':p'  => (int)($in['position'] ?? 0),
            ':i'  => !empty($in['isInitial']) ? 1 : 0,
            ':w'  => !empty($in['isWon'])     ? 1 : 0,
            ':l'  => !empty($in['isLost'])    ? 1 : 0,
            ':a'  => $auto,
        ]);
        ok(['id' => $id], 201);
    } catch (PDOException $e) {
        if ($e->getCode() === '23000') fail('Étape déjà existante', 409);
        fail('Erreur: ' . $e->getMessage(), 500);
    }
}

if ($method === 'PUT' || $method === 'PATCH') {
    $in = json_input();
    $id = $in['id'] ?? ($_GET['id'] ?? '');
    if (!$id) fail('id requis', 422);
    $map = [
        'name'       => 'name',
        'color'      => 'color',
        'position'   => 'position',
        'isInitial'  => 'is_initial',
        'isWon'      => 'is_won',
        'isLost'     => 'is_lost',
        'autoAction' => 'auto_action',
    ];
    $sets = []; $params = [':id' => $id];
    foreach ($map as $k => $col) {
        if (!array_key_exists($k, $in)) continue;
        $v = $in[$k];
        if ($k === 'position') {
            $v = (int)$v;
        } elseif (in_array($k, ['isInitial', 'isWon', 'isLost'], true)) {
            $v = $v ? 1 : 0;
        } elseif ($k === 'autoAction' && !in_array($v, ['none', 'convert_contract', 'revert_lead'], true)) {
            continue;
        }
        $sets[] = "$col = :$k";
        $params[":$k"] = $v;
    }
    if (!$sets) fail('Aucun champ à mettre à jour', 422);
    $db->prepare('UPDATE crminternet_opportunity_stages SET ' . implode(', ', $sets) . ' WHERE id = :id')
       ->execute($params);
    ok(['message' => 'Étape mise à jour']);
}

if ($method === 'DELETE') {
    $id = $_GET['id'] ?? '';
    if (!$id) fail('id requis', 422);
    $s = $db->prepare('DELETE FROM crminternet_opportunity_stages WHERE id = :id');
    $s->execute([':id' => $id]);
    ok(['deleted' => $s->rowCount()]);
}

fail('Method not allowed', 405);
