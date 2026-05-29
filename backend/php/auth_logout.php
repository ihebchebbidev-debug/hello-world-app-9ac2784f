<?php
require_once __DIR__ . '/config.php';
require_method('POST');
// Best-effort logout audit (token may still be valid).
try {
    $payload = jwt_verify(bearer_token());
    if ($payload) {
        $db = (new Database())->getConnection();
        audit_log($db, $payload, 'logout', 'user', $payload['username'] ?? null);
    }
} catch (Throwable $e) {}
ok(['message' => 'Logged out']);
