<?php
require_once __DIR__ . '/config.php';
require_method('POST');
$payload = require_auth();
$db = (new Database())->getConnection();

$in = json_input();
if (!is_array($in)) fail('Invalid JSON', 422);

// ---- Validation helpers (same rules as users.php POST) -------------------
$strOrNull = function ($v, int $max = 255) {
    if ($v === null) return null;
    $s = trim((string)$v);
    if ($s === '') return null;
    return function_exists('mb_substr') ? mb_substr($s, 0, $max) : substr($s, 0, $max);
};
$decOrNull = function ($v, float $min = 0.0, float $max = 9999999.999) {
    if ($v === null || $v === '') return null;
    if (!is_numeric($v)) return false;
    $n = (float)$v;
    if ($n < $min || $n > $max) return false;
    return round($n, 3);
};
$dateOrNull = function ($v) {
    if ($v === null) return null;
    $s = trim((string)$v);
    if ($s === '') return null;
    if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $s, $m)) return false;
    return checkdate((int)$m[2], (int)$m[3], (int)$m[1]) ? $s : false;
};

$allowedContract = ['CDI','CDD','CIVP','SIVP','Karama','Stage','Freelance'];
$errs = [];

$fullName     = $strOrNull($in['fullName']     ?? null, 120);
$email        = $strOrNull($in['email']        ?? null, 255);
$jobTitle     = $strOrNull($in['jobTitle']     ?? null, 120);
$company      = $strOrNull($in['company']      ?? null, 120);
$contractType = $strOrNull($in['contractType'] ?? null, 40);
$cin          = $strOrNull($in['cin']          ?? null, 40);
$phone        = $strOrNull($in['phone']        ?? null, 40);
$rib          = $strOrNull($in['rib']          ?? null, 40);
$observations = $strOrNull($in['observations'] ?? null, 2000);

if ($fullName === null)                                          $errs[] = 'fullName requis';
if ($email !== null && !filter_var($email, FILTER_VALIDATE_EMAIL)) $errs[] = 'email invalide';
if ($contractType !== null && !in_array($contractType, $allowedContract, true)) $errs[] = 'contractType invalide';
if ($cin   !== null && !preg_match('/^[A-Za-z0-9-]{4,40}$/', $cin))   $errs[] = 'cin format';
if ($phone !== null && !preg_match('/^[0-9 +()-]{6,40}$/', $phone))   $errs[] = 'phone format';
if ($rib   !== null && !preg_match('/^[0-9]{10,30}$/', $rib))         $errs[] = 'rib format';

$salary         = $decOrNull($in['salary']         ?? null);
$salaryIncrease = $decOrNull($in['salaryIncrease'] ?? null);
if ($salary === false)         $errs[] = 'salary invalide';
if ($salaryIncrease === false) $errs[] = 'salaryIncrease invalide';

$dates = [
    'birthDate'     => $dateOrNull($in['birthDate']     ?? null),
    'contractStart' => $dateOrNull($in['contractStart'] ?? null),
    'contractEnd'   => $dateOrNull($in['contractEnd']   ?? null),
    'renewalStart'  => $dateOrNull($in['renewalStart']  ?? null),
    'renewalEnd'    => $dateOrNull($in['renewalEnd']    ?? null),
    'hireDate'      => $dateOrNull($in['hireDate']      ?? null),
];
foreach ($dates as $k => $v) if ($v === false) $errs[] = "$k invalide";

if ($dates['contractStart'] && $dates['contractEnd'] && $dates['contractEnd'] < $dates['contractStart'])
    $errs[] = 'contractEnd < contractStart';
if ($dates['renewalStart'] && $dates['renewalEnd'] && $dates['renewalEnd'] < $dates['renewalStart'])
    $errs[] = 'renewalEnd < renewalStart';
if ($dates['birthDate'] && $dates['birthDate'] > date('Y-m-d')) $errs[] = 'birthDate dans le futur';

if ($errs) fail(implode(', ', $errs), 422);

// ---- Pre-emptive uniqueness checks ---------------------------------------
$uid = $payload['sub'];
if ($cin !== null) {
    $s = $db->prepare('SELECT id FROM crminternet_users WHERE cin = :c AND id <> :id LIMIT 1');
    $s->execute([':c' => $cin, ':id' => $uid]);
    if ($s->fetchColumn()) {
        http_response_code(409);
        echo json_encode(['ok'=>false,'code'=>'DUPLICATE_CIN','field'=>'cin','error'=>"CIN déjà utilisé ($cin)"]);
        exit;
    }
}
if ($email !== null) {
    $s = $db->prepare('SELECT id FROM crminternet_users WHERE email = :e AND id <> :id LIMIT 1');
    $s->execute([':e' => $email, ':id' => $uid]);
    if ($s->fetchColumn()) {
        http_response_code(409);
        echo json_encode(['ok'=>false,'code'=>'DUPLICATE_EMAIL','field'=>'email','error'=>"Email déjà utilisé ($email)"]);
        exit;
    }
}

try {
    $u = $db->prepare('UPDATE crminternet_users SET
        full_name=:fn, email=COALESCE(:em, email),
        job_title=:jt, birth_date=:bd, cin=:cin, company=:co,
        contract_type=:ct, salary=:sal, salary_increase=:si,
        contract_start=:cs, contract_end=:ce,
        renewal_start=:rs, renewal_end=:re,
        observations=:obs, phone=:ph, rib=:rib, hire_date=:hd
        WHERE id=:id');
    $u->execute([
        ':fn'=>$fullName, ':em'=>$email,
        ':jt'=>$jobTitle, ':bd'=>$dates['birthDate'] ?: null, ':cin'=>$cin, ':co'=>$company,
        ':ct'=>$contractType, ':sal'=>$salary, ':si'=>$salaryIncrease,
        ':cs'=>$dates['contractStart'] ?: null, ':ce'=>$dates['contractEnd'] ?: null,
        ':rs'=>$dates['renewalStart']  ?: null, ':re'=>$dates['renewalEnd']  ?: null,
        ':obs'=>$observations, ':ph'=>$phone, ':rib'=>$rib,
        ':hd'=>$dates['hireDate'] ?: null,
        ':id'=>$uid,
    ]);
} catch (PDOException $e) {
    if ($e->getCode() === '23000') {
        http_response_code(409);
        $msg = $e->getMessage();
        $code = stripos($msg,'cin')!==false ? 'DUPLICATE_CIN'
              : (stripos($msg,'email')!==false ? 'DUPLICATE_EMAIL' : 'DUPLICATE');
        echo json_encode(['ok'=>false,'code'=>$code,'error'=>'Conflit de valeur unique']);
        exit;
    }
    fail('Erreur serveur', 500);
}

audit_log($db, $payload, 'user.profile_update', 'user', $uid);

// Return updated user (mirror auth_me.php shape)
$stmt = $db->prepare('SELECT id, username, full_name, email, role, team, active,
                             job_title, birth_date, cin, company, contract_type,
                             salary, salary_increase,
                             contract_start, contract_end, renewal_start, renewal_end,
                             observations, phone, rib, hire_date
                      FROM crminternet_users WHERE id = :id LIMIT 1');
$stmt->execute([':id' => $uid]);
$u = $stmt->fetch();
ok(['user' => [
    'id'=>$u['id'], 'username'=>$u['username'], 'fullName'=>$u['full_name'],
    'email'=>$u['email'], 'role'=>$u['role'], 'team'=>$u['team'], 'active'=>(bool)$u['active'],
    'jobTitle'=>$u['job_title'], 'birthDate'=>$u['birth_date'], 'cin'=>$u['cin'],
    'company'=>$u['company'], 'contractType'=>$u['contract_type'],
    'salary'=>$u['salary']!==null?(float)$u['salary']:null,
    'salaryIncrease'=>$u['salary_increase']!==null?(float)$u['salary_increase']:null,
    'contractStart'=>$u['contract_start'], 'contractEnd'=>$u['contract_end'],
    'renewalStart'=>$u['renewal_start'], 'renewalEnd'=>$u['renewal_end'],
    'observations'=>$u['observations'], 'phone'=>$u['phone'], 'rib'=>$u['rib'],
    'hireDate'=>$u['hire_date'],
]]);
