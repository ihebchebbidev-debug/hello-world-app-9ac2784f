<?php
require_once __DIR__ . '/config.php';
require_auth();
require_method('GET');
$db = (new Database())->getConnection();

$action = $_GET['action'] ?? null;
$series = $_GET['series'] ?? null;

// =========================================================================
// action=stats — agrégats légers pour le dashboard frontend (1 seule requête
// principale + 1 GROUP BY status). Aligné avec les prédicats du front
// (src/routes/index.tsx : isWonStatusFn / isLostStatusFn / isPendingStatusFn).
// =========================================================================
if ($action === 'stats') {
    header('Cache-Control: private, max-age=30');

    $WON_REGEX  = '^(vendu|ok)$';
    $LOST_REGEX = '^(refus|refuse|pas[[:space:]]*int|pas[[:space:]]*intersse|d(é|e)j(à|a)[[:space:]]*conn|autre|autr[[:space:]]*dde)';
    $STALE_DAYS = 7;

    $sql = "
        SELECT
            COUNT(*) AS total,
            SUM(LOWER(TRIM(status)) REGEXP :won_re)  AS won,
            SUM(LOWER(TRIM(status)) REGEXP :lost_re) AS lost,
            SUM(assigned_to IS NULL OR assigned_to = '') AS unassigned,
            SUM(
                (outcome = 'won')
                OR LOWER(TRIM(status)) REGEXP :won_re2
            ) AS converted,
            SUM(
                LOWER(TRIM(status)) NOT REGEXP :won_re3
                AND LOWER(TRIM(status)) NOT REGEXP :lost_re2
            ) AS untouched,
            SUM(
                LOWER(TRIM(status)) NOT REGEXP :won_re4
                AND LOWER(TRIM(status)) NOT REGEXP :lost_re3
                AND created_at <= (CURDATE() - INTERVAL :stale_days DAY)
            ) AS untouched_stale,
            SUM(
                LOWER(TRIM(status)) NOT REGEXP :won_re5
                AND LOWER(TRIM(status)) NOT REGEXP :lost_re4
                AND (assigned_to IS NULL OR assigned_to = '')
            ) AS untouched_unassigned
        FROM crminternet_prospects
    ";
    $st = $db->prepare($sql);
    $st->execute([
        ':won_re'  => $WON_REGEX,  ':won_re2' => $WON_REGEX,
        ':won_re3' => $WON_REGEX,  ':won_re4' => $WON_REGEX, ':won_re5' => $WON_REGEX,
        ':lost_re' => $LOST_REGEX, ':lost_re2' => $LOST_REGEX,
        ':lost_re3' => $LOST_REGEX, ':lost_re4' => $LOST_REGEX,
        ':stale_days' => $STALE_DAYS,
    ]);
    $r = $st->fetch() ?: [];

    $total      = (int)($r['total']      ?? 0);
    $won        = (int)($r['won']        ?? 0);
    $lost       = (int)($r['lost']       ?? 0);
    $unassigned = (int)($r['unassigned'] ?? 0);
    $converted  = (int)($r['converted']  ?? 0);
    $untouched  = (int)($r['untouched']  ?? 0);
    $untouchedStale      = (int)($r['untouched_stale']      ?? 0);
    $untouchedUnassigned = (int)($r['untouched_unassigned'] ?? 0);
    $pending    = max(0, $total - $won - $lost);
    $assigned   = max(0, $total - $unassigned);
    $convRate   = $total > 0 ? round(($won / $total) * 100, 1) : 0.0;

    $byStatusRows = $db->query("
        SELECT COALESCE(NULLIF(TRIM(status), ''), 'Inconnu') AS status, COUNT(*) AS c
        FROM crminternet_prospects
        GROUP BY status
        ORDER BY c DESC
        LIMIT 50
    ")->fetchAll();
    $byStatus = array_map(
        fn($x) => ['status' => (string)$x['status'], 'count' => (int)$x['c']],
        $byStatusRows
    );

    ok([
        'generated_at' => gmdate('c'),
        'stats' => [
            'total'                => $total,
            'won'                  => $won,
            'lost'                 => $lost,
            'pending'              => $pending,
            'unassigned'           => $unassigned,
            'assigned'             => $assigned,
            'converted'            => $converted,
            'untouched'            => $untouched,
            'untouched_stale'      => $untouchedStale,
            'untouched_unassigned' => $untouchedUnassigned,
            'conversion_rate'      => $convRate,
            'by_status'            => $byStatus,
        ],
    ]);
}

$days   = max(1, min(60, (int)($_GET['days'] ?? 7)));

if ($series) {
    // Build a date axis covering the last N days (inclusive) ending today.
    $axis = [];
    for ($i = $days - 1; $i >= 0; $i--) {
        $axis[] = date('Y-m-d', strtotime("-$i days"));
    }
    $from = $axis[0];

    // ---- daily aggregates pulled from the DB
    if ($series === 'leads') {
        $s = $db->prepare("SELECT created_at d, COUNT(*) c
                           FROM crminternet_prospects WHERE created_at >= :f GROUP BY created_at");
    } elseif ($series === 'won') {
        $s = $db->prepare("SELECT created_at d, COUNT(*) c
                           FROM crminternet_prospects
                           WHERE outcome='won' AND created_at >= :f GROUP BY created_at");
    } elseif ($series === 'lost') {
        $s = $db->prepare("SELECT created_at d, COUNT(*) c
                           FROM crminternet_prospects
                           WHERE outcome='lost' AND created_at >= :f GROUP BY created_at");
    } elseif ($series === 'contracts') {
        $s = $db->prepare("SELECT signature_date d, COUNT(*) c
                           FROM crminternet_contracts
                           WHERE signature_date >= :f GROUP BY signature_date");
    } elseif ($series === 'revenue') {
        $s = $db->prepare("SELECT signature_date d, COALESCE(SUM(premium),0) c
                           FROM crminternet_contracts
                           WHERE signature_date >= :f GROUP BY signature_date");
    } elseif ($series === 'conversion') {
        // Per-day conversion rate (won / total) on prospects created that day
        $s = $db->prepare("SELECT created_at d,
                              ROUND(SUM(CASE WHEN outcome='won' THEN 1 ELSE 0 END) / NULLIF(COUNT(*),0) * 100, 1) c
                           FROM crminternet_prospects WHERE created_at >= :f GROUP BY created_at");
    } else {
        fail('series invalide', 422);
    }
    $s->execute([':f' => $from]);
    $byDay = [];
    foreach ($s->fetchAll() as $r) { $byDay[$r['d']] = (float)$r['c']; }

    $points = array_map(fn($d) => ['date' => $d, 'value' => $byDay[$d] ?? 0], $axis);
    ok(['series' => $series, 'days' => $days, 'points' => $points]);
}

// ---- default: aggregate stats card payload
$today = date('Y-m-d');
$monthStart = date('Y-m-01');

$prospectsAgg = $db->query("
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN outcome='won'  THEN 1 ELSE 0 END) AS won,
      SUM(CASE WHEN outcome='lost' THEN 1 ELSE 0 END) AS lost,
      SUM(CASE WHEN outcome='pending' THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN assigned_to IS NULL THEN 1 ELSE 0 END) AS unclaimed
    FROM crminternet_prospects
")->fetch();

$contractsAgg = $db->prepare("
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN signature_date = :today THEN 1 ELSE 0 END) AS today_count,
      COALESCE(SUM(CASE WHEN signature_date >= :ms THEN premium ELSE 0 END), 0) AS month_revenue
    FROM crminternet_contracts
");
$contractsAgg->execute([':today' => $today, ':ms' => $monthStart]);
$c = $contractsAgg->fetch();

$total = (int)$prospectsAgg['total'];
$won   = (int)$prospectsAgg['won'];
$conv  = $total > 0 ? round(($won / $total) * 100, 1) : 0.0;

// CRM MVP — KPI complémentaires basés sur le `status` texte (Nouveau/En cours/Rappel/Refus/Vendu)
// car la colonne `outcome` (legacy) n'est plus alimentée par l'UI MVP.
$mvp = $db->query("
    SELECT
      SUM(CASE WHEN status='Vendu'    THEN 1 ELSE 0 END) AS sold,
      SUM(CASE WHEN status='Nouveau'  THEN 1 ELSE 0 END) AS new_count,
      SUM(CASE WHEN status='En cours' THEN 1 ELSE 0 END) AS in_progress,
      SUM(CASE WHEN status='Rappel'   THEN 1 ELSE 0 END) AS callback,
      SUM(CASE WHEN status='Refus'    THEN 1 ELSE 0 END) AS refused
    FROM crminternet_prospects
")->fetch();
$soldMvp = (int)($mvp['sold'] ?? 0);
$convMvp = $total > 0 ? round(($soldMvp / $total) * 100, 1) : 0.0;

// Temps moyen de traitement (en heures) : leads non Nouveau, basé sur created_at vs maintenant.
// Note: la colonne created_at est de type DATE — on calcule donc en jours puis on convertit.
$avgRow = $db->query("
    SELECT AVG(DATEDIFF(CURDATE(), created_at)) AS avg_days
    FROM crminternet_prospects
    WHERE status IS NOT NULL AND status <> 'Nouveau'
")->fetch();
$avgHandlingDays = $avgRow && $avgRow['avg_days'] !== null ? round((float)$avgRow['avg_days'], 1) : 0.0;

ok([
    'stats' => [
        'totalLeads'         => $total,
        'newLeadsToday'      => (int)$prospectsAgg['unclaimed'],
        'wonLeads'           => $won,
        'lostLeads'          => (int)$prospectsAgg['lost'],
        'pendingLeads'       => (int)$prospectsAgg['pending'],
        'contractsThisMonth' => (int)$c['total'],
        'contractsToday'     => (int)$c['today_count'],
        'conversionRate'     => $conv,
        'revenueThisMonth'   => (float)$c['month_revenue'],
        // CRM MVP
        'soldLeads'          => $soldMvp,
        'newLeads'           => (int)($mvp['new_count'] ?? 0),
        'inProgressLeads'    => (int)($mvp['in_progress'] ?? 0),
        'callbackLeads'      => (int)($mvp['callback'] ?? 0),
        'refusedLeads'       => (int)($mvp['refused'] ?? 0),
        'mvpConversionRate'  => $convMvp,
        'avgHandlingDays'    => $avgHandlingDays,
    ],
]);
