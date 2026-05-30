<?php
// CRUD de la matrice de transitions autorisées par pipeline.
// GET ?pipeline=lead -> renvoie la liste; sinon les 3.
// POST { pipeline, fromStageId, toStageId } -> ajoute
// DELETE ?id=...   -> supprime
require_once __DIR__ . '/config.php';
$me = require_auth();
$db = (new Database())->getConnection();
$method = $_SERVER['REQUEST_METHOD'];

$VALID = ['lead','opportunity','contract'];

function ensure_pipeline_transitions_runtime_schema(PDO $db): void {
    try { $db->exec("CREATE TABLE IF NOT EXISTS crminternet_pipeline_transitions (id VARCHAR(40) PRIMARY KEY, pipeline ENUM('lead','opportunity','contract') NOT NULL, from_stage_id VARCHAR(40) NOT NULL, to_stage_id VARCHAR(40) NOT NULL, UNIQUE KEY uniq_transition (pipeline, from_stage_id, to_stage_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"); } catch (Throwable $e) {}
}
ensure_pipeline_transitions_runtime_schema($db);

if ($method === 'GET') {
    $p = $_GET['pipeline'] ?? '';
    if ($p && in_array($p, $VALID, true)) {
        $s = $db->prepare('SELECT * FROM crminternet_pipeline_transitions WHERE pipeline = :p ORDER BY id');
        $s->execute([':p' => $p]);
    } else {
        $s = $db->query('SELECT * FROM crminternet_pipeline_transitions ORDER BY pipeline, id');
    }
    $rows = $s->fetchAll();
    ok(['transitions' => array_map(fn($r) => [
        'id'=>$r['id'], 'pipeline'=>$r['pipeline'],
        'fromStageId'=>$r['from_stage_id'], 'toStageId'=>$r['to_stage_id'],
    ], $rows)]);
}

require_permission($db, $me, 'pipeline.manage');

if ($method === 'POST') {
    $in = json_input();
    $p = $in['pipeline'] ?? '';
    $f = $in['fromStageId'] ?? '';
    $t = $in['toStageId'] ?? '';
    if (!in_array($p, $VALID, true)) fail('pipeline invalide', 422);
    if (!$f || !$t) fail('fromStageId/toStageId requis', 422);
    $id = 'T-' . substr(bin2hex(random_bytes(6)), 0, 10);
    try {
        $s = $db->prepare('INSERT INTO crminternet_pipeline_transitions
            (id, pipeline, from_stage_id, to_stage_id) VALUES (:id,:p,:f,:t)');
        $s->execute([':id'=>$id, ':p'=>$p, ':f'=>$f, ':t'=>$t]);
        ok(['id'=>$id], 201);
    } catch (PDOException $e) {
        if ($e->getCode() === '23000') fail('Transition déjà existante', 409);
        fail('Erreur: '.$e->getMessage(), 500);
    }
}

if ($method === 'DELETE') {
    $id = $_GET['id'] ?? '';
    if (!$id) fail('id requis', 422);
    $s = $db->prepare('DELETE FROM crminternet_pipeline_transitions WHERE id = :id');
    $s->execute([':id'=>$id]);
    ok(['deleted'=>$s->rowCount()]);
}

fail('Method not allowed', 405);
