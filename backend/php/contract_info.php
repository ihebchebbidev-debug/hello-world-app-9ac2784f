<?php
// =====================================================================
// CRM Internet — "Information contrat / Détails Techniques"
// Endpoint polymorphe (prospect / opportunity / contract).
//
//   GET  contract_info.php?entity=prospect&id=PR-123
//        Renvoie la fiche associée. Si aucune ligne propre :
//          - opportunity  → fallback sur le prospect d'origine
//          - contract     → fallback sur l'opportunité puis le prospect
//        Le champ "inheritedFrom" indique d'où vient la donnée.
//
//   PUT  contract_info.php?entity=contract&id=CT-7
//        Body JSON = champs ; upsert sur (entity_type, entity_id).
// =====================================================================

require_once __DIR__ . '/config.php';
$me = require_auth();
$db = (new Database())->getConnection();
$method = $_SERVER['REQUEST_METHOD'];

$ENTITIES = ['prospect', 'opportunity', 'contract'];

function ensure_contract_info_schema(PDO $db): void {
    try {
        $db->exec("CREATE TABLE IF NOT EXISTS crminternet_contract_info (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            entity_type ENUM('prospect','opportunity','contract') NOT NULL,
            entity_id VARCHAR(40) NOT NULL,
            type_conn VARCHAR(255) NOT NULL DEFAULT '',
            reference_tt VARCHAR(120) NOT NULL DEFAULT '',
            tel_ligne VARCHAR(60) NOT NULL DEFAULT '',
            date_activation DATE NULL,
            etape VARCHAR(60) NOT NULL DEFAULT '',
            interface_type VARCHAR(255) NOT NULL DEFAULT '',
            fsi VARCHAR(60) NOT NULL DEFAULT '',
            motif_retour_tt VARCHAR(255) NOT NULL DEFAULT '',
            etat ENUM('','En cours','Basculement','Rejete','Valide') NOT NULL DEFAULT '',
            remarque TEXT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            created_by VARCHAR(64) NULL,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            updated_by VARCHAR(64) NULL,
            PRIMARY KEY (id),
            UNIQUE KEY ux_entity (entity_type, entity_id),
            KEY idx_entity_id (entity_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    } catch (Throwable $e) { /* best effort */ }
    // Backfill metadata columns for older installs (idempotent).
    $addCol = function (string $col, string $ddl) use ($db) {
        try {
            $s = $db->prepare("SELECT COUNT(*) FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crminternet_contract_info' AND COLUMN_NAME = ?");
            $s->execute([$col]);
            if ((int)$s->fetchColumn() === 0) {
                $db->exec("ALTER TABLE crminternet_contract_info ADD COLUMN $ddl");
            }
        } catch (Throwable $e) { /* best effort */ }
    };
    $addCol('created_at', "created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP");
    $addCol('created_by', "created_by VARCHAR(64) NULL");
    $addCol('updated_at', "updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");
    $addCol('updated_by', "updated_by VARCHAR(64) NULL");
}

function row_to_info(?array $r, string $entity, string $id, ?string $inherited = null): array {
    if (!$r) {
        return [
            'entity'        => $entity,
            'entityId'      => $id,
            'typeConn'      => [],
            'referenceTt'   => '',
            'telLigne'      => '',
            'dateActivation'=> null,
            'etape'         => [],
            'interfaceType' => [],
            'fsi'           => '',
            'motifRetourTt' => [],
            'etat'          => '',
            'remarque'      => '',
            'createdAt'     => null,
            'createdBy'     => null,
            'updatedAt'     => null,
            'updatedBy'     => null,
            'inheritedFrom' => null,
            'exists'        => false,
        ];
    }
    $dec = function ($v) {
        if ($v === null || $v === '') return [];
        $j = json_decode((string)$v, true);
        if (is_array($j)) return $j;
        // legacy CSV fallback
        return array_values(array_filter(array_map('trim', explode(',', (string)$v)), fn($s) => $s !== ''));
    };
    return [
        'entity'        => $entity,
        'entityId'      => $id,
        'typeConn'      => $dec($r['type_conn']),
        'referenceTt'   => $r['reference_tt'] ?? '',
        'telLigne'      => $r['tel_ligne'] ?? '',
        'dateActivation'=> $r['date_activation'] ?? null,
        'etape'         => $dec($r['etape']),
        'interfaceType' => $dec($r['interface_type']),
        'fsi'           => $r['fsi'] ?? '',
        'motifRetourTt' => $dec($r['motif_retour_tt']),
        'etat'          => $r['etat'] ?? '',
        'remarque'      => $r['remarque'] ?? '',
        'createdAt'     => $r['created_at'] ?? null,
        'createdBy'     => $r['created_by'] ?? null,
        'updatedAt'     => $r['updated_at'] ?? null,
        'updatedBy'     => $r['updated_by'] ?? null,
        'inheritedFrom' => $inherited,
        'exists'        => $inherited === null,
    ];
}

function fetch_info(PDO $db, string $entity, string $id): ?array {
    $s = $db->prepare("SELECT * FROM crminternet_contract_info WHERE entity_type = ? AND entity_id = ? LIMIT 1");
    $s->execute([$entity, $id]);
    $r = $s->fetch(PDO::FETCH_ASSOC);
    return $r ?: null;
}

function resolve_parent(PDO $db, string $entity, string $id): ?array {
    // returns ['entity' => ..., 'id' => ...] or null
    if ($entity === 'opportunity') {
        try {
            $s = $db->prepare("SELECT prospect_id FROM crminternet_opportunities WHERE id = ?");
            $s->execute([$id]);
            $pid = $s->fetchColumn();
            if ($pid) return ['entity' => 'prospect', 'id' => (string)$pid];
        } catch (Throwable $e) {}
    }
    if ($entity === 'contract') {
        // 1) Remonter via l'opportunité si présente.
        try {
            $s = $db->prepare("SELECT opportunity_id FROM crminternet_contracts WHERE id = ?");
            $s->execute([$id]);
            $oid = $s->fetchColumn();
            if ($oid) return ['entity' => 'opportunity', 'id' => (string)$oid];
        } catch (Throwable $e) {}
        // 2) Fallback : prospect_id direct sur le contrat (colonne ajoutée par
        //    migration_propagate_full_identity_v3.sql). Permet d'afficher les
        //    infos prospect même si opportunity_id est NULL ou si l'opportunité
        //    n'existe plus / n'a jamais été créée.
        try {
            $colExists = $db->query("SELECT COUNT(*) FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'crminternet_contracts'
                  AND COLUMN_NAME = 'prospect_id'")->fetchColumn();
            if ((int)$colExists > 0) {
                $s = $db->prepare("SELECT prospect_id FROM crminternet_contracts WHERE id = ?");
                $s->execute([$id]);
                $pid = $s->fetchColumn();
                if ($pid) return ['entity' => 'prospect', 'id' => (string)$pid];
            }
        } catch (Throwable $e) {}
    }
    return null;
}

ensure_contract_info_schema($db);

$entity = strtolower(trim((string)($_GET['entity'] ?? '')));
$id     = trim((string)($_GET['id'] ?? ''));
if (!in_array($entity, $ENTITIES, true)) fail("Paramètre 'entity' invalide", 400);
if ($id === '') fail("Paramètre 'id' requis", 400);

if ($method === 'GET') {
    // Try direct
    $r = fetch_info($db, $entity, $id);
    if ($r) ok(['info' => row_to_info($r, $entity, $id, null)]);

    // Walk parent chain
    $cur = ['entity' => $entity, 'id' => $id];
    $hops = 0;
    while ($hops++ < 3) {
        $p = resolve_parent($db, $cur['entity'], $cur['id']);
        if (!$p) break;
        $r = fetch_info($db, $p['entity'], $p['id']);
        if ($r) ok(['info' => row_to_info($r, $entity, $id, $p['entity'] . ':' . $p['id'])]);
        $cur = $p;
    }
    ok(['info' => row_to_info(null, $entity, $id)]);
}

if ($method === 'PUT' || $method === 'POST') {
    $body = json_input();
    $enc  = function ($v) {
        if (is_array($v)) return json_encode(array_values($v), JSON_UNESCAPED_UNICODE);
        if ($v === null) return '';
        return (string)$v;
    };

    $allowedEtat = ['', 'En cours', 'Basculement', 'Rejete', 'Valide'];
    $etat = (string)($body['etat'] ?? '');
    if (!in_array($etat, $allowedEtat, true)) $etat = '';

    $date = $body['dateActivation'] ?? null;
    if ($date === '' || $date === null) {
        $date = null;
    } else {
        // accept yyyy-mm-dd
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)$date)) $date = null;
    }

    // created_at / updated_at are SYSTEM-managed: never accept client overrides.
    // - INSERT  -> created_at = NOW(),  updated_at = NOW(),  created_by = updated_by = current user
    // - UPDATE  -> updated_at = NOW(),  updated_by = current user (created_at/by stay frozen)

    $fields = [
        'type_conn'       => $enc($body['typeConn'] ?? []),
        'reference_tt'    => substr((string)($body['referenceTt'] ?? ''), 0, 120),
        'tel_ligne'       => substr((string)($body['telLigne'] ?? ''), 0, 60),
        'date_activation' => $date,
        'etape'           => $enc($body['etape'] ?? []),
        'interface_type'  => $enc($body['interfaceType'] ?? []),
        'fsi'             => substr((string)($body['fsi'] ?? ''), 0, 60),
        'motif_retour_tt' => $enc($body['motifRetourTt'] ?? []),
        'etat'            => $etat,
        'remarque'        => (string)($body['remarque'] ?? ''),
    ];
    $username = (string)($me['username'] ?? $me['id'] ?? 'system');

    $existing = fetch_info($db, $entity, $id);
    if ($existing) {
        $sets = []; $params = [];
        foreach ($fields as $k => $v) { $sets[] = "$k = ?"; $params[] = $v; }
        $sets[] = "updated_by = ?"; $params[] = $username;
        $sets[] = "updated_at = NOW()";
        $params[] = $entity; $params[] = $id;
        $sql = "UPDATE crminternet_contract_info SET " . implode(', ', $sets)
             . " WHERE entity_type = ? AND entity_id = ?";
        $db->prepare($sql)->execute($params);
    } else {
        // First save: this user is the "creator" (form went from null → filled).
        $cols = array_keys($fields);
        $cols[] = 'entity_type'; $cols[] = 'entity_id';
        $cols[] = 'created_by';  $cols[] = 'updated_by';
        $cols[] = 'created_at';  $cols[] = 'updated_at';
        $vals  = array_values($fields);
        $vals[] = $entity; $vals[] = $id;
        $vals[] = $username; $vals[] = $username;
        // Use the same NOW() for both so created_at == updated_at on first save.
        $now = date('Y-m-d H:i:s');
        $vals[] = $now; $vals[] = $now;
        $place = implode(',', array_fill(0, count($cols), '?'));
        $sql = "INSERT INTO crminternet_contract_info (" . implode(',', $cols) . ") VALUES ($place)";
        $db->prepare($sql)->execute($vals);
    }

    $r = fetch_info($db, $entity, $id);
    ok(['info' => row_to_info($r, $entity, $id, null)]);
}

if ($method === 'DELETE') {
    $s = $db->prepare("DELETE FROM crminternet_contract_info WHERE entity_type = ? AND entity_id = ?");
    $s->execute([$entity, $id]);
    ok(['deleted' => true]);
}

fail('Méthode non supportée', 405);
