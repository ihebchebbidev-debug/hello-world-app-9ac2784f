<?php
// =====================================================================
// CRM MVP — Suivi commercial : actions horodatées par lead
// (appels, visites, relances, notes). Cf. cahier des charges §4.2.
// =====================================================================
require_once __DIR__ . '/config.php';

$me = require_auth();
$db = (new Database())->getConnection();
$method = $_SERVER['REQUEST_METHOD'];

// Auto-création idempotente de la table (style ensure_must_change_column).
function ensure_lead_actions_table(PDO $db): void {
    try {
        $db->exec("CREATE TABLE IF NOT EXISTS crminternet_lead_actions (
            id VARCHAR(32) PRIMARY KEY,
            prospect_id VARCHAR(32) NOT NULL,
            agent_username VARCHAR(64) NOT NULL,
            type ENUM('appel','visite','relance','note','terrain','reseaux','technicien') NOT NULL DEFAULT 'note',
            comment TEXT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_prospect (prospect_id),
            INDEX idx_created  (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        // Si la table existait déjà avec l'ancien ENUM, on l'étend
        try {
          $db->exec("ALTER TABLE crminternet_lead_actions
            MODIFY COLUMN type ENUM('appel','visite','relance','note','terrain','reseaux','technicien')
            NOT NULL DEFAULT 'note'");
        } catch (Throwable $e) {}
    } catch (Throwable $e) { /* ignore */ }
}
ensure_lead_actions_table($db);

function action_to_arr(array $r): array {
    return [
        'id'           => $r['id'],
        'prospectId'   => $r['prospect_id'],
        'agentUsername'=> $r['agent_username'],
        'type'         => $r['type'],
        'comment'      => $r['comment'],
        'createdAt'    => $r['created_at'],
    ];
}

if ($method === 'GET') {
    $prospectId = $_GET['prospectId'] ?? '';
    if ($prospectId === '') fail('prospectId requis', 422);
    $s = $db->prepare('SELECT * FROM crminternet_lead_actions
                       WHERE prospect_id = :p ORDER BY created_at DESC LIMIT 200');
    $s->execute([':p' => $prospectId]);
    ok(['actions' => array_map('action_to_arr', $s->fetchAll())]);
}

if ($method === 'POST') {
    $in = json_input();
    $prospectId = trim($in['prospectId'] ?? '');
    $type = $in['type'] ?? 'note';
    $comment = trim($in['comment'] ?? '');
    if ($prospectId === '') fail('prospectId requis', 422);
    if (!in_array($type, ['appel','visite','relance','note','terrain','reseaux','technicien'], true)) fail('type invalide', 422);
    if ($comment === '' && $type === 'note') fail('Commentaire requis pour une note', 422);

    $id = 'LA-' . substr(bin2hex(random_bytes(6)), 0, 10);
    try {
        $s = $db->prepare('INSERT INTO crminternet_lead_actions
            (id, prospect_id, agent_username, type, comment)
            VALUES (:id, :p, :a, :t, :c)');
        $s->execute([
            ':id' => $id, ':p' => $prospectId,
            ':a'  => $me['username'], ':t' => $type,
            ':c'  => $comment !== '' ? $comment : null,
        ]);
        audit_log($db, $me, 'lead_action.create', 'prospect', $prospectId, ['type' => $type, 'actionId' => $id]);
        ok(['id' => $id], 201);
    } catch (Throwable $e) {
        fail('Insertion échouée: ' . $e->getMessage(), 500);
    }
}

if ($method === 'DELETE') {
    $id = $_GET['id'] ?? '';
    if ($id === '') fail('id requis', 422);
    // Seul l'auteur ou un Admin/Manager peut supprimer
    $s = $db->prepare('SELECT agent_username FROM crminternet_lead_actions WHERE id=:id LIMIT 1');
    $s->execute([':id' => $id]);
    $row = $s->fetch();
    if (!$row) fail('introuvable', 404);
    $isAdmin = in_array($me['role'] ?? '', ['Administrateur','Manager'], true);
    if (!$isAdmin && $row['agent_username'] !== $me['username']) fail('Forbidden', 403);
    $db->prepare('DELETE FROM crminternet_lead_actions WHERE id=:id')->execute([':id' => $id]);
    audit_log($db, $me, 'lead_action.delete', 'prospect', $id);
    ok(['deleted' => 1]);
}

fail('Method not allowed', 405);
