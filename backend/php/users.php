<?php
require_once __DIR__ . '/config.php';
$me = require_auth();
$db = (new Database())->getConnection();
$method = $_SERVER['REQUEST_METHOD'];

function row_to_user(array $u): array {
    return [
        'id'             => $u['id'],
        'username'       => $u['username'],
        'fullName'       => $u['full_name'],
        'email'          => $u['email'],
        'role'           => $u['role'],
        'team'           => $u['team'],
        'active'         => (bool)$u['active'],
        // HR / personnel (added by migration_users_hr.sql)
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
        'teamId'          => $u['team_id'] ?? null,
    ];
}

/** Ensure crminternet_users has guichet_entity_id and team_id (best-effort, idempotent). */
function ensure_user_extra_columns(PDO $db): void {
    try {
        $db->exec("ALTER TABLE crminternet_users
            ADD COLUMN IF NOT EXISTS guichet_entity_id VARCHAR(40) NULL,
            ADD INDEX IF NOT EXISTS idx_users_guichet_entity (guichet_entity_id)");
    } catch (Throwable $e) {}
    try { $db->exec("ALTER TABLE crminternet_users ADD COLUMN IF NOT EXISTS team_id VARCHAR(40) NULL"); } catch (Throwable $e) {}
    try { $db->exec("ALTER TABLE crminternet_users ADD INDEX IF NOT EXISTS idx_users_team (team_id)"); } catch (Throwable $e) {}
}
ensure_user_extra_columns($db);

if ($method === 'GET') {
    // Aggregate leadsHandled / contractsWon / conversionRate from crminternet_prospects.
    $sql = "
        SELECT u.*,
          COALESCE(p.handled, 0) AS leads_handled,
          COALESCE(p.won, 0)     AS contracts_won
        FROM crminternet_users u
        LEFT JOIN (
          SELECT assigned_to,
                 COUNT(*)                                    AS handled,
                 SUM(CASE WHEN outcome='won' THEN 1 ELSE 0 END) AS won
          FROM crminternet_prospects WHERE assigned_to IS NOT NULL GROUP BY assigned_to
        ) p ON p.assigned_to = u.username
        ORDER BY u.full_name
    ";
    $rows = $db->query($sql)->fetchAll();
    $crminternet_users = array_map(function ($u) {
        $base = row_to_user($u);
        $handled = (int)$u['leads_handled'];
        $won = (int)$u['contracts_won'];
        $conv = $handled > 0 ? round(($won / $handled) * 100, 1) : 0.0;
        $base['leadsHandled'] = $handled;
        $base['contractsWon'] = $won;
        $base['conversionRate'] = $conv;
        return $base;
    }, $rows);
    ok(['users' => $crminternet_users]);
}

if ($method === 'POST') {
    require_auth(['Administrateur']);
    $in = json_input();
    $rows = $in['rows'] ?? [$in];
    $added = 0; $updated = 0; $skipped = 0;
    $errors = [];
    // Dynamic roles: load valid role keys from crminternet_roles
    $allowedRole = $db->query('SELECT name FROM crminternet_roles')->fetchAll(PDO::FETCH_COLUMN);
    if (empty($allowedRole)) $allowedRole = ['Administrateur','Manager','Agent','Backoffice'];
    $allowedContract = ['CDI','CDD','CIVP','SIVP','Karama','Stage','Freelance'];

    // ---- Validation helpers ----------------------------------------------
    // Trim/normalize, enforce max length, return null when blank.
    $strOrNull = function ($v, int $max = 255) {
        if ($v === null) return null;
        $s = trim((string)$v);
        if ($s === '') return null;
        if (function_exists('mb_substr')) $s = mb_substr($s, 0, $max);
        else                              $s = substr($s, 0, $max);
        return $s;
    };
    // Decimal(10,3): up to 9_999_999.999. Reject negatives and non-numeric.
    $decOrNull = function ($v, float $min = 0.0, float $max = 9999999.999) {
        if ($v === null || $v === '') return null;
        if (!is_numeric($v)) return false; // sentinel = invalid
        $n = (float)$v;
        if ($n < $min || $n > $max) return false;
        return round($n, 3);
    };
    // Strict ISO date YYYY-MM-DD with calendar validity (checkdate).
    $dateOrNull = function ($v) {
        if ($v === null) return null;
        $s = trim((string)$v);
        if ($s === '') return null;
        if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $s, $m)) return false;
        return checkdate((int)$m[2], (int)$m[3], (int)$m[1]) ? $s : false;
    };
    $errInvalid = []; // accumulator inside loop scope

    foreach ($rows as $idx => $r) {
        $rowErr = [];
        $username = $strOrNull($r['username'] ?? null, 64);
        $fullName = $strOrNull($r['fullName'] ?? null, 120);
        if (!$username) $rowErr[] = 'username required';
        elseif (!preg_match('/^[A-Za-z0-9._-]{2,64}$/', $username)) $rowErr[] = 'username format';
        if (!$fullName) $rowErr[] = 'fullName required';

        $role = in_array($r['role'] ?? '', $allowedRole, true) ? $r['role'] : 'Agent';
        $email = $strOrNull($r['email'] ?? null, 255) ?? ($username . '@protection.fr');
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) $rowErr[] = 'email invalid';
        $team = $strOrNull($r['team'] ?? null, 60) ?? 'Lead-Actifs';
        $activeIn = $r['active'] ?? true;
        $active = filter_var($activeIn, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
        if ($active === null) $active = true;
        $active = $active ? 1 : 0;

        // HR fields with type/format checks
        $jobTitle      = $strOrNull($r['jobTitle']     ?? null, 120);
        $company       = $strOrNull($r['company']      ?? null, 120);
        $contractType  = $strOrNull($r['contractType'] ?? null, 40);
        if ($contractType !== null && !in_array($contractType, $allowedContract, true)) {
            $rowErr[] = 'contractType invalid';
        }
        $cin = $strOrNull($r['cin'] ?? null, 40);
        if ($cin !== null && !preg_match('/^[A-Za-z0-9-]{4,40}$/', $cin)) $rowErr[] = 'cin format';
        $phone = $strOrNull($r['phone'] ?? null, 40);
        if ($phone !== null && !preg_match('/^[0-9 +()-]{6,40}$/', $phone)) $rowErr[] = 'phone format';
        $rib = $strOrNull($r['rib'] ?? null, 40);
        if ($rib !== null && !preg_match('/^[0-9]{10,30}$/', $rib)) $rowErr[] = 'rib format';
        $observations = $strOrNull($r['observations'] ?? null, 2000);

        $salary         = $decOrNull($r['salary']         ?? null);
        $salaryIncrease = $decOrNull($r['salaryIncrease'] ?? null);
        if ($salary === false)         $rowErr[] = 'salary invalid';
        if ($salaryIncrease === false) $rowErr[] = 'salaryIncrease invalid';

        $birthDate     = $dateOrNull($r['birthDate']     ?? null);
        $contractStart = $dateOrNull($r['contractStart'] ?? null);
        $contractEnd   = $dateOrNull($r['contractEnd']   ?? null);
        $renewalStart  = $dateOrNull($r['renewalStart']  ?? null);
        $renewalEnd    = $dateOrNull($r['renewalEnd']    ?? null);
        $hireDate      = $dateOrNull($r['hireDate']      ?? null);
        foreach ([
            'birthDate'=>$birthDate,'contractStart'=>$contractStart,'contractEnd'=>$contractEnd,
            'renewalStart'=>$renewalStart,'renewalEnd'=>$renewalEnd,'hireDate'=>$hireDate,
        ] as $k=>$v) if ($v === false) $rowErr[] = "$k invalid";

        // Affectation guichet (entité / franchise) — facultative.
        $guichetEntityId = $strOrNull($r['guichetEntityId'] ?? null, 40);
        if ($guichetEntityId !== null) {
            // Vérifier existence pour éviter une FK cassée.
            $chk = $db->prepare('SELECT 1 FROM crminternet_guichet_entities WHERE id = :id');
            $chk->execute([':id' => $guichetEntityId]);
            if (!$chk->fetchColumn()) { $rowErr[] = 'guichetEntityId invalid'; }
        }

        // Équipe (team_id) — facultative. L'équipe REMPLACE le rôle pour les permissions.
        $teamId = $strOrNull($r['teamId'] ?? null, 40);
        if ($teamId !== null) {
            try {
                $chk = $db->prepare('SELECT 1 FROM crminternet_teams WHERE id = :id');
                $chk->execute([':id' => $teamId]);
                if (!$chk->fetchColumn()) { $rowErr[] = 'teamId invalid'; }
            } catch (Throwable $e) { $rowErr[] = 'teamId invalid'; }
        }

        // Cross-field date logic
        if ($contractStart && $contractEnd && $contractEnd < $contractStart)
            $rowErr[] = 'contractEnd before contractStart';
        if ($renewalStart && $renewalEnd && $renewalEnd < $renewalStart)
            $rowErr[] = 'renewalEnd before renewalStart';
        if ($birthDate && $birthDate > date('Y-m-d'))
            $rowErr[] = 'birthDate in the future';

        if ($rowErr) {
            $skipped++;
            $errors[] = ['row'=>$idx, 'username'=>$username, 'errors'=>$rowErr];
            continue;
        }

        $hr = [
            'job_title'       => $jobTitle,
            'birth_date'      => $birthDate ?: null,
            'cin'             => $cin,
            'company'         => $company,
            'contract_type'   => $contractType,
            'salary'          => $salary,
            'salary_increase' => $salaryIncrease,
            'contract_start'  => $contractStart ?: null,
            'contract_end'    => $contractEnd   ?: null,
            'renewal_start'   => $renewalStart  ?: null,
            'renewal_end'     => $renewalEnd    ?: null,
            'observations'    => $observations,
            'phone'           => $phone,
            'rib'             => $rib,
            'hire_date'       => $hireDate ?: null,
            'guichet_entity_id' => $guichetEntityId,
            'team_id'         => $teamId,
        ];

        // --- Renommage éventuel : si previousUsername est fourni et diffère,
        // on renomme l'utilisateur (PK = id) et on cascade assigned_to partout.
        $prevUsername = $strOrNull($r['previousUsername'] ?? null, 64);
        $existingId = null;
        if ($prevUsername && $prevUsername !== $username) {
            $find = $db->prepare('SELECT id FROM crminternet_users WHERE username = :u');
            $find->execute([':u' => $prevUsername]);
            $existingId = $find->fetchColumn() ?: null;
            if ($existingId) {
                // Empêche un conflit avec un autre user qui aurait déjà ce username.
                $clash = $db->prepare('SELECT id FROM crminternet_users WHERE username = :u AND id <> :id');
                $clash->execute([':u' => $username, ':id' => $existingId]);
                if ($clash->fetchColumn()) {
                    $skipped++;
                    $errors[] = ['row'=>$idx, 'username'=>$username, 'code'=>'DUPLICATE_USERNAME',
                                 'errors'=>["Username déjà utilisé ($username)"]];
                    continue;
                }
                try {
                    $db->beginTransaction();
                    $up = $db->prepare('UPDATE crminternet_users SET username = :nu WHERE id = :id');
                    $up->execute([':nu' => $username, ':id' => $existingId]);
                    // Cascade : tables qui stockent le username dans assigned_to / agent / created_by.
                    foreach ([
                        ['crminternet_prospects',     'assigned_to'],
                        ['crminternet_opportunities', 'assigned_to'],
                        ['crminternet_opportunities', 'created_by'],
                        ['crminternet_contracts',     'assigned_to'],
                    ] as $tc) {
                        try {
                            $q = $db->prepare("UPDATE {$tc[0]} SET {$tc[1]} = :nu WHERE {$tc[1]} = :ou");
                            $q->execute([':nu' => $username, ':ou' => $prevUsername]);
                        } catch (PDOException $ignore) { /* table/colonne absente : on ignore */ }
                    }
                    $db->commit();
                } catch (Throwable $e) {
                    if ($db->inTransaction()) $db->rollBack();
                    $skipped++;
                    $errors[] = ['row'=>$idx, 'username'=>$username, 'code'=>'DB_ERROR',
                                 'errors'=>['Renommage impossible: '.$e->getMessage()]];
                    continue;
                }
            }
        }
        if (!$existingId) {
            $exists = $db->prepare('SELECT id FROM crminternet_users WHERE username = :u');
            $exists->execute([':u' => $username]);
            $existingId = $exists->fetchColumn();
        }
        try {
            if ($existingId) {
                $u = $db->prepare('UPDATE crminternet_users SET
                    full_name=:fn, email=:em, role=:r, team=:t, active=:a,
                    job_title=:jt, birth_date=:bd, cin=:cin, company=:co,
                    contract_type=:ct, salary=:sal, salary_increase=:si,
                    contract_start=:cs, contract_end=:ce,
                    renewal_start=:rs, renewal_end=:re,
                    observations=:obs, phone=:ph, rib=:rib, hire_date=:hd,
                    guichet_entity_id=:gei, team_id=:tid
                    WHERE id=:id');
                $u->execute([
                    ':fn'=>$fullName, ':em'=>$email, ':r'=>$role, ':t'=>$team, ':a'=>$active, ':id'=>$existingId,
                    ':jt'=>$hr['job_title'], ':bd'=>$hr['birth_date'], ':cin'=>$hr['cin'], ':co'=>$hr['company'],
                    ':ct'=>$hr['contract_type'], ':sal'=>$hr['salary'], ':si'=>$hr['salary_increase'],
                    ':cs'=>$hr['contract_start'], ':ce'=>$hr['contract_end'],
                    ':rs'=>$hr['renewal_start'], ':re'=>$hr['renewal_end'],
                    ':obs'=>$hr['observations'], ':ph'=>$hr['phone'], ':rib'=>$hr['rib'], ':hd'=>$hr['hire_date'],
                    ':gei'=>$hr['guichet_entity_id'], ':tid'=>$hr['team_id'],
                ]);
                $updated++;
            } else {
                $id = $r['id'] ?? ('U-' . substr(bin2hex(random_bytes(6)), 0, 8));
                $tempPwd = $r['password'] ?? bin2hex(random_bytes(6));
                $hash = password_hash($tempPwd, PASSWORD_BCRYPT);
                $i = $db->prepare('INSERT INTO crminternet_users
                    (id,username,full_name,email,password_hash,role,team,active,
                     job_title,birth_date,cin,company,contract_type,salary,salary_increase,
                     contract_start,contract_end,renewal_start,renewal_end,
                     observations,phone,rib,hire_date,guichet_entity_id,team_id)
                    VALUES
                    (:id,:u,:fn,:em,:p,:r,:t,:a,
                     :jt,:bd,:cin,:co,:ct,:sal,:si,:cs,:ce,:rs,:re,:obs,:ph,:rib,:hd,:gei,:tid)');
                $i->execute([
                    ':id'=>$id, ':u'=>$username, ':fn'=>$fullName, ':em'=>$email,
                    ':p'=>$hash, ':r'=>$role, ':t'=>$team, ':a'=>$active,
                    ':jt'=>$hr['job_title'], ':bd'=>$hr['birth_date'], ':cin'=>$hr['cin'], ':co'=>$hr['company'],
                    ':ct'=>$hr['contract_type'], ':sal'=>$hr['salary'], ':si'=>$hr['salary_increase'],
                    ':cs'=>$hr['contract_start'], ':ce'=>$hr['contract_end'],
                    ':rs'=>$hr['renewal_start'], ':re'=>$hr['renewal_end'],
                    ':obs'=>$hr['observations'], ':ph'=>$hr['phone'], ':rib'=>$hr['rib'], ':hd'=>$hr['hire_date'],
                    ':gei'=>$hr['guichet_entity_id'], ':tid'=>$hr['team_id'],
                ]);
                $added++;
            }
        } catch (PDOException $e) {
            $sqlState = $e->getCode();
            $msg      = $e->getMessage();
            $isDup    = ($sqlState === '23000');
            $dupCin   = $isDup && stripos($msg, 'cin')   !== false;
            $dupMail  = $isDup && stripos($msg, 'email') !== false;
            $dupUser  = $isDup && stripos($msg, 'username') !== false;
            $code     = $dupCin ? 'DUPLICATE_CIN'
                      : ($dupMail ? 'DUPLICATE_EMAIL'
                      : ($dupUser ? 'DUPLICATE_USERNAME'
                      : ($isDup ? 'DUPLICATE' : 'DB_ERROR')));
            $skipped++;
            $errors[] = [
                'row'      => $idx,
                'username' => $username,
                'code'     => $code,
                'errors'   => [$dupCin ? "CIN déjà utilisé ($cin)"
                              : ($dupMail ? "Email déjà utilisé ($email)"
                              : ($dupUser ? "Username déjà utilisé ($username)"
                              : 'Erreur base de données'))],
            ];
        }
    }
    audit_log($db, $me, 'user.upsert', 'user', null, ['added' => $added, 'updated' => $updated, 'skipped' => $skipped]);

    // Single-row request that failed on a uniqueness conflict → return 409 with a clear message.
    if (count($rows) === 1 && $added === 0 && $updated === 0 && !empty($errors)) {
        $first = $errors[0];
        $code  = $first['code'] ?? 'DB_ERROR';
        if (in_array($code, ['DUPLICATE_CIN','DUPLICATE_EMAIL','DUPLICATE_USERNAME','DUPLICATE'], true)) {
            http_response_code(409);
            echo json_encode([
                'ok'      => false,
                'error'   => $first['errors'][0] ?? 'Conflit',
                'code'    => $code,
                'field'   => $code === 'DUPLICATE_CIN' ? 'cin'
                            : ($code === 'DUPLICATE_EMAIL' ? 'email'
                            : ($code === 'DUPLICATE_USERNAME' ? 'username' : null)),
                'details' => $first,
            ]);
            exit;
        }
    }
    ok(['added'=>$added, 'updated'=>$updated, 'skipped'=>$skipped, 'errors'=>$errors]);
}

if ($method === 'DELETE') {
    require_auth(['Administrateur']);
    $id = $_GET['id'] ?? '';
    if (!$id) fail('id requis', 422);
    $s = $db->prepare('DELETE FROM crminternet_users WHERE id = :id');
    $s->execute([':id' => $id]);
    audit_log($db, $me, 'user.delete', 'user', $id);
    ok(['deleted' => $s->rowCount()]);
}

fail('Method not allowed', 405);
