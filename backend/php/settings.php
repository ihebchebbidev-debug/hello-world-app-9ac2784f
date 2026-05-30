<?php
require_once __DIR__ . '/config.php';
$me = require_auth();
$db = (new Database())->getConnection();
$method = $_SERVER['REQUEST_METHOD'];

// Scope rules:
//  - "global"  → readable by everyone, writable by Administrateur or Manager
//  - "<username>" → readable/writable by that user (or Administrateur)
function scope_can_write(array $me, string $scope): bool {
    if ($scope === 'global') return in_array($me['role'] ?? '', ['Administrateur','Manager'], true);
    return $scope === ($me['username'] ?? '') || ($me['role'] ?? '') === 'Administrateur';
}

if ($method === 'GET') {
    $scope = $_GET['scope'] ?? 'global';
    $key   = $_GET['key']   ?? null;
    if ($key) {
        $s = $db->prepare('SELECT value FROM crminternet_settings WHERE scope = :s AND setting_key = :k');
        $s->execute([':s' => $scope, ':k' => $key]);
        $val = $s->fetchColumn();
        $decoded = $val !== false ? json_decode($val, true) : null;
        ok(['scope' => $scope, 'key' => $key, 'value' => $decoded]);
    }
    $s = $db->prepare('SELECT setting_key, value FROM crminternet_settings WHERE scope = :s');
    $s->execute([':s' => $scope]);
    $out = [];
    foreach ($s->fetchAll() as $r) {
        $out[$r['setting_key']] = json_decode($r['value'], true);
    }
    ok(['scope' => $scope, 'settings' => $out]);
}

if ($method === 'PUT' || $method === 'POST') {
    $in    = json_input();
    $scope = $in['scope'] ?? 'global';
    $key   = trim((string)($in['key'] ?? ''));
    if ($key === '') fail('key requis', 422);
    if (!scope_can_write($me, $scope)) fail('Accès refusé', 403);

    $value = $in['value'] ?? null;
    $encoded = json_encode($value, JSON_UNESCAPED_UNICODE);
    $s = $db->prepare('INSERT INTO crminternet_settings (scope, setting_key, value)
                       VALUES (:s, :k, :v)
                       ON DUPLICATE KEY UPDATE value = VALUES(value)');
    $s->execute([':s' => $scope, ':k' => $key, ':v' => $encoded]);
    ok(['message' => 'Paramètre enregistré', 'scope' => $scope, 'key' => $key]);
}

if ($method === 'DELETE') {
    $scope = $_GET['scope'] ?? 'global';
    $key   = $_GET['key'] ?? '';
    if (!$key) fail('key requis', 422);
    if (!scope_can_write($me, $scope)) fail('Accès refusé', 403);
    $s = $db->prepare('DELETE FROM crminternet_settings WHERE scope = :s AND setting_key = :k');
    $s->execute([':s' => $scope, ':k' => $key]);
    ok(['deleted' => $s->rowCount()]);
}

fail('Method not allowed', 405);
