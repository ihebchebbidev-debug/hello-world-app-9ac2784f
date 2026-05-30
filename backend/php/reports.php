<?php
require_once __DIR__ . '/config.php';
require_auth();
require_method('GET');
$db = (new Database())->getConnection();

$from = $_GET['from'] ?? date('Y-m-01');
$to   = $_GET['to']   ?? date('Y-m-d');
$format = $_GET['format'] ?? 'json';
$team = isset($_GET['team']) ? trim((string)$_GET['team']) : '';
$teamIsNone = ($team === '__none__');
if ($teamIsNone) {
    $teamFilter = " AND (u.team = '' OR u.team IS NULL) ";
} elseif ($team !== '') {
    $teamFilter = ' AND u.team = :team ';
} else {
    $teamFilter = '';
}

// Per-agent KPIs
$agentSql = "
  SELECT u.username, u.full_name, u.team,
    COALESCE(SUM(p.cnt),0)  AS handled,
    COALESCE(SUM(p.won),0)  AS won,
    COALESCE(SUM(p.lost),0) AS lost,
    COALESCE(c.contracts_count,0) AS contracts_count,
    COALESCE(c.revenue,0)   AS revenue
  FROM crminternet_users u
  LEFT JOIN (
    SELECT assigned_to,
      COUNT(*) cnt,
      SUM(CASE WHEN outcome='won' THEN 1 ELSE 0 END) won,
      SUM(CASE WHEN outcome='lost' THEN 1 ELSE 0 END) lost
    FROM crminternet_prospects
    WHERE created_at BETWEEN :from1 AND :to1
    GROUP BY assigned_to
  ) p ON p.assigned_to = u.username
  LEFT JOIN (
    SELECT assigned_to,
      COUNT(*) contracts_count,
      SUM(premium) revenue
    FROM crminternet_contracts
    WHERE signature_date BETWEEN :from2 AND :to2
    GROUP BY assigned_to
  ) c ON c.assigned_to = u.username
  WHERE u.role IN ('Agent','Manager','AgentSuivi','AgentActivation','AgentVente') AND u.active = 1
  $teamFilter
  GROUP BY u.id
  ORDER BY revenue DESC
";
$s = $db->prepare($agentSql);
$params = [':from1'=>$from, ':to1'=>$to, ':from2'=>$from, ':to2'=>$to];
if ($team !== '' && !$teamIsNone) $params[':team'] = $team;
$s->execute($params);
$agents = array_map(function($r){
    $h = (int)$r['handled'];
    return [
        'username'  => $r['username'],
        'fullName'  => $r['full_name'],
        'team'      => $r['team'],
        'handled'   => $h,
        'won'       => (int)$r['won'],
        'lost'      => (int)$r['lost'],
        'contracts' => (int)$r['contracts_count'],
        'revenue'   => (float)$r['revenue'],
        'conversion' => $h > 0 ? round(((int)$r['won'] / $h) * 100, 1) : 0.0,
    ];
}, $s->fetchAll());

// Per-team (agence) aggregation derived from the agent rows above so the
// team filter is naturally honored.
$NO_TEAM = 'Aucune agence';
$teamsAgg = [];
foreach ($agents as $a) {
    $t = $a['team'] !== '' && $a['team'] !== null ? $a['team'] : $NO_TEAM;
    if (!isset($teamsAgg[$t])) {
        $teamsAgg[$t] = ['team'=>$t,'agents'=>0,'handled'=>0,'won'=>0,'lost'=>0,'contracts'=>0,'revenue'=>0.0];
    }
    $teamsAgg[$t]['agents']    += 1;
    $teamsAgg[$t]['handled']   += $a['handled'];
    $teamsAgg[$t]['won']       += $a['won'];
    $teamsAgg[$t]['lost']      += $a['lost'];
    $teamsAgg[$t]['contracts'] += $a['contracts'];
    $teamsAgg[$t]['revenue']   += $a['revenue'];
}
$teams = array_values(array_map(function($t){
    $t['conversion'] = $t['handled'] > 0 ? round($t['won'] / $t['handled'] * 100, 1) : 0.0;
    return $t;
}, $teamsAgg));
usort($teams, fn($a,$b) => $b['revenue'] <=> $a['revenue']);

// Funnel
if ($teamIsNone) {
    $funnelJoin = " INNER JOIN crminternet_users u ON u.username = p.assigned_to AND (u.team = '' OR u.team IS NULL) ";
} elseif ($team !== '') {
    $funnelJoin = ' INNER JOIN crminternet_users u ON u.username = p.assigned_to AND u.team = :team ';
} else {
    $funnelJoin = '';
}
$funnel = $db->prepare("
  SELECT
    SUM(CASE WHEN p.outcome='pending' THEN 1 ELSE 0 END) pending,
    SUM(CASE WHEN p.outcome='won'     THEN 1 ELSE 0 END) won,
    SUM(CASE WHEN p.outcome='lost'    THEN 1 ELSE 0 END) lost,
    COUNT(*) total
  FROM crminternet_prospects p
  $funnelJoin
  WHERE p.created_at BETWEEN :f AND :t
");
$fp = [':f'=>$from, ':t'=>$to];
if ($team !== '' && !$teamIsNone) $fp[':team'] = $team;
$funnel->execute($fp);
$f = $funnel->fetch();

// Monthly revenue (12 buckets back from `to`)
if ($teamIsNone) {
    $monthlyJoin = " INNER JOIN crminternet_users u ON u.username = c.assigned_to AND (u.team = '' OR u.team IS NULL) ";
} elseif ($team !== '') {
    $monthlyJoin = ' INNER JOIN crminternet_users u ON u.username = c.assigned_to AND u.team = :team ';
} else {
    $monthlyJoin = '';
}
$monthly = $db->prepare("
  SELECT DATE_FORMAT(c.signature_date,'%Y-%m') ym, COUNT(*) cnt, SUM(c.premium) rev
  FROM crminternet_contracts c
  $monthlyJoin
  WHERE c.signature_date >= DATE_SUB(:t, INTERVAL 12 MONTH)
  GROUP BY ym ORDER BY ym
");
$mp = [':t'=>$to];
if ($team !== '' && !$teamIsNone) $mp[':team'] = $team;
$monthly->execute($mp);
$months = array_map(fn($r)=>['month'=>$r['ym'],'contracts'=>(int)$r['cnt'],'revenue'=>(float)$r['rev']], $monthly->fetchAll());

// Per source
if ($teamIsNone) {
    $srcJoin = " INNER JOIN crminternet_users u ON u.username = p.assigned_to AND (u.team = '' OR u.team IS NULL) ";
} elseif ($team !== '') {
    $srcJoin = ' INNER JOIN crminternet_users u ON u.username = p.assigned_to AND u.team = :team ';
} else {
    $srcJoin = '';
}
$src = $db->prepare("
  SELECT p.source, COUNT(*) total,
    SUM(CASE WHEN p.outcome='won' THEN 1 ELSE 0 END) won
  FROM crminternet_prospects p
  $srcJoin
  WHERE p.created_at BETWEEN :f AND :t
  GROUP BY p.source ORDER BY total DESC
");
$sp = [':f'=>$from, ':t'=>$to];
if ($team !== '' && !$teamIsNone) $sp[':team'] = $team;
$src->execute($sp);
$sources = array_map(fn($r)=>[
    'source'=>$r['source'], 'total'=>(int)$r['total'], 'won'=>(int)$r['won'],
    'conversion'=> (int)$r['total']>0 ? round((int)$r['won']/(int)$r['total']*100,1) : 0.0,
], $src->fetchAll());

if ($format === 'csv') {
    header('Content-Type: text/csv; charset=UTF-8');
    $tag = $team !== '' ? '_'.preg_replace('/[^A-Za-z0-9_-]/','',$team) : '';
    header('Content-Disposition: attachment; filename="report_agents_'.$from.'_'.$to.$tag.'.csv"');
    $out = fopen('php://output','w');
    fputcsv($out, ['Agent','Username','Agence','Leads traités','Gagnés','Perdus','Contrats','Revenue','Conversion %']);
    foreach ($agents as $a) {
        $teamLabel = ($a['team'] !== '' && $a['team'] !== null) ? $a['team'] : $NO_TEAM;
        fputcsv($out, [$a['fullName'],$a['username'],$teamLabel,$a['handled'],$a['won'],$a['lost'],$a['contracts'],$a['revenue'],$a['conversion']]);
    }
    fclose($out);
    exit;
}

ok([
    'period'  => ['from'=>$from,'to'=>$to,'team'=>$team],
    'agents'  => $agents,
    'teams'   => $teams,
    'funnel'  => ['pending'=>(int)$f['pending'],'won'=>(int)$f['won'],'lost'=>(int)$f['lost'],'total'=>(int)$f['total']],
    'monthly' => $months,
    'sources' => $sources,
]);
