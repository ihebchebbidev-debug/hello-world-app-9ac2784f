<?php
// =====================================================================
// Guichet — Dossiers (parent) + entries (enfants) en transaction.
// GET    list / single (avec entries)
// POST   create dossier (+ entries[])
// PATCH  update dossier
// POST   ?action=validate     -> passe dossier+entries en 'valide'
// DELETE
// =====================================================================
require_once __DIR__ . '/config.php';
$me = require_auth();
$db = (new Database())->getConnection();
$method = $_SERVER['REQUEST_METHOD'];

$ENTRY_TYPES = ['sim','port','swp','divers','facture_tt','facture_topnet'];

function row_to_dossier(array $r): array {
    return [
        'id'          => $r['id'],
        'ref'         => $r['ref'],
        'entityId'    => $r['entity_id'],
        'agentId'     => $r['agent_id'],
        'clientName'  => $r['client_name'] ?? '',
        'clientCin'   => $r['client_cin']  ?? '',
        'status'      => $r['status'] ?? 'draft',
        'validatedAt' => $r['validated_at'] ?? null,
        'validatedBy' => $r['validated_by'] ?? null,
        'notes'       => $r['notes'] ?? '',
        'createdAt'   => $r['created_at'] ?? null,
        'updatedAt'   => $r['updated_at'] ?? null,
    ];
}
function row_to_entry(array $r): array {
    return [
        'id'             => $r['id'],
        'dossierId'      => $r['dossier_id'],
        'type'           => $r['type'],
        'cin'            => $r['cin'] ?? '',
        'numero'         => $r['numero'] ?? '',
        'amount'         => isset($r['amount']) ? (float)$r['amount'] : null,
        'offre'          => $r['offre'] ?? '',
        'operatorSource' => $r['operator_source'] ?? '',
        'label'          => $r['label'] ?? '',
        'opDate'         => $r['op_date'] ?? null,
        'status'         => $r['status'] ?? 'draft',
        'createdAt'      => $r['created_at'] ?? null,
    ];
}

/** Génère la prochaine référence à 8 chiffres en partant de 71500500. */
function next_dossier_ref(PDO $db): string {
    $max = $db->query("SELECT MAX(CAST(ref AS UNSIGNED)) FROM crminternet_guichet_dossiers")->fetchColumn();
    $n = max((int)$max + 1, 71500500);
    return (string)$n;
}

$role     = $me['role'] ?? '';
$isAdmin  = $role === 'Administrateur' || $role === 'Manager';

function auth_user_id(array $me): string {
    return trim((string)($me['sub'] ?? $me['id'] ?? ''));
}

function can_view_all(PDO $db, array $me): bool {
    if (function_exists('user_has_permission')) return user_has_permission($db, $me, 'guichet.read_all');
    return ($me['role'] ?? '') === 'Administrateur';
}

/**
 * Returns the guichet entity assigned to a user (NULL when none).
 * Used to scope every read/write to that single franchise / point de vente.
 */
function user_guichet_entity(PDO $db, array $me): ?string {
    static $cache = [];
    $uid = auth_user_id($me);
    if ($uid === '') return null;
    if (array_key_exists($uid, $cache)) return $cache[$uid];
    try {
        $st = $db->prepare("SELECT guichet_entity_id FROM crminternet_users WHERE id = :id");
        $st->execute([':id' => $uid]);
        $v = $st->fetchColumn();
        return $cache[$uid] = ($v ? (string)$v : null);
    } catch (Throwable $e) { return $cache[$uid] = null; }
}
$assignedEntity = user_guichet_entity($db, $me);
// Les Administrateurs / Managers (ou détenteurs de guichet.read_all) ne sont JAMAIS
// restreints à une seule franchise, même si une affectation existe sur leur user.
if ($isAdmin || can_view_all($db, $me)) {
    $assignedEntity = null;
}

/* ---------------- GET ---------------- */
if ($method === 'GET') {
    $id = $_GET['id'] ?? null;
    if ($id) {
        $s = $db->prepare('SELECT * FROM crminternet_guichet_dossiers WHERE id = :id');
        $s->execute([':id' => $id]);
        $d = $s->fetch();
        if (!$d) fail('Not found', 404);
        // Restriction par entité assignée (Agent Guichet rattaché à une franchise)
        if ($assignedEntity && ($d['entity_id'] ?? '') !== $assignedEntity) {
            fail('Accès refusé (entité)', 403);
        }
        if (!$isAdmin && !can_view_all($db, $me) && ($d['agent_id'] ?? '') !== auth_user_id($me)) {
            // Si l'utilisateur a une affectation entité, on autorise toute la lecture de cette entité
            if (!$assignedEntity) fail('Accès refusé', 403);
        }
        $e = $db->prepare('SELECT * FROM crminternet_guichet_entries WHERE dossier_id = :d ORDER BY created_at, id');
        $e->execute([':d' => $id]);
        ok([
            'dossier' => row_to_dossier($d),
            'entries' => array_map('row_to_entry', $e->fetchAll()),
        ]);
    }

    $where = []; $params = [];
    // Affectation entité : verrouille la lecture sur la franchise de l'utilisateur.
    if ($assignedEntity) {
        $where[] = 'd.entity_id = :assigned_ent';
        $params[':assigned_ent'] = $assignedEntity;
    } elseif (!$isAdmin && !can_view_all($db, $me)) {
        $where[] = 'd.agent_id = :me';
        $params[':me'] = auth_user_id($me);
    }
    foreach (['entity_id'=>'entityId','agent_id'=>'agentId','status'=>'status'] as $col=>$q) {
        if (!empty($_GET[$q])) {
            // Empêche un agent affecté de contourner via ?entityId=...
            if ($col === 'entity_id' && $assignedEntity && $_GET[$q] !== $assignedEntity) continue;
            $where[] = "d.$col = :$col"; $params[":$col"] = $_GET[$q];
        }
    }
    if (!empty($_GET['month']) && preg_match('/^\d{4}-\d{2}$/', $_GET['month'])) {
        $where[] = "(
            EXISTS (SELECT 1 FROM crminternet_guichet_entries em
                    WHERE em.dossier_id = d.id
                      AND DATE_FORMAT(COALESCE(em.op_date, DATE(d.validated_at), DATE(d.created_at)),'%Y-%m') = :m1)
            OR (
                NOT EXISTS (SELECT 1 FROM crminternet_guichet_entries enx WHERE enx.dossier_id = d.id)
                AND DATE_FORMAT(COALESCE(DATE(d.validated_at), DATE(d.created_at)),'%Y-%m') = :m2
            )
        )";
        $params[':m1'] = $_GET['month'];
        $params[':m2'] = $_GET['month'];
    }
    if (!empty($_GET['type'])) {
        $where[] = "EXISTS (SELECT 1 FROM crminternet_guichet_entries e WHERE e.dossier_id = d.id AND e.type = :t)";
        $params[':t'] = $_GET['type'];
    }
    if (!empty($_GET['q'])) {
        // NOTE: PDO with ATTR_EMULATE_PREPARES=false (native MySQL prepares)
        // forbids reusing the same named placeholder. Use distinct names.
        $where[] = "(d.ref LIKE :q1 OR d.client_name LIKE :q2 OR d.client_cin LIKE :q3)";
        $like = '%' . $_GET['q'] . '%';
        $params[':q1'] = $like; $params[':q2'] = $like; $params[':q3'] = $like;
    }
    $sql = 'SELECT d.* FROM crminternet_guichet_dossiers d';
    if ($where) $sql .= ' WHERE ' . implode(' AND ', $where);
    // Paginated list: the frontend auto-fetches all pages for exact KPIs/exports.
    $LIMIT = max(1, min(5000, (int)($_GET['limit'] ?? 5000)));
    $OFFSET = max(0, (int)($_GET['offset'] ?? 0));
    $sql .= " ORDER BY d.created_at DESC, d.id DESC LIMIT $LIMIT OFFSET $OFFSET";
    $s = $db->prepare($sql);
    $s->execute($params);
    $rows = $s->fetchAll();
    $dossiers = array_map('row_to_dossier', $rows);

    // Bulk-load entries pour summary par dossier
    $entriesByDossier = [];
    if ($dossiers) {
        $ids = array_column($dossiers, 'id');
        $ph  = implode(',', array_fill(0, count($ids), '?'));
        $st  = $db->prepare("SELECT * FROM crminternet_guichet_entries WHERE dossier_id IN ($ph) ORDER BY created_at, id");
        $st->execute($ids);
        foreach ($st->fetchAll() as $r) {
            $entriesByDossier[$r['dossier_id']] ??= [];
            $entriesByDossier[$r['dossier_id']][] = row_to_entry($r);
        }
    }
    foreach ($dossiers as &$d) $d['entries'] = $entriesByDossier[$d['id']] ?? [];
    $truncated = count($dossiers) >= $LIMIT;
    ok(['dossiers' => $dossiers, 'truncated' => $truncated, 'nextOffset' => $truncated ? $OFFSET + count($dossiers) : null]);
}

/* ---------------- POST (create) ---------------- */
if ($method === 'POST') {
    $action = $_GET['action'] ?? '';

    // -- VALIDATE -----------------------------------------------------
    if ($action === 'validate') {
        require_permission($db, $me, 'guichet.validate');
        $in = json_input();
        $id = (string)($in['id'] ?? '');
        if ($id === '') fail('id requis', 422);
        // Empêche la validation d'un dossier hors entité assignée.
        if ($assignedEntity) {
            $chk = $db->prepare("SELECT entity_id FROM crminternet_guichet_dossiers WHERE id = :id");
            $chk->execute([':id' => $id]);
            $entOf = $chk->fetchColumn();
            if ($entOf && $entOf !== $assignedEntity) fail('Accès refusé (entité)', 403);
        } elseif (!$isAdmin && !can_view_all($db, $me)) {
            $chk = $db->prepare("SELECT agent_id FROM crminternet_guichet_dossiers WHERE id = :id");
            $chk->execute([':id' => $id]);
            if ((string)$chk->fetchColumn() !== auth_user_id($me)) fail('Accès refusé', 403);
        }
        $db->beginTransaction();
        try {
            $db->prepare("UPDATE crminternet_guichet_dossiers
                          SET status='valide', validated_at=NOW(), validated_by=:u
                          WHERE id=:id")
               ->execute([':u' => auth_user_id($me) ?: ($me['username'] ?? ''), ':id' => $id]);
            $db->prepare("UPDATE crminternet_guichet_entries SET status='valide' WHERE dossier_id=:id")
               ->execute([':id' => $id]);
            $db->commit();
            audit_log($db, $me, 'guichet_dossier.validate', 'guichet_dossier', $id);
            ok(['validated' => 1]);
        } catch (Throwable $e) { $db->rollBack(); fail('Erreur: ' . $e->getMessage(), 500); }
    }

    // -- CREATE -------------------------------------------------------
    require_permission($db, $me, 'guichet.create');
    $in       = json_input();
    $entityId = trim((string)($in['entityId'] ?? ''));
    // Si l'utilisateur a une entité affectée, on l'impose côté serveur (anti-bypass).
    if ($assignedEntity) $entityId = $assignedEntity;
    if ($entityId === '') fail('entityId requis', 422);

    // --- Agent : OBLIGATOIRE, jamais vide, doit exister dans crminternet_users ---
    // Admin/Manager peuvent assigner explicitement un agent ; sinon fallback sur soi.
    $rawAgent = trim((string)($in['agentId'] ?? ''));
    if ($isAdmin && $rawAgent !== '') {
        $agentId = $rawAgent;
    } else {
        $agentId = auth_user_id($me);
    }
    if ($agentId === '') {
        fail('agentId manquant : impossible de créer un dossier sans agent identifié', 422);
    }
    // Vérification d'existence (évite agent_id pointant vers un user supprimé/inexistant)
    $chkAgent = $db->prepare("SELECT 1 FROM crminternet_users WHERE id = :id LIMIT 1");
    $chkAgent->execute([':id' => $agentId]);
    if (!$chkAgent->fetchColumn()) {
        fail("agentId inconnu ($agentId) : l'agent doit exister dans la base utilisateurs", 422);
    }

    $entries  = is_array($in['entries'] ?? null) ? $in['entries'] : [];

    $db->beginTransaction();
    try {
        $ref = next_dossier_ref($db);
        $id  = 'GD-' . substr(bin2hex(random_bytes(6)), 0, 10);
        $st  = in_array(($in['status'] ?? 'draft'), ['draft','valide'], true) ? $in['status'] : 'draft';

        $db->prepare('INSERT INTO crminternet_guichet_dossiers
            (id, ref, entity_id, agent_id, client_name, client_cin, status, notes, validated_at, validated_by)
            VALUES (:id,:ref,:e,:a,:cn,:cc,:s,:n,:va,:vb)')
           ->execute([
               ':id' => $id, ':ref' => $ref, ':e' => $entityId, ':a' => $agentId,
               ':cn' => trim((string)($in['clientName'] ?? '')),
               ':cc' => trim((string)($in['clientCin']  ?? '')),
               ':s'  => $st,
               ':n'  => trim((string)($in['notes'] ?? '')),
               ':va' => $st === 'valide' ? date('Y-m-d H:i:s') : null,
               ':vb' => $st === 'valide' ? (auth_user_id($me) ?: ($me['username'] ?? '')) : null,
           ]);

        $insE = $db->prepare('INSERT INTO crminternet_guichet_entries
            (id, dossier_id, type, cin, numero, amount, offre, operator_source, label, op_date, status)
            VALUES (:id,:d,:t,:cin,:num,:amt,:off,:os,:lab,:od,:st)');
        foreach ($entries as $e) {
            $type = $e['type'] ?? '';
            if (!in_array($type, $ENTRY_TYPES, true)) continue;
            $insE->execute([
                ':id'  => 'GE-' . substr(bin2hex(random_bytes(6)), 0, 10),
                ':d'   => $id,
                ':t'   => $type,
                ':cin' => trim((string)($e['cin'] ?? '')),
                ':num' => trim((string)($e['numero'] ?? '')),
                ':amt' => isset($e['amount']) && $e['amount'] !== '' ? (float)$e['amount'] : null,
                ':off' => trim((string)($e['offre'] ?? '')),
                ':os'  => trim((string)($e['operatorSource'] ?? '')),
                ':lab' => trim((string)($e['label'] ?? '')),
                ':od'  => !empty($e['opDate']) ? substr((string)$e['opDate'], 0, 10) : null,
                ':st'  => $st,
            ]);
        }
        $db->commit();
        audit_log($db, $me, 'guichet_dossier.create', 'guichet_dossier', $id, ['ref' => $ref, 'entries' => count($entries)]);

        $d = $db->prepare('SELECT * FROM crminternet_guichet_dossiers WHERE id = :id');
        $d->execute([':id' => $id]); $drow = $d->fetch();
        $eq = $db->prepare('SELECT * FROM crminternet_guichet_entries WHERE dossier_id = :id ORDER BY created_at, id');
        $eq->execute([':id' => $id]);
        ok(['dossier' => row_to_dossier($drow), 'entries' => array_map('row_to_entry', $eq->fetchAll())], 201);
    } catch (Throwable $e) {
        $db->rollBack();
        fail('Erreur création: ' . $e->getMessage(), 500);
    }
}

/* ---------------- PATCH ---------------- */
if ($method === 'PATCH' || $method === 'PUT') {
    require_permission($db, $me, 'guichet.edit');
    $in = json_input();
    $id = (string)($in['id'] ?? ($_GET['id'] ?? ''));
    if ($id === '') fail('id requis', 422);
    // Verrou « validé » : seul Administrateur ou détenteur de guichet.edit_validated peut modifier un dossier validé.
    $stCur = $db->prepare("SELECT status FROM crminternet_guichet_dossiers WHERE id = :id");
    $stCur->execute([':id' => $id]);
    $curStatus = (string)$stCur->fetchColumn();
    if ($curStatus === 'valide' && $role !== 'Administrateur'
        && !(function_exists('user_has_permission') && user_has_permission($db, $me, 'guichet.edit_validated'))) {
        fail('Dossier validé : permission « guichet.edit_validated » requise', 403);
    }
    if ($assignedEntity) {
        $chk = $db->prepare("SELECT entity_id FROM crminternet_guichet_dossiers WHERE id = :id");
        $chk->execute([':id' => $id]);
        $entOf = $chk->fetchColumn();
        if ($entOf && $entOf !== $assignedEntity) fail('Accès refusé (entité)', 403);
        // Empêche de muter entityId vers une autre franchise
        if (array_key_exists('entityId', $in) && $in['entityId'] && $in['entityId'] !== $assignedEntity) {
            $in['entityId'] = $assignedEntity;
        }
    } elseif (!$isAdmin && !can_view_all($db, $me)) {
        $chk = $db->prepare("SELECT agent_id FROM crminternet_guichet_dossiers WHERE id = :id");
        $chk->execute([':id' => $id]);
        if ((string)$chk->fetchColumn() !== auth_user_id($me)) fail('Accès refusé', 403);
    }
    $sets = []; $params = [':id' => $id];
    $map = ['entityId'=>'entity_id','agentId'=>'agent_id','clientName'=>'client_name','clientCin'=>'client_cin','notes'=>'notes'];
    foreach ($map as $k => $col) {
        if (!array_key_exists($k, $in)) continue;
        $val = $in[$k];
        // Protection : agent_id ne peut jamais devenir vide ni pointer vers un user inexistant.
        if ($k === 'agentId') {
            $val = trim((string)$val);
            if ($val === '') fail('agentId ne peut pas être vide', 422);
            $chk2 = $db->prepare("SELECT 1 FROM crminternet_users WHERE id = :id LIMIT 1");
            $chk2->execute([':id' => $val]);
            if (!$chk2->fetchColumn()) fail("agentId inconnu ($val)", 422);
        }
        $sets[] = "$col = :$k"; $params[":$k"] = $val;
    }
    if (!$sets) fail('Aucun champ', 422);
    $db->prepare('UPDATE crminternet_guichet_dossiers SET ' . implode(', ', $sets) . ' WHERE id = :id')
       ->execute($params);
    audit_log($db, $me, 'guichet_dossier.update', 'guichet_dossier', $id);
    ok(['updated' => 1]);
}

/* ---------------- DELETE ---------------- */
if ($method === 'DELETE') {
    require_permission($db, $me, 'guichet.delete');
    $id = (string)($_GET['id'] ?? '');
    if ($id === '') fail('id requis', 422);
    if ($assignedEntity) {
        $chk = $db->prepare("SELECT entity_id FROM crminternet_guichet_dossiers WHERE id = :id");
        $chk->execute([':id' => $id]);
        $entOf = $chk->fetchColumn();
        if ($entOf && $entOf !== $assignedEntity) fail('Accès refusé (entité)', 403);
    } elseif (!$isAdmin && !can_view_all($db, $me)) {
        $chk = $db->prepare("SELECT agent_id FROM crminternet_guichet_dossiers WHERE id = :id");
        $chk->execute([':id' => $id]);
        if ((string)$chk->fetchColumn() !== auth_user_id($me)) fail('Accès refusé', 403);
    }
    $db->prepare('DELETE FROM crminternet_guichet_dossiers WHERE id = :id')->execute([':id' => $id]);
    audit_log($db, $me, 'guichet_dossier.delete', 'guichet_dossier', $id);
    ok(['deleted' => 1]);
}

fail('Method not allowed', 405);