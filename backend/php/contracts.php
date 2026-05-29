<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/pipeline_helpers.php';
require_once __DIR__ . '/geo_helpers.php';
require_once __DIR__ . '/attachment_helpers.php';
require_once __DIR__ . '/contract_info_helpers.php';
require_once __DIR__ . '/list_query_helpers.php';
if (is_file(__DIR__ . '/crm_normalize.php')) require_once __DIR__ . '/crm_normalize.php';

$me = require_auth();
$db = (new Database())->getConnection();
$method = $_SERVER['REQUEST_METHOD'];

/* ------------------------------------------------------------------ */
/* Runtime schema (idempotent, best-effort)                            */
/* ------------------------------------------------------------------ */
function ensure_contracts_runtime_schema(PDO $db): void {
    $stmts = [
        "ALTER TABLE crminternet_contracts ADD COLUMN civility ENUM('M','Mme') NOT NULL DEFAULT 'M'",
        "ALTER TABLE crminternet_contracts ADD COLUMN phone VARCHAR(40) NOT NULL DEFAULT ''",
        "ALTER TABLE crminternet_contracts ADD COLUMN phone2 VARCHAR(40) NOT NULL DEFAULT ''",
        "ALTER TABLE crminternet_contracts ADD COLUMN cin VARCHAR(40) NULL",
        "ALTER TABLE crminternet_contracts ADD COLUMN birth_date DATE NULL",
        "ALTER TABLE crminternet_contracts ADD COLUMN email VARCHAR(160) NOT NULL DEFAULT ''",
        "ALTER TABLE crminternet_contracts ADD COLUMN gouvernorat VARCHAR(120) NOT NULL DEFAULT ''",
        "ALTER TABLE crminternet_contracts ADD COLUMN delegation VARCHAR(120) NOT NULL DEFAULT ''",
        "ALTER TABLE crminternet_contracts ADD COLUMN address VARCHAR(255) NOT NULL DEFAULT ''",
        "ALTER TABLE crminternet_contracts ADD COLUMN localisation_xy VARCHAR(64) NULL",
        "ALTER TABLE crminternet_contracts ADD COLUMN code_postal VARCHAR(20) NULL",
        "ALTER TABLE crminternet_contracts ADD COLUMN comment1 TEXT NULL",
        "ALTER TABLE crminternet_contracts ADD COLUMN comment2 TEXT NULL",
        "ALTER TABLE crminternet_contracts ADD COLUMN stage_id VARCHAR(40) NULL",
        "ALTER TABLE crminternet_contracts ADD COLUMN opportunity_id VARCHAR(40) NULL",
        "ALTER TABLE crminternet_contracts ADD COLUMN type_id VARCHAR(40) NULL",
    ];
    foreach ($stmts as $sql) {
        try { $db->exec($sql); } catch (Throwable $e) { /* column may already exist */ }
    }
}
schema_ensure_once('contracts', '20260513', function () use ($db) {
    ensure_contracts_runtime_schema($db);
});

/* ------------------------------------------------------------------ */
/* Serialization                                                       */
/* ------------------------------------------------------------------ */
function row_to_contract(array $r): array {
    return [
        'id'             => $r['id']                ?? '',
        'civility'       => $r['civility']          ?? 'M',
        'lastName'       => $r['last_name']         ?? '',
        'firstName'      => $r['first_name']        ?? '',
        'phone'          => $r['phone']             ?? '',
        'phone2'         => $r['phone2']            ?? '',
        'animateur'      => $r['animateur']         ?? null,
        'ancienLigne'    => $r['ancien_ligne']      ?? null,
        'cin'            => $r['cin']               ?? '',
        'birthDate'      => $r['birth_date']        ?? null,
        'email'          => $r['email']             ?? '',
        'city'           => $r['city']              ?? '',
        'gouvernorat'    => $r['gouvernorat']       ?? '',
        'delegation'     => $r['delegation']        ?? '',
        'zone'           => $r['zone']              ?? '',
        'address'        => $r['address']           ?? '',
        'localisationXy' => $r['localisation_xy']   ?? '',
        'codePostal'     => $r['code_postal']       ?? '',
        'comment1'       => $r['comment1']          ?? null,
        'comment2'       => $r['comment2']          ?? null,
        'partner'        => $r['partner']           ?? '',
        'cabinet'        => $r['cabinet']           ?? '',
        'signatureDate'  => $r['signature_date']    ?? null,
        'effectiveDate'  => $r['effective_date']    ?? null,
        'validationDate' => $r['validation_date']   ?? null,
        'premium'        => (float)($r['premium']   ?? 0),
        'billingStatus'  => $r['billing_status']    ?? '',
        'stageId'        => $r['stage_id']          ?? null,
        'opportunityId'  => $r['opportunity_id']    ?? null,
        'prospectId'     => $r['prospect_id']       ?? null,
        'leadStatus'     => $r['lead_status']       ?? null,
        'source'         => $r['source']            ?? '',
        'assignedTo'     => $r['assigned_to']       ?? '',
        'typeId'         => $r['type_id']           ?? null,
    ];
}

$role    = $me['role'] ?? '';
$isAgent = in_array($role, ['Agent','AgentSuivi','AgentActivation','AgentVente'], true);

/* ================================================================== */
/* GET                                                                 */
/* ================================================================== */
if ($method === 'GET') {
    $id = $_GET['id'] ?? null;
    if ($id) {
        $s = $db->prepare('SELECT * FROM crminternet_contracts WHERE id = :id');
        $s->execute([':id' => $id]);
        $r = $s->fetch();
        if (!$r) fail('Not found', 404);
        // Lecture globale : tous les utilisateurs authentifiés voient les contrats.
        // Les écritures restent gardées par les permissions plus bas.
        ok(['contract' => row_to_contract($r)]);
    }
    // ---- Server-side filter / sort / pagination -------------------------
    $params = parse_list_params([
        'sortable' => [
            'signatureDate'  => 'signature_date',
            'effectiveDate'  => 'effective_date',
            'createdAt'      => 'signature_date',
            'lastName'       => 'last_name',
            'firstName'      => 'first_name',
            'billingStatus'  => 'billing_status',
            'premium'        => 'premium',
            'assignedTo'     => 'assigned_to',
            'phone'          => 'phone',
            'cin'            => 'cin',
        ],
        'defaultSort' => 'signatureDate',
        'defaultDir'  => 'desc',
        'maxPerPage'  => 200,
    ]);

    [$whereSql, $bind] = build_list_where($params, [
        'searchable'  => ['last_name','first_name','phone','phone2','cin','email'],
        'statusCol'   => 'billing_status',
        'assignedCol' => 'assigned_to',
        'dateCol'     => 'signature_date',
        'preWhere'    => '1=1',
        'preParams'   => [],
    ]);

    if ($params['count']) {
        $s = $db->prepare("SELECT COUNT(*) FROM crminternet_contracts WHERE $whereSql");
        $s->execute($bind);
        ok(['total' => (int)$s->fetchColumn()]);
    }

    $listCols = 'id, civility, last_name, first_name, phone, phone2, cin, signature_date, effective_date, premium, billing_status, stage_id, opportunity_id, prospect_id, assigned_to, gouvernorat, delegation, type_id';
    $selectCols = $params['fields'] === 'list' ? $listCols : '*';
    $orderBy = build_list_order($params);

    if ($params['paginate']) {
        $etagSeed = compute_list_etag($db, 'crminternet_contracts', $whereSql, $bind,
            $params['sortKey'].'|'.$params['dir'].'|'.$params['page'].'|'.$params['perPage'].'|'.$params['fields']);
        emit_list_etag($etagSeed);

        $countS = $db->prepare("SELECT COUNT(*) FROM crminternet_contracts WHERE $whereSql");
        $countS->execute($bind);
        $total = (int)$countS->fetchColumn();

        $sql = "SELECT $selectCols FROM crminternet_contracts WHERE $whereSql
                ORDER BY $orderBy LIMIT {$params['perPage']} OFFSET {$params['offset']}";
        $stmt = $db->prepare($sql);
        $stmt->execute($bind);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        ok([
            'contracts' => array_map('row_to_contract', $rows),
            'page'      => $params['page'],
            'per_page'  => $params['perPage'],
            'total'     => $total,
            'has_more'  => ($params['offset'] + count($rows)) < $total,
            'sort'      => $params['sortKey'],
            'dir'       => strtolower($params['dir']),
            'fields'    => $params['fields'],
        ]);
    }

    $sql = "SELECT $selectCols FROM crminternet_contracts WHERE $whereSql ORDER BY $orderBy";
    $stmt = $db->prepare($sql);
    $stmt->execute($bind);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    ok(['contracts' => array_map('row_to_contract', $rows)]);
}

/* ================================================================== */
/* PATCH / PUT — update                                                */
/* ================================================================== */
if ($method === 'PATCH' || $method === 'PUT') {
    $in  = json_input();
    $cid = $in['id'] ?? ($_GET['id'] ?? '');
    if (!$cid) fail('id requis', 422);

    $cur = $db->prepare('SELECT * FROM crminternet_contracts WHERE id = :id');
    $cur->execute([':id' => $cid]);
    $existing = $cur->fetch();
    if (!$existing) fail('Contrat introuvable', 404);

    if ($isAgent && ($existing['assigned_to'] ?? null) !== $me['username']) {
        fail('Accès refusé', 403);
    }

    $sets   = [];
    $params = [':id' => $cid];

    /* ---- billingStatus / stageId (dynamic pipeline) ------------------ */
    $newStageName = null;
    if (array_key_exists('stageId', $in) && $in['stageId']) {
        $sg = $db->prepare('SELECT name FROM crminternet_contract_stages WHERE id = :id');
        $sg->execute([':id' => $in['stageId']]);
        $newStageName = $sg->fetchColumn() ?: null;
        if (!$newStageName) fail('stageId inconnu', 422);
    } elseif (array_key_exists('billingStatus', $in)) {
        $newStageName = (string)$in['billingStatus'];
        $exists = $db->prepare('SELECT 1 FROM crminternet_contract_stages WHERE name = :n');
        $exists->execute([':n' => $newStageName]);
        if (!$exists->fetchColumn()) fail('Statut invalide', 422);
    }

    if ($newStageName !== null) {
        pipeline_assert_transition($db, 'contract', $existing['billing_status'] ?? '', $newStageName);
        $sets[]            = 'billing_status = :bs';
        $params[':bs']     = $newStageName;

        $sg = $db->prepare('SELECT id, is_won FROM crminternet_contract_stages WHERE name = :n');
        $sg->execute([':n' => $newStageName]);
        $stRow = $sg->fetch() ?: [];

        $sets[]        = 'stage_id = :sid';
        $params[':sid']= $stRow['id'] ?? null;

        if (!empty($stRow['is_won'])) {
            $sets[]        = 'validation_date = :vd';
            $params[':vd'] = date('Y-m-d');
        } else {
            $sets[] = 'validation_date = NULL';
        }

        if (($existing['billing_status'] ?? '') !== $newStageName) {
            try {
                $log = $db->prepare('INSERT INTO crminternet_activity_log
                    (id,entity_type,entity_id,contract_id,field,previous_value,new_value,user_username)
                    VALUES (:id,:et,:eid,:cid,:f,:pv,:nv,:u)');
                $log->execute([
                    ':id'  => 'A-' . substr(bin2hex(random_bytes(6)), 0, 10),
                    ':et'  => 'contract',
                    ':eid' => $cid,
                    ':cid' => $cid,
                    ':f'   => 'billingStatus',
                    ':pv'  => $existing['billing_status'] ?? '',
                    ':nv'  => $newStageName,
                    ':u'   => $me['username'] ?? '',
                ]);
            } catch (Throwable $e) { /* best-effort */ }
        }
    }

    /* ---- premium (logged separately) --------------------------------- */
    if (array_key_exists('premium', $in)) {
        $new            = (float)$in['premium'];
        $sets[]         = 'premium = :pr';
        $params[':pr']  = $new;
        if ((float)($existing['premium'] ?? 0) !== $new) {
            try {
                $log = $db->prepare('INSERT INTO crminternet_activity_log
                    (id,entity_type,entity_id,contract_id,field,previous_value,new_value,user_username)
                    VALUES (:id,:et,:eid,:cid,:f,:pv,:nv,:u)');
                $log->execute([
                    ':id'  => 'A-' . substr(bin2hex(random_bytes(6)), 0, 10),
                    ':et'  => 'contract',
                    ':eid' => $cid,
                    ':cid' => $cid,
                    ':f'   => 'premium',
                    ':pv'  => (string)($existing['premium'] ?? ''),
                    ':nv'  => (string)$new,
                    ':u'   => $me['username'] ?? '',
                ]);
            } catch (Throwable $e) { /* best-effort */ }
        }
    }

    /* ---- generic editable fields ------------------------------------- */
    $editable = [
        'civility'       => 'civility',
        'lastName'       => 'last_name',
        'firstName'      => 'first_name',
        'phone'          => 'phone',
        'phone2'         => 'phone2',
        'cin'            => 'cin',
        'birthDate'      => 'birth_date',
        'email'          => 'email',
        'city'           => 'city',
        'gouvernorat'    => 'gouvernorat',
        'delegation'     => 'delegation',
        'address'        => 'address',
        'localisationXy' => 'localisation_xy',
        'codePostal'     => 'code_postal',
        'comment1'       => 'comment1',
        'comment2'       => 'comment2',
        'partner'        => 'partner',
        'cabinet'        => 'cabinet',
        'signatureDate'  => 'signature_date',
        'effectiveDate'  => 'effective_date',
        'validationDate' => 'validation_date',
        'source'         => 'source',
        'assignedTo'     => 'assigned_to',
        'typeId'         => 'type_id',
    ];

    foreach ($editable as $k => $col) {
        if (!array_key_exists($k, $in)) continue;
        $val = $in[$k];

        if ($k === 'civility' && !in_array($val, ['M','Mme'], true)) continue;

        if (($k === 'city' || $k === 'gouvernorat') && is_string($val)) {
            $val = strtoupper(trim($val));
        }
        if ($k === 'cin') {
            $val = is_string($val) ? trim($val) : $val;
            if ($val === '' || $val === null) $val = null;
            // Doublons CIN autorisés (warning seulement à l'import).
        }
        if ($k === 'birthDate' || $k === 'signatureDate' || $k === 'effectiveDate' || $k === 'validationDate') {
            if (is_string($val) && strlen($val) >= 10) $val = substr($val, 0, 10);
            if ($val !== null && $val !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)$val)) $val = null;
        }
        if ($k === 'localisationXy') $val = prospect_norm_xy($val);
        if ($k === 'codePostal')     $val = prospect_norm_cp($val);
        if ($val === '') $val = null;

        $sets[]            = "$col = :f_$k";
        $params[":f_$k"]   = $val;
    }

    if (!$sets) fail('Aucun champ à mettre à jour', 422);

    $sql = 'UPDATE crminternet_contracts SET ' . implode(', ', $sets) . ' WHERE id = :id';
    $db->prepare($sql)->execute($params);

    if (!empty($existing['assigned_to']) && $existing['assigned_to'] !== $me['username']) {
        notify_user($db, $existing['assigned_to'], 'Contrat mis à jour',
                    "$cid modifié par {$me['username']}", "/contracts/$cid");
    }
    audit_log($db, $me, 'contract.update', 'contract', $cid);

    $autoResult = null;
    if ($newStageName !== null && ($existing['billing_status'] ?? '') !== $newStageName) {
        $autoResult = pipeline_run_auto_action($db, 'contract', $cid, $newStageName, $me);
    }
    ok(['message' => 'Contrat mis à jour', 'auto' => $autoResult]);
}

/* ================================================================== */
/* POST — revert / create / bulk-upsert                                */
/* ================================================================== */
if ($method === 'POST') {
    $in     = json_input();
    $action = $in['action'] ?? ($_GET['action'] ?? '');

    /* ---- revert contract -> prospect (lead) -------------------------- */
    if ($action === 'revert_to_prospect') {
        require_permission($db, $me, 'contract.revert');
        $cid = (string)($in['id'] ?? '');
        if ($cid === '') fail('id requis', 422);

        $cur = $db->prepare('SELECT * FROM crminternet_contracts WHERE id = :id');
        $cur->execute([':id' => $cid]);
        $row = $cur->fetch();
        if (!$row) fail('Contrat introuvable', 404);
        if ($isAgent && ($row['assigned_to'] ?? null) !== $me['username']) {
            fail('Accès refusé', 403);
        }

        // Resolve source prospect: direct column if present, else via opportunity.
        $prospectId = !empty($row['prospect_id']) ? (string)$row['prospect_id'] : null;
        $sourceOpportunityId = !empty($row['opportunity_id']) ? (string)$row['opportunity_id'] : null;
        $sourceOpportunity = null;
        if ($sourceOpportunityId) {
            $oq = $db->prepare('SELECT * FROM crminternet_opportunities WHERE id = :id');
            $oq->execute([':id' => $sourceOpportunityId]);
            $sourceOpportunity = $oq->fetch() ?: null;
            if (!$prospectId && $sourceOpportunity && !empty($sourceOpportunity['prospect_id'])) {
                $prospectId = (string)$sourceOpportunity['prospect_id'];
            }
        }

        $db->beginTransaction();
        try {
            $existingProspect = null;
            if ($prospectId) {
                $pq = $db->prepare('SELECT * FROM crminternet_prospects WHERE id = :pid LIMIT 1');
                $pq->execute([':pid' => $prospectId]);
                $existingProspect = $pq->fetch() ?: null;
            }

            $revertStatus = pipeline_pick_revert_lead_status($db);

            if ($existingProspect) {
                $stmt = $db->prepare("UPDATE crminternet_prospects
                    SET converted = 0,
                        opportunity_id = NULL,
                        status = :st,
                        outcome = 'pending',
                        lost_reason = NULL,
                        assigned_to = NULL,
                        check_valeur = 'pending',
                        converted_at = NULL,
                        created_at = NOW(),
                        reverted_at = NOW(),
                        reverted_from = 'contract'
                    WHERE id = :pid");
                $stmt->execute([':st' => $revertStatus, ':pid' => $prospectId]);
            } else {
                $prospectId = 'P-' . substr(bin2hex(random_bytes(6)), 0, 10);
                // Use the opportunity (if any) as a richer source than the contract row.
                $src = $sourceOpportunity ?: $row;
                $db->prepare("INSERT INTO crminternet_prospects
                    (id, civility, last_name, first_name, phone, phone2, cin, birth_date,
                     email, source, status, assigned_to, created_at, city, zone,
                     gouvernorat, delegation, address, localisation_xy, code_postal,
                     comment, comment2, outcome, lost_reason, check_valeur,
                     converted, converted_at, opportunity_id, type_id,
                     reverted_at, reverted_from)
                    VALUES
                    (:id,:civ,:ln,:fn,:ph,:ph2,:cin,:bd,:em,:src,:st,NULL,NOW(),:city,:zone,
                     :gov,:del,:addr,:xy,:cp,:comment,:comment2,'pending',NULL,'pending',
                     0,NULL,NULL,:tid,
                     NOW(),'contract')")
                  ->execute([
                    ':id'      => $prospectId,
                    ':st'      => $revertStatus,
                    ':civ'     => $src['civility'] ?? 'M',
                    ':ln'      => $src['last_name'] ?? $row['last_name'] ?? '',
                    ':fn'      => $src['first_name'] ?? $row['first_name'] ?? '',
                    ':ph'      => $src['phone'] ?? '',
                    ':ph2'     => $src['phone2'] ?? '',
                    ':cin'     => ($src['cin'] ?? '') !== '' ? $src['cin'] : null,
                    ':bd'      => $src['birth_date'] ?? null,
                    ':em'      => $src['email'] ?? '',
                    ':src'     => $src['source'] ?? ($row['source'] ?? ''),
                    ':city'    => $src['city'] ?? $row['city'] ?? '',
                    ':zone'    => $src['delegation'] ?? '',
                    ':gov'     => $src['gouvernorat'] ?? ($src['city'] ?? ''),
                    ':del'     => $src['delegation'] ?? '',
                    ':addr'    => $src['address'] ?? '',
                    ':xy'      => ($src['localisation_xy'] ?? '') !== '' ? $src['localisation_xy'] : null,
                    ':cp'      => ($src['code_postal'] ?? '') !== '' ? $src['code_postal'] : null,
                    ':comment' => $src['comment1'] ?? ($src['notes'] ?? null),
                    ':comment2'=> $src['comment2'] ?? null,
                    ':tid'     => $src['type_id'] ?? ($row['type_id'] ?? null),
                  ]);
            }

            // Preserve attachments + contract_info + custom fields from the contract (and opportunity) onto the prospect.
            try { attachment_clone_entity($db, 'contract', $cid, 'prospect', $prospectId); } catch (Throwable $e) {}
            try { contract_info_clone_entity($db, 'contract', $cid, 'prospect', $prospectId, $me['username'] ?? ''); } catch (Throwable $e) {}
            try { custom_field_clone_entity($db, 'contract', $cid, 'prospect', $prospectId); } catch (Throwable $e) {}
            if ($sourceOpportunityId) {
                try { attachment_clone_entity($db, 'opportunity', $sourceOpportunityId, 'prospect', $prospectId); } catch (Throwable $e) {}
                try { contract_info_clone_entity($db, 'opportunity', $sourceOpportunityId, 'prospect', $prospectId, $me['username'] ?? ''); } catch (Throwable $e) {}
                try { custom_field_clone_entity($db, 'opportunity', $sourceOpportunityId, 'prospect', $prospectId); } catch (Throwable $e) {}
                // Drop the source opportunity — prospect is the only source of truth again.
                $db->prepare('DELETE FROM crminternet_opportunities WHERE id = :id')->execute([':id' => $sourceOpportunityId]);
            }

            // Drop the contract.
            $db->prepare('DELETE FROM crminternet_contracts WHERE id = :id')->execute([':id' => $cid]);
            $db->commit();
        } catch (Throwable $e) {
            $db->rollBack();
            fail('Erreur revert: ' . $e->getMessage(), 500);
        }

        log_field_changes($db, 'contract', $cid, ['exists' => 1],
                          ['exists' => 0, 'reason' => 'revert_to_prospect', 'prospect_id' => $prospectId],
                          $me['username'] ?? '');
        if ($sourceOpportunityId) {
            log_field_changes($db, 'opportunity', $sourceOpportunityId, ['exists' => 1],
                              ['exists' => 0, 'reason' => 'revert_to_prospect', 'prospect_id' => $prospectId],
                              $me['username'] ?? '');
        }
        log_field_changes($db, 'prospect', $prospectId,
                          ['converted' => 1, 'opportunity_id' => $sourceOpportunityId ?: ''],
                          ['converted' => 0, 'opportunity_id' => '', 'reason' => 'contract→lead'],
                          $me['username'] ?? '');
        audit_log($db, $me, 'revert_lead', 'contract', $cid, ['prospectId' => $prospectId, 'opportunityId' => $sourceOpportunityId]);
        audit_log($db, $me, 'revert_lead', 'prospect', $prospectId, ['contractId' => $cid, 'opportunityId' => $sourceOpportunityId, 'fresh' => true]);
        ok(['message' => 'Contrat retourné en lead', 'prospectId' => $prospectId, 'opportunityId' => $sourceOpportunityId]);
    }

    /* ---- revert contract -> opportunity ------------------------------ */
    if ($action === 'revert_to_opportunity') {
        require_permission($db, $me, 'contract.revert');
        $cid = (string)($in['id'] ?? '');
        if ($cid === '') fail('id requis', 422);

        $cur = $db->prepare('SELECT * FROM crminternet_contracts WHERE id = :id');
        $cur->execute([':id' => $cid]);
        $row = $cur->fetch();
        if (!$row) fail('Contrat introuvable', 404);

        if ($isAgent && ($row['assigned_to'] ?? null) !== $me['username']) {
            fail('Accès refusé', 403);
        }

        $db->beginTransaction();
        try {
            $opportunityId = $row['opportunity_id'] ?? null;
            if ($opportunityId) {
                // Réactive l'opportunité d'origine.
                $db->prepare('UPDATE crminternet_opportunities
                    SET converted_to_contract = 0, contract_id = NULL,
                        converted_at = NULL, reverted_at = NOW()
                    WHERE id = :oid')->execute([':oid' => $opportunityId]);
            } else {
                // Recrée une opportunité depuis le contrat.
                $opportunityId = 'O-' . substr(bin2hex(random_bytes(6)), 0, 10);

                // Stage initial dynamique si dispo.
                $initialName = 'Qualification';
                try {
                    $oppStages = pipeline_load_stages($db, 'opportunity');
                    foreach ($oppStages['list'] ?? [] as $s) {
                        if (!empty($s['is_initial'])) { $initialName = $s['name']; break; }
                    }
                    if (!$initialName && !empty($oppStages['list'][0]['name'])) {
                        $initialName = $oppStages['list'][0]['name'];
                    }
                } catch (Throwable $e) { /* fallback */ }

                $db->prepare("INSERT INTO crminternet_opportunities
                    (id, civility, last_name, first_name, phone, email, city, source,
                     title, stage, amount, probability, assigned_to, notes, created_by, type_id)
                    VALUES (:id,:civ,:ln,:fn,:ph,:em,:ci,:src,:title,:stg,:amt,50,:at,'',:cb,:tid)")
                  ->execute([
                    ':id'   => $opportunityId,
                    ':civ'  => $row['civility'] ?? 'M',
                    ':ln'   => $row['last_name'] ?? '',
                    ':fn'   => $row['first_name'] ?? '',
                    ':ph'   => $row['phone'] ?? '',
                    ':em'   => $row['email'] ?? '',
                    ':ci'   => $row['city'] ?? '',
                    ':src'  => $row['source'] ?? '',
                    ':title'=> trim(($row['last_name'] ?? '').' '.($row['first_name'] ?? '')),
                    ':stg'  => $initialName,
                    ':amt'  => (float)($row['premium'] ?? 0),
                    ':at'   => $row['assigned_to'] ?? $me['username'],
                    ':cb'   => $me['username'],
                    ':tid'  => $row['type_id'] ?? null,
                  ]);
            }

            // Preserve attachments + contract_info + custom fields from the contract back to the opportunity.
            try { attachment_clone_entity($db, 'contract', $cid, 'opportunity', $opportunityId); } catch (Throwable $e) {}
            try { contract_info_clone_entity($db, 'contract', $cid, 'opportunity', $opportunityId, $me['username'] ?? ''); } catch (Throwable $e) {}
            try { custom_field_clone_entity($db, 'contract', $cid, 'opportunity', $opportunityId); } catch (Throwable $e) {}

            $db->prepare('DELETE FROM crminternet_contracts WHERE id = :id')->execute([':id' => $cid]);
            $db->commit();
        } catch (Throwable $e) {
            $db->rollBack();
            fail('Erreur revert: ' . $e->getMessage(), 500);
        }

        log_field_changes($db, 'contract', $cid, ['exists' => 1],
                          ['exists' => 0, 'reason' => 'revert_to_opportunity', 'opportunity_id' => $opportunityId],
                          $me['username'] ?? '');
        audit_log($db, $me, 'contract.revert', 'contract', $cid, ['opportunityId' => $opportunityId]);
        ok(['message' => 'Contrat retourné en opportunité', 'opportunityId' => $opportunityId]);
    }

    /* ---- bulk create / upsert --------------------------------------- */
    $rows = $in['rows'] ?? [$in];
    if (!is_array($rows)) fail('rows invalide', 422);

    $mode    = (string)($in['mode'] ?? 'upsert');   // 'upsert' | 'create_only'
    $added   = 0;
    $updated = 0;
    $skipped = 0;
    $ids     = [];
    $blocked = [];
    $warnings= [];

    $allowed = $db->query('SELECT name FROM crminternet_contract_stages')->fetchAll(PDO::FETCH_COLUMN);
    if (!$allowed) {
        $allowed = ['Validé Confirmation','En attente de validation','Annuler la confirmation','Pré-validé'];
    }

    $ins = $db->prepare('INSERT INTO crminternet_contracts
        (id,civility,last_name,first_name,phone,phone2,cin,birth_date,email,city,gouvernorat,delegation,address,localisation_xy,code_postal,partner,cabinet,signature_date,effective_date,validation_date,premium,billing_status,source,assigned_to,type_id,comment1,comment2)
        VALUES (:id,:civ,:ln,:fn,:ph,:ph2,:cin,:bd,:em,:city,:gov,:del,:ad,:loc,:cp,:p,:cab,:sd,:ed,:vd,:pr,:bs,:src,:at,:tid,:c1,:c2)
        ON DUPLICATE KEY UPDATE
          civility=VALUES(civility), last_name=VALUES(last_name), first_name=VALUES(first_name),
          phone=VALUES(phone), phone2=VALUES(phone2), cin=VALUES(cin), birth_date=VALUES(birth_date),
          email=VALUES(email), city=VALUES(city), gouvernorat=VALUES(gouvernorat),
          delegation=VALUES(delegation), address=VALUES(address),
          localisation_xy=VALUES(localisation_xy), code_postal=VALUES(code_postal),
          partner=VALUES(partner), cabinet=VALUES(cabinet), signature_date=VALUES(signature_date),
          effective_date=VALUES(effective_date), validation_date=VALUES(validation_date),
          premium=VALUES(premium), billing_status=VALUES(billing_status),
          source=VALUES(source), assigned_to=VALUES(assigned_to), type_id=VALUES(type_id),
          comment1=VALUES(comment1), comment2=VALUES(comment2)');

    $cfIns = $db->prepare('INSERT INTO crminternet_custom_field_values (entity, entity_id, field_key, value)
                           VALUES (:e,:id,:k,:v)
                           ON DUPLICATE KEY UPDATE value = VALUES(value)');

    foreach ($rows as $idx => $r) {
        $rowNum = $idx + 1;
        if (!is_array($r)) {
            $skipped++;
            $blocked[] = ['row'=>$rowNum, 'reason'=>'INVALID_ROW', 'field'=>null, 'message'=>'Ligne non objet'];
            continue;
        }

        // Accept front aliases (nom/prenom/telephone/...).
        if (function_exists('crm_normalize_row')) {
            $r = crm_normalize_row($r);
        }

        $ln = trim((string)($r['lastName'] ?? ''));
        if ($ln === '') {
            $skipped++;
            $blocked[] = ['row'=>$rowNum, 'reason'=>'MISSING_REQUIRED', 'field'=>'lastName', 'message'=>'Nom obligatoire'];
            continue;
        }

        $id = $r['id'] ?? ('C-' . substr(bin2hex(random_bytes(6)), 0, 10));

        $exists = $db->prepare('SELECT 1 FROM crminternet_contracts WHERE id = :id');
        $exists->execute([':id' => $id]);
        $isUpdate = (bool)$exists->fetchColumn();
        if ($isUpdate && $mode === 'create_only') {
            $skipped++;
            $blocked[] = ['row'=>$rowNum, 'reason'=>'ID_EXISTS', 'field'=>'id', 'message'=>"ID $id existe déjà"];
            continue;
        }

        // CIN normalisation (doublons autorisés, warning informatif).
        $cin = trim((string)($r['cin'] ?? ''));
        $cin = $cin === '' ? null : $cin;
        if ($cin !== null) {
            $sib = $db->prepare('SELECT id FROM crminternet_contracts WHERE cin = :c AND id <> :id LIMIT 5');
            $sib->execute([':c' => $cin, ':id' => $id]);
            $siblings = $sib->fetchAll(PDO::FETCH_COLUMN);
            if ($siblings) {
                $warnings[] = [
                    'row'      => $rowNum,
                    'reason'   => 'CIN_DUPLICATE',
                    'field'    => 'cin',
                    'message'  => "CIN $cin déjà présent (fiche doublon créée)",
                    'siblings' => $siblings,
                ];
            }
        }

        // billingStatus validation (fallback safe).
        $bs = $r['billingStatus'] ?? 'Pré-validé';
        if (!in_array($bs, $allowed, true)) {
            $bs = in_array('Pré-validé', $allowed, true) ? 'Pré-validé' : $allowed[0];
        }

        // Date normalisations.
        $bd = $r['birthDate'] ?? null;
        if (is_string($bd) && strlen($bd) >= 10) $bd = substr($bd, 0, 10);
        if ($bd && !preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)$bd)) $bd = null;

        $sd = $r['signatureDate'] ?? date('Y-m-d');
        if (is_string($sd) && strlen($sd) >= 10) $sd = substr($sd, 0, 10);
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)$sd)) $sd = date('Y-m-d');

        $ed = $r['effectiveDate'] ?? date('Y-m-d');
        if (is_string($ed) && strlen($ed) >= 10) $ed = substr($ed, 0, 10);
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)$ed)) $ed = date('Y-m-d');

        $vd = $r['validationDate'] ?? null;
        if (is_string($vd) && strlen($vd) >= 10) $vd = substr($vd, 0, 10);
        if ($vd === '' || ($vd && !preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)$vd))) $vd = null;

        try {
            $ins->execute([
                ':id'  => $id,
                ':civ' => ($r['civility'] ?? 'M') === 'Mme' ? 'Mme' : 'M',
                ':ln'  => $ln,
                ':fn'  => trim((string)($r['firstName'] ?? '')),
                ':ph'  => trim((string)($r['phone']  ?? '')),
                ':ph2' => trim((string)($r['phone2'] ?? '')),
                ':cin' => $cin,
                ':bd'  => $bd,
                ':em'  => trim((string)($r['email'] ?? '')),
                ':city'=> strtoupper(trim((string)($r['gouvernorat'] ?? $r['city'] ?? ''))),
                ':gov' => strtoupper(trim((string)($r['gouvernorat'] ?? $r['city'] ?? ''))),
                ':del' => trim((string)($r['delegation'] ?? '')),
                ':ad'  => trim((string)($r['address']    ?? '')),
                ':loc' => prospect_norm_xy($r['localisationXy'] ?? $r['localisation_xy'] ?? null),
                ':cp'  => prospect_norm_cp($r['codePostal']     ?? $r['code_postal']     ?? null),
                ':p'   => $r['partner']  ?? 'NEOLIANE',
                ':cab' => $r['cabinet']  ?? 'Cabinet Paris 1',
                ':sd'  => $sd,
                ':ed'  => $ed,
                ':vd'  => $vd,
                ':pr'  => (float)($r['premium'] ?? 0),
                ':bs'  => $bs,
                ':src' => $r['source']      ?? 'Web',
                ':at'  => $r['assignedTo']  ?? '—',
                ':tid' => isset($r['typeId']) && $r['typeId'] !== '' ? (string)$r['typeId'] : null,
                ':c1'  => $r['comment1'] ?? null,
                ':c2'  => $r['comment2'] ?? null,
            ]);
        } catch (Throwable $e) {
            $skipped++;
            $blocked[] = [
                'row'     => $rowNum,
                'reason'  => 'DB_ERROR',
                'field'   => null,
                'message' => 'SQL: ' . $e->getMessage(),
            ];
            continue;
        }

        // Optional custom field values.
        if (isset($r['customValues']) && is_array($r['customValues'])) {
            foreach ($r['customValues'] as $k => $v) {
                try {
                    $cfIns->execute([
                        ':e'  => 'contract',
                        ':id' => $id,
                        ':k'  => (string)$k,
                        ':v'  => is_scalar($v) ? (string)$v : json_encode($v),
                    ]);
                } catch (Throwable $e) { /* best-effort */ }
            }
        }

        $ids[] = $id;
        if ($isUpdate) $updated++; else $added++;
    }

    audit_log($db, $me, 'contract.create', 'contract',
              implode(',', array_slice($ids, 0, 10)),
              ['added' => $added, 'updated' => $updated,
               'blocked' => count($blocked), 'warnings' => count($warnings)]);

    ok([
        'added'    => $added,
        'updated'  => $updated,
        'skipped'  => $skipped,
        'ids'      => $ids,
        'blocked'  => $blocked,
        'warnings' => $warnings,
    ]);
}

/* ================================================================== */
/* DELETE                                                              */
/* ================================================================== */
if ($method === 'DELETE') {
    require_permission($db, $me, 'contract.delete');
    $id = $_GET['id'] ?? '';
    if (!$id) fail('id requis', 422);

    // Best-effort: trace deletion on the originating prospect for lifecycle history.
    try {
        $cu = $db->prepare('SELECT opportunity_id FROM crminternet_contracts WHERE id = :id');
        $cu->execute([':id' => $id]);
        $oppId = (string)($cu->fetchColumn() ?: '');
        if ($oppId !== '') {
            $pu = $db->prepare('SELECT prospect_id FROM crminternet_opportunities WHERE id = :id');
            $pu->execute([':id' => $oppId]);
            $pid = (string)($pu->fetchColumn() ?: '');
            if ($pid !== '') {
                log_field_changes($db, 'prospect', $pid,
                    ['contract_id' => $id],
                    ['contract_id' => '', 'reason' => 'contract_deleted'],
                    $me['username'] ?? '');
            }
        }
    } catch (Throwable $e) { /* best-effort */ }

    log_field_changes($db, 'contract', (string)$id,
        ['exists' => 1],
        ['exists' => 0, 'reason' => 'delete'],
        $me['username'] ?? '');

    $s = $db->prepare('DELETE FROM crminternet_contracts WHERE id = :id');
    $s->execute([':id' => $id]);

    audit_log($db, $me, 'contract.delete', 'contract', $id);
    ok(['deleted' => $s->rowCount()]);
}

fail('Method not allowed', 405);
