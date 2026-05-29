<?php
// Lightweight audit tracker for client-side page views & generic events.
// POST /audit_track.php  body: { action, entityType?, entityId?, path?, details? }
// Inserts a row into crminternet_audit_log so admins get a real activity stream.
require_once __DIR__ . '/config.php';
$me = require_auth();
require_method('POST');
$db = (new Database())->getConnection();
ensure_audit_log_table($db);

// FIX: read_json_body() does not exist in this codebase — use json_input() (defined in config.php).
$body = json_input();
$action = trim((string)($body['action'] ?? 'page.view'));
// audit_log() expects strings (not null) for entityType/entityId.
$entityType = isset($body['entityType']) ? (string)$body['entityType'] : '';
$entityId   = isset($body['entityId'])   ? (string)$body['entityId']   : '';
$path       = isset($body['path'])       ? (string)$body['path']       : null;
$details    = $body['details'] ?? [];

// Whitelist actions to avoid abuse
$allowed = ['page.view', 'navigate', 'session.heartbeat', 'ui.click'];
if (!in_array($action, $allowed, true)) $action = 'page.view';

// Override path for the audit row so admins see the URL the user was on.
if ($path) {
    $_SERVER['REQUEST_URI'] = $path;
}

audit_log($db, $me, $action, $entityType, $entityId, is_array($details) ? $details : ['raw' => $details], 200);

echo json_encode(['ok' => true]);
