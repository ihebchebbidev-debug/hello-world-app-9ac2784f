<?php
// =====================================================================
// Protection ERP — Chat API (Messenger-style)
// Single endpoint with `action` dispatch. All routes require auth.
// =====================================================================
require_once __DIR__ . '/config.php';
$me = require_auth();
$db = (new Database())->getConnection();
$method = $_SERVER['REQUEST_METHOD'];
$in = json_input();
$action = $_GET['action'] ?? $in['action'] ?? '';

// Ensure tables exist (idempotent, soft-fail).
try {
    $sqlPath = __DIR__ . '/chat_schema.sql';
    if (file_exists($sqlPath)) {
        // Best-effort: split on ';' and run each statement. Cheap, runs once on first hit.
        static $checked = false;
        if (!$checked) {
            $exists = $db->query("SHOW TABLES LIKE 'crminternet_chat_conversations'")->fetchColumn();
            if (!$exists) {
                foreach (array_filter(array_map('trim', explode(';', file_get_contents($sqlPath)))) as $stmt) {
                    if ($stmt && stripos($stmt, 'SET NAMES') !== 0) {
                        try { $db->exec($stmt); } catch (Throwable $e) { /* ignore */ }
                    }
                }
            }
            $checked = true;
        }
    }
} catch (Throwable $e) { /* ignore */ }

// Idempotent: ensure attachment columns + post_policy column exist.
foreach ([
    "ALTER TABLE crminternet_chat_messages ADD COLUMN attachment_id VARCHAR(40) NULL",
    "ALTER TABLE crminternet_chat_messages ADD COLUMN attachment_filename VARCHAR(255) NULL",
    "ALTER TABLE crminternet_chat_messages ADD COLUMN attachment_mime VARCHAR(120) NULL",
    "ALTER TABLE crminternet_chat_messages ADD COLUMN attachment_size INT NULL",
    "ALTER TABLE crminternet_chat_conversations ADD COLUMN post_policy ENUM('all','admins') NOT NULL DEFAULT 'all'",
] as $alter) {
    try { $db->exec($alter); } catch (Throwable $e) { /* column already exists */ }
}

// Idempotent: ensure per-message read-receipts table exists.
try {
    $db->exec("CREATE TABLE IF NOT EXISTS crminternet_chat_message_reads (
        message_id    VARCHAR(40) NOT NULL,
        user_username VARCHAR(80) NOT NULL,
        read_at       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (message_id, user_username),
        KEY idx_msg (message_id),
        KEY idx_user (user_username)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
} catch (Throwable $e) { /* ignore */ }

// Helper: collect seenBy lists for a batch of message ids.
function load_seen_by(PDO $db, array $messageIds): array {
    if (empty($messageIds)) return [];
    $place = implode(',', array_fill(0, count($messageIds), '?'));
    $s = $db->prepare("SELECT r.message_id, r.user_username, r.read_at, u.full_name
                       FROM crminternet_chat_message_reads r
                       LEFT JOIN crminternet_users u ON u.username = r.user_username
                       WHERE r.message_id IN ($place)
                       ORDER BY r.read_at ASC");
    $s->execute(array_values($messageIds));
    $out = [];
    foreach ($s->fetchAll() as $r) {
        $out[$r['message_id']] = $out[$r['message_id']] ?? [];
        $out[$r['message_id']][] = [
            'username' => $r['user_username'],
            'fullName' => $r['full_name'] ?? $r['user_username'],
            'readAt'   => $r['read_at'],
        ];
    }
    return $out;
}

// Helper: mark every message in a conversation up to NOW as seen by $user.
function record_reads(PDO $db, string $convId, string $user): void {
    // Insert receipts for messages the user hasn't yet acknowledged. Skip own messages and system.
    $sql = "INSERT IGNORE INTO crminternet_chat_message_reads (message_id, user_username)
            SELECT m.id, :u FROM crminternet_chat_messages m
            LEFT JOIN crminternet_chat_message_reads r
                ON r.message_id = m.id AND r.user_username = :u2
            WHERE m.conversation_id = :c
              AND r.message_id IS NULL
              AND (m.sender_username IS NULL OR m.sender_username <> :u3)";
    $db->prepare($sql)->execute([':u'=>$user, ':u2'=>$user, ':u3'=>$user, ':c'=>$convId]);
}

function user_is_app_admin(array $me): bool {
    return ($me['role'] ?? '') === 'Administrateur';
}

function user_can_post(PDO $db, string $convId, array $me): bool {
    if (user_is_app_admin($me)) return true;
    $s = $db->prepare('SELECT c.type, c.post_policy, m.role
                       FROM crminternet_chat_conversations c
                       JOIN crminternet_chat_members m ON m.conversation_id=c.id AND m.user_username=:u
                       WHERE c.id=:c');
    $s->execute([':c'=>$convId, ':u'=>$me['username']]);
    $row = $s->fetch();
    if (!$row) return false;
    if ($row['post_policy'] === 'admins') return $row['role'] === 'admin';
    return true;
}

function chat_id(string $prefix = 'CV'): string {
    return $prefix . '-' . substr(bin2hex(random_bytes(7)), 0, 12);
}

function user_can_admin_conv(PDO $db, string $convId, array $me): bool {
    if (($me['role'] ?? '') === 'Administrateur') return true;
    $s = $db->prepare('SELECT role FROM crminternet_chat_members WHERE conversation_id=:c AND user_username=:u');
    $s->execute([':c'=>$convId, ':u'=>$me['username']]);
    return $s->fetchColumn() === 'admin';
}

function require_member(PDO $db, string $convId, string $u): array {
    $s = $db->prepare('SELECT * FROM crminternet_chat_members WHERE conversation_id=:c AND user_username=:u');
    $s->execute([':c'=>$convId, ':u'=>$u]);
    $row = $s->fetch();
    if (!$row) fail('Forbidden — not a member', 403);
    return $row;
}

function load_members(PDO $db, string $convId): array {
    $s = $db->prepare("SELECT m.user_username AS username, m.role, m.muted, m.last_read_at,
                              u.full_name, u.role AS user_role, u.team
                       FROM crminternet_chat_members m
                       LEFT JOIN crminternet_users u ON u.username = m.user_username
                       WHERE m.conversation_id = :c");
    $s->execute([':c'=>$convId]);
    return array_map(function ($r) {
        return [
            'username' => $r['username'],
            'fullName' => $r['full_name'] ?? $r['username'],
            'userRole' => $r['user_role'],
            'team'     => $r['team'],
            'role'     => $r['role'],
            'muted'    => (bool)$r['muted'],
            'lastReadAt' => $r['last_read_at'],
        ];
    }, $s->fetchAll());
}

function row_to_message(array $r, ?string $fullName = null, array $seenBy = []): array {
    $att = null;
    if (!empty($r['attachment_id'])) {
        $att = [
            'id'        => $r['attachment_id'],
            'filename'  => $r['attachment_filename'],
            'mimeType'  => $r['attachment_mime'],
            'sizeBytes' => (int)($r['attachment_size'] ?? 0),
            'url'       => 'attachments.php?download=' . urlencode($r['attachment_id']),
        ];
    }
    return [
        'id'        => $r['id'],
        'conversationId' => $r['conversation_id'],
        'sender'    => $r['sender_username'],
        'senderName'=> $fullName ?? $r['sender_full_name'] ?? $r['sender_username'],
        'body'      => $r['body'],
        'isSystem'  => (bool)($r['is_system'] ?? 0),
        'createdAt' => $r['created_at'],
        'attachment'=> $att,
        'seenBy'    => $seenBy,
    ];
}

function bump_conv(PDO $db, string $convId): void {
    $db->prepare('UPDATE crminternet_chat_conversations SET last_message_at = CURRENT_TIMESTAMP(3) WHERE id = :id')
       ->execute([':id'=>$convId]);
}

function insert_system(PDO $db, string $convId, string $body): void {
    $db->prepare('INSERT INTO crminternet_chat_messages (id, conversation_id, sender_username, body, is_system)
                  VALUES (:id, :c, NULL, :b, 1)')
       ->execute([':id'=>chat_id('M'), ':c'=>$convId, ':b'=>$body]);
    bump_conv($db, $convId);
}

// ---------------------------------------------------------------------
// GET — read endpoints
// ---------------------------------------------------------------------
if ($method === 'GET') {
    if ($action === 'conversations' || $action === '') {
        // All conversations the user belongs to, with last message + unread count + peer info for DMs.
        $s = $db->prepare("
            SELECT c.id, c.type, c.name, c.created_by, c.created_at, c.last_message_at, c.post_policy,
                   m.muted, m.last_read_at,
                   (SELECT body FROM crminternet_chat_messages WHERE conversation_id=c.id ORDER BY created_at DESC LIMIT 1) AS last_body,
                   (SELECT sender_username FROM crminternet_chat_messages WHERE conversation_id=c.id ORDER BY created_at DESC LIMIT 1) AS last_sender,
                   (SELECT COUNT(*) FROM crminternet_chat_messages mm
                      WHERE mm.conversation_id=c.id
                        AND mm.created_at > COALESCE(m.last_read_at, '1970-01-01')
                        AND (mm.sender_username IS NULL OR mm.sender_username <> :me_sub)) AS unread
            FROM crminternet_chat_conversations c
            JOIN crminternet_chat_members m ON m.conversation_id = c.id
            WHERE m.user_username = :me AND m.hidden = 0
            ORDER BY COALESCE(c.last_message_at, c.created_at) DESC
        ");
        $s->execute([':me'=>$me['username'], ':me_sub'=>$me['username']]);
        $rows = $s->fetchAll();
        $out = [];
        foreach ($rows as $r) {
            $members = load_members($db, $r['id']);
            $title = $r['name'];
            if ($r['type'] === 'dm') {
                foreach ($members as $mb) {
                    if ($mb['username'] !== $me['username']) { $title = $mb['fullName']; break; }
                }
            }
            $out[] = [
                'id'            => $r['id'],
                'type'          => $r['type'],
                'name'          => $title,
                'createdBy'     => $r['created_by'],
                'createdAt'     => $r['created_at'],
                'lastMessageAt' => $r['last_message_at'],
                'lastBody'      => $r['last_body'],
                'lastSender'    => $r['last_sender'],
                'muted'         => (bool)$r['muted'],
                'lastReadAt'    => $r['last_read_at'],
                'unread'        => (int)$r['unread'],
                'postPolicy'    => $r['post_policy'] ?? 'all',
                'members'       => $members,
            ];
        }
        ok(['conversations' => $out]);
    }

    if ($action === 'messages') {
        $convId = $_GET['conversation_id'] ?? '';
        if (!$convId) fail('conversation_id requis', 422);
        require_member($db, $convId, $me['username']);
        $limit  = max(1, min(200, (int)($_GET['limit'] ?? 50)));
        $before = $_GET['before'] ?? null;
        $sql = "SELECT m.*, u.full_name AS sender_full_name
                FROM crminternet_chat_messages m
                LEFT JOIN crminternet_users u ON u.username = m.sender_username
                WHERE m.conversation_id = :c";
        $params = [':c'=>$convId];
        if ($before) { $sql .= " AND m.created_at < :before"; $params[':before'] = $before; }
        $sql .= " ORDER BY m.created_at DESC LIMIT $limit";
        $s = $db->prepare($sql);
        $s->execute($params);
        $rows = array_reverse($s->fetchAll());
        // Mark these as seen by the caller, then load receipts for the batch.
        record_reads($db, $convId, $me['username']);
        $db->prepare('UPDATE crminternet_chat_members SET last_read_at = CURRENT_TIMESTAMP(3) WHERE conversation_id=:c AND user_username=:u')
           ->execute([':c'=>$convId, ':u'=>$me['username']]);
        $ids = array_map(fn($r)=>$r['id'], $rows);
        $seen = load_seen_by($db, $ids);
        ok(['messages' => array_map(fn($r)=>row_to_message($r, null, $seen[$r['id']] ?? []), $rows)]);
    }

    if ($action === 'search') {
        $convId = $_GET['conversation_id'] ?? '';
        $q = trim((string)($_GET['q'] ?? ''));
        if (!$convId) fail('conversation_id requis', 422);
        require_member($db, $convId, $me['username']);
        if ($q === '') ok(['results' => []]);
        $limit = max(1, min(50, (int)($_GET['limit'] ?? 30)));
        $like = '%' . str_replace(['\\','%','_'], ['\\\\','\\%','\\_'], $q) . '%';
        $s = $db->prepare("SELECT m.*, u.full_name AS sender_full_name
                           FROM crminternet_chat_messages m
                           LEFT JOIN crminternet_users u ON u.username = m.sender_username
                           WHERE m.conversation_id = :c
                             AND (m.is_system IS NULL OR m.is_system = 0)
                             AND m.body LIKE :q
                           ORDER BY m.created_at DESC
                           LIMIT $limit");
        $s->execute([':c'=>$convId, ':q'=>$like]);
        $rows = $s->fetchAll();
        ok(['results' => array_map(fn($r)=>row_to_message($r, null, []), $rows)]);
    }

    if ($action === 'poll') {
        // Lightweight: returns latest activity timestamp across user's conversations + unread totals.
        $s = $db->prepare("
            SELECT c.id,
                   c.last_message_at,
                   m.last_read_at,
                   m.muted,
                   (SELECT COUNT(*) FROM crminternet_chat_messages mm
                      WHERE mm.conversation_id=c.id
                        AND mm.created_at > COALESCE(m.last_read_at, '1970-01-01')
                        AND (mm.sender_username IS NULL OR mm.sender_username <> :me_sub)) AS unread
            FROM crminternet_chat_conversations c
            JOIN crminternet_chat_members m ON m.conversation_id = c.id
            WHERE m.user_username = :me AND m.hidden = 0
        ");
        $s->execute([':me'=>$me['username'], ':me_sub'=>$me['username']]);
        $rows = $s->fetchAll();
        $unreadTotal = 0;
        foreach ($rows as $r) if (!$r['muted']) $unreadTotal += (int)$r['unread'];
        ok([
            'serverTime' => date('c'),
            'totalUnread' => $unreadTotal,
            'conversations' => array_map(function ($r) {
                return [
                    'id' => $r['id'],
                    'lastMessageAt' => $r['last_message_at'],
                    'unread' => (int)$r['unread'],
                ];
            }, $rows),
        ]);
    }

    if ($action === 'users') {
        // Picker: list of users (active) for new chats. Anyone authed can read this.
        $s = $db->query("SELECT username, full_name, role, team FROM crminternet_users WHERE active = 1 ORDER BY full_name");
        $rows = array_map(function ($u) {
            return [
                'username' => $u['username'],
                'fullName' => $u['full_name'],
                'role'     => $u['role'],
                'team'     => $u['team'],
            ];
        }, $s->fetchAll());
        ok(['users' => $rows]);
    }

    fail('Unknown action', 400);
}

// ---------------------------------------------------------------------
// POST — write endpoints
// ---------------------------------------------------------------------
if ($method === 'POST') {

    // Multipart upload: file + caption + conversation_id. Reuses crminternet_attachments table.
    $postAction = $_POST['action'] ?? $action;
    if ($postAction === 'upload' && !empty($_FILES['file'])) {
        $convId = trim((string)($_POST['conversation_id'] ?? ''));
        $caption = trim((string)($_POST['body'] ?? ''));
        if (!$convId) fail('conversation_id requis', 422);
        require_member($db, $convId, $me['username']);
        if (!user_can_post($db, $convId, $me)) fail('Seuls les administrateurs peuvent poster dans cette conversation', 403);
        $f = $_FILES['file'];
        if ($f['error'] !== UPLOAD_ERR_OK) fail('Échec upload', 422);
        if ($f['size'] > 20 * 1024 * 1024) fail('Fichier trop volumineux (>20 Mo)', 413);

        $UPLOAD_DIR = __DIR__ . '/uploads/chat';
        if (!is_dir($UPLOAD_DIR)) @mkdir($UPLOAD_DIR, 0775, true);
        $safeName = preg_replace('/[^A-Za-z0-9._-]/', '_', $f['name']);
        $attId = 'AT-' . substr(bin2hex(random_bytes(6)), 0, 10);
        $dest = $UPLOAD_DIR . '/' . $attId . '_' . $safeName;
        if (!move_uploaded_file($f['tmp_name'], $dest)) fail('Écriture impossible', 500);
        $mime = mime_content_type($dest) ?: ($f['type'] ?? 'application/octet-stream');

        // Persist to attachments table (entity = 'chat', entity_id = conversation id) — reuses download endpoint.
        try {
            $db->prepare('INSERT INTO crminternet_attachments (id,entity,entity_id,filename,mime_type,size_bytes,storage_path,uploaded_by)
                          VALUES (:id,:e,:ei,:fn,:mt,:sz,:sp,:u)')
               ->execute([
                   ':id'=>$attId, ':e'=>'chat', ':ei'=>$convId, ':fn'=>$safeName, ':mt'=>$mime,
                   ':sz'=>$f['size'], ':sp'=>$dest, ':u'=>$me['username'],
               ]);
        } catch (Throwable $e) { @unlink($dest); fail('DB: '.$e->getMessage(), 500); }

        $msgId = chat_id('M');
        $db->prepare('INSERT INTO crminternet_chat_messages
                      (id, conversation_id, sender_username, body, attachment_id, attachment_filename, attachment_mime, attachment_size)
                      VALUES (:id,:c,:s,:b,:ai,:af,:am,:asz)')
           ->execute([
               ':id'=>$msgId, ':c'=>$convId, ':s'=>$me['username'], ':b'=>$caption,
               ':ai'=>$attId, ':af'=>$safeName, ':am'=>$mime, ':asz'=>$f['size'],
           ]);
        bump_conv($db, $convId);
        $db->prepare('UPDATE crminternet_chat_members SET last_read_at = CURRENT_TIMESTAMP(3) WHERE conversation_id=:c AND user_username=:u')
           ->execute([':c'=>$convId, ':u'=>$me['username']]);

        $s = $db->prepare('SELECT m.*, u.full_name AS sender_full_name
                           FROM crminternet_chat_messages m
                           LEFT JOIN crminternet_users u ON u.username = m.sender_username
                           WHERE m.id = :id');
        $s->execute([':id'=>$msgId]);
        ok(['message' => row_to_message($s->fetch())], 201);
    }

    if ($action === 'send') {
        $convId = $in['conversation_id'] ?? '';
        $body   = trim((string)($in['body'] ?? ''));
        if (!$convId || $body === '') fail('conversation_id et body requis', 422);
        if (mb_strlen($body) > 4000) fail('Message trop long (max 4000)', 422);
        require_member($db, $convId, $me['username']);
        if (!user_can_post($db, $convId, $me)) fail('Seuls les administrateurs peuvent poster dans cette conversation', 403);
        $id = chat_id('M');
        $db->prepare('INSERT INTO crminternet_chat_messages (id, conversation_id, sender_username, body) VALUES (:id,:c,:s,:b)')
           ->execute([':id'=>$id, ':c'=>$convId, ':s'=>$me['username'], ':b'=>$body]);
        bump_conv($db, $convId);
        // Mark sender as read up to now
        $db->prepare('UPDATE crminternet_chat_members SET last_read_at = CURRENT_TIMESTAMP(3) WHERE conversation_id=:c AND user_username=:u')
           ->execute([':c'=>$convId, ':u'=>$me['username']]);
        // Fetch the inserted row to return.
        $s = $db->prepare('SELECT m.*, u.full_name AS sender_full_name
                           FROM crminternet_chat_messages m
                           LEFT JOIN crminternet_users u ON u.username = m.sender_username
                           WHERE m.id = :id');
        $s->execute([':id'=>$id]);
        ok(['message' => row_to_message($s->fetch())], 201);
    }

    if ($action === 'create_dm') {
        $other = trim((string)($in['user'] ?? ''));
        if (!$other || $other === $me['username']) fail('user requis', 422);
        // Look up existing DM between the two
        $s = $db->prepare("
            SELECT c.id FROM crminternet_chat_conversations c
            JOIN crminternet_chat_members m1 ON m1.conversation_id=c.id AND m1.user_username=:a
            JOIN crminternet_chat_members m2 ON m2.conversation_id=c.id AND m2.user_username=:b
            WHERE c.type = 'dm' LIMIT 1
        ");
        $s->execute([':a'=>$me['username'], ':b'=>$other]);
        $existing = $s->fetchColumn();
        if ($existing) {
            // Un-hide for the caller
            $db->prepare('UPDATE crminternet_chat_members SET hidden=0 WHERE conversation_id=:c AND user_username=:u')
               ->execute([':c'=>$existing, ':u'=>$me['username']]);
            ok(['id' => $existing, 'created' => false]);
        }
        $id = chat_id('CV');
        $db->prepare("INSERT INTO crminternet_chat_conversations (id,type,created_by) VALUES (:id,'dm',:cb)")
           ->execute([':id'=>$id, ':cb'=>$me['username']]);
        $ins = $db->prepare("INSERT INTO crminternet_chat_members (conversation_id,user_username,role) VALUES (:c,:u,'member')");
        $ins->execute([':c'=>$id, ':u'=>$me['username']]);
        $ins->execute([':c'=>$id, ':u'=>$other]);
        ok(['id' => $id, 'created' => true], 201);
    }

    if ($action === 'create_group') {
        if (!in_array($me['role'] ?? '', ['Administrateur','Manager'], true)) fail('Forbidden', 403);
        $name    = trim((string)($in['name'] ?? ''));
        $members = $in['members'] ?? [];
        if ($name === '') fail('name requis', 422);
        if (!is_array($members)) $members = [];
        $id = chat_id('CV');
        $db->prepare("INSERT INTO crminternet_chat_conversations (id,type,name,created_by) VALUES (:id,'group',:n,:cb)")
           ->execute([':id'=>$id, ':n'=>$name, ':cb'=>$me['username']]);
        $ins = $db->prepare("INSERT INTO crminternet_chat_members (conversation_id,user_username,role) VALUES (:c,:u,:r)");
        // Creator = admin
        $ins->execute([':c'=>$id, ':u'=>$me['username'], ':r'=>'admin']);
        foreach ($members as $u) {
            $u = trim((string)$u);
            if ($u === '' || $u === $me['username']) continue;
            try { $ins->execute([':c'=>$id, ':u'=>$u, ':r'=>'member']); } catch (Throwable $e) {}
        }
        insert_system($db, $id, ($me['username'] ?? 'admin') . " a créé le groupe « $name »");
        ok(['id' => $id], 201);
    }

    if ($action === 'add_members') {
        $convId  = $in['conversation_id'] ?? '';
        $members = $in['members'] ?? [];
        if (!$convId || !is_array($members)) fail('Paramètres invalides', 422);
        if (!user_can_admin_conv($db, $convId, $me)) fail('Forbidden', 403);
        $ins = $db->prepare("INSERT IGNORE INTO crminternet_chat_members (conversation_id,user_username,role) VALUES (:c,:u,'member')");
        $added = 0;
        foreach ($members as $u) {
            $u = trim((string)$u); if ($u === '') continue;
            $ins->execute([':c'=>$convId, ':u'=>$u]);
            if ($ins->rowCount() > 0) { $added++; insert_system($db, $convId, "$u a été ajouté au groupe"); }
        }
        ok(['added' => $added]);
    }

    if ($action === 'remove_member') {
        $convId = $in['conversation_id'] ?? '';
        $user   = $in['user'] ?? '';
        if (!$convId || !$user) fail('Paramètres invalides', 422);
        if (!user_can_admin_conv($db, $convId, $me) && $user !== $me['username']) fail('Forbidden', 403);
        $db->prepare('DELETE FROM crminternet_chat_members WHERE conversation_id=:c AND user_username=:u')
           ->execute([':c'=>$convId, ':u'=>$user]);
        insert_system($db, $convId, "$user a quitté le groupe");
        ok(['removed' => true]);
    }

    if ($action === 'rename') {
        $convId = $in['conversation_id'] ?? '';
        $name   = trim((string)($in['name'] ?? ''));
        if (!$convId || $name === '') fail('Paramètres invalides', 422);
        if (!user_can_admin_conv($db, $convId, $me)) fail('Forbidden', 403);
        $db->prepare('UPDATE crminternet_chat_conversations SET name=:n WHERE id=:id')
           ->execute([':n'=>$name, ':id'=>$convId]);
        insert_system($db, $convId, "Le groupe a été renommé en « $name »");
        ok(['updated' => true]);
    }

    if ($action === 'mark_read') {
        $convId = $in['conversation_id'] ?? '';
        if (!$convId) fail('conversation_id requis', 422);
        require_member($db, $convId, $me['username']);
        $db->prepare('UPDATE crminternet_chat_members SET last_read_at = CURRENT_TIMESTAMP(3), hidden = 0 WHERE conversation_id=:c AND user_username=:u')
           ->execute([':c'=>$convId, ':u'=>$me['username']]);
        record_reads($db, $convId, $me['username']);
        ok(['ok'=>true]);
    }

    if ($action === 'set_mute') {
        $convId = $in['conversation_id'] ?? '';
        $muted  = !empty($in['muted']) ? 1 : 0;
        if (!$convId) fail('conversation_id requis', 422);
        require_member($db, $convId, $me['username']);
        $db->prepare('UPDATE crminternet_chat_members SET muted=:m WHERE conversation_id=:c AND user_username=:u')
           ->execute([':m'=>$muted, ':c'=>$convId, ':u'=>$me['username']]);
        ok(['muted'=>(bool)$muted]);
    }

    if ($action === 'leave') {
        $convId = $in['conversation_id'] ?? '';
        if (!$convId) fail('conversation_id requis', 422);
        $db->prepare('UPDATE crminternet_chat_members SET hidden=1 WHERE conversation_id=:c AND user_username=:u')
           ->execute([':c'=>$convId, ':u'=>$me['username']]);
        ok(['ok'=>true]);
    }

    if ($action === 'set_role') {
        // Promote/demote a member of a group conversation.
        $convId = $in['conversation_id'] ?? '';
        $user   = trim((string)($in['user'] ?? ''));
        $role   = $in['role'] ?? '';
        if (!$convId || !$user || !in_array($role, ['admin','member'], true)) fail('Paramètres invalides', 422);
        if (!user_can_admin_conv($db, $convId, $me)) fail('Forbidden', 403);
        $type = $db->prepare('SELECT type FROM crminternet_chat_conversations WHERE id=:id');
        $type->execute([':id'=>$convId]);
        if ($type->fetchColumn() === 'dm') fail('Non applicable aux DM', 422);
        $upd = $db->prepare('UPDATE crminternet_chat_members SET role=:r WHERE conversation_id=:c AND user_username=:u');
        $upd->execute([':r'=>$role, ':c'=>$convId, ':u'=>$user]);
        if ($upd->rowCount() === 0) fail('Membre introuvable', 404);
        insert_system($db, $convId, $role === 'admin' ? "$user a été promu administrateur" : "$user n'est plus administrateur");
        ok(['updated'=>true, 'role'=>$role]);
    }

    if ($action === 'set_post_policy') {
        // Restrict who can send messages in a group: 'all' or 'admins'.
        $convId = $in['conversation_id'] ?? '';
        $policy = $in['policy'] ?? '';
        if (!$convId || !in_array($policy, ['all','admins'], true)) fail('Paramètres invalides', 422);
        if (!user_can_admin_conv($db, $convId, $me)) fail('Forbidden', 403);
        $type = $db->prepare('SELECT type FROM crminternet_chat_conversations WHERE id=:id');
        $type->execute([':id'=>$convId]);
        if ($type->fetchColumn() === 'dm') fail('Non applicable aux DM', 422);
        $db->prepare('UPDATE crminternet_chat_conversations SET post_policy=:p WHERE id=:id')
           ->execute([':p'=>$policy, ':id'=>$convId]);
        insert_system($db, $convId, $policy === 'admins'
            ? "Seuls les administrateurs peuvent désormais envoyer des messages"
            : "Tous les membres peuvent désormais envoyer des messages");
        ok(['policy'=>$policy]);
    }

    if ($action === 'broadcast') {
        // Admin-only: send a message to many users at once.
        // target: 'all' | 'role' (value=role) | 'team' (value=team) | 'users' (value=array of usernames)
        // mode: 'individual' (one DM per user) | 'group' (one new group with all)
        if (($me['role'] ?? '') !== 'Administrateur') fail('Forbidden', 403);
        $body  = trim((string)($in['body'] ?? ''));
        $target= $in['target'] ?? 'all';
        $value = $in['value'] ?? null;
        $mode  = $in['mode'] ?? 'individual';
        $title = trim((string)($in['title'] ?? 'Annonce'));
        if ($body === '') fail('body requis', 422);

        // Resolve recipients
        if ($target === 'all') {
            $rows = $db->query("SELECT username FROM crminternet_users WHERE active=1")->fetchAll();
        } elseif ($target === 'role') {
            $s = $db->prepare("SELECT username FROM crminternet_users WHERE active=1 AND role=:r");
            $s->execute([':r'=>$value]); $rows = $s->fetchAll();
        } elseif ($target === 'team') {
            $s = $db->prepare("SELECT username FROM crminternet_users WHERE active=1 AND team=:t");
            $s->execute([':t'=>$value]); $rows = $s->fetchAll();
        } elseif ($target === 'users' && is_array($value)) {
            $rows = array_map(fn($u)=>['username'=>$u], $value);
        } else fail('target invalide', 422);

        $recipients = array_filter(array_map(fn($r)=>$r['username'], $rows), fn($u)=>$u !== $me['username']);
        $recipients = array_values(array_unique($recipients));
        if (empty($recipients)) fail('Aucun destinataire', 422);

        if ($mode === 'group') {
            $convId = chat_id('CV');
            $db->prepare("INSERT INTO crminternet_chat_conversations (id,type,name,created_by) VALUES (:id,'broadcast',:n,:cb)")
               ->execute([':id'=>$convId, ':n'=>$title, ':cb'=>$me['username']]);
            $ins = $db->prepare("INSERT IGNORE INTO crminternet_chat_members (conversation_id,user_username,role) VALUES (:c,:u,:r)");
            $ins->execute([':c'=>$convId, ':u'=>$me['username'], ':r'=>'admin']);
            foreach ($recipients as $u) $ins->execute([':c'=>$convId, ':u'=>$u, ':r'=>'member']);
            $msgId = chat_id('M');
            $db->prepare('INSERT INTO crminternet_chat_messages (id,conversation_id,sender_username,body) VALUES (:id,:c,:s,:b)')
               ->execute([':id'=>$msgId, ':c'=>$convId, ':s'=>$me['username'], ':b'=>$body]);
            bump_conv($db, $convId);
            ok(['mode'=>'group', 'conversation_id'=>$convId, 'recipients'=>count($recipients)], 201);
        }

        // mode = individual — find or create DM with each user, send message
        $sent = 0;
        $findDm = $db->prepare("SELECT c.id FROM crminternet_chat_conversations c
            JOIN crminternet_chat_members m1 ON m1.conversation_id=c.id AND m1.user_username=:a
            JOIN crminternet_chat_members m2 ON m2.conversation_id=c.id AND m2.user_username=:b
            WHERE c.type='dm' LIMIT 1");
        $insConv = $db->prepare("INSERT INTO crminternet_chat_conversations (id,type,created_by) VALUES (:id,'dm',:cb)");
        $insMember = $db->prepare("INSERT INTO crminternet_chat_members (conversation_id,user_username,role) VALUES (:c,:u,'member')");
        $insMsg = $db->prepare("INSERT INTO crminternet_chat_messages (id,conversation_id,sender_username,body) VALUES (:id,:c,:s,:b)");
        foreach ($recipients as $u) {
            $findDm->execute([':a'=>$me['username'], ':b'=>$u]);
            $convId = $findDm->fetchColumn();
            if (!$convId) {
                $convId = chat_id('CV');
                $insConv->execute([':id'=>$convId, ':cb'=>$me['username']]);
                $insMember->execute([':c'=>$convId, ':u'=>$me['username']]);
                $insMember->execute([':c'=>$convId, ':u'=>$u]);
            } else {
                $db->prepare('UPDATE crminternet_chat_members SET hidden=0 WHERE conversation_id=:c AND user_username IN (:a,:b)')
                   ->execute([':c'=>$convId, ':a'=>$me['username'], ':b'=>$u]);
            }
            $insMsg->execute([':id'=>chat_id('M'), ':c'=>$convId, ':s'=>$me['username'], ':b'=>$body]);
            bump_conv($db, $convId);
            $sent++;
        }
        ok(['mode'=>'individual', 'recipients'=>$sent], 201);
    }

    fail('Unknown action', 400);
}

fail('Method not allowed', 405);
