<?php
// =====================================================================
// Guichet — Objectifs mensuels (SIM / Portabilité / Fancy)
// GET    list (filtres: scope, agentId, entityId, month)
// POST   upsert (UNIQUE scope+agent+entity+period)
// DELETE supprimer un objectif (?id=)
// =====================================================================
require_once __DIR__ . '/config.php';
$me = require_auth();
$db = (new Database())->getConnection();
$method = $_SERVER['REQUEST_METHOD'];

function row_to_obj(array $r): array {
    return [
        'id'                     => $r['id'],
        'scope'                  => $r['scope'] ?? 'agent',
        'agentId'                => $r['agent_id'] ?? null,
        'entityId'               => $r['entity_id'] ?? null,
        'periodMonth'            => $r['period_month'] ?? '',
        'targetSim'              => (int)($r['target_sim'] ?? 0),
        'targetPort'             => (int)($r['target_port'] ?? 0),
        'targetFancy'            => (int)($r['target_fancy'] ?? 0),
        'targetContractsDaily'   => (int)($r['target_contracts_daily']   ?? 25),
        'targetContractsMonthly' => (int)($r['target_contracts_monthly'] ?? 650),
        'workingDays'            => (int)($r['working_days']             ?? 26),
        'budgetMonthlyDt'        => isset($r['budget_monthly_dt']) && $r['budget_monthly_dt'] !== null ? (float)$r['budget_monthly_dt'] : null,
        'budgetDailyDt'          => isset($r['budget_daily_dt'])   && $r['budget_daily_dt']   !== null ? (float)$r['budget_daily_dt']   : null,
        'minActivationPct'       => isset($r['min_activation_pct']) ? (float)$r['min_activation_pct'] : 25.0,
        'challengeBonusDt'       => isset($r['challenge_bonus_dt']) ? (float)$r['challenge_bonus_dt'] : null,
        'notes'                  => $r['notes'] ?? '',
    ];
}

if ($method === 'GET') {
    $where = []; $params = [];
    foreach (['scope'=>'scope','agentId'=>'agent_id','entityId'=>'entity_id'] as $q=>$col) {
        if (!empty($_GET[$q])) { $where[] = "$col = :$q"; $params[":$q"] = $_GET[$q]; }
    }
    if (!empty($_GET['month']) && preg_match('/^\d{4}-\d{2}$/', $_GET['month'])) {
        $where[] = 'period_month = :m'; $params[':m'] = $_GET['month'];
    }
    $sql = 'SELECT * FROM crminternet_guichet_objectives';
    if ($where) $sql .= ' WHERE ' . implode(' AND ', $where);
    $sql .= ' ORDER BY period_month DESC, scope, agent_id, entity_id LIMIT 500';
    $s = $db->prepare($sql); $s->execute($params);
    ok(['objectives' => array_map('row_to_obj', $s->fetchAll())]);
}

if ($method === 'POST') {
    require_permission($db, $me, 'guichet.manage_objectives');
    $in = json_input();
    $scope = in_array(($in['scope'] ?? 'agent'), ['agent','entity','global'], true) ? $in['scope'] : 'agent';
    $period = (string)($in['periodMonth'] ?? '');
    if (!preg_match('/^\d{4}-\d{2}$/', $period)) fail('periodMonth (YYYY-MM) requis', 422);
    $agent  = $scope === 'agent'  ? (string)($in['agentId']  ?? '') : null;
    $entity = $scope === 'entity' ? (string)($in['entityId'] ?? '') : null;
    if ($scope === 'agent'  && !$agent)  fail('agentId requis',  422);
    if ($scope === 'entity' && !$entity) fail('entityId requis', 422);

    // Upsert (clé unique scope+agent+entity+period)
    $find = $db->prepare("SELECT id FROM crminternet_guichet_objectives
        WHERE scope=:s AND period_month=:p
        AND (agent_id <=> :a) AND (entity_id <=> :e) LIMIT 1");
    $find->execute([':s'=>$scope, ':p'=>$period, ':a'=>$agent, ':e'=>$entity]);
    $existing = $find->fetchColumn();

    $sim   = max(0, (int)($in['targetSim']   ?? 0));
    $port  = max(0, (int)($in['targetPort']  ?? 0));
    $fancy = max(0, (int)($in['targetFancy'] ?? 0));
    $tcd   = max(0, (int)($in['targetContractsDaily']   ?? 25));
    $tcm   = max(0, (int)($in['targetContractsMonthly'] ?? 650));
    $wdays = max(1, (int)($in['workingDays'] ?? 26));
    $bm    = (isset($in['budgetMonthlyDt']) && $in['budgetMonthlyDt'] !== '' && $in['budgetMonthlyDt'] !== null) ? (float)$in['budgetMonthlyDt'] : null;
    $bd    = (isset($in['budgetDailyDt'])   && $in['budgetDailyDt']   !== '' && $in['budgetDailyDt']   !== null) ? (float)$in['budgetDailyDt']   : null;
    $minAct = isset($in['minActivationPct']) && $in['minActivationPct'] !== '' ? max(0.0, min(100.0, (float)$in['minActivationPct'])) : 25.0;
    $bonus = (isset($in['challengeBonusDt']) && $in['challengeBonusDt'] !== '' && $in['challengeBonusDt'] !== null)
             ? (float)$in['challengeBonusDt'] : null;
    $notes = trim((string)($in['notes'] ?? ''));

    if ($existing) {
        $db->prepare("UPDATE crminternet_guichet_objectives
            SET target_sim=:s, target_port=:p, target_fancy=:f,
                target_contracts_daily=:tcd, target_contracts_monthly=:tcm,
                working_days=:wd, budget_monthly_dt=:bm, budget_daily_dt=:bd,
                min_activation_pct=:ma, challenge_bonus_dt=:b, notes=:n
            WHERE id=:id")
           ->execute([
               ':s'=>$sim, ':p'=>$port, ':f'=>$fancy,
               ':tcd'=>$tcd, ':tcm'=>$tcm, ':wd'=>$wdays,
               ':bm'=>$bm, ':bd'=>$bd, ':ma'=>$minAct,
               ':b'=>$bonus, ':n'=>$notes, ':id'=>$existing,
           ]);
        audit_log($db, $me, 'guichet_objective.update', 'guichet_objective', $existing);
        ok(['id'=>$existing, 'updated'=>1]);
    }
    $id = 'GO-' . substr(bin2hex(random_bytes(6)), 0, 10);
    $db->prepare("INSERT INTO crminternet_guichet_objectives
        (id, scope, agent_id, entity_id, period_month,
         target_sim, target_port, target_fancy,
         target_contracts_daily, target_contracts_monthly, working_days,
         budget_monthly_dt, budget_daily_dt, min_activation_pct,
         challenge_bonus_dt, notes)
        VALUES (:id,:s,:a,:e,:p,:ts,:tp,:tf,:tcd,:tcm,:wd,:bm,:bd,:ma,:b,:n)")
       ->execute([
           ':id'=>$id, ':s'=>$scope, ':a'=>$agent, ':e'=>$entity, ':p'=>$period,
           ':ts'=>$sim, ':tp'=>$port, ':tf'=>$fancy,
           ':tcd'=>$tcd, ':tcm'=>$tcm, ':wd'=>$wdays,
           ':bm'=>$bm, ':bd'=>$bd, ':ma'=>$minAct,
           ':b'=>$bonus, ':n'=>$notes,
       ]);
    audit_log($db, $me, 'guichet_objective.create', 'guichet_objective', $id);
    ok(['id'=>$id, 'created'=>1], 201);
}

if ($method === 'DELETE') {
    require_permission($db, $me, 'guichet.manage_objectives');
    $id = (string)($_GET['id'] ?? '');
    if ($id === '') fail('id requis', 422);
    $db->prepare('DELETE FROM crminternet_guichet_objectives WHERE id = :id')->execute([':id'=>$id]);
    audit_log($db, $me, 'guichet_objective.delete', 'guichet_objective', $id);
    ok(['deleted'=>1]);
}

fail('Method not allowed', 405);
