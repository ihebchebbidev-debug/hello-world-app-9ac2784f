<?php
// =====================================================================
// Prospect / Opportunity / Contract TYPES (campagnes, catégories…)
// CRUD réservé Admin/Manager. Lecture pour tous (selon prospect_type.view).
// =====================================================================
require_once __DIR__ . '/config.php';
$me = require_auth();
$db = (new Database())->getConnection();
$method = $_SERVER['REQUEST_METHOD'];

function row_to_type(array $r): array {
    return [
        'id'          => $r['id'],
        'name'        => $r['name'],
        'description' => $r['description'] ?? '',
        'color'       => $r['color'] ?? 'primary',
        'position'    => (int)($r['position'] ?? 100),
        'active'      => !empty($r['active']),
        'createdAt'   => $r['created_at'] ?? null,
    ];
}

if ($method === 'GET') {
    // Lecture ouverte à tout utilisateur authentifié : la liste des types est
    // requise pour rendre le filtre "Par type" du sidebar et les sélecteurs
    // de type dans les formulaires (sinon les agents ne voient pas le menu).
    $onlyActive = !empty($_GET['active']);
    $sql = 'SELECT * FROM crminternet_prospect_types';
    if ($onlyActive) $sql .= ' WHERE active = 1';
    $sql .= ' ORDER BY position, name';
    $rows = $db->query($sql)->fetchAll();
    ok(['types' => array_map('row_to_type', $rows)]);
}

if ($method === 'POST') {
    require_permission($db, $me, 'prospect_type.edit');
    $in = json_input();
    $name = trim((string)($in['name'] ?? ''));
    if ($name === '') fail('name requis', 422);
    $id = 'PT-' . substr(bin2hex(random_bytes(6)), 0, 10);
    try {
        $s = $db->prepare('INSERT INTO crminternet_prospect_types
            (id, name, description, color, position, active)
            VALUES (:id,:n,:d,:c,:p,:a)');
        $s->execute([
            ':id' => $id, ':n' => $name,
            ':d' => trim((string)($in['description'] ?? '')),
            ':c' => trim((string)($in['color'] ?? 'primary')),
            ':p' => (int)($in['position'] ?? 100),
            ':a' => empty($in['active']) ? 0 : 1,
        ]);
        audit_log($db, $me, 'prospect_type.create', 'prospect_type', $id, ['name' => $name]);
        ok(['type' => row_to_type([
            'id' => $id, 'name' => $name,
            'description' => (string)($in['description'] ?? ''),
            'color' => (string)($in['color'] ?? 'primary'),
            'position' => (int)($in['position'] ?? 100),
            'active' => empty($in['active']) ? 0 : 1,
            'created_at' => date('Y-m-d H:i:s'),
        ])], 201);
    } catch (PDOException $e) {
        if ($e->getCode() === '23000') fail('Un type avec ce nom existe déjà', 409);
        fail('Erreur: ' . $e->getMessage(), 500);
    }
}

if ($method === 'PATCH' || $method === 'PUT') {
    require_permission($db, $me, 'prospect_type.edit');
    $in = json_input();
    $id = (string)($in['id'] ?? ($_GET['id'] ?? ''));
    if ($id === '') fail('id requis', 422);
    $map = [
        'name' => 'name', 'description' => 'description', 'color' => 'color',
        'position' => 'position', 'active' => 'active',
    ];
    $sets = []; $params = [':id' => $id];
    foreach ($map as $k => $col) {
        if (!array_key_exists($k, $in)) continue;
        $v = $in[$k];
        if ($k === 'active')   $v = $v ? 1 : 0;
        if ($k === 'position') $v = (int)$v;
        $sets[] = "$col = :$k"; $params[":$k"] = $v;
    }
    if (!$sets) fail('Aucun champ', 422);
    try {
        $db->prepare('UPDATE crminternet_prospect_types SET ' . implode(', ', $sets) . ' WHERE id = :id')
           ->execute($params);
        audit_log($db, $me, 'prospect_type.update', 'prospect_type', $id);
        ok(['message' => 'Type mis à jour']);
    } catch (PDOException $e) {
        if ($e->getCode() === '23000') fail('Un type avec ce nom existe déjà', 409);
        fail('Erreur: ' . $e->getMessage(), 500);
    }
}

if ($method === 'DELETE') {
    require_permission($db, $me, 'prospect_type.delete');
    $id = (string)($_GET['id'] ?? '');
    if ($id === '') fail('id requis', 422);
    if ($id === 'PT-DEFAULT') fail('Le type par défaut ne peut pas être supprimé', 409);
    // Vérifier qu'aucun prospect/opportunity/contract n'utilise ce type
    $used = (int)$db->query("SELECT
        (SELECT COUNT(*) FROM crminternet_prospects     WHERE type_id = " . $db->quote($id) . ") +
        (SELECT COUNT(*) FROM crminternet_opportunities WHERE type_id = " . $db->quote($id) . ") +
        (SELECT COUNT(*) FROM crminternet_contracts     WHERE type_id = " . $db->quote($id) . ")
    ")->fetchColumn();
    if ($used > 0) fail("Type utilisé par $used enregistrement(s) — désactivez-le plutôt", 409);

    // Supprimer aussi les définitions de champs personnalisés rattachées à ce type
    $db->prepare('DELETE FROM crminternet_custom_fields WHERE type_id = :id')->execute([':id' => $id]);
    $db->prepare('DELETE FROM crminternet_prospect_types WHERE id = :id')->execute([':id' => $id]);
    audit_log($db, $me, 'prospect_type.delete', 'prospect_type', $id);
    ok(['deleted' => 1]);
}

fail('Method not allowed', 405);
