<?php
require_once __DIR__ . '/config.php';
$me = require_auth();
$db = (new Database())->getConnection();
$method = $_SERVER['REQUEST_METHOD'];

$isAdmin = (($me['role'] ?? '') === 'Administrateur');
$myName  = (string)($me['username'] ?? '');

if ($method === 'GET') {
    // Admin sees all events. Everyone else only sees their own.
    if ($isAdmin) {
        $rows = $db->query('SELECT * FROM crminternet_calendar_events ORDER BY date, time')->fetchAll();
    } else {
        $s = $db->prepare('SELECT * FROM crminternet_calendar_events
                           WHERE agent = :u
                           ORDER BY date, time');
        $s->execute([':u' => $myName]);
        $rows = $s->fetchAll();
    }
    $events = array_map(fn($e) => [
        'id'    => $e['id'],
        'title' => $e['title'],
        'date'  => $e['date'],
        'time'  => $e['time'],
        'type'  => $e['type'],
        'agent' => $e['agent'],
    ], $rows);
    ok(['events' => $events]);
}

if ($method === 'POST') {
    $in = json_input();
    $title = trim($in['title'] ?? '');
    $date  = $in['date'] ?? '';
    $time  = $in['time'] ?? '';
    $type  = in_array($in['type'] ?? 'rdv', ['rdv','rappel','signature'], true) ? ($in['type'] ?? 'rdv') : 'rdv';
    // Non-admin can only create events for themselves; admin can pick any agent.
    $rawAgent = trim($in['agent'] ?? '');
    $agent = $isAdmin ? ($rawAgent !== '' ? $rawAgent : $myName) : $myName;
    if (!$title || !$date || !$time || !$agent) fail('Champs requis manquants', 422);

    $id = $in['id'] ?? ('E-' . substr(bin2hex(random_bytes(6)), 0, 8));
    $s = $db->prepare('INSERT INTO crminternet_calendar_events (id,title,date,time,type,agent)
                       VALUES (:id,:t,:d,:tm,:tp,:a)');
    $s->execute([':id'=>$id, ':t'=>$title, ':d'=>$date, ':tm'=>$time, ':tp'=>$type, ':a'=>$agent]);
    ok(['id' => $id]);
}

if ($method === 'PUT' || $method === 'PATCH') {
    $in = json_input();
    $id = $in['id'] ?? ($_GET['id'] ?? '');
    if (!$id) fail('id requis', 422);

    $cur = $db->prepare('SELECT agent FROM crminternet_calendar_events WHERE id = :id');
    $cur->execute([':id' => $id]);
    $row = $cur->fetch();
    if (!$row) fail('Événement introuvable', 404);
    if (!$isAdmin && $row['agent'] !== $myName) fail('Accès refusé', 403);

    $sets = [];
    $params = [':id' => $id];
    foreach ([
        'title' => 'title', 'date' => 'date', 'time' => 'time',
        'agent' => 'agent', 'type' => 'type',
    ] as $k => $col) {
        if (array_key_exists($k, $in)) {
            if ($k === 'type' && !in_array($in[$k], ['rdv','rappel','signature'], true)) continue;
            // Non-admin cannot reassign to someone else.
            if ($k === 'agent' && !$isAdmin && $in[$k] !== $myName) continue;
            $sets[] = "$col = :$k";
            $params[":$k"] = $in[$k];
        }
    }
    if (!$sets) fail('Aucun champ à mettre à jour', 422);
    $sql = 'UPDATE crminternet_calendar_events SET ' . implode(', ', $sets) . ' WHERE id = :id';
    $db->prepare($sql)->execute($params);
    ok(['message' => 'Événement mis à jour']);
}

if ($method === 'DELETE') {
    $id = $_GET['id'] ?? '';
    if (!$id) fail('id requis', 422);
    $cur = $db->prepare('SELECT agent FROM crminternet_calendar_events WHERE id = :id');
    $cur->execute([':id' => $id]);
    $row = $cur->fetch();
    if (!$row) fail('Événement introuvable', 404);
    if (!$isAdmin && $row['agent'] !== $myName) fail('Accès refusé', 403);
    $s = $db->prepare('DELETE FROM crminternet_calendar_events WHERE id = :id');
    $s->execute([':id' => $id]);
    ok(['deleted' => $s->rowCount()]);
}

fail('Method not allowed', 405);
