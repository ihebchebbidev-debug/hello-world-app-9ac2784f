<?php
require_once __DIR__ . '/config.php';
$me = require_auth();
$db = (new Database())->getConnection();
$method = $_SERVER['REQUEST_METHOD'];

function notif_to_arr(array $r): array {
    return [
        'id'        => $r['id'],
        'user'      => $r['user_username'],
        'title'     => $r['title'],
        'body'      => $r['body'],
        'link'      => $r['link'],
        'read'      => $r['read_at'] !== null,
        'readAt'    => $r['read_at'],
        'createdAt' => $r['created_at'],
    ];
}

if ($method === 'GET') {
    $unread = isset($_GET['unread']) && $_GET['unread'] === '1';
    $sql = 'SELECT * FROM crminternet_notifications WHERE user_username = :u' . ($unread ? ' AND read_at IS NULL' : '') .
           ' ORDER BY created_at DESC LIMIT 100';
    $s = $db->prepare($sql);
    $s->execute([':u' => $me['username']]);
    $rows = array_map('notif_to_arr', $s->fetchAll());
    $count = $db->prepare('SELECT COUNT(*) FROM crminternet_notifications WHERE user_username=:u AND read_at IS NULL');
    $count->execute([':u'=>$me['username']]);
    ok(['notifications' => $rows, 'unread' => (int)$count->fetchColumn()]);
}

if ($method === 'POST') {
    // Create a notification (admin/manager can target other crminternet_users; everyone can self-notify)
    $in = json_input();
    $title = trim($in['title'] ?? '');
    if ($title === '') fail('title requis', 422);
    $target = $in['user'] ?? $me['username'];
    if ($target !== $me['username'] && !in_array($me['role'] ?? '', ['Administrateur','Manager'], true)) {
        fail('Forbidden', 403);
    }
    $id = 'N-' . substr(bin2hex(random_bytes(6)), 0, 10);
    $s = $db->prepare('INSERT INTO crminternet_notifications (id,user_username,title,body,link) VALUES (:id,:u,:t,:b,:l)');
    $s->execute([':id'=>$id, ':u'=>$target, ':t'=>$title, ':b'=>$in['body']??null, ':l'=>$in['link']??null]);
    ok(['id' => $id], 201);
}

if ($method === 'PATCH' || $method === 'PUT') {
    $in = json_input();
    $id = $in['id'] ?? ($_GET['id'] ?? null);
    $all = !empty($in['all']);
    if ($all) {
        $s = $db->prepare('UPDATE crminternet_notifications SET read_at = NOW() WHERE user_username = :u AND read_at IS NULL');
        $s->execute([':u'=>$me['username']]);
        ok(['updated' => $s->rowCount()]);
    }
    if (!$id) fail('id requis', 422);
    $s = $db->prepare('UPDATE crminternet_notifications SET read_at = NOW() WHERE id = :id AND user_username = :u');
    $s->execute([':id'=>$id, ':u'=>$me['username']]);
    ok(['updated' => $s->rowCount()]);
}

if ($method === 'DELETE') {
    $id = $_GET['id'] ?? '';
    if (!$id) fail('id requis', 422);
    $s = $db->prepare('DELETE FROM crminternet_notifications WHERE id = :id AND user_username = :u');
    $s->execute([':id'=>$id, ':u'=>$me['username']]);
    ok(['deleted' => $s->rowCount()]);
}

fail('Method not allowed', 405);
