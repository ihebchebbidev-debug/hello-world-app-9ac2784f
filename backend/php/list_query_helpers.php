<?php
// =====================================================================
// PERF — Helpers communs pour les endpoints liste (prospects/opps/contracts).
//
// Fournit :
//   - parse_list_params()  : lit q, status, assignedTo, dateFrom/To, sort, dir, page, perPage, fields
//   - build_list_where()   : transforme les filtres en clause SQL paramétrée
//   - build_list_order()   : transforme sort/dir en ORDER BY whitelist
//   - schema_ensure_once() : garde fichier-lock pour éviter de relancer
//                            ensure_*_runtime_schema() à chaque GET
//   - emit_list_etag()     : ETag faible + 304 si If-None-Match correspond
//
// Chaque endpoint déclare son propre tableau de "colonnes triables" et
// "colonnes filtrables fulltext", donc aucune injection possible.
// =====================================================================

if (!function_exists('list_param')) {
    function list_param(string $name, $default = null) {
        return isset($_GET[$name]) ? $_GET[$name] : $default;
    }
}

if (!function_exists('parse_list_params')) {
    /**
     * @param array $cfg [
     *   'sortable'   => ['createdAt'=>'created_at', 'lastName'=>'last_name', ...],
     *   'searchable' => ['last_name','first_name','phone','phone2','cin','email'],
     *   'defaultSort'=> 'createdAt',
     *   'defaultDir' => 'desc',
     *   'maxPerPage' => 200,
     * ]
     */
    function parse_list_params(array $cfg): array {
        $sortable   = $cfg['sortable']    ?? [];
        $defaultSort= $cfg['defaultSort'] ?? array_key_first($sortable);
        $defaultDir = strtolower($cfg['defaultDir'] ?? 'desc') === 'asc' ? 'asc' : 'desc';
        $maxPerPage = (int)($cfg['maxPerPage'] ?? 200);

        $sortKey = (string) list_param('sort', $defaultSort);
        if (!isset($sortable[$sortKey])) $sortKey = $defaultSort;
        $sortCol = $sortable[$sortKey] ?? 'created_at';

        $dirRaw = strtolower((string) list_param('dir', $defaultDir));
        $dir    = $dirRaw === 'asc' ? 'ASC' : 'DESC';

        $page    = max(1, (int) list_param('page', 1));
        $perPage = (int) list_param('per_page', list_param('perPage', 50));
        if ($perPage <= 0) $perPage = 50;
        if ($perPage > $maxPerPage) $perPage = $maxPerPage;

        $fields  = strtolower((string) list_param('fields', 'full'));
        if (!in_array($fields, ['full','list'], true)) $fields = 'full';

        return [
            'q'          => trim((string) list_param('q', '')),
            'status'     => trim((string) list_param('status', '')),
            'assignedTo' => trim((string) list_param('assignedTo', list_param('assigned_to', ''))),
            'dateFrom'   => trim((string) list_param('dateFrom', list_param('date_from', ''))),
            'dateTo'     => trim((string) list_param('dateTo', list_param('date_to', ''))),
            'sortKey'    => $sortKey,
            'sortCol'    => $sortCol,
            'dir'        => $dir,
            'page'       => $page,
            'perPage'    => $perPage,
            'offset'     => ($page - 1) * $perPage,
            'fields'     => $fields,
            'count'      => (bool) list_param('count', false),
            'paginate'   => list_param('paginate', null) !== null
                            || list_param('page',   null) !== null
                            || list_param('per_page', null) !== null,
        ];
    }
}

if (!function_exists('build_list_where')) {
    /**
     * @param array $params  Result of parse_list_params()
     * @param array $cfg     [
     *   'searchable'    => ['last_name','first_name','phone','phone2','cin','email'],
     *   'statusCol'     => 'status',
     *   'assignedCol'   => 'assigned_to',
     *   'dateCol'       => 'created_at',
     *   'preWhere'      => '1=1 AND ...',  // already built (e.g. role scoping)
     *   'preParams'     => [':x' => 'y'],
     * ]
     * @return [string $whereSql, array $bindings]
     */
    function build_list_where(array $params, array $cfg): array {
        $clauses = [];
        $bind    = $cfg['preParams'] ?? [];
        $pre     = $cfg['preWhere']  ?? '1=1';
        $clauses[] = '(' . $pre . ')';

        // Free-text search via LIKE on a list of columns. Suffix-anchored
        // index usage requires "col LIKE 'foo%'" — so for short queries
        // we use prefix LIKE; for longer or numeric we fall back to %x%.
        if ($params['q'] !== '' && !empty($cfg['searchable'])) {
            $q     = $params['q'];
            $like  = '%' . str_replace(['%', '_'], ['\\%', '\\_'], $q) . '%';
            $likeP = $q . '%';
            $or = [];
            foreach ($cfg['searchable'] as $i => $col) {
                $kFull   = ':qf_' . $i;
                $kPrefix = ':qp_' . $i;
                $or[]    = "($col LIKE $kPrefix OR $col LIKE $kFull)";
                $bind[$kFull]   = $like;
                $bind[$kPrefix] = $likeP;
            }
            $clauses[] = '(' . implode(' OR ', $or) . ')';
        }

        if ($params['status'] !== '' && !empty($cfg['statusCol'])) {
            $clauses[] = $cfg['statusCol'] . ' = :flt_status';
            $bind[':flt_status'] = $params['status'];
        }

        if ($params['assignedTo'] !== '' && !empty($cfg['assignedCol'])) {
            $clauses[] = $cfg['assignedCol'] . ' = :flt_assigned';
            $bind[':flt_assigned'] = $params['assignedTo'];
        }

        if (!empty($cfg['dateCol'])) {
            if ($params['dateFrom'] !== '' && preg_match('/^\d{4}-\d{2}-\d{2}/', $params['dateFrom'])) {
                $clauses[] = $cfg['dateCol'] . ' >= :flt_dfrom';
                $bind[':flt_dfrom'] = substr($params['dateFrom'], 0, 10);
            }
            if ($params['dateTo'] !== '' && preg_match('/^\d{4}-\d{2}-\d{2}/', $params['dateTo'])) {
                $clauses[] = $cfg['dateCol'] . ' <= :flt_dto';
                $bind[':flt_dto'] = substr($params['dateTo'], 0, 10) . ' 23:59:59';
            }
        }

        return [implode(' AND ', $clauses), $bind];
    }
}

if (!function_exists('build_list_order')) {
    function build_list_order(array $params, string $tieBreaker = 'id'): string {
        // sortCol is whitelisted in parse_list_params()
        return $params['sortCol'] . ' ' . $params['dir'] . ', ' . $tieBreaker . ' ' . $params['dir'];
    }
}

if (!function_exists('schema_ensure_once')) {
    /**
     * Évite de réexécuter ensure_*_runtime_schema() à chaque GET.
     * Garde un flag fichier (chemin temp) marqué par version. Forçable
     * via ?schema=ensure pour les déploiements.
     *
     *   schema_ensure_once('prospects', '20260513', function () use ($db) {
     *       ensure_prospects_runtime_schema($db);
     *   });
     */
    function schema_ensure_once(string $key, string $version, callable $fn): void {
        $force = isset($_GET['schema']) && $_GET['schema'] === 'ensure';
        $tmp   = sys_get_temp_dir() . '/crm_schema_' . preg_replace('/[^a-z0-9]/i', '_', $key) . '_' . $version;
        if (!$force && is_file($tmp)) return;
        $fn();
        @file_put_contents($tmp, (string) time());
    }
}

if (!function_exists('emit_list_etag')) {
    /**
     * Emit a weak ETag based on an opaque string. If the request sent
     * If-None-Match equal to this tag, respond 304 and exit immediately.
     * Le tag est calculé à partir de (max(updated_at), count(*)) côté caller.
     */
    function emit_list_etag(string $tag): void {
        $etag = 'W/"' . $tag . '"';
        header('ETag: ' . $etag);
        header('Cache-Control: private, max-age=0, must-revalidate');
        header('Vary: Authorization');
        $inm = $_SERVER['HTTP_IF_NONE_MATCH'] ?? '';
        if ($inm !== '' && trim($inm) === $etag) {
            http_response_code(304);
            // Some PHP-FPM setups still emit body — close cleanly.
            header('Content-Length: 0');
            exit;
        }
    }
}

if (!function_exists('compute_list_etag')) {
    /**
     * @return string  short hex digest combining table fingerprint + caller filters
     */
    function compute_list_etag(PDO $db, string $table, string $whereSql, array $bind, string $extra = ''): string {
        try {
            $sql = "SELECT COALESCE(UNIX_TIMESTAMP(MAX(updated_at)),0) AS u, COUNT(*) AS c
                    FROM $table WHERE $whereSql";
            $s = $db->prepare($sql);
            $s->execute($bind);
            $r = $s->fetch(PDO::FETCH_ASSOC) ?: ['u' => 0, 'c' => 0];
        } catch (Throwable $e) {
            // Table sans updated_at → fallback created_at.
            try {
                $sql = "SELECT COALESCE(UNIX_TIMESTAMP(MAX(created_at)),0) AS u, COUNT(*) AS c
                        FROM $table WHERE $whereSql";
                $s = $db->prepare($sql);
                $s->execute($bind);
                $r = $s->fetch(PDO::FETCH_ASSOC) ?: ['u' => 0, 'c' => 0];
            } catch (Throwable $e2) {
                $r = ['u' => 0, 'c' => 0];
            }
        }
        return substr(sha1($table . '|' . $r['u'] . '|' . $r['c'] . '|' . $extra), 0, 16);
    }
}
