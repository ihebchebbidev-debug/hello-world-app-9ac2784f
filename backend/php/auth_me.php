<?php
require_once __DIR__ . '/config.php';
require_method('GET');
$payload = require_auth();

$db = (new Database())->getConnection();
ensure_must_change_column($db);
// Garantit la colonne d'affectation guichet (rétro-compat avec d'anciens déploiements)
try { $db->exec("ALTER TABLE crminternet_users ADD COLUMN IF NOT EXISTS guichet_entity_id VARCHAR(40) NULL"); } catch (Throwable $e) {}
try { $db->exec("ALTER TABLE crminternet_users ADD COLUMN IF NOT EXISTS team_id VARCHAR(40) NULL"); } catch (Throwable $e) {}
$stmt = $db->prepare('SELECT id, username, full_name, email, role, team, active,
                             COALESCE(must_change_password, 0) AS must_change_password,
                             job_title, birth_date, cin, company, contract_type,
                             salary, salary_increase,
                             contract_start, contract_end, renewal_start, renewal_end,
                             observations, phone, rib, hire_date, guichet_entity_id, team_id
                      FROM crminternet_users WHERE id = :id LIMIT 1');
$stmt->execute([':id' => $payload['sub']]);
$u = $stmt->fetch();
if (!$u) fail('User not found', 404);

// Charge l'équipe (nom + rôles membres) si l'utilisateur en a une.
$teamId = (string)($u['team_id'] ?? '');
$teamName = null; $teamRoles = [];
if ($teamId !== '') {
    try {
        $ts = $db->prepare('SELECT name FROM crminternet_teams WHERE id = :t');
        $ts->execute([':t' => $teamId]);
        $teamName = $ts->fetchColumn() ?: null;
        $rs = $db->prepare('SELECT role FROM crminternet_team_roles WHERE team_id = :t');
        $rs->execute([':t' => $teamId]);
        $teamRoles = array_map('strval', $rs->fetchAll(PDO::FETCH_COLUMN) ?: []);
    } catch (Throwable $e) { /* tables pas encore migrées */ }
}

$grants = active_grants_for($db, $u['username']);
$overrides = user_overrides_for($db, $u['username']);

ok(['user' => [
    'id'       => $u['id'],
    'username' => $u['username'],
    'fullName' => $u['full_name'],
    'email'    => $u['email'],
    'role'     => $u['role'],
    'team'     => $u['team'],
    'active'   => (bool)$u['active'],
    'mustChangePassword' => (bool)($u['must_change_password'] ?? 0),
    'grantedRoles'       => $grants['roles'],
    'grantedPermissions' => $grants['permissions'],
    'allowedPermissions' => $overrides['allow'],
    'deniedPermissions'  => $overrides['deny'],
    // HR / personnel
    'jobTitle'       => $u['job_title']       ?? null,
    'birthDate'      => $u['birth_date']      ?? null,
    'cin'            => $u['cin']             ?? null,
    'company'        => $u['company']         ?? null,
    'contractType'   => $u['contract_type']   ?? null,
    'salary'         => isset($u['salary'])           && $u['salary']          !== null ? (float)$u['salary']          : null,
    'salaryIncrease' => isset($u['salary_increase']) && $u['salary_increase'] !== null ? (float)$u['salary_increase'] : null,
    'contractStart'  => $u['contract_start']  ?? null,
    'contractEnd'    => $u['contract_end']    ?? null,
    'renewalStart'   => $u['renewal_start']   ?? null,
    'renewalEnd'     => $u['renewal_end']     ?? null,
    'observations'   => $u['observations']    ?? null,
    'phone'          => $u['phone']           ?? null,
    'rib'            => $u['rib']             ?? null,
    'hireDate'       => $u['hire_date']       ?? null,
    'guichetEntityId' => $u['guichet_entity_id'] ?? null,
    'teamId'          => $teamId !== '' ? $teamId : null,
    'teamName'        => $teamName,
    'teamRoles'       => $teamRoles,
]]);
