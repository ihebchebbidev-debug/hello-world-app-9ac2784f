<?php
/**
 * One-shot maintenance script: resets RessourceHumaine role permissions to the
 * correct set. Upload to server, call once via browser (as an admin user), then
 * delete the file.
 *
 * Usage: GET /crminternet/fix_rh_permissions.php?token=RESET_RH_2025
 */
require_once __DIR__ . '/config.php';

// Simple hard-coded token so the script can't be triggered by anyone who
// stumbles on the URL.
$TOKEN = 'RESET_RH_2025';
if (($_GET['token'] ?? '') !== $TOKEN) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Token requis']);
    exit;
}

$db = (new Database())->getConnection();

// Canonical permission set for RessourceHumaine.
$correct = [
    // Core pages
    'page.dashboard',
    'page.profile',
    'page.notifications',
    // HR pages
    'page.hr.attendance',
    'page.hr.payroll',
    'page.hr.commissions',
    'page.hr.external-agents',
    // HR actions
    'hr.attendance.clock',
    'hr.attendance.export',
    'hr.payroll.edit',
    'hr.payroll.export',
    'hr.commissions.edit',
    'hr.commissions.export',
    'hr.external_agents.add',
    'hr.external_agents.edit',
    'hr.external_agents.delete',
    // Prospects (HR needs read access to leads)
    'page.prospects',
    'prospect.view',
];

$db->beginTransaction();
try {
    // Wipe current (corrupted) permissions for this role.
    $db->prepare('DELETE FROM crminternet_role_permissions WHERE role = :r')
       ->execute([':r' => 'RessourceHumaine']);

    $ins = $db->prepare('INSERT INTO crminternet_role_permissions (role, permission, enabled) VALUES (:r, :p, 1)');
    foreach ($correct as $perm) {
        $ins->execute([':r' => 'RessourceHumaine', ':p' => $perm]);
    }

    $db->commit();

    // Verify
    $rows = $db->query("SELECT permission FROM crminternet_role_permissions
                        WHERE role = 'RessourceHumaine' AND enabled = 1
                        ORDER BY permission")
               ->fetchAll(PDO::FETCH_COLUMN);

    ok([
        'message'  => 'Permissions RessourceHumaine réinitialisées avec succès.',
        'count'    => count($rows),
        'inserted' => $rows,
        'action'   => 'DELETE ce fichier du serveur maintenant.',
    ]);
} catch (Throwable $e) {
    $db->rollBack();
    fail('Erreur: ' . $e->getMessage(), 500);
}
