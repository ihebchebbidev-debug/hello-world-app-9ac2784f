<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/pipeline_helpers.php';
require_once __DIR__ . '/geo_helpers.php';
require_once __DIR__ . '/attachment_helpers.php';
require_once __DIR__ . '/list_query_helpers.php';
if (is_file(__DIR__ . '/crm_normalize.php')) require_once __DIR__ . '/crm_normalize.php';
$me = require_auth();
$db = (new Database())->getConnection();
$method = $_SERVER['REQUEST_METHOD'];
// prospect_norm_xy / prospect_norm_cp sont définis dans geo_helpers.php.

function ensure_prospects_runtime_schema(PDO $db): void {
    $stmts = [
        "ALTER TABLE crminternet_prospects ADD COLUMN phone2 VARCHAR(40) NOT NULL DEFAULT ''",
        "ALTER TABLE crminternet_prospects ADD COLUMN ancien_ligne VARCHAR(40) NULL",
        "ALTER TABLE crminternet_prospects ADD COLUMN animateur VARCHAR(120) NULL",
        "ALTER TABLE crminternet_prospects ADD COLUMN cin VARCHAR(40) NULL",
        "ALTER TABLE crminternet_prospects ADD COLUMN birth_date DATE NULL",
        "ALTER TABLE crminternet_prospects ADD COLUMN address VARCHAR(255) NOT NULL DEFAULT ''",
        "ALTER TABLE crminternet_prospects ADD COLUMN zone VARCHAR(120) NOT NULL DEFAULT ''",
        "ALTER TABLE crminternet_prospects ADD COLUMN gouvernorat VARCHAR(120) NOT NULL DEFAULT ''",
        "ALTER TABLE crminternet_prospects ADD COLUMN delegation VARCHAR(120) NOT NULL DEFAULT ''",
        "ALTER TABLE crminternet_prospects ADD COLUMN localisation_xy VARCHAR(64) NULL",
        "ALTER TABLE crminternet_prospects ADD COLUMN code_postal VARCHAR(20) NULL",
        "ALTER TABLE crminternet_prospects ADD COLUMN comment2 TEXT NULL",
        "ALTER TABLE crminternet_prospects ADD COLUMN check_valeur ENUM('valid','invalid','pending') NOT NULL DEFAULT 'pending'",
        "ALTER TABLE crminternet_prospects ADD COLUMN converted TINYINT(1) NOT NULL DEFAULT 0",
        "ALTER TABLE crminternet_prospects ADD COLUMN converted_at DATETIME NULL",
        "ALTER TABLE crminternet_prospects ADD COLUMN opportunity_id VARCHAR(40) NULL",
        "ALTER TABLE crminternet_prospects ADD COLUMN type_id VARCHAR(40) NULL",
        "ALTER TABLE crminternet_prospects ADD COLUMN reverted_at DATETIME NULL",
        "ALTER TABLE crminternet_prospects ADD COLUMN reverted_from VARCHAR(20) NULL",
        // updated_at est requis pour que l'ETag de la liste (compute_list_etag)
        // change après chaque PATCH/PUT — sinon les éditions remontent un 304
        // avec un corps vide, et le client conserve l'ancien snapshot
        // ("édition réussie mais aucun changement visible").
        "ALTER TABLE crminternet_prospects ADD COLUMN updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
    ];
    foreach ($stmts as $sql) { try { $db->exec($sql); } catch (Throwable $e) {} }
}
// Schema bootstrap : exécuté une fois par version (file-lock dans /tmp).
// Forçable via ?schema=ensure pour les déploiements.
schema_ensure_once('prospects', '20260525', function () use ($db) {
    ensure_prospects_runtime_schema($db);
});

function row_to_prospect(array $r): array {
    // Every field is null-safe (`?? ''` / `?? null`). A missing column on an
    // older install must NEVER fatal a SELECT — it just becomes empty.
    return [
        'id'              => $r['id']               ?? '',
        'civility'        => $r['civility']         ?? '',
        'lastName'        => $r['last_name']        ?? '',
        'firstName'       => $r['first_name']       ?? '',
        'phone'           => $r['phone']            ?? '',
        'phone2'          => $r['phone2']           ?? '',
        'ancienLigne'     => $r['ancien_ligne']     ?? null,
        'animateur'       => $r['animateur']         ?? null,
        'cin'             => $r['cin']              ?? '',
        'birthDate'       => $r['birth_date']       ?? null,
        'email'           => $r['email']            ?? '',
        'source'          => $r['source']           ?? '',
        'status'          => $r['status']           ?? '',
        'assignedTo'      => $r['assigned_to']      ?? null,
        'createdAt'       => $r['created_at']       ?? null,
        'city'            => $r['city']             ?? '',
        'address'         => $r['address']          ?? '',
        'zone'            => $r['zone']             ?? '',
        'gouvernorat'     => $r['gouvernorat']      ?? ($r['city'] ?? ''),
        'delegation'      => $r['delegation']       ?? ($r['zone'] ?? ''),
        'localisationXy'  => $r['localisation_xy']  ?? '',
        'codePostal'      => $r['code_postal']      ?? '',
        'outcome'         => $r['outcome']          ?? 'pending',
        'lostReason'      => $r['lost_reason']      ?? null,
        'comment'         => $r['comment']          ?? null,
        'comment2'        => $r['comment2']         ?? null,
        'checkValeur'     => $r['check_valeur']     ?? 'pending',
        'converted'       => !empty($r['converted']),
        'opportunityId'   => $r['opportunity_id']   ?? null,
        'lastOpportunityId' => null,
        'typeId'          => $r['type_id']          ?? null,
        'revertedAt'      => $r['reverted_at']      ?? null,
        'revertedFrom'    => $r['reverted_from']    ?? null,
    ];
}

// Role-based scoping: Agents only see leads assigned to them OR still in the
// unassigned queue (so they can claim from /dispatch). Manager / Administrateur
// / Backoffice see everything.
$role = $me['role'] ?? '';
// Agents (legacy + MVP roles AgentSuivi/AgentActivation/AgentVente) ne voient
// que leurs leads + ceux non assignés. Manager / Administrateur / Backoffice : tout.
$isAgent = in_array($role, ['Agent', 'AgentSuivi', 'AgentActivation', 'AgentVente'], true);

if ($method === 'GET') {
    // CRM MVP §1 — Vérification anciens clients : détection de doublons par CIN/téléphone.
    if (!empty($_GET['check_duplicate'])) {
        $cin   = trim((string)($_GET['cin'] ?? ''));
        $phone = trim((string)($_GET['phone'] ?? ''));
        $phone2= trim((string)($_GET['phone2'] ?? ''));
        if ($cin === '' && $phone === '' && $phone2 === '') ok(['matches' => []]);
        $where = []; $params = [];
        if ($cin !== '')    { $where[] = 'cin = :cin';     $params[':cin']   = $cin; }
        if ($phone !== '')  { $where[] = '(phone = :p OR phone2 = :p)'; $params[':p'] = $phone; }
        if ($phone2 !== '') { $where[] = '(phone = :p2 OR phone2 = :p2)'; $params[':p2'] = $phone2; }
        $sql = 'SELECT id, last_name, first_name, phone, phone2, cin, status, assigned_to, created_at
                FROM crminternet_prospects WHERE ' . implode(' OR ', $where) . '
                ORDER BY created_at DESC LIMIT 10';
        $s = $db->prepare($sql);
        $s->execute($params);
        ok(['matches' => array_map(fn($r) => [
            'id' => $r['id'], 'lastName' => $r['last_name'], 'firstName' => $r['first_name'],
            'phone' => $r['phone'], 'phone2' => $r['phone2'] ?? '', 'cin' => $r['cin'] ?? '',
            'status' => $r['status'], 'assignedTo' => $r['assigned_to'], 'createdAt' => $r['created_at'],
        ], $s->fetchAll())]);
    }

    $id = $_GET['id'] ?? null;
    if ($id) {
        $s = $db->prepare('SELECT * FROM crminternet_prospects WHERE id = :id');
        $s->execute([':id' => $id]);
        $r = $s->fetch();
        if (!$r) fail('Not found', 404);
        // Lecture globale : tout utilisateur authentifié voit tous les prospects.
        // Les permissions (édition / conversion / suppression) restent gérées plus bas.
        ok(['prospect' => row_to_prospect($r)]);
    }
    // Filter: hide leads converted to opportunities (they live in /opportunities now).
    // Admin can pass ?include_converted=1 to see them too.
    $includeConverted = !empty($_GET['include_converted']);
    $convertedClause = $includeConverted ? '1=1' : '(converted IS NULL OR converted = 0)';

    // ---- Server-side filter / sort / pagination -------------------------
    // Backwards-compatible :
    //   - Aucun param         → ancien comportement (liste complète)
    //   - ?count=1            → { total }
    //   - ?page=N&per_page=K  → liste paginée
    //   - ?fields=list        → projection courte (id, nom, tel, statut...)
    //   - ?q=...&status=...&assignedTo=...&dateFrom/dateTo&sort=...&dir=...
    $params = parse_list_params([
        'sortable' => [
            'createdAt'  => 'created_at',
            'lastName'   => 'last_name',
            'firstName'  => 'first_name',
            'status'     => 'status',
            'assignedTo' => 'assigned_to',
            'phone'      => 'phone',
            'cin'        => 'cin',
        ],
        'defaultSort' => 'createdAt',
        'defaultDir'  => 'desc',
        'maxPerPage'  => 100000,
    ]);

    [$whereSql, $bind] = build_list_where($params, [
        'searchable'  => ['last_name','first_name','phone','phone2','cin','email'],
        'statusCol'   => 'status',
        'assignedCol' => 'assigned_to',
        'dateCol'     => 'created_at',
        'preWhere'    => $convertedClause,
        'preParams'   => [],
    ]);

    try {
        if ($params['count']) {
            $s = $db->prepare("SELECT COUNT(*) FROM crminternet_prospects WHERE $whereSql");
            $s->execute($bind);
            ok(['total' => (int)$s->fetchColumn()]);
        }

        // Projection : ?fields=list  → colonnes courtes (payload x5 plus petit)
        $listCols = 'id, civility, last_name, first_name, phone, phone2, cin, status, assigned_to, created_at, gouvernorat, delegation, converted, type_id';
        $selectCols = $params['fields'] === 'list' ? $listCols : '*';
        $orderBy = build_list_order($params);

        if ($params['paginate']) {
            $countS = $db->prepare("SELECT COUNT(*) FROM crminternet_prospects WHERE $whereSql");
            $countS->execute($bind);
            $total = (int)$countS->fetchColumn();

            $sql = "SELECT $selectCols FROM crminternet_prospects WHERE $whereSql
                    ORDER BY $orderBy LIMIT {$params['perPage']} OFFSET {$params['offset']}";
            $stmt = $db->prepare($sql);
            $stmt->execute($bind);
            $list = [];
            while ($r = $stmt->fetch(PDO::FETCH_ASSOC)) $list[] = row_to_prospect($r);
            $stmt->closeCursor();

            ok([
                'prospects' => $list,
                'page'      => $params['page'],
                'per_page'  => $params['perPage'],
                'total'     => $total,
                'has_more'  => ($params['offset'] + count($list)) < $total,
                'sort'      => $params['sortKey'],
                'dir'       => strtolower($params['dir']),
                'fields'    => $params['fields'],
            ]);
        }

        // Legacy full-list (streamed). Conservé pour scripts d'export et
        // installations historiques. Au-delà de ~50k lignes, basculer sur
        // le mode paginé côté client.
        $sql = "SELECT $selectCols FROM crminternet_prospects WHERE $whereSql ORDER BY $orderBy";
        $stmt = $db->prepare($sql);
        $stmt->execute($bind);
        $prospects = [];
        while ($r = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $prospects[] = row_to_prospect($r);
        }
        $stmt->closeCursor();
        ok(['prospects' => $prospects]);
    } catch (Throwable $e) {
        fail('Prospects load failed: ' . $e->getMessage(), 500, [
            'where' => $whereSql,
            'hint'  => 'Vérifie le schéma (colonnes manquantes ?) ou augmente memory_limit PHP.',
        ]);
    }
}

if ($method === 'POST') {
    // Create OR claim depending on action
    $in = json_input();
    $action = $in['action'] ?? 'create';

    if ($action === 'claim') {
        $pid = $in['id'] ?? '';
        if (!$pid) fail('id requis', 422);
        // Allow claiming when nobody owns the lead (NULL or empty string).
        $s = $db->prepare("UPDATE crminternet_prospects
                           SET assigned_to = :a, status = 'En cours'
                           WHERE id = :id AND (assigned_to IS NULL OR assigned_to = '')");
        $s->execute([':a' => $me['username'], ':id' => $pid]);
        if ($s->rowCount() === 0) fail('Lead déjà attribué ou introuvable', 409);
        log_field_changes($db, 'prospect', $pid, ['assigned_to' => '', 'status' => ''], ['assigned_to' => $me['username'], 'status' => 'En cours'], $me['username']);
        notify_user($db, $me['username'], 'Lead attribué', "Vous avez réclamé le lead $pid", "/prospects/$pid");
        audit_log($db, $me, 'prospect.claim', 'prospect', $pid);
        ok(['message' => 'Lead attribué']);
    }

    if ($action === 'mark_won') {
        $pid     = $in['id'] ?? '';
        $premium = (float)($in['premium'] ?? 950);
        $partner = trim($in['partner'] ?? 'NEOLIANE');
        if (!$pid) fail('id requis', 422);

        if ($isAgent) {
            $own = $db->prepare('SELECT assigned_to FROM crminternet_prospects WHERE id = :id');
            $own->execute([':id' => $pid]);
            $owner = $own->fetchColumn();
            if ($owner !== $me['username']) fail('Accès refusé', 403);
        }

        $db->beginTransaction();
        try {
            $s = $db->prepare("UPDATE crminternet_prospects SET outcome='won', status='Vendu' WHERE id = :id");
            $s->execute([':id' => $pid]);
            log_field_changes($db, 'prospect', $pid, ['outcome' => 'pending', 'status' => ''], ['outcome' => 'won', 'status' => 'Vendu'], $me['username']);

            $row = $db->prepare('SELECT * FROM crminternet_prospects WHERE id = :id');
            $row->execute([':id' => $pid]);
            $p = $row->fetch();
            if (!$p) { $db->rollBack(); fail('Prospect introuvable', 404); }

            $cid = 'C-' . substr(bin2hex(random_bytes(6)), 0, 10);
            require_once __DIR__ . '/conversion_helpers.php';
            // mark_won = lead → contrat (raccourci). Snapshot complet.
            conversion_insert_contract_from_prospect($db, $cid, $p, [
                'partner'        => $partner,
                'cabinet'        => 'Cabinet Paris 1',
                'premium'        => $premium,
                'billing_status' => 'Pré-validé',
                'assigned_to'    => $p['assigned_to'] ?? '—',
            ]);
            try { attachment_clone_entity($db, 'prospect', $pid, 'contract', $cid); } catch (Throwable $e) {}
            // Propagate custom fields + "Information contrat" prospect → contract (raccourci mark_won).
            try {
                require_once __DIR__ . '/custom_field_helpers.php';
                custom_field_clone_entity($db, 'prospect', $pid, 'contract', $cid);
            } catch (Throwable $e) {}
            try {
                require_once __DIR__ . '/contract_info_helpers.php';
                contract_info_clone_entity($db, 'prospect', $pid, 'contract', $cid, $me['username'] ?? '');
            } catch (Throwable $e) {}
            $db->commit();
            $owner = $p['assigned_to'] ?? '';
            if ($owner) notify_user($db, $owner, 'Vente confirmée', "Contrat $cid créé pour {$p['first_name']} {$p['last_name']}", "/contracts/$cid");
            audit_log($db, $me, 'prospect.mark_won', 'prospect', $pid, ['contractId' => $cid, 'premium' => $premium]);
            ok(['message' => 'Contrat créé', 'contractId' => $cid]);
        } catch (Throwable $e) {
            $db->rollBack();
            fail('Erreur: ' . $e->getMessage(), 500);
        }
    }

    if ($action === 'convert_to_opportunity') {
        // Manual conversion Prospect → Opportunity (mirrors the auto-action
        // wired on lead-stage transitions, but callable on demand).
        $pid = $in['id'] ?? '';
        if (!$pid) fail('id requis', 422);

        if ($isAgent) {
            $own = $db->prepare('SELECT assigned_to FROM crminternet_prospects WHERE id = :id');
            $own->execute([':id' => $pid]);
            $owner = $own->fetchColumn();
            if ($owner !== $me['username']) fail('Accès refusé', 403);
        }

        $p = $db->prepare('SELECT * FROM crminternet_prospects WHERE id = :id');
        $p->execute([':id' => $pid]);
        $row = $p->fetch();
        if (!$row) fail('Prospect introuvable', 404);
        if (!empty($row['converted']) && !empty($row['opportunity_id'])) {
            ok(['message' => 'Déjà converti', 'opportunityId' => $row['opportunity_id']]);
        }

        $oppStages = pipeline_load_stages($db, 'opportunity');
        $initial = null;
        foreach ($oppStages['list'] as $s) { if (!empty($s['is_initial'])) { $initial = $s; break; } }
        $initialName = $initial['name'] ?? ($oppStages['list'][0]['name'] ?? 'Qualification');

        $oid = 'O-' . substr(bin2hex(random_bytes(6)), 0, 10);
        $db->beginTransaction();
        try {
            require_once __DIR__ . '/conversion_helpers.php';
            // Snapshot complet du prospect : civilité, contacts, animateur,
            // ancien_ligne, identité, adresse, GPS, observations, statut, type…
            // sont copiés tels quels dans l'opportunité (exigence client :
            // 100% des infos prospect doivent rester visibles côté opportunité).
            conversion_insert_opportunity_from_prospect($db, $oid, $row, [
                'stage'        => $initialName,
                'amount'       => (float)($in['amount'] ?? 0),
                'probability'  => (int)($in['probability'] ?? 50),
                'assigned_to'  => $row['assigned_to'] ?: $me['username'],
                'created_by'   => $me['username'],
            ]);
            $db->prepare('UPDATE crminternet_prospects SET converted = 1, converted_at = NOW(), opportunity_id = :oid WHERE id = :id')
               ->execute([':oid'=>$oid, ':id'=>$pid]);

            // Propagate custom field values prospect → opportunity so they
            // follow the customer through the pipeline.
            try {
                require_once __DIR__ . '/custom_field_helpers.php';
                custom_field_clone_entity($db, 'prospect', $pid, 'opportunity', $oid);
            } catch (Throwable $e) { /* best effort */ }

            // Clone attachments (CIN Recto/Verso, Contrat TT, etc.) so they follow the lead.
            try { attachment_clone_entity($db, 'prospect', $pid, 'opportunity', $oid); } catch (Throwable $e) { /* best effort */ }

            // Propagate "Information contrat / Détails Techniques" prospect → opportunity.
            try {
                require_once __DIR__ . '/contract_info_helpers.php';
                contract_info_clone_entity($db, 'prospect', $pid, 'opportunity', $oid, $me['username'] ?? '');
            } catch (Throwable $e) { /* best effort */ }

            $db->commit();
        } catch (Throwable $e) {
            $db->rollBack();
            fail('Erreur conversion: '.$e->getMessage(), 500);
        }

        log_field_changes($db, 'prospect', $pid, ['converted'=>0, 'opportunity_id'=>''], ['converted'=>1, 'opportunity_id'=>$oid, 'manual'=>'lead→opportunity'], $me['username']);
        log_field_changes($db, 'opportunity', $oid, ['exists'=>0], ['exists'=>1, 'created_from'=>'lead:'.$pid, 'stage'=>$initialName], $me['username']);
        audit_log($db, $me, 'prospect.convert_to_opportunity', 'prospect', $pid, ['opportunityId'=>$oid]);
        $owner = $row['assigned_to'] ?? '';
        if ($owner) notify_user($db, $owner, 'Lead converti', "Opportunité $oid créée pour {$row['first_name']} {$row['last_name']}", "/opportunities");
        ok(['message'=>'Opportunité créée', 'opportunityId'=>$oid]);
    }

    if ($action === 'mark_lost') {
        $pid    = $in['id'] ?? '';
        $reason = trim($in['reason'] ?? 'Non précisé');
        if (!$pid) fail('id requis', 422);
        if ($isAgent) {
            $own = $db->prepare('SELECT assigned_to FROM crminternet_prospects WHERE id = :id');
            $own->execute([':id' => $pid]);
            $owner = $own->fetchColumn();
            if ($owner !== $me['username']) fail('Accès refusé', 403);
        }
        $cur = $db->prepare('SELECT outcome, status, lost_reason FROM crminternet_prospects WHERE id = :id');
        $cur->execute([':id' => $pid]);
        $bef = $cur->fetch() ?: [];
        $s = $db->prepare("UPDATE crminternet_prospects
                           SET outcome='lost', status='Refus', lost_reason=:r
                           WHERE id = :id");
        $s->execute([':r' => $reason, ':id' => $pid]);
        if ($s->rowCount() === 0) fail('Prospect introuvable', 404);
        log_field_changes($db, 'prospect', $pid, $bef, ['outcome' => 'lost', 'status' => 'Refus', 'lost_reason' => $reason], $me['username']);
        audit_log($db, $me, 'prospect.mark_lost', 'prospect', $pid, ['reason' => $reason]);
        ok(['message' => 'Lead marqué perdu']);
    }

    if ($action === 'bulk') {
        require_auth(['Administrateur','Manager']);
        $ids = $in['ids'] ?? [];
        $op  = $in['op']  ?? '';
        if (!is_array($ids) || !$ids) fail('ids requis', 422);
        $place = implode(',', array_fill(0, count($ids), '?'));

        // Snapshot before for diff logging
        $bulkCols = ['assigned_to','status','check_valeur'];
        $beforeMap = [];
        if (in_array($op, ['assign','status','check'], true)) {
            $sel = $db->prepare("SELECT id, assigned_to, status, check_valeur FROM crminternet_prospects WHERE id IN ($place)");
            $sel->execute($ids);
            foreach ($sel->fetchAll() as $r) $beforeMap[$r['id']] = $r;
        }

        $writeBulkLog = function(string $col, $newVal) use ($db, $ids, $beforeMap, $me) {
            foreach ($ids as $pid) {
                $bef = $beforeMap[$pid] ?? [];
                log_field_changes($db, 'prospect', $pid, [$col => $bef[$col] ?? null], [$col => $newVal], $me['username'] ?? '');
            }
        };

        if ($op === 'assign') {
            $to = trim($in['assignedTo'] ?? '');
            if ($to === '') fail('assignedTo requis', 422);
            $sql = "UPDATE crminternet_prospects SET assigned_to = ? WHERE id IN ($place)";
            $st = $db->prepare($sql);
            $st->execute(array_merge([$to], $ids));
            $writeBulkLog('assigned_to', $to);
            audit_log($db, $me, 'prospect.bulk_assign', 'prospect', implode(',', array_slice($ids,0,10)), ['to' => $to, 'count' => $st->rowCount()]);
            ok(['updated' => $st->rowCount()]);
        }
        if ($op === 'status') {
            $st_v = trim($in['status'] ?? '');
            if ($st_v === '') fail('status requis', 422);
            // Vérifie chaque transition individuellement (mode strict si configuré).
            foreach ($ids as $pid) {
                $oldStatus = $beforeMap[$pid]['status'] ?? '';
                pipeline_assert_transition($db, 'lead', $oldStatus, $st_v);
            }
            $sql = "UPDATE crminternet_prospects SET status = ? WHERE id IN ($place)";
            $st = $db->prepare($sql);
            $st->execute(array_merge([$st_v], $ids));
            $writeBulkLog('status', $st_v);
            // Auto-action par lead si applicable.
            $autos = [];
            foreach ($ids as $pid) {
                $r = pipeline_run_auto_action($db, 'lead', $pid, $st_v, $me);
                if ($r) $autos[$pid] = $r;
            }
            audit_log($db, $me, 'prospect.bulk_status', 'prospect', implode(',', array_slice($ids,0,10)), ['status' => $st_v, 'count' => $st->rowCount()]);
            ok(['updated' => $st->rowCount(), 'auto' => $autos]);
        }
        if ($op === 'check') {
            $cv = $in['checkValeur'] ?? 'pending';
            if (!in_array($cv, ['valid','invalid','pending'], true)) fail('checkValeur invalide', 422);
            $sql = "UPDATE crminternet_prospects SET check_valeur = ? WHERE id IN ($place)";
            $st = $db->prepare($sql);
            $st->execute(array_merge([$cv], $ids));
            $writeBulkLog('check_valeur', $cv);
            audit_log($db, $me, 'prospect.bulk_check', 'prospect', implode(',', array_slice($ids,0,10)), ['check' => $cv, 'count' => $st->rowCount()]);
            ok(['updated' => $st->rowCount()]);
        }
        if ($op === 'type') {
            $tid = $in['typeId'] ?? null;
            if ($tid === '') $tid = null;
            if ($tid !== null) {
                $chk = $db->prepare('SELECT 1 FROM crminternet_prospect_types WHERE id = ?');
                $chk->execute([$tid]);
                if (!$chk->fetchColumn()) fail('typeId inconnu', 422);
            }
            $selT = $db->prepare("SELECT id, type_id FROM crminternet_prospects WHERE id IN ($place)");
            $selT->execute($ids);
            $beforeT = [];
            foreach ($selT->fetchAll() as $r) $beforeT[$r['id']] = $r['type_id'];
            $sql = "UPDATE crminternet_prospects SET type_id = ? WHERE id IN ($place)";
            $st = $db->prepare($sql);
            $st->execute(array_merge([$tid], $ids));
            foreach ($ids as $pid) {
                log_field_changes($db, 'prospect', (string)$pid, ['type_id' => $beforeT[$pid] ?? null], ['type_id' => $tid], $me['username'] ?? '');
            }
            audit_log($db, $me, 'prospect.bulk_type', 'prospect', implode(',', array_slice($ids,0,10)), ['typeId' => $tid, 'count' => $st->rowCount()]);
            ok(['updated' => $st->rowCount()]);
        }
        if ($op === 'delete') {
            require_permission($db, $me, 'prospect.delete');
            foreach ($ids as $pid) {
                log_field_changes($db, 'prospect', (string)$pid, ['exists' => 1], ['exists' => 0, 'reason' => 'bulk_delete'], $me['username']);
            }
            $sql = "DELETE FROM crminternet_prospects WHERE id IN ($place)";
            $st = $db->prepare($sql);
            $st->execute($ids);
            audit_log($db, $me, 'prospect.bulk_delete', 'prospect', implode(',', array_slice($ids,0,10)), ['count' => $st->rowCount()]);
            ok(['deleted' => $st->rowCount()]);
        }
        fail('op invalide', 422);
    }

    // create / upsert  (rapport structuré : added / updated / blocked)
    $rows = $in['rows'] ?? [$in];
    if (!is_array($rows)) fail('rows invalide', 422);
    $mode = (string)($in['mode'] ?? 'upsert'); // 'upsert' | 'create_only'
    $added = 0; $updated = 0; $skipped = 0; $ids = []; $blocked = [];

    $ins = $db->prepare('INSERT INTO crminternet_prospects
        (id,civility,last_name,first_name,phone,phone2,ancien_ligne,animateur,cin,birth_date,email,source,status,assigned_to,created_at,city,address,zone,gouvernorat,delegation,localisation_xy,code_postal,outcome,lost_reason,comment,comment2,check_valeur,type_id)
        VALUES (:id,:civ,:ln,:fn,:ph,:ph2,:al,:anim,:cin,:bd,:em,:src,:st,:at,:ca,:city,:addr,:zone,:gov,:deleg,:loc,:cp,:oc,:lr,:cm,:cm2,:cv,:tid)
        ON DUPLICATE KEY UPDATE
          civility=VALUES(civility), last_name=VALUES(last_name), first_name=VALUES(first_name),
          phone=VALUES(phone), phone2=VALUES(phone2), ancien_ligne=VALUES(ancien_ligne), animateur=VALUES(animateur), cin=VALUES(cin), birth_date=VALUES(birth_date),
          email=VALUES(email), source=VALUES(source), status=VALUES(status),
          assigned_to=VALUES(assigned_to), city=VALUES(city), address=VALUES(address), zone=VALUES(zone),
          gouvernorat=VALUES(gouvernorat), delegation=VALUES(delegation),
          localisation_xy=VALUES(localisation_xy), code_postal=VALUES(code_postal),
          outcome=VALUES(outcome), lost_reason=VALUES(lost_reason),
          comment=VALUES(comment), comment2=VALUES(comment2), check_valeur=VALUES(check_valeur),
          type_id=VALUES(type_id)');

    $cfIns = $db->prepare('INSERT INTO crminternet_custom_field_values (entity, entity_id, field_key, value)
                           VALUES (:e,:id,:k,:v)
                           ON DUPLICATE KEY UPDATE value = VALUES(value)');

    // CIN n'est plus unique : on accepte les doublons (autres fiches)
    // mais on remonte des "warnings" pour informer l'utilisateur.
    $warnings = [];

    // PERF: hoist out of the per-row loop to avoid N round-trips that blow up
    // memory + time on large imports (was: SELECT lead_stages per row, plus
    // SELECT-id-existence per row).
    $allowedStatus = $db->query('SELECT name FROM crminternet_lead_stages')->fetchAll(PDO::FETCH_COLUMN);
    if (!$allowedStatus) $allowedStatus = ['Nouveau','En cours','Rappel','Refus','Vendu'];
    $existingIdsMap = [];
    try {
        foreach ($db->query('SELECT id FROM crminternet_prospects', PDO::FETCH_COLUMN) as $eid) {
            $existingIdsMap[$eid] = true;
        }
    } catch (Throwable $e) { /* fallback to per-row check below */ }
    $existsStmt = $db->prepare('SELECT 1 FROM crminternet_prospects WHERE id = :id');
    $cinChkStmt = $db->prepare('SELECT id FROM crminternet_prospects WHERE cin = :c AND id <> :id LIMIT 5');

    // Map prospect-type name (case/space-insensitive) -> id, for resolving the
    // "type" column in CSV imports. Also indexes by id so existing typeId
    // values pass through unchanged.
    $typeByName = []; $typeIdSet = []; $typeNameById = [];
    try {
        foreach ($db->query('SELECT id, name FROM crminternet_prospect_types') as $tr) {
            $typeIdSet[(string)$tr['id']] = true;
            $typeNameById[(string)$tr['id']] = (string)$tr['name'];
            $key = strtolower(trim((string)$tr['name']));
            if ($key !== '') $typeByName[$key] = (string)$tr['id'];
        }
    } catch (Throwable $e) { /* table may not exist */ }
    $resolveTypeId = function ($r) use ($typeByName, $typeIdSet) {
        $cands = [$r['typeId'] ?? null, $r['type_id'] ?? null, $r['type'] ?? null, $r['typeName'] ?? null, $r['type_name'] ?? null];
        foreach ($cands as $c) {
            if ($c === null || $c === '') continue;
            $s = (string)$c;
            if (isset($typeIdSet[$s])) return $s;
            $k = strtolower(trim($s));
            if (isset($typeByName[$k])) return $typeByName[$k];
        }
        return null;
    };
    $isStreetType = function (?string $tid) use ($typeNameById): bool {
        if (!$tid) return false;
        $name = strtolower(trim($typeNameById[$tid] ?? ''));
        return $name === 'street';
    };

    // Wrap in a single transaction — large imports are 10x+ faster and never
    // leave the table in a half-imported state if a row blows up.
    $inTx = false;
    try { $db->beginTransaction(); $inTx = true; } catch (Throwable $e) {}
    foreach ($rows as $idx => $r) {
        $rowNum = $idx + 1;
        // FIX: accepter les alias front (nom/prenom/telephone/...) en plus des noms canoniques
        $r = crm_normalize_row($r);
        $ln = trim($r['lastName'] ?? '');
        if ($ln === '') {
            $skipped++;
            $blocked[] = ['row' => $rowNum, 'reason' => 'MISSING_REQUIRED', 'field' => 'lastName', 'message' => 'Nom obligatoire'];
            continue;
        }
        $id = $r['id'] ?? ('P-' . substr(bin2hex(random_bytes(6)), 0, 8));
        if (!empty($existingIdsMap)) {
            $isUpdate = isset($existingIdsMap[$id]);
        } else {
            $existsStmt->execute([':id' => $id]);
            $isUpdate = (bool)$existsStmt->fetchColumn();
        }
        if ($isUpdate && $mode === 'create_only') {
            $skipped++;
            $blocked[] = ['row' => $rowNum, 'reason' => 'ID_EXISTS', 'field' => 'id', 'message' => "ID $id existe déjà"];
            continue;
        }

        // ---- CIN normalisation (doublons autorisés) ----
        $cinNorm = trim((string)($r['cin'] ?? ''));
        $cinNorm = $cinNorm === '' ? null : $cinNorm;
        if ($cinNorm !== null) {
            $cinChkStmt->execute([':c' => $cinNorm, ':id' => $id]);
            $siblings = $cinChkStmt->fetchAll(PDO::FETCH_COLUMN);
            if ($siblings) {
                $warnings[] = ['row' => $rowNum, 'reason' => 'CIN_DUPLICATE', 'field' => 'cin',
                               'message' => "CIN $cinNorm déjà présent (fiche doublon créée)",
                               'siblings' => $siblings];
            }
        }

        $ca = $r['createdAt'] ?? date('Y-m-d');
        if (is_string($ca) && strlen($ca) >= 10) $ca = substr($ca, 0, 10);
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)$ca)) $ca = date('Y-m-d');

        $bd = $r['birthDate'] ?? null;
        if (is_string($bd) && strlen($bd) >= 10) $bd = substr($bd, 0, 10);
        if ($bd && !preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)$bd)) $bd = null;

        $assignedTo = $r['assignedTo'] ?? null;
        if ($assignedTo === '') $assignedTo = null;

        // $allowedStatus is hoisted above the loop (perf).
        $st = $r['status'] ?? ($allowedStatus[0] ?? 'Nouveau');
        if (!in_array($st, $allowedStatus, true)) $st = $allowedStatus[0] ?? 'Nouveau';

        $resolvedTid = $resolveTypeId($r);
        $animVal = null;
        if ($isStreetType($resolvedTid)) {
            $av = $r['animateur'] ?? null;
            if (is_string($av)) $av = trim($av);
            $animVal = ($av === '' || $av === null) ? null : (string)$av;
        }
        try {
            $ins->execute([
                ':id' => $id,
                ':civ' => ($r['civility'] ?? 'M') === 'Mme' ? 'Mme' : 'M',
                ':ln' => $ln,
                ':fn' => trim($r['firstName'] ?? ''),
                ':ph' => trim($r['phone'] ?? ''),
                ':ph2'=> trim($r['phone2'] ?? ''),
                ':al' => (function($v){ $v = is_string($v) ? trim($v) : $v; return ($v === '' || $v === null) ? null : (string)$v; })($r['ancienLigne'] ?? $r['ancien_ligne'] ?? null),
                ':cin'=> $cinNorm,
                ':bd' => $bd,
                ':em' => trim($r['email'] ?? ''),
                ':src' => $r['source'] ?? 'Terrain',
                ':st' => $st,
                ':at' => $assignedTo,
                ':ca' => $ca,
                ':city' => strtoupper(trim($r['gouvernorat'] ?? $r['city'] ?? '')),
                ':addr'=> trim($r['address'] ?? ''),
                ':zone'=> trim($r['delegation'] ?? $r['zone'] ?? ''),
                ':gov' => strtoupper(trim($r['gouvernorat'] ?? $r['city'] ?? '')),
                ':deleg'=> trim($r['delegation'] ?? $r['zone'] ?? ''),
                ':loc' => prospect_norm_xy($r['localisationXy'] ?? $r['localisation_xy'] ?? null),
                ':cp'  => prospect_norm_cp($r['codePostal'] ?? $r['code_postal'] ?? null),
                ':oc' => in_array(($r['outcome'] ?? 'pending'), ['pending','won','lost'], true) ? ($r['outcome'] ?? 'pending') : 'pending',
                ':lr' => $r['lostReason'] ?? null,
                ':cm' => $r['comment'] ?? null,
                ':cm2'=> $r['comment2'] ?? null,
                ':cv' => in_array(($r['checkValeur'] ?? 'pending'), ['valid','invalid','pending'], true) ? ($r['checkValeur'] ?? 'pending') : 'pending',
                ':tid'=> $resolvedTid,
                ':anim'=> $animVal,
            ]);
        } catch (Throwable $e) {
            // En import, on ne casse plus tout : on bloque la ligne et on continue.
            $skipped++;
            $blocked[] = ['row' => $rowNum, 'reason' => 'DB_ERROR', 'field' => null,
                          'message' => 'Erreur SQL: ' . $e->getMessage()];
            continue;
        }

        // Optional custom field values shipped alongside the row
        if (isset($r['customValues']) && is_array($r['customValues'])) {
            foreach ($r['customValues'] as $k => $v) {
                $cfIns->execute([
                    ':e' => 'prospect', ':id' => $id, ':k' => (string)$k,
                    ':v' => is_scalar($v) ? (string)$v : json_encode($v),
                ]);
            }
        }

        $ids[] = $id;
        if ($isUpdate) { $updated++; } else { $added++; $existingIdsMap[$id] = true; }
    }
    if ($inTx) { try { $db->commit(); } catch (Throwable $e) { try { $db->rollBack(); } catch (Throwable $e2) {} } }
    audit_log($db, $me, 'prospect.create', 'prospect', implode(',', array_slice($ids, 0, 10)),
              ['added' => $added, 'updated' => $updated, 'blocked' => count($blocked), 'warnings' => count($warnings)]);
    ok(['added' => $added, 'updated' => $updated, 'skipped' => $skipped, 'ids' => $ids,
        'blocked' => $blocked, 'warnings' => $warnings]);
}

if ($method === 'PATCH' || $method === 'PUT') {
    $in = json_input();
    $id = $in['id'] ?? ($_GET['id'] ?? '');
    if (!$id) fail('id requis', 422);

    $cur = $db->prepare('SELECT * FROM crminternet_prospects WHERE id = :id');
    $cur->execute([':id' => $id]);
    $curRow = $cur->fetch();
    if (!$curRow) fail('Prospect introuvable', 404);
    if ($isAgent) {
        // Politique : les agents peuvent éditer n'importe quel prospect, mais
        // ne peuvent pas le réassigner à un autre utilisateur (auto-assignation
        // ou désattribution uniquement).
        if (array_key_exists('assignedTo', $in)) {
            $target = $in['assignedTo'];
            if ($target !== null && $target !== '' && $target !== $me['username']) {
                fail('Accès refusé', 403);
            }
        }
    }

    $map = [
        'civility'    => 'civility',
        'lastName'    => 'last_name',
        'firstName'   => 'first_name',
        'phone'       => 'phone',
        'phone2'      => 'phone2',
        'ancienLigne' => 'ancien_ligne',
        'animateur'   => 'animateur',
        'cin'         => 'cin',
        'birthDate'   => 'birth_date',
        'email'       => 'email',
        'source'      => 'source',
        'status'      => 'status',
        'assignedTo'  => 'assigned_to',
        'city'        => 'city',
        'address'     => 'address',
        'zone'        => 'zone',
        'gouvernorat' => 'gouvernorat',
        'delegation'  => 'delegation',
        'localisationXy' => 'localisation_xy',
        'codePostal'  => 'code_postal',
        'outcome'     => 'outcome',
        'lostReason'  => 'lost_reason',
        'comment'     => 'comment',
        'comment2'    => 'comment2',
        'checkValeur' => 'check_valeur',
        'typeId'      => 'type_id',
    ];
    $sets = [];
    $params = [':id' => $id];
    $before = []; $after = [];
    foreach ($map as $k => $col) {
        if (array_key_exists($k, $in)) {
            $val = $in[$k];
            if ($k === 'civility' && !in_array($val, ['M','Mme'], true)) continue;
            if ($k === 'outcome' && !in_array($val, ['pending','won','lost'], true)) continue;
            if ($k === 'checkValeur' && !in_array($val, ['valid','invalid','pending'], true)) continue;
            if ($k === 'city' && is_string($val)) $val = strtoupper(trim($val));
            if ($k === 'gouvernorat' && is_string($val)) $val = strtoupper(trim($val));
            if ($k === 'cin') {
                $val = is_string($val) ? trim($val) : $val;
                if ($val === '' || $val === null) $val = null;
                // Doublons autorisés : pas de blocage, juste normalisation.
            }
            if ($k === 'ancienLigne' || $k === 'animateur') {
                $val = is_string($val) ? trim($val) : $val;
                if ($val === '' || $val === null) $val = null;
            }
            if ($k === 'localisationXy') $val = prospect_norm_xy($val);
            if ($k === 'codePostal')     $val = prospect_norm_cp($val);
            $sets[] = "$col = :$k";
            $params[":$k"] = $val;
            $before[$col] = $curRow[$col] ?? null;
            $after[$col]  = $val;
        }
    }
    if (!$sets) fail('Aucun champ à mettre à jour', 422);
    // ---- Transition guard + auto-action sur changement de statut ----
    $autoResult = null;
    if (array_key_exists('status', $in)) {
        $oldStatus = $curRow['status'] ?? '';
        $newStatus = (string)$in['status'];
        pipeline_assert_transition($db, 'lead', $oldStatus, $newStatus);
    }

    // Auto-clear the "reverted from opportunity/contract" highlight as soon as
    // an agent picks up the lead (assignment) or moves it off the initial
    // 'Nouveau' status — meaning the lead is now being treated again.
    if (!empty($curRow['reverted_at'])) {
        $clearHighlight = false;
        if (array_key_exists('assignedTo', $in) && !empty($in['assignedTo'])) $clearHighlight = true;
        if (array_key_exists('status', $in) && (string)$in['status'] !== 'Nouveau' && (string)$in['status'] !== ($curRow['status'] ?? '')) $clearHighlight = true;
        if ($clearHighlight) {
            $sets[] = "reverted_at = NULL";
            $sets[] = "reverted_from = NULL";
        }
    }

    $sql = 'UPDATE crminternet_prospects SET ' . implode(', ', $sets) . ' WHERE id = :id';
    $db->prepare($sql)->execute($params);
    log_field_changes($db, 'prospect', $id, $before, $after, $me['username'] ?? '');
    audit_log($db, $me, 'prospect.update', 'prospect', $id, ['fields' => array_keys(array_intersect_key($in, $map))]);

    if (array_key_exists('status', $in) && ($curRow['status'] ?? '') !== $in['status']) {
        $autoResult = pipeline_run_auto_action($db, 'lead', $id, (string)$in['status'], $me);
    }
    ok(['message' => 'Prospect mis à jour', 'auto' => $autoResult]);
}

if ($method === 'DELETE') {
    require_permission($db, $me, 'prospect.delete');
    $id = $_GET['id'] ?? '';
    if (!$id) fail('id requis', 422);
    log_field_changes($db, 'prospect', (string)$id, ['exists' => 1], ['exists' => 0, 'reason' => 'delete'], $me['username']);

    // Hard delete — suppression du prospect uniquement, sans toucher aux
    // opportunités ni aux contrats. On détache simplement les références
    // pour éviter des liens cassés ; les enfants restent vivants.
    $db->beginTransaction();
    try {
        // Détacher (ne pas supprimer) les opportunités liées
        try { $db->prepare("UPDATE crminternet_opportunities SET prospect_id = NULL WHERE prospect_id = :pid")->execute([':pid' => $id]); } catch (Throwable $e) {}
        // Détacher les contrats éventuellement liés directement au prospect
        try { $db->prepare("UPDATE crminternet_contracts SET prospect_id = NULL WHERE prospect_id = :pid")->execute([':pid' => $id]); } catch (Throwable $e) {}
        // Suppression du prospect uniquement
        $s = $db->prepare('DELETE FROM crminternet_prospects WHERE id = :id');
        $s->execute([':id' => $id]);
        $db->commit();
        audit_log($db, $me, 'prospect.delete', 'prospect', $id);
        ok(['deleted' => $s->rowCount()]);
    } catch (Throwable $e) {
        $db->rollBack();
        fail('Erreur suppression: ' . $e->getMessage(), 500);
    }
}


fail('Method not allowed', 405);
