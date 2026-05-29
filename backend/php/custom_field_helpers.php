<?php
// =====================================================================
// Helpers de propagation des valeurs de champs personnalisés
// entre prospect / opportunity / contract lors des conversions.
// Copie toutes les valeurs source vers la destination (INSERT IGNORE-style
// via ON DUPLICATE KEY) afin que les champs personnalisés "suivent"
// le client tout au long du pipeline.
// =====================================================================

function custom_fields_ensure_table(PDO $db): void {
    try {
        $db->exec("CREATE TABLE IF NOT EXISTS crminternet_custom_field_values (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            entity VARCHAR(20) NOT NULL,
            entity_id VARCHAR(40) NOT NULL,
            field_key VARCHAR(80) NOT NULL,
            value TEXT NULL,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_entity_field (entity, entity_id, field_key),
            INDEX idx_entity (entity, entity_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    } catch (Throwable $e) {}
}

/**
 * Copie toutes les valeurs de champs personnalisés depuis (srcEntity, srcId)
 * vers (dstEntity, dstId). Les valeurs déjà présentes côté destination ne
 * sont PAS écrasées (préserve d'éventuelles saisies manuelles).
 * Retourne le nombre de valeurs copiées.
 */
function custom_field_clone_entity(PDO $db, string $srcEntity, string $srcId, string $dstEntity, string $dstId): int {
    if ($srcId === '' || $dstId === '') return 0;
    custom_fields_ensure_table($db);
    $sel = $db->prepare('SELECT field_key, value FROM crminternet_custom_field_values
                         WHERE entity = :e AND entity_id = :id');
    $sel->execute([':e' => $srcEntity, ':id' => $srcId]);
    $rows = $sel->fetchAll(PDO::FETCH_ASSOC) ?: [];
    if (!$rows) return 0;
    $ins = $db->prepare('INSERT INTO crminternet_custom_field_values
                         (entity, entity_id, field_key, value)
                         VALUES (:e, :id, :k, :v)
                         ON DUPLICATE KEY UPDATE value = COALESCE(NULLIF(value, ""), VALUES(value))');
    $n = 0;
    foreach ($rows as $r) {
        try {
            $ins->execute([
                ':e'  => $dstEntity,
                ':id' => $dstId,
                ':k'  => (string)$r['field_key'],
                ':v'  => $r['value'],
            ]);
            $n++;
        } catch (Throwable $e) { /* best effort */ }
    }
    return $n;
}
