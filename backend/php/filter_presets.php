<?php
/**
 * /filter_presets.php — Modèles de filtres partagés
 *
 * Tables :
 *   crminternet_filter_presets             (modèles partagés / défauts)
 *   crminternet_filter_preset_user_choice  (choix actif par utilisateur)
 *
 * IDs :
 *   crminternet_filter_presets.id est VARCHAR(40) (préfixe "FP-").
 *   Génération côté PHP — aucune dépendance à AUTO_INCREMENT
 *   (un anciens schéma utilisait AUTO_INCREMENT, ce qui provoquait
 *   un duplicate-key '' sur certains hébergements; on ne s'en sert plus).
 */

require_once __DIR__ . '/config.php';

$me     = require_auth();
$db     = (new Database())->getConnection();
$method = $_SERVER['REQUEST_METHOD'];

/* ----------------------------------------------------- ensure tables */

function ensure_filter_presets_tables(PDO $db): void {
    $db->exec("CREATE TABLE IF NOT EXISTS crminternet_filter_presets (
        id            VARCHAR(40)  PRIMARY KEY,
        scope         VARCHAR(32)  NOT NULL,
        name          VARCHAR(120) NOT NULL,
        description   VARCHAR(500) NULL,
        filters_json  LONGTEXT     NOT NULL,
        is_shared     TINYINT(1)   NOT NULL DEFAULT 0,
        is_default    TINYINT(1)   NOT NULL DEFAULT 0,
        default_role  VARCHAR(60)  NULL,
        position      INT          NOT NULL DEFAULT 9999,
        created_by    VARCHAR(80)  NULL,
        created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_scope (scope)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $db->exec("CREATE TABLE IF NOT EXISTS crminternet_filter_preset_user_choice (
        username    VARCHAR(80)  NOT NULL,
        scope       VARCHAR(32)  NOT NULL,
        preset_id   VARCHAR(40)  NOT NULL,
        updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (username, scope)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}
ensure_filter_presets_tables($db);

/* ---------------------------------------------------------------- helpers */

const ALLOWED_SCOPES = ['prospects', 'opportunities', 'contracts'];

function fp_scope(string $s): string {
    if (!in_array($s, ALLOWED_SCOPES, true)) fail('scope invalide', 422);
    return $s;
}

function fp_can_manage(PDO $db, array $me): bool {
    if (($me['role'] ?? '') === 'Administrateur') return true;
    return user_has_permission($db, $me, 'filter_preset.manage');
}

function fp_require_manage(PDO $db, array $me): void {
    if (!fp_can_manage($db, $me)) fail('Accès refusé', 403);
}

function fp_row(array $r): array {
    return [
        'id'            => (string)$r['id'],
        'scope'         => $r['scope'],
        'name'          => $r['name'],
        'description'   => $r['description'],
        'filters'       => json_decode((string)$r['filters_json'], true) ?: new stdClass(),
        'is_shared'     => (int)$r['is_shared'] === 1,
        'is_default'    => (int)$r['is_default'] === 1,
        'default_role'  => $r['default_role'],
        'position'      => (int)$r['position'],
        'created_by'    => $r['created_by'],
        'created_at'    => $r['created_at'],
        'updated_at'    => $r['updated_at'],
    ];
}

function fp_fetch(PDO $db, string $id): ?array {
    if ($id === '') return null;
    $s = $db->prepare('SELECT * FROM crminternet_filter_presets WHERE id = :id LIMIT 1');
    $s->execute([':id' => $id]);
    $r = $s->fetch();
    return $r ? fp_row($r) : null;
}

function fp_clear_other_defaults(PDO $db, string $scope, ?string $role, string $exceptId): void {
    $s = $db->prepare(
        "UPDATE crminternet_filter_presets
            SET is_default = 0
          WHERE scope = :scope
            AND id <> :id
            AND COALESCE(default_role, '') = COALESCE(:role, '')"
    );
    $s->execute([':scope' => $scope, ':id' => $exceptId, ':role' => $role]);
}

function fp_effective_default(PDO $db, string $scope, array $me): ?array {
    $s = $db->prepare(
        'SELECT * FROM crminternet_filter_presets
          WHERE scope = :s AND is_default = 1 AND default_role = :r
          ORDER BY position ASC, id ASC LIMIT 1'
    );
    $s->execute([':s' => $scope, ':r' => $me['role'] ?? '']);
    if ($r = $s->fetch()) return fp_row($r);

    $s = $db->prepare(
        'SELECT * FROM crminternet_filter_presets
          WHERE scope = :s AND is_default = 1 AND default_role IS NULL
          ORDER BY position ASC, id ASC LIMIT 1'
    );
    $s->execute([':s' => $scope]);
    if ($r = $s->fetch()) return fp_row($r);

    return null;
}

function fp_my_choice(PDO $db, string $scope, string $username): ?string {
    $s = $db->prepare(
        'SELECT preset_id FROM crminternet_filter_preset_user_choice
          WHERE username = :u AND scope = :s LIMIT 1'
    );
    $s->execute([':u' => $username, ':s' => $scope]);
    $v = $s->fetchColumn();
    return $v === false || $v === null ? null : (string)$v;
}

function fp_new_id(): string {
    return 'FP-' . substr(bin2hex(random_bytes(6)), 0, 10);
}

/* ------------------------------------------------------------------- GET */

if ($method === 'GET') {
    $scope = fp_scope($_GET['scope'] ?? '');
    $manage = fp_can_manage($db, $me);
    $username = (string)($me['username'] ?? '');

    $sql = 'SELECT * FROM crminternet_filter_presets WHERE scope = :s';
    $args = [':s' => $scope];
    if (!$manage) {
        $sql .= ' AND (is_shared = 1 OR created_by = :u)';
        $args[':u'] = $username;
    }
    $sql .= ' ORDER BY position ASC, id ASC';
    $s = $db->prepare($sql);
    $s->execute($args);
    $presets = array_map('fp_row', $s->fetchAll());

    ok([
        'scope'            => $scope,
        'presets'          => $presets,
        'myChoice'         => fp_my_choice($db, $scope, $username),
        'effectiveDefault' => fp_effective_default($db, $scope, $me),
        'canManage'        => $manage,
    ]);
}

/* ------------------------------------------------------------------ POST */

if ($method === 'POST') {
    $in     = json_input();
    $action = $in['action'] ?? null;

    /* ----- choose : tout utilisateur authentifié ----- */
    if ($action === 'choose') {
        $scope    = fp_scope((string)($in['scope'] ?? ''));
        $presetId = $in['preset_id'] ?? null;
        $username = (string)($me['username'] ?? '');

        if ($presetId === null || $presetId === '') {
            $s = $db->prepare(
                'DELETE FROM crminternet_filter_preset_user_choice
                  WHERE username = :u AND scope = :s'
            );
            $s->execute([':u' => $username, ':s' => $scope]);
            ok(['cleared' => true]);
        }

        $presetId = (string)$presetId;
        $preset = fp_fetch($db, $presetId);
        if (!$preset || $preset['scope'] !== $scope) fail('Modèle introuvable', 404);
        if (!$preset['is_shared'] && $preset['created_by'] !== $username && !fp_can_manage($db, $me)) {
            fail('Accès refusé', 403);
        }

        $s = $db->prepare(
            'INSERT INTO crminternet_filter_preset_user_choice (username, scope, preset_id)
             VALUES (:u, :s, :p)
             ON DUPLICATE KEY UPDATE preset_id = VALUES(preset_id), updated_at = CURRENT_TIMESTAMP'
        );
        $s->execute([':u' => $username, ':s' => $scope, ':p' => $presetId]);
        ok(['chosen' => $presetId]);
    }

    /* ----- reorder : admin ----- */
    if ($action === 'reorder') {
        fp_require_manage($db, $me);
        $scope = fp_scope((string)($in['scope'] ?? ''));
        $order = $in['order'] ?? [];
        if (!is_array($order)) fail('order doit être un tableau', 422);

        $db->beginTransaction();
        try {
            $upd = $db->prepare(
                'UPDATE crminternet_filter_presets
                    SET position = :p
                  WHERE id = :id AND scope = :s'
            );
            foreach ($order as $i => $id) {
                $upd->execute([':p' => (int)$i, ':id' => (string)$id, ':s' => $scope]);
            }
            $db->commit();
        } catch (Throwable $e) {
            $db->rollBack();
            fail('Réordonnancement impossible : ' . $e->getMessage(), 500);
        }
        ok(['reordered' => count($order)]);
    }

    /* ----- create : admin ----- */
    fp_require_manage($db, $me);
    $scope = fp_scope((string)($in['scope'] ?? ''));
    $name  = trim((string)($in['name'] ?? ''));
    if ($name === '' || mb_strlen($name) > 120) fail('name requis (1-120)', 422);
    $description = isset($in['description']) ? mb_substr((string)$in['description'], 0, 500) : null;
    $filters     = $in['filters'] ?? new stdClass();
    if (!is_array($filters) && !is_object($filters)) fail('filters doit être un objet', 422);
    $isShared    = !empty($in['is_shared']) ? 1 : 0;
    $isDefault   = !empty($in['is_default']) ? 1 : 0;
    $defaultRole = isset($in['default_role']) && $in['default_role'] !== ''
        ? mb_substr((string)$in['default_role'], 0, 60) : null;
    $position    = isset($in['position']) ? (int)$in['position'] : 9999;
    $id          = fp_new_id();

    $s = $db->prepare(
        'INSERT INTO crminternet_filter_presets
           (id, scope, name, description, filters_json, is_shared, is_default, default_role, position, created_by)
         VALUES (:id, :s, :n, :d, :f, :sh, :df, :dr, :p, :u)'
    );
    $s->execute([
        ':id' => $id,
        ':s'  => $scope,
        ':n'  => $name,
        ':d'  => $description,
        ':f'  => json_encode($filters, JSON_UNESCAPED_UNICODE),
        ':sh' => $isShared,
        ':df' => $isDefault,
        ':dr' => $defaultRole,
        ':p'  => $position,
        ':u'  => $me['username'] ?? null,
    ]);
    if ($isDefault) fp_clear_other_defaults($db, $scope, $defaultRole, $id);

    ok(['preset' => fp_fetch($db, $id)], 201);
}

/* ----------------------------------------------------------------- PATCH */

if ($method === 'PATCH') {
    fp_require_manage($db, $me);
    $id = (string)($_GET['id'] ?? '');
    if ($id === '') fail('id requis', 422);
    $existing = fp_fetch($db, $id);
    if (!$existing) fail('Modèle introuvable', 404);

    $in = json_input();
    $sets = [];
    $args = [':id' => $id];

    if (array_key_exists('name', $in)) {
        $name = trim((string)$in['name']);
        if ($name === '' || mb_strlen($name) > 120) fail('name invalide', 422);
        $sets[] = 'name = :n'; $args[':n'] = $name;
    }
    if (array_key_exists('description', $in)) {
        $sets[] = 'description = :d';
        $args[':d'] = $in['description'] === null ? null : mb_substr((string)$in['description'], 0, 500);
    }
    if (array_key_exists('filters', $in)) {
        if (!is_array($in['filters']) && !is_object($in['filters'])) fail('filters doit être un objet', 422);
        $sets[] = 'filters_json = :f';
        $args[':f'] = json_encode($in['filters'], JSON_UNESCAPED_UNICODE);
    }
    if (array_key_exists('is_shared', $in))  { $sets[] = 'is_shared = :sh';  $args[':sh'] = $in['is_shared'] ? 1 : 0; }
    if (array_key_exists('is_default', $in)) { $sets[] = 'is_default = :df'; $args[':df'] = $in['is_default'] ? 1 : 0; }
    if (array_key_exists('default_role', $in)) {
        $sets[] = 'default_role = :dr';
        $args[':dr'] = $in['default_role'] === null || $in['default_role'] === '' ? null : mb_substr((string)$in['default_role'], 0, 60);
    }
    if (array_key_exists('position', $in)) { $sets[] = 'position = :p'; $args[':p'] = (int)$in['position']; }

    if (!$sets) fail('Aucune modification', 422);

    $sql = 'UPDATE crminternet_filter_presets SET ' . implode(', ', $sets)
         . ', updated_at = CURRENT_TIMESTAMP WHERE id = :id';
    $db->prepare($sql)->execute($args);

    $updated = fp_fetch($db, $id);
    if ($updated && $updated['is_default']) {
        fp_clear_other_defaults($db, $updated['scope'], $updated['default_role'], $id);
    }
    ok(['preset' => $updated]);
}

/* ---------------------------------------------------------------- DELETE */

if ($method === 'DELETE') {
    // Suppression réservée à l'Administrateur uniquement.
    if (($me['role'] ?? '') !== 'Administrateur') fail('Suppression réservée à l\'Administrateur', 403);
    $id = (string)($_GET['id'] ?? '');
    if ($id === '') fail('id requis', 422);

    $db->prepare('DELETE FROM crminternet_filter_preset_user_choice WHERE preset_id = :id')
       ->execute([':id' => $id]);
    $s = $db->prepare('DELETE FROM crminternet_filter_presets WHERE id = :id');
    $s->execute([':id' => $id]);
    ok(['deleted' => $s->rowCount()]);
}

fail('Method not allowed', 405);
