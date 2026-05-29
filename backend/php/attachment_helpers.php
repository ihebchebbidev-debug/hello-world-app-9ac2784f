<?php
/**
 * Helpers de clonage des pièces jointes lors des conversions
 * lead → opportunité → contrat (manuelles ET auto-actions de pipeline).
 *
 * Stratégie : on n'écrit PAS de nouveau fichier sur disque. On insère une
 * nouvelle ligne dans crminternet_attachments avec un nouvel id, le couple
 * (entity, entity_id) cible, mais on garde storage_path / filename / mime /
 * size identiques. N rows logiques peuvent référencer le même fichier
 * physique. Le DELETE de attachments.php doit donc protéger l'unlink via
 * attachment_storage_path_in_use().
 *
 * Idempotent : si une row avec le même storage_path existe déjà sur la
 * cible, on n'insère pas (utile en cas de re-conversion après revert).
 */

if (!function_exists('attachment_clone_entity')) {
    function attachment_clone_entity(PDO $db, string $fromEntity, string $fromId, string $toEntity, string $toId): int {
        if ($fromEntity === '' || $fromId === '' || $toEntity === '' || $toId === '') return 0;
        if ($fromEntity === $toEntity && $fromId === $toId) return 0;

        try {
            $src = $db->prepare('SELECT * FROM crminternet_attachments WHERE entity = :e AND entity_id = :id');
            $src->execute([':e' => $fromEntity, ':id' => $fromId]);
            $rows = $src->fetchAll();
        } catch (Throwable $e) { return 0; }
        if (!$rows) return 0;

        $exists = $db->prepare('SELECT 1 FROM crminternet_attachments
                                 WHERE entity = :e AND entity_id = :id AND storage_path = :sp LIMIT 1');
        $ins = $db->prepare('INSERT INTO crminternet_attachments
            (id, entity, entity_id, filename, mime_type, size_bytes, storage_path, uploaded_by, created_at)
            VALUES (:id, :e, :ei, :fn, :mt, :sz, :sp, :ub, NOW())');

        $copied = 0;
        foreach ($rows as $r) {
            $exists->execute([':e' => $toEntity, ':id' => $toId, ':sp' => $r['storage_path']]);
            if ($exists->fetchColumn()) continue;

            $newId = 'AT-' . substr(bin2hex(random_bytes(6)), 0, 10);
            try {
                $ins->execute([
                    ':id' => $newId,
                    ':e'  => $toEntity,
                    ':ei' => $toId,
                    ':fn' => $r['filename'],
                    ':mt' => $r['mime_type'],
                    ':sz' => (int)$r['size_bytes'],
                    ':sp' => $r['storage_path'],
                    ':ub' => $r['uploaded_by'],
                ]);
                $copied++;
            } catch (Throwable $e) { /* best effort */ }
        }
        return $copied;
    }
}

if (!function_exists('attachment_storage_path_in_use')) {
    /**
     * Renvoie true si une autre row (id != $excludeId) référence le même
     * storage_path. Utilisé par DELETE pour décider si on peut unlink le
     * fichier disque.
     */
    function attachment_storage_path_in_use(PDO $db, string $path, string $excludeId): bool {
        if ($path === '') return false;
        $s = $db->prepare('SELECT 1 FROM crminternet_attachments
                            WHERE storage_path = :sp AND id <> :id LIMIT 1');
        $s->execute([':sp' => $path, ':id' => $excludeId]);
        return (bool)$s->fetchColumn();
    }
}
