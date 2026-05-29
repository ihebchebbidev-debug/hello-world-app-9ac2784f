<?php
// =====================================================================
// Guichet — Dashboard (compteurs + objectifs + leaderboard)
// GET ?month=YYYY-MM[&entityId=][&agentId=]
// Compte uniquement les opérations VALIDES (status='valide').
// "fancy" = SIM dont offre = 'Fancy' (insensible à la casse).
// =====================================================================
require_once __DIR__ . '/config.php';
$me = require_auth();
$db = (new Database())->getConnection();

$month    = (string)($_GET['month'] ?? date('Y-m'));
if (!preg_match('/^\d{4}-\d{2}$/', $month)) fail('month (YYYY-MM) requis', 422);
$dayParam = (string)($_GET['day'] ?? '');
if ($dayParam !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $dayParam)) fail('day (YYYY-MM-DD) invalide', 422);

// Date range support — when both `from` and `to` are provided, all monthly
// aggregates (counts, amounts, activation, leaderboard, perAgent) are scoped
// to the BETWEEN range instead of the calendar month. This fixes the previous
// over-counting when the analytics UI looped a daily request per day.
$fromParam = (string)($_GET['from'] ?? '');
$toParam   = (string)($_GET['to']   ?? '');
if ($fromParam !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $fromParam)) fail('from (YYYY-MM-DD) invalide', 422);
if ($toParam   !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $toParam))   fail('to (YYYY-MM-DD) invalide',   422);
$useRange = ($fromParam !== '' && $toParam !== '');
if ($useRange && $fromParam > $toParam) { [$fromParam, $toParam] = [$toParam, $fromParam]; }

$selectedDay = $dayParam !== '' ? $dayParam
    : ($useRange ? $toParam
        : (substr($month, 0, 7) === date('Y-m') ? date('Y-m-d') : $month.'-01'));
$entityId = !empty($_GET['entityId']) ? (string)$_GET['entityId'] : null;
$agentId  = !empty($_GET['agentId'])  ? (string)$_GET['agentId']  : null;

$role = $me['role'] ?? '';
$canAll = ($role === 'Administrateur' || $role === 'Manager')
       || (function_exists('user_has_permission') && user_has_permission($db, $me, 'guichet.read_all'));
$currentUserId = trim((string)($me['sub'] ?? $me['id'] ?? ''));

// Affectation entité (Agent Guichet rattaché à une franchise) — verrou serveur.
$assignedEntity = null;
try {
    $st = $db->prepare("SELECT guichet_entity_id FROM crminternet_users WHERE id = :id");
    $st->execute([':id' => $currentUserId]);
    $v = $st->fetchColumn();
    if ($v) $assignedEntity = (string)$v;
} catch (Throwable $e) {}
// Admin / Manager / read_all : aucun verrou d'entité — voient tout.
if ($canAll) {
    $assignedEntity = null;
}
if ($assignedEntity) {
    // Verrou serveur : entité forcée à la franchise affectée.
    $entityId = $assignedEntity;
    // L'agent peut voir toute la franchise (agentId vide) ou filtrer SUR LUI-MÊME.
    // Toute tentative de filtrer un autre agent est ignorée (sécurité).
    $selfId = $currentUserId;
    if ($agentId && $agentId !== $selfId) {
        $agentId = null;
    }
} elseif (!$canAll) {
    // Pas d'affectation entité : restreint au scope de l'utilisateur courant.
    $agentId = $currentUserId;
}

// Date "réelle" d'une opération = op_date si renseignée, sinon date de
// validation du dossier, sinon date de création. Cela évite que des
// opérations validées aujourd'hui mais rattachées à un dossier ouvert
// un autre jour soient comptées dans la mauvaise période.
$OP_DATE_EXPR = "COALESCE(e.op_date, DATE(d.validated_at), DATE(d.created_at))";

$where  = $useRange
    ? ["$OP_DATE_EXPR BETWEEN :from AND :to", "e.status = 'valide'"]
    : ["DATE_FORMAT($OP_DATE_EXPR,'%Y-%m') = :m", "e.status = 'valide'"];
$params = $useRange ? [':from' => $fromParam, ':to' => $toParam] : [':m' => $month];
if ($entityId) { $where[] = 'd.entity_id = :ent'; $params[':ent'] = $entityId; }
if ($agentId)  { $where[] = 'd.agent_id  = :ag';  $params[':ag']  = $agentId;  }
$wsql = implode(' AND ', $where);

/* --- Compteurs / montants par type ---------------------------------- */
$sql = "SELECT e.type AS t,
               COUNT(*) AS c,
               COALESCE(SUM(e.amount), 0) AS s,
               SUM(CASE WHEN e.type='sim' AND LOWER(COALESCE(e.offre,''))='fancy' THEN 1 ELSE 0 END) AS fancy
        FROM crminternet_guichet_entries e
        JOIN crminternet_guichet_dossiers d ON d.id = e.dossier_id
        WHERE $wsql
        GROUP BY e.type";
$st = $db->prepare($sql); $st->execute($params); $rows = $st->fetchAll();

$counts = ['sim'=>0,'port'=>0,'swp'=>0,'divers'=>0,'facture_tt'=>0,'facture_topnet'=>0,'fancy'=>0];
$amounts = ['sim'=>0,'port'=>0,'swp'=>0,'divers'=>0,'facture_tt'=>0,'facture_topnet'=>0];
foreach ($rows as $r) {
    $t = $r['t']; if (!isset($counts[$t])) continue;
    $counts[$t]   = (int)$r['c'];
    $amounts[$t]  = (float)$r['s'];
    if ($t === 'sim') $counts['fancy'] = (int)$r['fancy'];
}

/* --- Objectifs (priorité : agent > entity > global) ----------------- */
$targetSim = 0; $targetPort = 0; $targetFancy = 0; $bonus = null;
$tcd = 25; $tcm = 650; $wdays = 26;
$budgetM = null; $budgetD = null; $minAct = 25.0;
$lookup = function(string $scope, ?string $a, ?string $e) use (
    $db, $month, &$targetSim, &$targetPort, &$targetFancy, &$bonus,
    &$tcd, &$tcm, &$wdays, &$budgetM, &$budgetD, &$minAct
) {
    if ($targetSim || $targetPort || $targetFancy || $budgetM !== null) return;
    $st = $db->prepare("SELECT * FROM crminternet_guichet_objectives
        WHERE scope=:s AND period_month=:p
        AND (agent_id <=> :a) AND (entity_id <=> :e) LIMIT 1");
    $st->execute([':s'=>$scope, ':p'=>$month, ':a'=>$a, ':e'=>$e]);
    $row = $st->fetch();
    if ($row) {
        $targetSim   = (int)$row['target_sim'];
        $targetPort  = (int)$row['target_port'];
        $targetFancy = (int)$row['target_fancy'];
        $bonus       = isset($row['challenge_bonus_dt']) ? (float)$row['challenge_bonus_dt'] : null;
        if (isset($row['target_contracts_daily']))   $tcd = (int)$row['target_contracts_daily'];
        if (isset($row['target_contracts_monthly'])) $tcm = (int)$row['target_contracts_monthly'];
        if (isset($row['working_days']))             $wdays = max(1, (int)$row['working_days']);
        if (array_key_exists('budget_monthly_dt', $row) && $row['budget_monthly_dt'] !== null) $budgetM = (float)$row['budget_monthly_dt'];
        if (array_key_exists('budget_daily_dt',   $row) && $row['budget_daily_dt']   !== null) $budgetD = (float)$row['budget_daily_dt'];
        if (isset($row['min_activation_pct']))       $minAct = (float)$row['min_activation_pct'];
    }
};
if ($agentId)  $lookup('agent',  $agentId,  null);
if ($entityId) $lookup('entity', null,      $entityId);
$lookup('global', null, null);

$pct = function(float $n, float $t): int { return $t > 0 ? (int)min(100, round($n * 100 / $t)) : 0; };

/* --- Contrats du jour (sim+port valide aujourd'hui) ----------------- */
$today = $selectedDay;
$todayWhere = ["$OP_DATE_EXPR = :today", "e.status = 'valide'", "e.type IN ('sim','port')"];
$todayParams = [':today' => $today];
if ($entityId) { $todayWhere[] = 'd.entity_id = :ent'; $todayParams[':ent'] = $entityId; }
if ($agentId)  { $todayWhere[] = 'd.agent_id  = :ag';  $todayParams[':ag']  = $agentId;  }
$tSql = "SELECT COUNT(*) FROM crminternet_guichet_entries e
         JOIN crminternet_guichet_dossiers d ON d.id = e.dossier_id
         WHERE " . implode(' AND ', $todayWhere);
$ts = $db->prepare($tSql); $ts->execute($todayParams);
$contractsToday = (int)$ts->fetchColumn();

$contractsMonth = (int)($counts['sim'] + $counts['port']);

/* --- Récap du jour : counts + amounts par type (status=valide) ------ */
$todayAggWhere = ["$OP_DATE_EXPR = :today", "e.status = 'valide'"];
$todayAggParams = [':today' => $today];
if ($entityId) { $todayAggWhere[] = 'd.entity_id = :ent'; $todayAggParams[':ent'] = $entityId; }
if ($agentId)  { $todayAggWhere[] = 'd.agent_id  = :ag';  $todayAggParams[':ag']  = $agentId;  }
$tdSql = "SELECT e.type AS t,
                 COUNT(*) AS c,
                 COALESCE(SUM(e.amount),0) AS s,
                 COUNT(DISTINCT d.id) AS dc
          FROM crminternet_guichet_entries e
          JOIN crminternet_guichet_dossiers d ON d.id = e.dossier_id
          WHERE " . implode(' AND ', $todayAggWhere) . "
          GROUP BY e.type";
$tds = $db->prepare($tdSql); $tds->execute($todayAggParams);
$todayCounts        = ['sim'=>0,'port'=>0,'swp'=>0,'divers'=>0,'facture_tt'=>0,'facture_topnet'=>0];
$todayAmounts       = ['sim'=>0,'port'=>0,'swp'=>0,'divers'=>0,'facture_tt'=>0,'facture_topnet'=>0];
$todayDossierCounts = ['sim'=>0,'port'=>0,'swp'=>0,'divers'=>0,'facture_tt'=>0,'facture_topnet'=>0];
foreach ($tds->fetchAll() as $r) {
    $t = $r['t']; if (!isset($todayCounts[$t])) continue;
    $todayCounts[$t]        = (int)$r['c'];
    $todayAmounts[$t]       = (float)$r['s'];
    $todayDossierCounts[$t] = (int)$r['dc'];
}
$todayOperations = array_sum($todayCounts);
$todayFacturesCount  = $todayCounts['facture_tt']  + $todayCounts['facture_topnet'];
$todayFacturesAmount = (float)($todayAmounts['facture_tt'] + $todayAmounts['facture_topnet']);
$todayTotalAmount    = (float)array_sum($todayAmounts);

// Total distinct dossiers du jour (toutes opérations valides confondues)
$tddSql = "SELECT COUNT(DISTINCT d.id)
           FROM crminternet_guichet_entries e
           JOIN crminternet_guichet_dossiers d ON d.id = e.dossier_id
           WHERE " . implode(' AND ', $todayAggWhere);
$tdd = $db->prepare($tddSql); $tdd->execute($todayAggParams);
$todayDossiersTotal = (int)$tdd->fetchColumn();

/* --- Taux d'activation : entries valide / (valide+draft) ------------ */
$actWhere = $useRange
    ? ["$OP_DATE_EXPR BETWEEN :from AND :to"]
    : ["DATE_FORMAT($OP_DATE_EXPR,'%Y-%m') = :m"];
$actParams = $useRange ? [':from' => $fromParam, ':to' => $toParam] : [':m' => $month];
if ($entityId) { $actWhere[] = 'd.entity_id = :ent'; $actParams[':ent'] = $entityId; }
if ($agentId)  { $actWhere[] = 'd.agent_id  = :ag';  $actParams[':ag']  = $agentId;  }
$aSql = "SELECT
           SUM(CASE WHEN e.status='valide' THEN 1 ELSE 0 END) AS v,
           COUNT(*) AS total
         FROM crminternet_guichet_entries e
         JOIN crminternet_guichet_dossiers d ON d.id = e.dossier_id
         WHERE " . implode(' AND ', $actWhere);
$as = $db->prepare($aSql); $as->execute($actParams); $arow = $as->fetch();
$totalEntries = (int)($arow['total'] ?? 0);
$validEntries = (int)($arow['v'] ?? 0);
$activationRate = $totalEntries > 0 ? round($validEntries * 100.0 / $totalEntries, 1) : 0.0;

/* --- Leaderboard SIM (top 10 agents) -------------------------------- */
$lbSql = "SELECT d.agent_id AS aid,
                 SUM(CASE WHEN e.type='sim'  THEN 1 ELSE 0 END) AS sim,
                 SUM(CASE WHEN e.type='port' THEN 1 ELSE 0 END) AS port,
                 SUM(CASE WHEN e.type='sim' AND LOWER(COALESCE(e.offre,''))='fancy' THEN 1 ELSE 0 END) AS fancy
          FROM crminternet_guichet_entries e
          JOIN crminternet_guichet_dossiers d ON d.id = e.dossier_id
          WHERE $wsql
          GROUP BY d.agent_id
          ORDER BY sim DESC, fancy DESC
          LIMIT 10";
$lb = $db->prepare($lbSql); $lb->execute($params);
$leaderboard = array_map(function($r) {
    return ['agentId'=>(string)$r['aid'], 'sim'=>(int)$r['sim'], 'port'=>(int)$r['port'], 'fancy'=>(int)$r['fancy']];
}, $lb->fetchAll());

/* --- Per-agent revenue (TOUS les agents avec opérations valides) ---- */
$paSql = "SELECT d.agent_id AS aid, e.type AS t,
                 COUNT(*) AS c, COALESCE(SUM(e.amount),0) AS s
          FROM crminternet_guichet_entries e
          JOIN crminternet_guichet_dossiers d ON d.id = e.dossier_id
          WHERE $wsql
          GROUP BY d.agent_id, e.type";
$pas = $db->prepare($paSql); $pas->execute($params);
$perAgentMap = [];
foreach ($pas->fetchAll() as $r) {
    $aid = (string)$r['aid']; $t = $r['t'];
    if (!isset($perAgentMap[$aid])) {
        $perAgentMap[$aid] = [
            'agentId' => $aid,
            'counts'  => ['sim'=>0,'port'=>0,'swp'=>0,'divers'=>0,'facture_tt'=>0,'facture_topnet'=>0],
            'amounts' => ['sim'=>0,'port'=>0,'swp'=>0,'divers'=>0,'facture_tt'=>0,'facture_topnet'=>0],
            'revenue' => 0.0,
        ];
    }
    if (isset($perAgentMap[$aid]['counts'][$t])) {
        $perAgentMap[$aid]['counts'][$t]  = (int)$r['c'];
        $perAgentMap[$aid]['amounts'][$t] = (float)$r['s'];
        $perAgentMap[$aid]['revenue']    += (float)$r['s'];
    }
}
$perAgent = array_values($perAgentMap);
usort($perAgent, fn($a,$b) => $b['revenue'] <=> $a['revenue']);

ok([
    'month'   => $month,
    'today'   => $today,
    'range'   => $useRange ? ['from' => $fromParam, 'to' => $toParam] : null,
    'scope'   => ['agentId' => $agentId, 'entityId' => $entityId],
    'counts'  => $counts,
    'amounts' => $amounts,
    'targets' => [
        'sim' => $targetSim, 'port' => $targetPort, 'fancy' => $targetFancy,
        'contractsDaily' => $tcd, 'contractsMonthly' => $tcm,
        'workingDays' => $wdays,
        'budgetMonthlyDt' => $budgetM, 'budgetDailyDt' => $budgetD,
        'minActivationPct' => $minAct,
    ],
    'progress'=> [
        'sim'   => $pct($counts['sim'],   $targetSim),
        'port'  => $pct($counts['port'],  $targetPort),
        'fancy' => $pct($counts['fancy'], $targetFancy),
        'contractsDaily'   => $pct($contractsToday, $tcd),
        'contractsMonthly' => $pct($contractsMonth, $tcm),
    ],
    'contracts' => [
        'today' => $contractsToday,
        'month' => $contractsMonth,
    ],
    'activation' => [
        'rate'        => $activationRate,
        'min'         => $minAct,
        'meets'       => $activationRate >= $minAct,
        'validated'   => $validEntries,
        'totalEntries'=> $totalEntries,
    ],
    'leaderboard' => $leaderboard,
    'perAgent'    => $perAgent,
    'bonusDt' => $bonus,
    'todayRecap' => [
        'date'            => $today,
        'counts'          => $todayCounts,
        'amounts'         => $todayAmounts,
        'dossierCounts'   => $todayDossierCounts,
        'dossiersTotal'   => (int)$todayDossiersTotal,
        'operations'      => (int)$todayOperations,
        'facturesCount'   => (int)$todayFacturesCount,
        'facturesAmount'  => $todayFacturesAmount,
        'totalAmount'     => $todayTotalAmount,
    ],
]);
