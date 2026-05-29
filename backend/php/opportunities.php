<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/pipeline_helpers.php';
require_once __DIR__ . '/geo_helpers.php';
require_once __DIR__ . '/attachment_helpers.php';
require_once __DIR__ . '/contract_info_helpers.php';
require_once __DIR__ . '/list_query_helpers.php';
$me = require_auth();
$db = (new Database())->getConnection();
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

function ensure_opportunities_runtime_schema(PDO $db): void {
    $stmts = [
        "CREATE TABLE IF NOT EXISTS crminternet_opportunities (
            id VARCHAR(40) PRIMARY KEY, prospect_id VARCHAR(40) NULL,
            civility ENUM('M','Mme') NOT NULL DEFAULT 'M', last_name VARCHAR(120) NOT NULL,
            first_name VARCHAR(120) NOT NULL DEFAULT '', phone VARCHAR(40) NOT NULL DEFAULT '',
            email VARCHAR(160) NOT NULL DEFAULT '', city VARCHAR(120) NOT NULL DEFAULT '',
            source VARCHAR(80) NOT NULL DEFAULT '', title VARCHAR(200) NOT NULL DEFAULT '',
            stage VARCHAR(80) NOT NULL DEFAULT 'Qualification', amount DECIMAL(10,2) NOT NULL DEFAULT 0,
            probability TINYINT NOT NULL DEFAULT 50, expected_close_date DATE NULL,
            assigned_to VARCHAR(80) NULL, notes TEXT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            created_by VARCHAR(80) NULL, converted_to_contract TINYINT(1) NOT NULL DEFAULT 0,
            contract_id VARCHAR(40) NULL, converted_at DATETIME NULL, reverted_at DATETIME NULL,
            INDEX idx_stage (stage), INDEX idx_assigned (assigned_to)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
        "ALTER TABLE crminternet_opportunities ADD COLUMN phone2 VARCHAR(40) NOT NULL DEFAULT ''",
        "ALTER TABLE crminternet_opportunities ADD COLUMN cin VARCHAR(40) NULL",
        "ALTER TABLE crminternet_opportunities ADD COLUMN birth_date DATE NULL",
        "ALTER TABLE crminternet_opportunities ADD COLUMN gouvernorat VARCHAR(120) NOT NULL DEFAULT ''",
        "ALTER TABLE crminternet_opportunities ADD COLUMN delegation VARCHAR(120) NOT NULL DEFAULT ''",
        "ALTER TABLE crminternet_opportunities ADD COLUMN address VARCHAR(255) NOT NULL DEFAULT ''",
        "ALTER TABLE crminternet_opportunities ADD COLUMN localisation_xy VARCHAR(64) NULL",
        "ALTER TABLE crminternet_opportunities ADD COLUMN code_postal VARCHAR(20) NULL",
        "ALTER TABLE crminternet_opportunities ADD COLUMN comment1 TEXT NULL",
        "ALTER TABLE crminternet_opportunities ADD COLUMN comment2 TEXT NULL",
        "ALTER TABLE crminternet_opportunities ADD COLUMN type_id VARCHAR(40) NULL",
    ];
    foreach ($stmts as $sql) { try { $db->exec($sql); } catch (Throwable $e) {} }
}
schema_ensure_once('opportunities', '20260513', function () use ($db) {
    ensure_opportunities_runtime_schema($db);
});

function row_to_opportunity(array $r): array {
    return [
        'id'                  => $r['id'],
        'prospectId'          => $r['prospect_id'],
        'civility'            => $r['civility'],
        'lastName'            => $r['last_name'],
        'firstName'           => $r['first_name'],
        'phone'               => $r['phone'],
        'phone2'              => $r['phone2'] ?? '',
        'animateur'           => $r['animateur'] ?? null,
        'ancienLigne'         => $r['ancien_ligne'] ?? null,
        'cin'                 => $r['cin'] ?? '',
        'birthDate'           => $r['birth_date'] ?? null,
        'email'               => $r['email'],
        'city'                => $r['city'],
        'gouvernorat'         => $r['gouvernorat'] ?? '',
        'delegation'          => $r['delegation'] ?? '',
        'zone'                => $r['zone'] ?? '',
        'address'             => $r['address'] ?? '',
        'localisationXy'      => $r['localisation_xy'] ?? '',
        'codePostal'          => $r['code_postal'] ?? '',
        'comment1'            => $r['comment1'] ?? null,
        'comment2'            => $r['comment2'] ?? null,
        'source'              => $r['source'],
        'leadStatus'          => $r['lead_status'] ?? null,
        'lostReason'          => $r['lost_reason'] ?? null,
        'title'               => $r['title'],
        'stage'               => $r['stage'],
        'amount'              => (float)$r['amount'],
        'probability'         => (int)$r['probability'],
        'expectedCloseDate'   => $r['expected_close_date'],
        'assignedTo'          => $r['assigned_to'],
        'notes'               => $r['notes'],
        'createdAt'           => $r['created_at'],
        'createdBy'           => $r['created_by'],
        'convertedToContract' => !empty($r['converted_to_contract']),
        'contractId'          => $r['contract_id'],
        'convertedAt'         => $r['converted_at'],
        'revertedAt'          => $r['reverted_at'],
        'typeId'              => $r['type_id'] ?? null,
    ];
}

function opp_check_cin_unique(PDO $db, ?string $cin, string $excludeId): ?string {
    if ($cin === null || $cin === '') return null;
    $s = $db->prepare('SELECT id FROM crminternet_opportunities WHERE cin = :c AND id <> :id LIMIT 1');
    $s->execute([':c' => $cin, ':id' => $excludeId]);
    return $s->fetchColumn() ?: null;
}

$role     = $me['role'] ?? '';
$username = $me['username'] ?? '';
$isAgent  = in_array($role, ['Agent','AgentSuivi','AgentActivation','AgentVente'], true);

// All endpoints require the opportunity.view permission (Admin bypasses).
require_permission($db, $me, 'opportunity.view');

// ---------------------------------------------------------------- GET
if ($method === 'GET') {
    $id = $_GET['id'] ?? null;
    // Admin/Manager peuvent voir toutes les opportunités converties via ?include_converted=1
    $includeConverted = !empty($_GET['include_converted']);
    $convClause = $includeConverted ? '' : ' AND (converted_to_contract IS NULL OR converted_to_contract = 0)';

    if ($id) {
        $s = $db->prepare('SELECT * FROM crminternet_opportunities WHERE id = :id');
        $s->execute([':id' => $id]);
        $r = $s->fetch();
        if (!$r) fail('Not found', 404);
        // Lecture globale : tous les utilisateurs authentifiés voient toutes les
        // opportunités. Les permissions restent appliquées sur les écritures.
        ok(['opportunity' => row_to_opportunity($r)]);
    }

    $convClause = $includeConverted ? '1=1' : '(converted_to_contract IS NULL OR converted_to_contract = 0)';

    // ---- Server-side filter / sort / pagination -------------------------
    $params = parse_list_params([
        'sortable' => [
            'createdAt'  => 'created_at',
            'lastName'   => 'last_name',
            'firstName'  => 'first_name',
            'stage'      => 'stage',
            'amount'     => 'amount',
            'assignedTo' => 'assigned_to',
            'phone'      => 'phone',
            'cin'        => 'cin',
        ],
        'defaultSort' => 'createdAt',
        'defaultDir'  => 'desc',
        'maxPerPage'  => 200,
    ]);

    [$whereSql, $bind] = build_list_where($params, [
        'searchable'  => ['last_name','first_name','phone','phone2','cin','email','title'],
        'statusCol'   => 'stage',
        'assignedCol' => 'assigned_to',
        'dateCol'     => 'created_at',
        'preWhere'    => $convClause,
        'preParams'   => [],
    ]);

    if ($params['count']) {
        $s = $db->prepare("SELECT COUNT(*) FROM crminternet_opportunities WHERE $whereSql");
        $s->execute($bind);
        ok(['total' => (int)$s->fetchColumn()]);
    }

    $listCols = 'id, prospect_id, civility, last_name, first_name, phone, phone2, cin, stage, amount, assigned_to, created_at, gouvernorat, delegation, converted_to_contract, contract_id, type_id';
    $selectCols = $params['fields'] === 'list' ? $listCols : '*';
    $orderBy = build_list_order($params);

    if ($params['paginate']) {
        $etagSeed = compute_list_etag($db, 'crminternet_opportunities', $whereSql, $bind,
            $params['sortKey'].'|'.$params['dir'].'|'.$params['page'].'|'.$params['perPage'].'|'.$params['fields']);
        emit_list_etag($etagSeed);

        $countS = $db->prepare("SELECT COUNT(*) FROM crminternet_opportunities WHERE $whereSql");
        $countS->execute($bind);
        $total = (int)$countS->fetchColumn();

        $sql = "SELECT $selectCols FROM crminternet_opportunities WHERE $whereSql
                ORDER BY $orderBy LIMIT {$params['perPage']} OFFSET {$params['offset']}";
        $stmt = $db->prepare($sql);
        $stmt->execute($bind);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        ok([
            'opportunities' => array_map('row_to_opportunity', $rows),
            'page'          => $params['page'],
            'per_page'      => $params['perPage'],
            'total'         => $total,
            'has_more'      => ($params['offset'] + count($rows)) < $total,
            'sort'          => $params['sortKey'],
            'dir'           => strtolower($params['dir']),
            'fields'        => $params['fields'],
        ]);
    }

    $sql = "SELECT $selectCols FROM crminternet_opportunities WHERE $whereSql ORDER BY $orderBy";
    $stmt = $db->prepare($sql);
    $stmt->execute($bind);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    ok(['opportunities' => array_map('row_to_opportunity', $rows)]);
}

// --------------------------------------------------- POST: convert / revert / convert_to_contract / create
if ($method === 'POST') {
    $in = json_input();
    $in = crm_normalize_row($in);
    $action = $in['action'] ?? $action ?? '';

    // ---- Convert prospect -> opportunity --------------------------------
    if ($action === 'convert_from_prospect') {
        require_permission($db, $me, 'opportunity.convert');
        $pid = (string)($in['prospectId'] ?? '');
        if ($pid === '') fail('prospectId requis', 422);
        $s = $db->prepare('SELECT * FROM crminternet_prospects WHERE id = :id');
        $s->execute([':id' => $pid]);
        $p = $s->fetch();
        if (!$p) fail('Prospect introuvable', 404);
        if (!empty($p['converted'])) fail('Ce lead est déjà converti', 409);
        if ($isAgent && ($p['assigned_to'] ?? '') !== $username && ($p['assigned_to'] ?? '') !== '') {
            fail('Accès refusé', 403);
        }
        $oid = 'O-' . substr(bin2hex(random_bytes(6)), 0, 10);
        $title       = trim((string)($in['title'] ?? ($p['last_name'] . ' ' . $p['first_name'])));
        $amount      = (float)($in['amount'] ?? 0);
        $probability = max(0, min(100, (int)($in['probability'] ?? 50)));
        // Use the admin-configured initial opportunity stage instead of a
        // hardcoded legacy name (e.g. "Qualification") that no longer exists
        // after the stages table was edited.
        $oppStages   = pipeline_load_stages($db, 'opportunity');
        $initialName = 'nouveau';
        foreach ($oppStages['list'] as $st) {
            if (!empty($st['is_initial'])) { $initialName = $st['name']; break; }
        }
        if (empty($oppStages['list'])) $initialName = 'nouveau';
        elseif (!isset($oppStages['byName'][$initialName])) {
            $initialName = $oppStages['list'][0]['name'];
        }
        $stage       = (string)($in['stage'] ?? $initialName);
        if (!isset($oppStages['byName'][$stage])) $stage = $initialName;
        $closeDate   = $in['expectedCloseDate'] ?? null;
        $notes       = (string)($in['notes'] ?? '');

        $db->beginTransaction();
        try {
            $ins = $db->prepare("INSERT INTO crminternet_opportunities
                (id, prospect_id, civility, last_name, first_name, phone, email, city, source,
                 title, stage, amount, probability, expected_close_date, assigned_to, notes,
                 created_by, type_id)
                VALUES (:id,:pid,:civ,:ln,:fn,:ph,:em,:ci,:src,:title,:stg,:amt,:pr,:cd,:at,:nt,:cb,:tid)");
            $ins->execute([
                ':id' => $oid, ':pid' => $pid,
                ':civ'=> $p['civility'], ':ln' => $p['last_name'], ':fn' => $p['first_name'],
                ':ph' => $p['phone'], ':em' => $p['email'], ':ci' => $p['city'], ':src' => $p['source'],
                ':title' => $title, ':stg' => $stage, ':amt' => $amount, ':pr' => $probability,
                ':cd' => $closeDate ?: null,
                ':at' => $p['assigned_to'] ?: $username,
                ':nt' => $notes, ':cb' => $username,
                ':tid'=> $p['type_id'] ?? null,
            ]);
            // Mark the prospect as converted (hidden from leads list, kept for history).
            $upd = $db->prepare('UPDATE crminternet_prospects
                SET converted = 1, converted_at = NOW(), opportunity_id = :oid
                WHERE id = :pid');
            $upd->execute([':oid' => $oid, ':pid' => $pid]);
            // Propagate "Information contrat" (Détails Techniques) saved on the
            // prospect over to the new opportunity so the data follows the lead.
            try { contract_info_clone_entity($db, 'prospect', $pid, 'opportunity', $oid, $username); } catch (Throwable $e) {}
            $db->commit();
        } catch (Throwable $e) {
            $db->rollBack();
            fail('Erreur: ' . $e->getMessage(), 500);
        }
        log_field_changes($db, 'prospect', $pid,
            ['converted' => 0], ['converted' => 1], $username);
        log_field_changes($db, 'opportunity', $oid,
            [], ['stage' => $stage, 'created_from_prospect' => $pid], $username);
        ok(['opportunityId' => $oid, 'message' => 'Lead converti en opportunité']);
    }

    // ---- Revert opportunity -> prospect ---------------------------------
    if ($action === 'revert_to_prospect') {
        require_permission($db, $me, 'opportunity.revert');
        $oid = (string)($in['id'] ?? '');
        if ($oid === '') fail('id requis', 422);
        $s = $db->prepare('SELECT * FROM crminternet_opportunities WHERE id = :id');
        $s->execute([':id' => $oid]);
        $o = $s->fetch();
        if (!$o) fail('Opportunité introuvable', 404);
        if (!empty($o['converted_to_contract'])) fail('Opportunité déjà transformée en contrat — réversion impossible', 409);

        $revertedProspectId = null;
        $prospectBefore = [];
        $prospectAfter = [];
        $db->beginTransaction();
        try {
            $revertedProspectId = $o['prospect_id']
                ? (string)$o['prospect_id']
                : ('P-' . substr(bin2hex(random_bytes(6)), 0, 10));

            $existingProspect = null;
            if ($o['prospect_id']) {
                $curProspect = $db->prepare('SELECT * FROM crminternet_prospects WHERE id = :pid LIMIT 1');
                $curProspect->execute([':pid' => $revertedProspectId]);
                $existingProspect = $curProspect->fetch();
            }

            if ($existingProspect) {
                $prospectBefore = [
                    'converted' => !empty($existingProspect['converted']) ? 1 : 0,
                    'opportunity_id' => $existingProspect['opportunity_id'] ?? '',
                    'status' => $existingProspect['status'] ?? '',
                    'outcome' => $existingProspect['outcome'] ?? '',
                    'lost_reason' => $existingProspect['lost_reason'] ?? '',
                    'assigned_to' => $existingProspect['assigned_to'] ?? '',
                    'created_at' => $existingProspect['created_at'] ?? '',
                    'check_valeur' => $existingProspect['check_valeur'] ?? '',
                    'converted_at' => $existingProspect['converted_at'] ?? '',
                ];
                $revertStatus = pipeline_pick_revert_lead_status($db);
                $upd = $db->prepare("UPDATE crminternet_prospects
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
                        reverted_from = 'opportunity'
                    WHERE id = :pid");
                $upd->execute([':st' => $revertStatus, ':pid' => $revertedProspectId]);
            } else {
                $revertStatus = pipeline_pick_revert_lead_status($db);
                $ins = $db->prepare("INSERT INTO crminternet_prospects
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
                     NOW(),'opportunity')");
                $ins->execute([
                    ':id' => $revertedProspectId,
                    ':st' => $revertStatus,
                    ':civ' => $o['civility'],
                    ':ln' => $o['last_name'],
                    ':fn' => $o['first_name'],
                    ':ph' => $o['phone'],
                    ':ph2' => $o['phone2'] ?? '',
                    ':cin' => ($o['cin'] ?? '') !== '' ? $o['cin'] : null,
                    ':bd' => $o['birth_date'] ?? null,
                    ':em' => $o['email'],
                    ':src' => $o['source'],
                    ':city' => $o['city'],
                    ':zone' => $o['delegation'] ?? '',
                    ':gov' => $o['gouvernorat'] ?? ($o['city'] ?? ''),
                    ':del' => $o['delegation'] ?? '',
                    ':addr' => $o['address'] ?? '',
                    ':xy' => ($o['localisation_xy'] ?? '') !== '' ? $o['localisation_xy'] : null,
                    ':cp' => ($o['code_postal'] ?? '') !== '' ? $o['code_postal'] : null,
                    ':comment' => $o['comment1'] ?? ($o['notes'] ?? null),
                    ':comment2' => $o['comment2'] ?? null,
                    ':tid' => $o['type_id'] ?? null,
                ]);
            }

            $prospectAfter = [
                'converted' => 0,
                'opportunity_id' => '',
                'status' => $revertStatus,
                'outcome' => 'pending',
                'lost_reason' => '',
                'assigned_to' => '',
                'check_valeur' => 'pending',
                'converted_at' => '',
                'created_at' => date('Y-m-d H:i:s'),
            ];
            // Re-clone attachments + contract_info from opportunity back to the prospect
            // so any work done at the opportunity stage is preserved on the lead.
            try { attachment_clone_entity($db, 'opportunity', $oid, 'prospect', $revertedProspectId); } catch (Throwable $e) {}
            try { contract_info_clone_entity($db, 'opportunity', $oid, 'prospect', $revertedProspectId, $username); } catch (Throwable $e) {}
            try { custom_field_clone_entity($db, 'opportunity', $oid, 'prospect', $revertedProspectId); } catch (Throwable $e) {}

            // Mark the opportunity as reverted (delete it; the prospect is the source of truth again).
            $del = $db->prepare('DELETE FROM crminternet_opportunities WHERE id = :id');
            $del->execute([':id' => $oid]);
            $db->commit();
        } catch (Throwable $e) {
            $db->rollBack();
            fail('Erreur: ' . $e->getMessage(), 500);
        }
        log_field_changes($db, 'prospect', $revertedProspectId, $prospectBefore, $prospectAfter, $username);
        log_field_changes($db, 'opportunity', $oid,
            ['exists' => 1], ['exists' => 0, 'reverted_to_prospect' => $revertedProspectId], $username);
        audit_log($db, $me, 'revert_lead', 'prospect', $revertedProspectId, ['opportunityId' => $oid, 'fresh' => true, 'assignedTo' => null]);
        audit_log($db, $me, 'revert_lead', 'opportunity', $oid, ['prospectId' => $revertedProspectId]);
        ok(['message' => 'Opportunité retournée vers les leads', 'prospectId' => $revertedProspectId]);
    }

    // ---- Convert opportunity -> contract --------------------------------
    if ($action === 'convert_to_contract') {
        require_permission($db, $me, 'opportunity.convert');
        $oid = (string)($in['id'] ?? '');
        if ($oid === '') fail('id requis', 422);
        $s = $db->prepare('SELECT * FROM crminternet_opportunities WHERE id = :id');
        $s->execute([':id' => $oid]);
        $o = $s->fetch();
        if (!$o) fail('Opportunité introuvable', 404);
        if (!empty($o['converted_to_contract'])) fail('Opportunité déjà transformée en contrat', 409);

        $partner       = (string)($in['partner'] ?? 'NEOLIANE');
        $cabinet       = (string)($in['cabinet'] ?? 'Cabinet Paris 1');
        $signatureDate = (string)($in['signatureDate'] ?? date('Y-m-d'));
        $effectiveDate = (string)($in['effectiveDate'] ?? $signatureDate);
        $premium       = (float)($in['premium'] ?? $o['amount']);

        $cid = 'C-' . substr(bin2hex(random_bytes(6)), 0, 10);
        $db->beginTransaction();
        try {
            require_once __DIR__ . '/conversion_helpers.php';
            // Snapshot complet de l'opportunité (civilité, animateur, ancien
            // ligne, identité, adresse, GPS, observations, statut, type…) +
            // référence directe au prospect_id pour traçabilité bout-en-bout.
            conversion_insert_contract_from_opportunity($db, $cid, $o, [
                'partner'        => $partner,
                'cabinet'        => $cabinet,
                'signature_date' => $signatureDate,
                'effective_date' => $effectiveDate,
                'premium'        => $premium,
                'billing_status' => 'Pré-validé',
                // Contrat créé sans agent assigné (à attribuer manuellement).
                'assigned_to'    => '',
            ]);
            $upd = $db->prepare('UPDATE crminternet_opportunities
                SET converted_to_contract = 1, contract_id = :cid, converted_at = NOW()
                WHERE id = :id');
            $upd->execute([':cid' => $cid, ':id' => $oid]);

            // Clone attachments: opportunity -> contract, plus original prospect (if any) -> contract.
            try { attachment_clone_entity($db, 'opportunity', $oid, 'contract', $cid); } catch (Throwable $e) {}
            if (!empty($o['prospect_id'])) {
                try { attachment_clone_entity($db, 'prospect', (string)$o['prospect_id'], 'contract', $cid); } catch (Throwable $e) {}
            }

            // Propagate custom field values: opportunity → contract, then merge
            // in any values from the original prospect (without overwriting).
            try {
                require_once __DIR__ . '/custom_field_helpers.php';
                custom_field_clone_entity($db, 'opportunity', $oid, 'contract', $cid);
                if (!empty($o['prospect_id'])) {
                    custom_field_clone_entity($db, 'prospect', (string)$o['prospect_id'], 'contract', $cid);
                }
            } catch (Throwable $e) {}

            // Propagate "Information contrat" (Détails Techniques): try the
            // opportunity row first, then fall back to the original prospect.
            try {
                $cloned = contract_info_clone_entity($db, 'opportunity', $oid, 'contract', $cid, $username);
                if (!$cloned && !empty($o['prospect_id'])) {
                    contract_info_clone_entity($db, 'prospect', (string)$o['prospect_id'], 'contract', $cid, $username);
                }
            } catch (Throwable $e) {}

            $db->commit();
        } catch (Throwable $e) {
            $db->rollBack();
            fail('Erreur: ' . $e->getMessage(), 500);
        }
        log_field_changes($db, 'opportunity', $oid,
            ['converted_to_contract' => 0], ['converted_to_contract' => 1, 'contract_id' => $cid], $username);
        ok(['contractId' => $cid, 'message' => 'Opportunité convertie en contrat']);
    }

    // ---- Create opportunity from scratch (rare) -------------------------
    if ($action === '' || $action === 'create') {
        require_permission($db, $me, 'opportunity.edit');
        // Bulk import : { rows: [...], mode?: 'upsert'|'create_only' }
        if (isset($in['rows']) && is_array($in['rows'])) {
            $rows = $in['rows'];
            $mode = (string)($in['mode'] ?? 'upsert');
            $added = 0; $updated = 0; $skipped = 0; $ids = []; $blocked = []; $warnings = [];
            foreach ($rows as $idx => $r) {
                $rowNum = $idx + 1;
                $r = crm_normalize_row(is_array($r) ? $r : []);
                $ln = trim((string)($r['lastName'] ?? ''));
                if ($ln === '') {
                    $skipped++; $blocked[] = ['row'=>$rowNum,'reason'=>'MISSING_REQUIRED','field'=>'lastName','message'=>'Nom obligatoire'];
                    continue;
                }
                $oid = $r['id'] ?? ('O-' . substr(bin2hex(random_bytes(6)), 0, 10));
                $ex = $db->prepare('SELECT 1 FROM crminternet_opportunities WHERE id = :id');
                $ex->execute([':id' => $oid]);
                $isUpdate = (bool)$ex->fetchColumn();
                if ($isUpdate && $mode === 'create_only') {
                    $skipped++; $blocked[] = ['row'=>$rowNum,'reason'=>'ID_EXISTS','field'=>'id','message'=>"ID $oid existe déjà"];
                    continue;
                }
                $cin = trim((string)($r['cin'] ?? ''));
                $cin = $cin === '' ? null : $cin;
                if ($cin !== null) {
                    $sib = $db->prepare('SELECT id FROM crminternet_opportunities WHERE cin = :c AND id <> :id LIMIT 5');
                    $sib->execute([':c'=>$cin, ':id'=>$oid]);
                    $siblings = $sib->fetchAll(PDO::FETCH_COLUMN);
                    if ($siblings) {
                        $warnings[] = ['row'=>$rowNum,'reason'=>'CIN_DUPLICATE','field'=>'cin',
                                       'message'=>"CIN $cin déjà présent (fiche doublon créée)",
                                       'siblings'=>$siblings];
                    }
                }
                try {
                    $sql = "INSERT INTO crminternet_opportunities
                        (id, civility, last_name, first_name, phone, phone2, cin, birth_date, email, city,
                         gouvernorat, delegation, address, localisation_xy, code_postal, source, title, stage, amount, probability,
                         expected_close_date, assigned_to, notes, created_by, type_id, comment1, comment2)
                        VALUES (:id,:civ,:ln,:fn,:ph,:ph2,:cin,:bd,:em,:ci,:gov,:del,:ad,:loc,:cp,:src,:t,:stg,:amt,:pr,:cd,:at,:nt,:cb,:tid,:c1,:c2)
                        ON DUPLICATE KEY UPDATE
                          civility=VALUES(civility), last_name=VALUES(last_name), first_name=VALUES(first_name),
                          phone=VALUES(phone), phone2=VALUES(phone2), cin=VALUES(cin), birth_date=VALUES(birth_date),
                          email=VALUES(email), city=VALUES(city), gouvernorat=VALUES(gouvernorat),
                          delegation=VALUES(delegation), address=VALUES(address),
                          localisation_xy=VALUES(localisation_xy), code_postal=VALUES(code_postal),
                          source=VALUES(source),
                          title=VALUES(title), stage=VALUES(stage), amount=VALUES(amount), probability=VALUES(probability),
                          expected_close_date=VALUES(expected_close_date), assigned_to=VALUES(assigned_to),
                          notes=VALUES(notes), type_id=VALUES(type_id), comment1=VALUES(comment1), comment2=VALUES(comment2)";
                    $bd = $r['birthDate'] ?? null;
                    if (is_string($bd) && strlen($bd) >= 10) $bd = substr($bd,0,10);
                    if ($bd && !preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)$bd)) $bd = null;
                    $db->prepare($sql)->execute([
                        ':id'=>$oid,
                        ':civ'=> ($r['civility'] ?? 'M') === 'Mme' ? 'Mme' : 'M',
                        ':ln'=>$ln,
                        ':fn'=>trim((string)($r['firstName'] ?? '')),
                        ':ph'=>trim((string)($r['phone'] ?? '')),
                        ':ph2'=>trim((string)($r['phone2'] ?? '')),
                        ':cin'=>$cin,
                        ':bd'=>$bd,
                        ':em'=>trim((string)($r['email'] ?? '')),
                        ':ci'=>strtoupper(trim((string)($r['gouvernorat'] ?? $r['city'] ?? ''))),
                        ':gov'=>strtoupper(trim((string)($r['gouvernorat'] ?? $r['city'] ?? ''))),
                        ':del'=>trim((string)($r['delegation'] ?? '')),
                        ':ad'=>trim((string)($r['address'] ?? '')),
                        ':loc'=>prospect_norm_xy($r['localisationXy'] ?? $r['localisation_xy'] ?? null),
                        ':cp'=>prospect_norm_cp($r['codePostal'] ?? $r['code_postal'] ?? null),
                        ':src'=>(string)($r['source'] ?? ''),
                        ':t'=>(string)($r['title'] ?? trim($ln.' '.($r['firstName'] ?? ''))),
                        ':stg'=>(string)($r['stage'] ?? 'Qualification'),
                        ':amt'=>(float)($r['amount'] ?? 0),
                        ':pr'=>max(0, min(100, (int)($r['probability'] ?? 50))),
                        ':cd'=>$r['expectedCloseDate'] ?? null,
                        ':at'=>(string)($r['assignedTo'] ?? $username),
                        ':nt'=>(string)($r['notes'] ?? ''),
                        ':cb'=>$username,
                        ':tid'=>isset($r['typeId']) && $r['typeId'] !== '' ? (string)$r['typeId'] : null,
                        ':c1'=>$r['comment1'] ?? null,
                        ':c2'=>$r['comment2'] ?? null,
                    ]);
                    $ids[] = $oid;
                    if ($isUpdate) $updated++; else $added++;
                } catch (Throwable $e) {
                    $skipped++;
                    $blocked[] = ['row'=>$rowNum,'reason'=>'DB_ERROR','field'=>null,'message'=>'SQL: '.$e->getMessage()];
                }
            }
            audit_log($db, $me, 'opportunity.import', 'opportunity', implode(',', array_slice($ids,0,10)), ['added'=>$added,'updated'=>$updated,'blocked'=>count($blocked),'warnings'=>count($warnings)]);
            ok(['added'=>$added,'updated'=>$updated,'skipped'=>$skipped,'ids'=>$ids,'blocked'=>$blocked,'warnings'=>$warnings]);
        }
        // Création unitaire
        $oid = 'O-' . substr(bin2hex(random_bytes(6)), 0, 10);
        $cin = trim((string)($in['cin'] ?? ''));
        $cin = $cin === '' ? null : $cin;
        // CIN doublons autorisés : pas de blocage.
        $bd = $in['birthDate'] ?? null;
        if (is_string($bd) && strlen($bd) >= 10) $bd = substr($bd,0,10);
        if ($bd && !preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)$bd)) $bd = null;
        $ins = $db->prepare("INSERT INTO crminternet_opportunities
            (id, civility, last_name, first_name, phone, phone2, cin, birth_date, email, city,
             gouvernorat, delegation, address, localisation_xy, code_postal, source, title, stage,
             amount, probability, expected_close_date, assigned_to, notes, created_by, type_id, comment1, comment2)
            VALUES (:id,:civ,:ln,:fn,:ph,:ph2,:cin,:bd,:em,:ci,:gov,:del,:ad,:loc,:cp,:src,:title,:stg,:amt,:pr,:cd,:at,:nt,:cb,:tid,:c1,:c2)");
        $ins->execute([
            ':id' => $oid,
            ':civ'=> ($in['civility'] ?? 'M') === 'Mme' ? 'Mme' : 'M',
            ':ln' => (string)($in['lastName'] ?? ''),
            ':fn' => (string)($in['firstName'] ?? ''),
            ':ph' => (string)($in['phone'] ?? ''),
            ':ph2'=> (string)($in['phone2'] ?? ''),
            ':cin'=> $cin,
            ':bd' => $bd,
            ':em' => (string)($in['email'] ?? ''),
            ':ci' => strtoupper(trim((string)($in['gouvernorat'] ?? $in['city'] ?? ''))),
            ':gov'=> strtoupper(trim((string)($in['gouvernorat'] ?? $in['city'] ?? ''))),
            ':del'=> (string)($in['delegation'] ?? ''),
            ':ad' => (string)($in['address'] ?? ''),
            ':loc'=> prospect_norm_xy($in['localisationXy'] ?? null),
            ':cp' => prospect_norm_cp($in['codePostal'] ?? null),
            ':src'=> (string)($in['source'] ?? ''),
            ':title' => (string)($in['title'] ?? ''),
            ':stg'=> (string)($in['stage'] ?? 'Qualification'),
            ':amt'=> (float)($in['amount'] ?? 0),
            ':pr' => max(0, min(100, (int)($in['probability'] ?? 50))),
            ':cd' => $in['expectedCloseDate'] ?? null,
            ':at' => (string)($in['assignedTo'] ?? $username),
            ':nt' => (string)($in['notes'] ?? ''),
            ':cb' => $username,
            ':tid'=> isset($in['typeId']) && $in['typeId'] !== '' ? (string)$in['typeId'] : null,
            ':c1' => $in['comment1'] ?? null,
            ':c2' => $in['comment2'] ?? null,
        ]);
        ok(['opportunityId' => $oid, 'message' => 'Opportunité créée'], 201);
    }

    fail('Action inconnue', 422);
}

// ---------------------------------------------------- PATCH/PUT (update)
if ($method === 'PATCH' || $method === 'PUT') {
    require_permission($db, $me, 'opportunity.edit');
    $in = json_input();
    $oid = (string)($in['id'] ?? ($_GET['id'] ?? ''));
    if ($oid === '') fail('id requis', 422);

    $cur = $db->prepare('SELECT * FROM crminternet_opportunities WHERE id = :id');
    $cur->execute([':id' => $oid]);
    $before = $cur->fetch();
    if (!$before) fail('Not found', 404);
    if (!empty($before['converted_to_contract'])) fail('Opportunité verrouillée (contrat émis)', 423);
    if ($isAgent && ($before['assigned_to'] ?? '') !== $username) fail('Accès refusé', 403);

    $map = [
        'title' => 'title', 'stage' => 'stage', 'amount' => 'amount',
        'probability' => 'probability', 'expectedCloseDate' => 'expected_close_date',
        'assignedTo' => 'assigned_to', 'notes' => 'notes',
        'civility' => 'civility',
        'lastName' => 'last_name', 'firstName' => 'first_name',
        'phone' => 'phone', 'phone2' => 'phone2',
        'cin' => 'cin', 'birthDate' => 'birth_date',
        'email' => 'email', 'city' => 'city',
        'gouvernorat' => 'gouvernorat', 'delegation' => 'delegation', 'address' => 'address',
        'localisationXy' => 'localisation_xy', 'codePostal' => 'code_postal',
        'comment1' => 'comment1', 'comment2' => 'comment2',
        'source' => 'source',
        'typeId' => 'type_id',
    ];
    $sets = []; $params = [':id' => $oid]; $diffs = [];
    foreach ($map as $k => $col) {
        if (!array_key_exists($k, $in)) continue;
        $v = $in[$k];
        if ($k === 'amount') $v = (float)$v;
        elseif ($k === 'probability') $v = max(0, min(100, (int)$v));
        elseif ($k === 'cin') {
            $v = is_string($v) ? trim($v) : $v;
            if ($v === '' || $v === null) $v = null;
            // Doublons CIN autorisés : pas de blocage.
        } elseif ($k === 'gouvernorat' || $k === 'city') {
            if (is_string($v)) $v = strtoupper(trim($v));
        } elseif ($k === 'localisationXy') {
            $v = prospect_norm_xy($v);
        } elseif ($k === 'codePostal') {
            $v = prospect_norm_cp($v);
        }
        $sets[] = "$col = :$k"; $params[":$k"] = $v;
        $diffs[$col] = $v;
    }
    if (!$sets) fail('Aucun champ', 422);
    if (array_key_exists('stage', $in)) {
        pipeline_assert_transition($db, 'opportunity', $before['stage'] ?? '', (string)$in['stage']);
    }
    $db->prepare('UPDATE crminternet_opportunities SET ' . implode(', ', $sets) . ' WHERE id = :id')
       ->execute($params);
    log_field_changes($db, 'opportunity', $oid, $before, $diffs, $username);
    $autoResult = null;
    if (array_key_exists('stage', $in) && ($before['stage'] ?? '') !== $in['stage']) {
        $autoResult = pipeline_run_auto_action($db, 'opportunity', $oid, (string)$in['stage'], $me);
    }
    ok(['message' => 'Opportunité mise à jour', 'auto' => $autoResult]);
}

// ---------------------------------------------------- DELETE (hard, cascade)
if ($method === 'DELETE') {
    require_permission($db, $me, 'opportunity.delete');
    $oid = (string)($_GET['id'] ?? '');
    if ($oid === '') fail('id requis', 422);
    $cur = $db->prepare('SELECT prospect_id FROM crminternet_opportunities WHERE id = :id');
    $cur->execute([':id' => $oid]);
    $row = $cur->fetch();
    if (!$row) fail('Not found', 404);
    // Suppression définitive de l'opportunité uniquement — prospect et
    // contrats associés sont conservés, on détache simplement leurs
    // références pour éviter des liens cassés.
    $db->beginTransaction();
    try {
        if (!empty($row['prospect_id'])) {
            $u = $db->prepare('UPDATE crminternet_prospects
                SET converted = 0, opportunity_id = NULL WHERE id = :pid');
            $u->execute([':pid' => $row['prospect_id']]);
            log_field_changes($db, 'prospect', (string)$row['prospect_id'], ['opportunity_id' => $oid], ['opportunity_id' => '', 'reason' => 'opportunity_deleted'], $username);
        }
        // Détacher (ne pas supprimer) les contrats issus de cette opportunité
        try { $db->prepare('UPDATE crminternet_contracts SET opportunity_id = NULL WHERE opportunity_id = :id')->execute([':id' => $oid]); } catch (Throwable $e) {}
        $d = $db->prepare('DELETE FROM crminternet_opportunities WHERE id = :id');
        $d->execute([':id' => $oid]);
        $db->commit();
    } catch (Throwable $e) {
        $db->rollBack();
        fail('Erreur: ' . $e->getMessage(), 500);
    }
    log_field_changes($db, 'opportunity', $oid, ['exists' => 1], ['exists' => 0], $username);
    audit_log($db, $me, 'opportunity.delete', 'opportunity', $oid);
    ok(['message' => 'Opportunité supprimée']);
}


fail('Method not allowed', 405);
