<?php
require_once __DIR__ . '/config.php';
$me = require_auth();
require_method('GET');
$db = (new Database())->getConnection();

$cid    = $_GET['contractId']  ?? null;
$entity = $_GET['entity']      ?? null;
$eid    = $_GET['entity_id']   ?? null;
$limit  = max(1, min(500, (int)($_GET['limit'] ?? 200)));

// Permission gate: viewing a lead's full change history requires `lead.history`.
// Administrateur is always granted. Others must have the perm via role or grant.
if ($entity === 'prospect') {
    require_permission($db, $me, 'lead.history');
}

if ($cid) {
    $s = $db->prepare('SELECT * FROM crminternet_activity_log WHERE contract_id = :c ORDER BY created_at DESC LIMIT ' . $limit);
    $s->execute([':c' => $cid]);
} elseif ($entity && $eid) {
    $s = $db->prepare('SELECT * FROM crminternet_activity_log WHERE entity_type = :e AND entity_id = :id ORDER BY created_at DESC LIMIT ' . $limit);
    $s->execute([':e' => $entity, ':id' => $eid]);
} elseif ($entity) {
    $s = $db->prepare('SELECT * FROM crminternet_activity_log WHERE entity_type = :e ORDER BY created_at DESC LIMIT ' . $limit);
    $s->execute([':e' => $entity]);
} else {
    $s = $db->query('SELECT * FROM crminternet_activity_log ORDER BY created_at DESC LIMIT ' . $limit);
}
$rows = $s->fetchAll();
$out = array_map(fn($a) => [
    'id'            => $a['id'],
    'entityType'    => $a['entity_type'] ?? 'contract',
    'entityId'      => $a['entity_id']   ?? $a['contract_id'],
    'contractId'    => $a['contract_id'],
    'field'         => $a['field'],
    'previousValue' => $a['previous_value'],
    'newValue'      => $a['new_value'],
    'user'          => $a['user_username'],
    'timestamp'     => str_replace(' ', 'T', $a['created_at']) . 'Z',
], $rows);
ok(['activity' => $out]);
