<?php
require_once __DIR__ . '/config.php';
$me = require_auth();
$db = (new Database())->getConnection();
$method = $_SERVER['REQUEST_METHOD'];

// Idempotent — protect against fresh installs / partial migrations.
function ensure_tasks_table(PDO $db): void {
    $db->exec("CREATE TABLE IF NOT EXISTS crminternet_tasks (
        id              VARCHAR(40)  PRIMARY KEY,
        title           VARCHAR(200) NOT NULL,
        description     TEXT         NULL,
        assigned_to     VARCHAR(80)  NOT NULL,
        related_entity  VARCHAR(20)  NULL,
        related_id      VARCHAR(40)  NULL,
        due_date        DATE         NULL,
        priority        ENUM('low','normal','high') NOT NULL DEFAULT 'normal',
        status          ENUM('todo','in_progress','done','cancelled') NOT NULL DEFAULT 'todo',
        created_by      VARCHAR(80)  NOT NULL,
        created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        completed_at    DATETIME     NULL,
        INDEX idx_assigned (assigned_to, status),
        INDEX idx_due (due_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}
ensure_tasks_table($db);

function task_to_arr(array $r): array {
    return [
        'id'            => $r['id'],
        'title'         => $r['title'],
        'description'   => $r['description'],
        'assignedTo'    => $r['assigned_to'],
        'relatedEntity' => $r['related_entity'],
        'relatedId'     => $r['related_id'],
        'dueDate'       => $r['due_date'],
        'priority'      => $r['priority'],
        'status'        => $r['status'],
        'createdBy'     => $r['created_by'],
        'createdAt'     => $r['created_at'],
        'completedAt'   => $r['completed_at'],
    ];
}

if ($method === 'GET') {
    $isAdmin = (($me['role'] ?? '') === 'Administrateur');
    $mine = isset($_GET['mine']) && $_GET['mine'] === '1';
    $status = $_GET['status'] ?? null;
    $sql = 'SELECT * FROM crminternet_tasks WHERE 1=1';
    $params = [];
    // Non-admin users only see tasks they are assigned to or created.
    // Admin sees everything (unless explicitly filtered with ?mine=1).
    if ($mine || !$isAdmin) {
        // FIX: PDO with native prepares (emulation off) requires distinct
        // placeholder names even when binding the same value twice.
        $sql .= ' AND (assigned_to = :u_assigned OR created_by = :u_created)';
        $params[':u_assigned'] = $me['username'];
        $params[':u_created']  = $me['username'];
    }
    if ($status) { $sql .= ' AND status = :s'; $params[':s'] = $status; }
    $sql .= ' ORDER BY (status="done") ASC, due_date IS NULL, due_date ASC, priority DESC';
    $s = $db->prepare($sql);
    $s->execute($params);
    $tasks = array_map('task_to_arr', $s->fetchAll());
    ok(['tasks' => $tasks]);
}

if ($method === 'POST') {
    $in = json_input();
    $title = trim($in['title'] ?? '');
    if ($title === '') fail('title requis', 422);
    $id = 'T-' . substr(bin2hex(random_bytes(6)), 0, 10);
    $assigned = $in['assignedTo'] ?? $me['username'];
    $priority = in_array($in['priority']??'normal', ['low','normal','high'], true) ? ($in['priority'] ?? 'normal') : 'normal';
    $s = $db->prepare('INSERT INTO crminternet_tasks (id,title,description,assigned_to,related_entity,related_id,due_date,priority,status,created_by)
                       VALUES (:id,:t,:d,:a,:re,:ri,:du,:p,:st,:cb)');
    $s->execute([
        ':id'=>$id, ':t'=>$title, ':d'=>$in['description']??null,
        ':a'=>$assigned, ':re'=>$in['relatedEntity']??null, ':ri'=>$in['relatedId']??null,
        ':du'=>$in['dueDate']??null, ':p'=>$priority,
        ':st'=>in_array($in['status']??'todo',['todo','in_progress','done','cancelled'],true)?($in['status']??'todo'):'todo',
        ':cb'=>$me['username'],
    ]);
    // Notify the assignee if someone else created it
    if ($assigned !== $me['username']) {
        $n = $db->prepare('INSERT INTO crminternet_notifications (id,user_username,title,body) VALUES (:id,:u,:t,:b)');
        $n->execute([':id'=>'N-'.substr(bin2hex(random_bytes(6)),0,10), ':u'=>$assigned,
                     ':t'=>'Nouvelle tâche: '.$title, ':b'=>'Assignée par '.$me['username']]);
    }
    ok(['id'=>$id], 201);
}

if ($method === 'PATCH' || $method === 'PUT') {
    $isAdmin = (($me['role'] ?? '') === 'Administrateur');
    $in = json_input();
    $id = $in['id'] ?? ($_GET['id'] ?? '');
    if (!$id) fail('id requis', 422);
    if (!$isAdmin) {
        $chk = $db->prepare('SELECT 1 FROM crminternet_tasks WHERE id=:id AND (assigned_to=:u1 OR created_by=:u2)');
        $chk->execute([':id'=>$id, ':u1'=>$me['username'], ':u2'=>$me['username']]);
        if (!$chk->fetchColumn()) fail('Accès refusé', 403);
    }
    $sets = []; $params = [':id'=>$id];
    $map = ['title'=>'title','description'=>'description','assignedTo'=>'assigned_to',
            'relatedEntity'=>'related_entity','relatedId'=>'related_id','dueDate'=>'due_date',
            'priority'=>'priority','status'=>'status'];
    foreach ($map as $k=>$col) {
        if (!array_key_exists($k,$in)) continue;
        $v = $in[$k];
        if ($k==='priority' && !in_array($v,['low','normal','high'],true)) continue;
        if ($k==='status'   && !in_array($v,['todo','in_progress','done','cancelled'],true)) continue;
        // Non-admin cannot reassign a task to someone else.
        if ($k==='assignedTo' && !$isAdmin && $v !== $me['username']) continue;
        $sets[] = "$col = :$k"; $params[":$k"] = $v;
        if ($k === 'status' && $v === 'done') {
            $sets[] = 'completed_at = NOW()';
        }
    }
    if (!$sets) fail('Aucun champ', 422);
    $db->prepare('UPDATE crminternet_tasks SET '.implode(', ',$sets).' WHERE id=:id')->execute($params);
    ok(['message'=>'Tâche mise à jour']);
}

if ($method === 'DELETE') {
    $isAdmin = (($me['role'] ?? '') === 'Administrateur');
    $id = $_GET['id'] ?? '';
    if (!$id) fail('id requis', 422);
    if (!$isAdmin) {
        $chk = $db->prepare('SELECT 1 FROM crminternet_tasks WHERE id=:id AND (assigned_to=:u1 OR created_by=:u2)');
        $chk->execute([':id'=>$id, ':u1'=>$me['username'], ':u2'=>$me['username']]);
        if (!$chk->fetchColumn()) fail('Accès refusé', 403);
    }
    $s = $db->prepare('DELETE FROM crminternet_tasks WHERE id = :id');
    $s->execute([':id'=>$id]);
    ok(['deleted' => $s->rowCount()]);
}

fail('Method not allowed', 405);
