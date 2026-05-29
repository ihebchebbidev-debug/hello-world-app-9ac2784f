<?php
// =====================================================================
// Guichet — Entités (TTshop / Franchise Akouda / Mahdia / ...)
// =====================================================================
require_once __DIR__ . '/config.php';
$me = require_auth();
$db = (new Database())->getConnection();
$method = $_SERVER['REQUEST_METHOD'];

// Best-effort runtime schema (idempotent) — pour les déploiements partiels.
try {
    $db->exec("CREATE TABLE IF NOT EXISTS crminternet_guichet_entities (
        id VARCHAR(40) PRIMARY KEY,
        name VARCHAR(120) NOT NULL UNIQUE,
        type ENUM('ttshop','franchise','autre') NOT NULL DEFAULT 'ttshop',
        city VARCHAR(120) NULL,
        active TINYINT(1) NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
} catch (Throwable $e) {}

function row_to_entity(array $r): array {
    return [
        'id'        => $r['id'],
        'name'      => $r['name'],
        'type'      => $r['type'] ?? 'ttshop',
        'city'      => $r['city'] ?? '',
        'active'    => !empty($r['active']),
        'createdAt' => $r['created_at'] ?? null,
    ];
}

if ($method === 'GET') {
    $only = !empty($_GET['active']);
    // SECURITY : un agent rattaché à une franchise ne voit QUE son entité.
    $role = $me['role'] ?? '';
    $isAdmin = ($role === 'Administrateur' || $role === 'Manager');
    $canAll = $isAdmin || (function_exists('user_has_permission') && user_has_permission($db, $me, 'guichet.read_all'));
    $assigned = null;
    if (!$canAll) {
        try {
            $st = $db->prepare("SELECT guichet_entity_id FROM crminternet_users WHERE id = :id");
            $st->execute([':id' => trim((string)($me['sub'] ?? $me['id'] ?? ''))]);
            $v = $st->fetchColumn();
            if ($v) $assigned = (string)$v;
        } catch (Throwable $e) {}
    }
    $where = []; $params = [];
    if ($only)     { $where[] = 'active = 1'; }
    if ($assigned) { $where[] = 'id = :assigned'; $params[':assigned'] = $assigned; }
    $sql = 'SELECT * FROM crminternet_guichet_entities';
    if ($where) $sql .= ' WHERE ' . implode(' AND ', $where);
    $sql .= ' ORDER BY name';
    $s = $db->prepare($sql); $s->execute($params);
    ok(['entities' => array_map('row_to_entity', $s->fetchAll())]);
}

if ($method === 'POST') {
    require_permission($db, $me, 'guichet.manage_entities');
    $in   = json_input();
    $name = trim((string)($in['name'] ?? ''));
    if ($name === '') fail('name requis', 422);
    $id = 'GE-' . substr(bin2hex(random_bytes(6)), 0, 10);
    try {
        $s = $db->prepare('INSERT INTO crminternet_guichet_entities (id,name,type,city,active)
                           VALUES (:id,:n,:t,:c,:a)');
        $s->execute([
            ':id' => $id,
            ':n'  => $name,
            ':t'  => in_array(($in['type'] ?? 'ttshop'), ['ttshop','franchise','autre'], true) ? $in['type'] : 'ttshop',
            ':c'  => trim((string)($in['city'] ?? '')),
            ':a'  => empty($in['active']) ? 0 : 1,
        ]);
        audit_log($db, $me, 'guichet_entity.create', 'guichet_entity', $id, ['name' => $name]);
        ok(['entity' => row_to_entity([
            'id' => $id, 'name' => $name,
            'type' => $in['type'] ?? 'ttshop',
            'city' => $in['city'] ?? '', 'active' => $in['active'] ?? 1,
            'created_at' => date('Y-m-d H:i:s'),
        ])], 201);
    } catch (PDOException $e) {
        if ($e->getCode() === '23000') fail('Nom déjà utilisé', 409);
        fail('Erreur: ' . $e->getMessage(), 500);
    }
}

if ($method === 'PATCH' || $method === 'PUT') {
    require_permission($db, $me, 'guichet.manage_entities');
    $in = json_input();
    $id = (string)($in['id'] ?? ($_GET['id'] ?? ''));
    if ($id === '') fail('id requis', 422);
    $sets = []; $params = [':id' => $id];
    foreach (['name'=>'name','type'=>'type','city'=>'city','active'=>'active'] as $k => $col) {
        if (!array_key_exists($k, $in)) continue;
        $v = $in[$k];
        if ($k === 'active') $v = $v ? 1 : 0;
        if ($k === 'type' && !in_array($v, ['ttshop','franchise','autre'], true)) continue;
        $sets[] = "$col = :$k"; $params[":$k"] = $v;
    }
    if (!$sets) fail('Aucun champ', 422);
    $db->prepare('UPDATE crminternet_guichet_entities SET ' . implode(', ', $sets) . ' WHERE id = :id')
       ->execute($params);
    audit_log($db, $me, 'guichet_entity.update', 'guichet_entity', $id);
    ok(['updated' => 1]);
}

if ($method === 'DELETE') {
    require_permission($db, $me, 'guichet.manage_entities');
    $id = (string)($_GET['id'] ?? '');
    if ($id === '') fail('id requis', 422);
    $used = (int)$db->query("SELECT COUNT(*) FROM crminternet_guichet_dossiers WHERE entity_id = " . $db->quote($id))->fetchColumn();
    if ($used > 0) fail("Entité utilisée par $used dossier(s) — désactivez-la plutôt", 409);
    $db->prepare('DELETE FROM crminternet_guichet_entities WHERE id = :id')->execute([':id' => $id]);
    audit_log($db, $me, 'guichet_entity.delete', 'guichet_entity', $id);
    ok(['deleted' => 1]);
}

fail('Method not allowed', 405);