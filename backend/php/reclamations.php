<?php
/**
 * /reclamations.php — CRUD des Réclamations
 *
 * Auth Bearer JWT via require_auth().
 *
 *   GET    /reclamations.php?...filtres
 *            tel, cin, gsm, ref, q (recherche libre),
 *            service, audit_status, mois, annee,
 *            date_from, date_to,
 *            limit, offset
 *          → { reclamations:[...], total: N }
 *
 *   GET    /reclamations.php?id=NN
 *          → { reclamation: {...} }
 *
 *   POST   /reclamations.php   (création — id auto)
 *          body : { tel_adsl, ref_demand, cin_client, gsm_client, client_name,
 *                   service, description, statut_crm, statut_tt, audit_status,
 *                   localisation, etat, remarques,
 *                   date_creation?, date_resolution?, assigned_to? }
 *
 *   POST   /reclamations.php { action:"import", rows:[ {...}, {...} ] }
 *          → import en masse, id auto, reference auto.
 *
 *   PATCH  /reclamations.php?id=NN  (mise à jour partielle)
 *
 *   DELETE /reclamations.php?id=NN
 */

require_once __DIR__ . '/config.php';

$me     = require_auth();
$db     = (new Database())->getConnection();
$method = $_SERVER['REQUEST_METHOD'];

// Idempotent — protège contre installs partielles / migrations oubliées.
function ensure_reclamations_tables(PDO $db): void {
    $db->exec("CREATE TABLE IF NOT EXISTS crminternet_reclamations (
        id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        reference       VARCHAR(32)     NOT NULL,
        tel_adsl        VARCHAR(32)     NULL,
        ref_demand      VARCHAR(64)     NULL,
        cin_client      VARCHAR(32)     NULL,
        gsm_client      VARCHAR(32)     NULL,
        client_name     VARCHAR(160)    NULL,
        service         ENUM('Technique','Facturation','Commercial','Autre') NOT NULL DEFAULT 'Technique',
        description     TEXT            NULL,
        statut_crm      VARCHAR(80)     NULL,
        statut_tt       VARCHAR(80)     NULL,
        audit_status    ENUM('en_cours','resolu','annule') NOT NULL DEFAULT 'en_cours',
        localisation    VARCHAR(160)    NULL,
        etat            VARCHAR(80)     NULL,
        remarques       TEXT            NULL,
        date_creation   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
        date_resolution DATETIME        NULL,
        mois            TINYINT  UNSIGNED GENERATED ALWAYS AS (MONTH(date_creation)) STORED,
        annee           SMALLINT UNSIGNED GENERATED ALWAYS AS (YEAR(date_creation))  STORED,
        assigned_to     VARCHAR(80)     NULL,
        created_by      VARCHAR(80)     NULL,
        created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uniq_rec_reference (reference),
        KEY idx_rec_audit  (audit_status),
        KEY idx_rec_service(service),
        KEY idx_rec_period (annee, mois)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $db->exec("CREATE TABLE IF NOT EXISTS crminternet_reclamation_counter (
        period    CHAR(6) NOT NULL,
        last_seq  INT UNSIGNED NOT NULL DEFAULT 0,
        PRIMARY KEY (period)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}
ensure_reclamations_tables($db);

/* ---------------------------------------------------------- helpers */

const REC_AUDIT     = ['en_cours', 'resolu', 'annule'];
const REC_SERVICES  = ['Technique', 'Facturation', 'Commercial', 'Autre'];

function rec_can_manage(PDO $db, array $me): bool {
    if (in_array($me['role'] ?? '', ['Administrateur', 'Manager'], true)) return true;
    return user_has_permission($db, $me, 'reclamation.manage');
}

function rec_clean_str($v, int $max = 255): ?string {
    if ($v === null) return null;
    $s = trim((string)$v);
    if ($s === '') return null;
    return mb_substr($s, 0, $max);
}

function rec_audit($v): string {
    $v = strtolower((string)$v);
    return in_array($v, REC_AUDIT, true) ? $v : 'en_cours';
}

function rec_service($v): string {
    $v = (string)$v;
    return in_array($v, REC_SERVICES, true) ? $v : 'Technique';
}

function rec_datetime($v): ?string {
    if ($v === null || $v === '') return null;
    $s = (string)$v;
    // accepte "YYYY-MM-DD" ou "YYYY-MM-DD HH:MM:SS" ou ISO
    $t = strtotime($s);
    return $t ? date('Y-m-d H:i:s', $t) : null;
}

/** Génère REC-AAAAMM-XXXX en transactionnel (séquence par mois). */
function rec_generate_reference(PDO $db, ?string $createdAt = null): string {
    $period = date('Ym', $createdAt ? strtotime($createdAt) : time());
    $db->prepare(
        'INSERT INTO crminternet_reclamation_counter (period, last_seq)
         VALUES (:p, 1)
         ON DUPLICATE KEY UPDATE last_seq = last_seq + 1'
    )->execute([':p' => $period]);
    $s = $db->prepare('SELECT last_seq FROM crminternet_reclamation_counter WHERE period = :p');
    $s->execute([':p' => $period]);
    $seq = (int)$s->fetchColumn();
    return sprintf('REC-%s-%04d', $period, $seq);
}

function rec_row(array $r): array {
    return [
        'id'             => (int)$r['id'],
        'reference'      => $r['reference'],
        'tel_adsl'       => $r['tel_adsl'],
        'ref_demand'     => $r['ref_demand'],
        'cin_client'     => $r['cin_client'],
        'gsm_client'     => $r['gsm_client'],
        'client_name'    => $r['client_name'],
        'service'        => $r['service'],
        'description'    => $r['description'],
        'statut_crm'     => $r['statut_crm'],
        'statut_tt'      => $r['statut_tt'],
        'audit_status'   => $r['audit_status'],
        'localisation'   => $r['localisation'],
        'etat'           => $r['etat'],
        'remarques'      => $r['remarques'],
        'date_creation'  => $r['date_creation'],
        'date_resolution'=> $r['date_resolution'],
        'mois'           => isset($r['mois']) ? (int)$r['mois'] : null,
        'annee'          => isset($r['annee']) ? (int)$r['annee'] : null,
        'assigned_to'    => $r['assigned_to'],
        'created_by'     => $r['created_by'],
        'created_at'     => $r['created_at'],
        'updated_at'     => $r['updated_at'],
    ];
}

/** Construit le payload INSERT/UPDATE depuis $in (sans id, sans reference). */
function rec_payload(array $in, bool $forUpdate = false): array {
    // FIX: accepter les alias camelCase envoyés par le front
    $aliasMap = [
        'clientName'     => 'client_name',
        'telAdsl'        => 'tel_adsl',
        'refDemand'      => 'ref_demand',
        'cinClient'      => 'cin_client',
        'gsmClient'      => 'gsm_client',
        'statutCrm'      => 'statut_crm',
        'statutTt'       => 'statut_tt',
        'auditStatus'    => 'audit_status',
        'dateCreation'   => 'date_creation',
        'dateResolution' => 'date_resolution',
        'assignedTo'     => 'assigned_to',
        'subject'        => 'description', // legacy front field
    ];
    foreach ($aliasMap as $camel => $snake) {
        if (array_key_exists($camel, $in) && !array_key_exists($snake, $in)) {
            $in[$snake] = $in[$camel];
        }
    }
    $p = [];
    $map = [
        'tel_adsl'        => 32,
        'ref_demand'      => 64,
        'cin_client'      => 32,
        'gsm_client'      => 32,
        'client_name'     => 160,
        'description'     => 65535,
        'statut_crm'      => 80,
        'statut_tt'       => 80,
        'localisation'    => 160,
        'etat'            => 80,
        'remarques'       => 65535,
        'assigned_to'     => 80,
    ];
    foreach ($map as $k => $max) {
        if (array_key_exists($k, $in)) $p[$k] = rec_clean_str($in[$k], $max);
    }
    if (array_key_exists('service',      $in)) $p['service']      = rec_service($in['service']);
    if (array_key_exists('audit_status', $in)) $p['audit_status'] = rec_audit($in['audit_status']);

    if (array_key_exists('date_creation', $in)) {
        $d = rec_datetime($in['date_creation']);
        if ($d) $p['date_creation'] = $d;
    }
    if (array_key_exists('date_resolution', $in)) {
        $p['date_resolution'] = rec_datetime($in['date_resolution']);
    }
    // Auto-fill date_resolution lorsqu'on passe à "resolu" et qu'aucune date n'est fournie.
    if (($p['audit_status'] ?? null) === 'resolu' && empty($p['date_resolution']) && !$forUpdate) {
        $p['date_resolution'] = date('Y-m-d H:i:s');
    }
    return $p;
}

function rec_fetch(PDO $db, int $id): ?array {
    $s = $db->prepare('SELECT * FROM crminternet_reclamations WHERE id = :id LIMIT 1');
    $s->execute([':id' => $id]);
    $r = $s->fetch();
    return $r ? rec_row($r) : null;
}

/* ---------------------------------------------------------------- GET */

if ($method === 'GET') {
    if (isset($_GET['id'])) {
        $r = rec_fetch($db, (int)$_GET['id']);
        if (!$r) fail('Réclamation introuvable', 404);
        ok(['reclamation' => $r]);
    }

    $where = [];
    $args  = [];

    foreach ([
        'tel'  => 'tel_adsl',
        'cin'  => 'cin_client',
        'gsm'  => 'gsm_client',
        'ref'  => 'ref_demand',
    ] as $param => $col) {
        if (!empty($_GET[$param])) {
            $where[] = "$col LIKE :$param";
            $args[":$param"] = '%' . trim($_GET[$param]) . '%';
        }
    }
    if (!empty($_GET['service']) && in_array($_GET['service'], REC_SERVICES, true)) {
        $where[] = 'service = :service';
        $args[':service'] = $_GET['service'];
    }
    if (!empty($_GET['audit_status']) && in_array($_GET['audit_status'], REC_AUDIT, true)) {
        $where[] = 'audit_status = :audit';
        $args[':audit'] = $_GET['audit_status'];
    }
    if (!empty($_GET['mois']))  { $where[] = 'mois = :mois';   $args[':mois']  = (int)$_GET['mois']; }
    if (!empty($_GET['annee'])) { $where[] = 'annee = :annee'; $args[':annee'] = (int)$_GET['annee']; }
    if (!empty($_GET['date_from'])) { $where[] = 'date_creation >= :df'; $args[':df'] = rec_datetime($_GET['date_from']); }
    if (!empty($_GET['date_to']))   { $where[] = 'date_creation <= :dt'; $args[':dt'] = rec_datetime($_GET['date_to']); }
    if (!empty($_GET['q'])) {
        // Native PDO prepares don't allow reusing the same named placeholder.
        $where[] = '(reference LIKE :q1 OR client_name LIKE :q2 OR description LIKE :q3 OR remarques LIKE :q4)';
        $like = '%' . trim($_GET['q']) . '%';
        $args[':q1'] = $like; $args[':q2'] = $like; $args[':q3'] = $like; $args[':q4'] = $like;
    }

    // Restriction : un agent ne voit que les réclamations qui lui sont assignées
    // ou qu'il a créées. Manager / Administrateur voient tout.
    if (!in_array($me['role'] ?? '', ['Administrateur', 'Manager'], true)
        && !user_has_permission($db, $me, 'reclamation.view_all')) {
        $where[] = '(assigned_to = :me OR created_by = :me2)';
        $args[':me']  = $me['username'];
        $args[':me2'] = $me['username'];
    }

    $whereSql = $where ? ('WHERE ' . implode(' AND ', $where)) : '';
    $limit  = max(1, min(500, (int)($_GET['limit']  ?? 200)));
    $offset = max(0, (int)($_GET['offset'] ?? 0));

    $cnt = $db->prepare("SELECT COUNT(*) FROM crminternet_reclamations $whereSql");
    $cnt->execute($args);
    $total = (int)$cnt->fetchColumn();

    $sql = "SELECT * FROM crminternet_reclamations $whereSql
            ORDER BY date_creation DESC, id DESC
            LIMIT $limit OFFSET $offset";
    $s = $db->prepare($sql);
    $s->execute($args);
    $rows = array_map('rec_row', $s->fetchAll());

    ok(['reclamations' => $rows, 'total' => $total]);
}

/* ---------------------------------------------------------------- POST */

if ($method === 'POST') {
    $in     = json_input();
    $action = $in['action'] ?? null;

    /* ----- import en masse ----- */
    if ($action === 'import') {
        if (!rec_can_manage($db, $me) && !user_has_permission($db, $me, 'reclamation.import')) {
            fail('Accès refusé', 403);
        }
        $rows = $in['rows'] ?? [];
        if (!is_array($rows) || !$rows) fail('rows requis', 422);
        if (count($rows) > 5000) fail('Maximum 5000 lignes par import', 422);

        $db->beginTransaction();
        try {
            $added = 0;
            foreach ($rows as $row) {
                if (!is_array($row)) continue;
                $payload = rec_payload($row, false);
                if (empty($payload['date_creation'])) {
                    $payload['date_creation'] = date('Y-m-d H:i:s');
                }
                $payload['service']      = $payload['service']      ?? 'Technique';
                $payload['audit_status'] = $payload['audit_status'] ?? 'en_cours';
                $payload['created_by']   = $me['username'];
                $payload['reference']    = rec_generate_reference($db, $payload['date_creation']);

                $cols = array_keys($payload);
                $placeholders = array_map(fn($c) => ':' . $c, $cols);
                $sql = 'INSERT INTO crminternet_reclamations (' . implode(',', $cols)
                     . ') VALUES (' . implode(',', $placeholders) . ')';
                $st = $db->prepare($sql);
                $args = [];
                foreach ($payload as $k => $v) $args[':' . $k] = $v;
                $st->execute($args);
                $added++;
            }
            $db->commit();
        } catch (Throwable $e) {
            $db->rollBack();
            fail('Import échoué : ' . $e->getMessage(), 500);
        }
        audit_log($db, $me, 'reclamation.import', 'reclamation', null, ['count' => $added]);
        ok(['added' => $added]);
    }

    /* ----- création unitaire ----- */
    if (!rec_can_manage($db, $me) && !user_has_permission($db, $me, 'reclamation.add')) {
        fail('Accès refusé', 403);
    }
    $payload = rec_payload($in, false);
    if (empty($payload['date_creation'])) $payload['date_creation'] = date('Y-m-d H:i:s');
    $payload['service']      = $payload['service']      ?? 'Technique';
    $payload['audit_status'] = $payload['audit_status'] ?? 'en_cours';
    $payload['created_by']   = $me['username'];
    $payload['reference']    = rec_generate_reference($db, $payload['date_creation']);

    $cols = array_keys($payload);
    $placeholders = array_map(fn($c) => ':' . $c, $cols);
    $sql = 'INSERT INTO crminternet_reclamations (' . implode(',', $cols)
         . ') VALUES (' . implode(',', $placeholders) . ')';
    $st = $db->prepare($sql);
    $args = [];
    foreach ($payload as $k => $v) $args[':' . $k] = $v;
    $st->execute($args);
    $id = (int)$db->lastInsertId();

    audit_log($db, $me, 'reclamation.create', 'reclamation', (string)$id, ['reference' => $payload['reference']]);
    ok(['reclamation' => rec_fetch($db, $id)], 201);
}

/* ---------------------------------------------------------------- PATCH */

if ($method === 'PATCH') {
    $id = (int)($_GET['id'] ?? 0);
    if ($id <= 0) fail('id requis', 422);
    $existing = rec_fetch($db, $id);
    if (!$existing) fail('Réclamation introuvable', 404);

    $isOwner = ($existing['assigned_to'] === ($me['username'] ?? '') || $existing['created_by'] === ($me['username'] ?? ''));
    if (!rec_can_manage($db, $me) && !$isOwner && !user_has_permission($db, $me, 'reclamation.edit')) {
        fail('Accès refusé', 403);
    }

    $in = json_input();
    $payload = rec_payload($in, true);
    if (!$payload) fail('Aucune modification', 422);

    // Auto-set date_resolution lorsqu'on bascule en "resolu"
    if (($payload['audit_status'] ?? null) === 'resolu'
        && empty($payload['date_resolution'])
        && empty($existing['date_resolution'])) {
        $payload['date_resolution'] = date('Y-m-d H:i:s');
    }

    $sets = [];
    $args = [':id' => $id];
    foreach ($payload as $k => $v) {
        $sets[] = "$k = :$k";
        $args[":$k"] = $v;
    }
    $sql = 'UPDATE crminternet_reclamations SET ' . implode(', ', $sets) . ' WHERE id = :id';
    $db->prepare($sql)->execute($args);

    log_field_changes($db, 'reclamation', (string)$id, $existing, $payload, $me['username'] ?? '');
    ok(['reclamation' => rec_fetch($db, $id)]);
}

/* ---------------------------------------------------------------- DELETE */

if ($method === 'DELETE') {
    if (!rec_can_manage($db, $me) && !user_has_permission($db, $me, 'reclamation.delete')) {
        fail('Accès refusé', 403);
    }
    $id = (int)($_GET['id'] ?? 0);
    if ($id <= 0) fail('id requis', 422);
    $s = $db->prepare('DELETE FROM crminternet_reclamations WHERE id = :id');
    $s->execute([':id' => $id]);
    audit_log($db, $me, 'reclamation.delete', 'reclamation', (string)$id);
    ok(['deleted' => $s->rowCount()]);
}

fail('Method not allowed', 405);
