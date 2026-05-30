<?php
require_once __DIR__ . '/config.php';
$me = require_auth();
$db = (new Database())->getConnection();
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

/** Best-effort, idempotent table creation (in case the migration was not run). */
function ensure_teams_tables(PDO $db): void {
    try {
        $db->exec("CREATE TABLE IF NOT EXISTS crminternet_teams (
            id VARCHAR(40) NOT NULL PRIMARY KEY,
            name VARCHAR(120) NOT NULL,
            description TEXT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_team_name (name)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        $db->exec("CREATE TABLE IF NOT EXISTS crminternet_team_roles (
            team_id VARCHAR(40) NOT NULL,
            role VARCHAR(80) NOT NULL,
            PRIMARY KEY (team_id, role),
            KEY idx_team_roles_team (team_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    } catch (Throwable $e) {}
}
ensure_teams_tables($db);

function load_teams(PDO $db): array {
    $teams = $db->query('SELECT id, name, description FROM crminternet_teams ORDER BY name')
                ->fetchAll(PDO::FETCH_ASSOC);
    if (!$teams) return [];
    $rows = $db->query('SELECT team_id, role FROM crminternet_team_roles')->fetchAll(PDO::FETCH_ASSOC);
    $byTeam = [];
    foreach ($rows as $r) { $byTeam[$r['team_id']][] = $r['role']; }

    // Compte des utilisateurs par équipe (best-effort si la colonne existe).
    $counts = [];
    try {
        $cstmt = $db->query('SELECT team_id, COUNT(*) AS n FROM crminternet_users
                             WHERE team_id IS NOT NULL AND team_id <> ""
                             GROUP BY team_id');
        foreach ($cstmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $counts[$r['team_id']] = (int)$r['n'];
        }
    } catch (Throwable $e) {}

    return array_map(function($t) use ($byTeam, $counts) {
        return [
            'id'          => $t['id'],
            'name'        => $t['name'],
            'description' => $t['description'],
            'roles'       => $byTeam[$t['id']] ?? [],
            'memberCount' => $counts[$t['id']] ?? 0,
        ];
    }, $teams);
}

if ($method === 'GET') {
    ok(['teams' => load_teams($db)]);
}

if ($method === 'POST' && $action === 'create') {
    require_auth(['Administrateur']);
    $in = json_input();
    $name = trim((string)($in['name'] ?? ''));
    $description = trim((string)($in['description'] ?? ''));
    $roles = $in['roles'] ?? [];
    if ($name === '' || mb_strlen($name) > 120) fail('Nom invalide (1-120 caractères)', 422);
    if (!is_array($roles)) fail('roles doit être un tableau', 422);

    // Vérifie que tous les rôles existent
    foreach ($roles as $r) {
        $s = $db->prepare('SELECT 1 FROM crminternet_roles WHERE name = :n');
        $s->execute([':n' => (string)$r]);
        if (!$s->fetchColumn()) fail("Rôle inconnu : $r", 422);
    }
    $id = 'T-' . substr(bin2hex(random_bytes(6)), 0, 10);
    try {
        $db->beginTransaction();
        $i = $db->prepare('INSERT INTO crminternet_teams (id, name, description) VALUES (:id,:n,:d)');
        $i->execute([':id' => $id, ':n' => $name, ':d' => ($description === '' ? null : $description)]);
        $ir = $db->prepare('INSERT INTO crminternet_team_roles (team_id, role) VALUES (:t,:r)');
        foreach (array_unique(array_map('strval', $roles)) as $r) {
            $ir->execute([':t' => $id, ':r' => $r]);
        }
        $db->commit();
    } catch (PDOException $e) {
        if ($db->inTransaction()) $db->rollBack();
        if ($e->getCode() === '23000') fail('Une équipe avec ce nom existe déjà', 409);
        fail('Erreur: ' . $e->getMessage(), 500);
    }
    audit_log($db, $me, 'team.create', 'team', $id, ['name' => $name, 'roles' => $roles]);
    ok(['message' => 'Équipe créée', 'id' => $id]);
}

if ($method === 'PUT' && $action === 'update') {
    require_auth(['Administrateur']);
    $in = json_input();
    $id = (string)($in['id'] ?? '');
    if ($id === '') fail('id requis', 422);
    $name = trim((string)($in['name'] ?? ''));
    $description = trim((string)($in['description'] ?? ''));
    $roles = $in['roles'] ?? [];
    if ($name === '' || mb_strlen($name) > 120) fail('Nom invalide', 422);
    if (!is_array($roles)) fail('roles doit être un tableau', 422);
    foreach ($roles as $r) {
        $s = $db->prepare('SELECT 1 FROM crminternet_roles WHERE name = :n');
        $s->execute([':n' => (string)$r]);
        if (!$s->fetchColumn()) fail("Rôle inconnu : $r", 422);
    }
    try {
        $db->beginTransaction();
        $u = $db->prepare('UPDATE crminternet_teams SET name=:n, description=:d WHERE id=:id');
        $u->execute([':n' => $name, ':d' => ($description === '' ? null : $description), ':id' => $id]);
        $d = $db->prepare('DELETE FROM crminternet_team_roles WHERE team_id=:t');
        $d->execute([':t' => $id]);
        $ir = $db->prepare('INSERT INTO crminternet_team_roles (team_id, role) VALUES (:t,:r)');
        foreach (array_unique(array_map('strval', $roles)) as $r) {
            $ir->execute([':t' => $id, ':r' => $r]);
        }
        $db->commit();
    } catch (PDOException $e) {
        if ($db->inTransaction()) $db->rollBack();
        if ($e->getCode() === '23000') fail('Une équipe avec ce nom existe déjà', 409);
        fail('Erreur: ' . $e->getMessage(), 500);
    }
    audit_log($db, $me, 'team.update', 'team', $id, ['name' => $name, 'roles' => $roles]);
    ok(['message' => 'Équipe mise à jour']);
}

if ($method === 'DELETE') {
    require_auth(['Administrateur']);
    $id = (string)($_GET['id'] ?? '');
    if ($id === '') fail('id requis', 422);
    try {
        $db->beginTransaction();
        // Détache les utilisateurs de cette équipe (sans toucher à leur rôle).
        $u = $db->prepare('UPDATE crminternet_users SET team_id = NULL WHERE team_id = :t');
        $u->execute([':t' => $id]);
        $dr = $db->prepare('DELETE FROM crminternet_team_roles WHERE team_id = :t');
        $dr->execute([':t' => $id]);
        $dt = $db->prepare('DELETE FROM crminternet_teams WHERE id = :t');
        $dt->execute([':t' => $id]);
        $db->commit();
    } catch (Throwable $e) {
        if ($db->inTransaction()) $db->rollBack();
        fail('Erreur: ' . $e->getMessage(), 500);
    }
    audit_log($db, $me, 'team.delete', 'team', $id);
    ok(['message' => 'Équipe supprimée']);
}

fail('Method not allowed', 405);
