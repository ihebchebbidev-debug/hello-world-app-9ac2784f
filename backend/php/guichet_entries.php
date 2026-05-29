<?php
// =====================================================================
// Guichet — CRUD enfants individuels (édition après création).
// SECURITY : Verrouillage entité — un agent rattaché à une franchise
// (guichet_entity_id) ne peut JAMAIS lire/créer/modifier/supprimer une
// entry rattachée à un dossier d'une autre entité.
// =====================================================================
require_once __DIR__ . '/config.php';
$me = require_auth();
$db = (new Database())->getConnection();
$method = $_SERVER['REQUEST_METHOD'];
$ENTRY_TYPES = ['sim','port','swp','divers','facture_tt','facture_topnet'];

function ge_auth_uid(array $me): string {
    return trim((string)($me['sub'] ?? $me['id'] ?? ''));
}
function ge_can_view_all(PDO $db, array $me): bool {
    if (function_exists('user_has_permission')) return user_has_permission($db, $me, 'guichet.read_all');
    return ($me['role'] ?? '') === 'Administrateur';
}
function ge_user_entity(PDO $db, array $me): ?string {
    $uid = ge_auth_uid($me);
    if ($uid === '') return null;
    try {
        $st = $db->prepare("SELECT guichet_entity_id FROM crminternet_users WHERE id = :id");
        $st->execute([':id' => $uid]);
        $v = $st->fetchColumn();
        return $v ? (string)$v : null;
    } catch (Throwable $e) { return null; }
}
function ge_dossier_entity(PDO $db, string $dossierId): ?string {
    $st = $db->prepare("SELECT entity_id FROM crminternet_guichet_dossiers WHERE id = :id");
    $st->execute([':id' => $dossierId]);
    $v = $st->fetchColumn();
    return $v ? (string)$v : null;
}
/** Vérifie que l'utilisateur a accès au dossier (entité assignée). */
function ge_assert_dossier_access(PDO $db, array $me, string $dossierId): void {
    $role = $me['role'] ?? '';
    $isAdmin = ($role === 'Administrateur' || $role === 'Manager');
    if ($isAdmin || ge_can_view_all($db, $me)) return;
    $assigned = ge_user_entity($db, $me);
    $st = $db->prepare("SELECT entity_id, agent_id FROM crminternet_guichet_dossiers WHERE id = :id");
    $st->execute([':id' => $dossierId]);
    $d = $st->fetch();
    if (!$d) fail('Dossier introuvable', 404);
    if ($assigned) {
        if (($d['entity_id'] ?? '') !== $assigned) fail('Accès refusé (entité)', 403);
        return;
    }
    if (($d['agent_id'] ?? '') !== ge_auth_uid($me)) fail('Accès refusé', 403);
}
/** Récupère l'entité du dossier d'une entry existante. */
function ge_entry_dossier(PDO $db, string $entryId): ?string {
    $st = $db->prepare("SELECT dossier_id FROM crminternet_guichet_entries WHERE id = :id");
    $st->execute([':id' => $entryId]);
    $v = $st->fetchColumn();
    return $v ? (string)$v : null;
}

/** Vrai si l'entry (ou son dossier parent) est validé. */
function ge_entry_is_validated(PDO $db, string $entryId): bool {
    $st = $db->prepare("SELECT e.status AS es, d.status AS ds
                          FROM crminternet_guichet_entries e
                          LEFT JOIN crminternet_guichet_dossiers d ON d.id = e.dossier_id
                         WHERE e.id = :id");
    $st->execute([':id' => $entryId]);
    $r = $st->fetch();
    if (!$r) return false;
    return ($r['es'] ?? '') === 'valide' || ($r['ds'] ?? '') === 'valide';
}
function ge_dossier_is_validated(PDO $db, string $dossierId): bool {
    $st = $db->prepare("SELECT status FROM crminternet_guichet_dossiers WHERE id = :id");
    $st->execute([':id' => $dossierId]);
    return ((string)$st->fetchColumn()) === 'valide';
}
function ge_require_validated_edit(PDO $db, array $me): void {
    if (($me['role'] ?? '') === 'Administrateur') return;
    if (function_exists('user_has_permission') && user_has_permission($db, $me, 'guichet.edit_validated')) return;
    fail('Élément validé : permission « guichet.edit_validated » requise', 403);
}

if ($method === 'POST') {
    require_permission($db, $me, 'guichet.edit');
    $in = json_input();
    $dossier = (string)($in['dossierId'] ?? '');
    $type    = (string)($in['type'] ?? '');
    if ($dossier === '' || !in_array($type, $ENTRY_TYPES, true)) fail('dossierId & type requis', 422);
    ge_assert_dossier_access($db, $me, $dossier);
    // Ajout d'une entry dans un dossier déjà validé : verrou « validé ».
    if (ge_dossier_is_validated($db, $dossier)) ge_require_validated_edit($db, $me);
    $id = 'GE-' . substr(bin2hex(random_bytes(6)), 0, 10);
    $db->prepare('INSERT INTO crminternet_guichet_entries
        (id, dossier_id, type, cin, numero, amount, offre, operator_source, label, op_date, status)
        VALUES (:id,:d,:t,:cin,:num,:amt,:off,:os,:lab,:od,:st)')
       ->execute([
           ':id' => $id, ':d' => $dossier, ':t' => $type,
           ':cin' => trim((string)($in['cin'] ?? '')),
           ':num' => trim((string)($in['numero'] ?? '')),
           ':amt' => isset($in['amount']) && $in['amount'] !== '' ? (float)$in['amount'] : null,
           ':off' => trim((string)($in['offre'] ?? '')),
           ':os'  => trim((string)($in['operatorSource'] ?? '')),
           ':lab' => trim((string)($in['label'] ?? '')),
           ':od'  => !empty($in['opDate']) ? substr((string)$in['opDate'], 0, 10) : null,
           ':st'  => in_array(($in['status'] ?? 'draft'), ['draft','valide'], true) ? $in['status'] : 'draft',
       ]);
    ok(['id' => $id], 201);
}

if ($method === 'PATCH' || $method === 'PUT') {
    require_permission($db, $me, 'guichet.edit');
    $in = json_input();
    $id = (string)($in['id'] ?? ($_GET['id'] ?? ''));
    if ($id === '') fail('id requis', 422);
    $dossierId = ge_entry_dossier($db, $id);
    if ($dossierId === null) fail('Entry introuvable', 404);
    ge_assert_dossier_access($db, $me, $dossierId);
    if (ge_entry_is_validated($db, $id)) ge_require_validated_edit($db, $me);
    $map = ['cin'=>'cin','numero'=>'numero','amount'=>'amount','offre'=>'offre',
            'operatorSource'=>'operator_source','label'=>'label','opDate'=>'op_date','status'=>'status'];
    $sets = []; $params = [':id' => $id];
    foreach ($map as $k => $col) {
        if (!array_key_exists($k, $in)) continue;
        $v = $in[$k];
        if ($k === 'amount')  $v = ($v === '' || $v === null) ? null : (float)$v;
        if ($k === 'opDate')  $v = !empty($v) ? substr((string)$v, 0, 10) : null;
        if ($k === 'status' && !in_array($v, ['draft','valide'], true)) continue;
        $sets[] = "$col = :$k"; $params[":$k"] = $v;
    }
    if (!$sets) fail('Aucun champ', 422);
    $db->prepare('UPDATE crminternet_guichet_entries SET ' . implode(', ', $sets) . ' WHERE id = :id')
       ->execute($params);
    ok(['updated' => 1]);
}

if ($method === 'DELETE') {
    require_permission($db, $me, 'guichet.edit');
    $id = (string)($_GET['id'] ?? '');
    if ($id === '') fail('id requis', 422);
    $dossierId = ge_entry_dossier($db, $id);
    if ($dossierId === null) fail('Entry introuvable', 404);
    ge_assert_dossier_access($db, $me, $dossierId);
    if (ge_entry_is_validated($db, $id)) ge_require_validated_edit($db, $me);
    $db->prepare('DELETE FROM crminternet_guichet_entries WHERE id = :id')->execute([':id' => $id]);
    ok(['deleted' => 1]);
}

fail('Method not allowed', 405);
