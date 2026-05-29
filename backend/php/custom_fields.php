<?php
require_once __DIR__ . '/config.php';
$me = require_auth();
$db = (new Database())->getConnection();
$method = $_SERVER['REQUEST_METHOD'];
$ENTITIES = ['prospect','contract','user','opportunity',
             'guichet_sim','guichet_port','guichet_swp','guichet_divers',
             'guichet_facture_tt','guichet_facture_topnet'];
$TYPES = ['text','textarea','number','date','boolean','select','multiselect'];

function ensure_custom_fields_runtime_schema(PDO $db): void {
    try { $db->exec("CREATE TABLE IF NOT EXISTS crminternet_custom_fields (id VARCHAR(40) PRIMARY KEY, entity VARCHAR(20) NOT NULL, field_key VARCHAR(80) NOT NULL, label VARCHAR(160) NOT NULL, type VARCHAR(20) NOT NULL DEFAULT 'text', options TEXT NULL, required TINYINT(1) NOT NULL DEFAULT 0, position INT NOT NULL DEFAULT 0, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY uniq_entity_key (entity, field_key)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"); } catch (Throwable $e) {}
    try { $db->exec("ALTER TABLE crminternet_custom_fields ADD COLUMN type_id VARCHAR(40) NULL"); } catch (Throwable $e) {}
    try { $db->exec("CREATE TABLE IF NOT EXISTS crminternet_custom_field_values (id BIGINT AUTO_INCREMENT PRIMARY KEY, entity VARCHAR(20) NOT NULL, entity_id VARCHAR(40) NOT NULL, field_key VARCHAR(80) NOT NULL, value TEXT NULL, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, UNIQUE KEY uniq_entity_field (entity, entity_id, field_key), INDEX idx_entity (entity, entity_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"); } catch (Throwable $e) {}
}
ensure_custom_fields_runtime_schema($db);

function row_to_field(array $r): array {
    return [
        'id'       => $r['id'],
        'entity'   => $r['entity'],
        'key'      => $r['field_key'],
        'label'    => $r['label'],
        'type'     => $r['type'],
        'options'  => $r['options'] ? json_decode($r['options'], true) : [],
        'required' => (bool)$r['required'],
        'position' => (int)$r['position'],
        'typeId'   => $r['type_id'] ?? null,
    ];
}

if ($method === 'GET') {
    $entity = $_GET['entity'] ?? null;
    if ($entity && !in_array($entity, $ENTITIES, true)) fail('entity invalide', 422);
    // type_id filter:
    //   absent           → renvoie TOUTES les définitions (gestion admin)
    //   "" / "null"      → uniquement les champs PARTAGÉS (type_id IS NULL)
    //   "<id>"           → champs partagés (NULL) + champs spécifiques au type
    //   ?scope=type_only → uniquement le type donné, pas les partagés
    $typeIdParam = array_key_exists('type_id', $_GET) ? (string)$_GET['type_id'] : null;
    $scope       = (string)($_GET['scope'] ?? 'inherit');
    $where = []; $params = [];
    if ($entity) { $where[] = 'entity = :e'; $params[':e'] = $entity; }
    if ($typeIdParam !== null) {
        if ($typeIdParam === '' || strtolower($typeIdParam) === 'null') {
            $where[] = 'type_id IS NULL';
        } elseif ($scope === 'type_only') {
            $where[] = 'type_id = :tid';
            $params[':tid'] = $typeIdParam;
        } else {
            $where[] = '(type_id IS NULL OR type_id = :tid)';
            $params[':tid'] = $typeIdParam;
        }
    }
    $sql = 'SELECT * FROM crminternet_custom_fields';
    if ($where) $sql .= ' WHERE ' . implode(' AND ', $where);
    $sql .= ' ORDER BY entity, position, id';
    $s = $db->prepare($sql);
    $s->execute($params);
    ok(['fields' => array_map('row_to_field', $s->fetchAll())]);
}

if ($method === 'POST') {
    require_auth(['Administrateur','Manager']);
    $in = json_input();
    $entity = $in['entity'] ?? '';
    $label  = trim($in['label'] ?? '');
    $type   = $in['type'] ?? 'text';
    if (!in_array($entity, $ENTITIES, true)) fail('entity invalide', 422);
    if ($label === '') fail('label requis', 422);
    if (!in_array($type, $TYPES, true)) fail('type invalide', 422);
    $key = $in['key'] ?? preg_replace('/[^a-z0-9_]/', '_', strtolower($label));
    $key = trim($key, '_');
    if ($key === '') fail('key invalide', 422);
    $opts = isset($in['options']) && is_array($in['options']) ? json_encode(array_values($in['options'])) : null;
    $req  = !empty($in['required']) ? 1 : 0;
    $pos  = (int)($in['position'] ?? 0);
    // type_id : NULL = champ partagé, sinon scopé à un prospect_type
    $typeId = isset($in['typeId']) && $in['typeId'] !== '' ? (string)$in['typeId'] : null;
    $id   = 'F-' . substr(bin2hex(random_bytes(6)), 0, 10);
    try {
        $s = $db->prepare('INSERT INTO crminternet_custom_fields (id,entity,field_key,label,type,options,required,position,type_id)
                           VALUES (:id,:e,:k,:l,:t,:o,:r,:p,:ti)');
        $s->execute([':id'=>$id, ':e'=>$entity, ':k'=>$key, ':l'=>$label, ':t'=>$type,
                     ':o'=>$opts, ':r'=>$req, ':p'=>$pos, ':ti'=>$typeId]);
        ok(['field' => ['id'=>$id,'entity'=>$entity,'key'=>$key,'label'=>$label,'type'=>$type,
                        'options'=>$opts?json_decode($opts,true):[],'required'=>(bool)$req,'position'=>$pos,
                        'typeId'=>$typeId]], 201);
    } catch (PDOException $e) {
        if ($e->getCode() === '23000') fail('Une clé identique existe déjà pour cette entité', 409);
        fail('Erreur: ' . $e->getMessage(), 500);
    }
}

if ($method === 'PUT' || $method === 'PATCH') {
    require_auth(['Administrateur','Manager']);
    $in = json_input();
    $id = $in['id'] ?? ($_GET['id'] ?? '');
    if (!$id) fail('id requis', 422);
    $sets = []; $params = [':id' => $id];
    foreach (['label'=>'label','required'=>'required','position'=>'position','type'=>'type','options'=>'options','typeId'=>'type_id'] as $k=>$col) {
        if (!array_key_exists($k, $in)) continue;
        $v = $in[$k];
        if ($k === 'type' && !in_array($v, $TYPES, true)) continue;
        if ($k === 'required') $v = $v ? 1 : 0;
        if ($k === 'options')  $v = is_array($v) ? json_encode(array_values($v)) : null;
        if ($k === 'position') $v = (int)$v;
        if ($k === 'typeId')   $v = ($v === '' || $v === null) ? null : (string)$v;
        $sets[] = "$col = :$k"; $params[":$k"] = $v;
    }
    if (!$sets) fail('Aucun champ à mettre à jour', 422);
    $sql = 'UPDATE crminternet_custom_fields SET ' . implode(', ', $sets) . ' WHERE id = :id';
    $db->prepare($sql)->execute($params);
    ok(['message' => 'Champ mis à jour']);
}

if ($method === 'DELETE') {
    require_auth(['Administrateur']);
    $id = $_GET['id'] ?? '';
    if (!$id) fail('id requis', 422);
    $db->beginTransaction();
    try {
        // also drop stored values for that key
        $f = $db->prepare('SELECT entity, field_key FROM crminternet_custom_fields WHERE id = :id');
        $f->execute([':id'=>$id]);
        $row = $f->fetch();
        if ($row) {
            $del = $db->prepare('DELETE FROM crminternet_custom_field_values WHERE entity = :e AND field_key = :k');
            $del->execute([':e'=>$row['entity'], ':k'=>$row['field_key']]);
        }
        $d = $db->prepare('DELETE FROM crminternet_custom_fields WHERE id = :id');
        $d->execute([':id'=>$id]);
        $db->commit();
        ok(['deleted' => $d->rowCount()]);
    } catch (Throwable $e) {
        $db->rollBack();
        fail('Erreur: ' . $e->getMessage(), 500);
    }
}

fail('Method not allowed', 405);
