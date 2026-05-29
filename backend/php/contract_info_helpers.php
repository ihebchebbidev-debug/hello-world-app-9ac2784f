<?php
// =====================================================================
// Helper to propagate the "Information contrat / Détails Techniques" row
// from one entity to another at conversion time.
//
// Used by:
//   - opportunities.php  (prospect -> opportunity, opportunity -> contract)
//
// Behaviour:
//   - If the source entity has a contract_info row AND the target does NOT
//     yet have one, copy all technical fields over (no-op otherwise so we
//     never clobber user edits already made on the destination).
//   - Marks created_by/updated_by with the acting user.
//   - Silently no-ops on any error (best-effort, never breaks conversion).
// =====================================================================

if (!function_exists('contract_info_clone_entity')) {
    function contract_info_clone_entity(
        PDO $db,
        string $fromEntity,
        string $fromId,
        string $toEntity,
        string $toId,
        ?string $username = null
    ): bool {
        try {
            // Ensure table exists (avoid hard failure on fresh installs).
            $db->exec("CREATE TABLE IF NOT EXISTS crminternet_contract_info (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                entity_type ENUM('prospect','opportunity','contract') NOT NULL,
                entity_id VARCHAR(40) NOT NULL,
                type_conn VARCHAR(255) NOT NULL DEFAULT '',
                reference_tt VARCHAR(120) NOT NULL DEFAULT '',
                tel_ligne VARCHAR(60) NOT NULL DEFAULT '',
                date_activation DATE NULL,
                etape VARCHAR(60) NOT NULL DEFAULT '',
                interface_type VARCHAR(255) NOT NULL DEFAULT '',
                fsi VARCHAR(60) NOT NULL DEFAULT '',
                motif_retour_tt VARCHAR(255) NOT NULL DEFAULT '',
                etat ENUM('','En cours','Basculement','Rejete','Valide') NOT NULL DEFAULT '',
                remarque TEXT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                created_by VARCHAR(64) NULL,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                updated_by VARCHAR(64) NULL,
                PRIMARY KEY (id),
                UNIQUE KEY ux_entity (entity_type, entity_id),
                KEY idx_entity_id (entity_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        } catch (Throwable $e) { /* ignore */ }

        try {
            // Source row.
            $s = $db->prepare("SELECT * FROM crminternet_contract_info
                WHERE entity_type = ? AND entity_id = ? LIMIT 1");
            $s->execute([$fromEntity, $fromId]);
            $row = $s->fetch(PDO::FETCH_ASSOC);
            if (!$row) return false;

            // Already has its own row? leave it alone.
            $t = $db->prepare("SELECT 1 FROM crminternet_contract_info
                WHERE entity_type = ? AND entity_id = ? LIMIT 1");
            $t->execute([$toEntity, $toId]);
            if ($t->fetchColumn()) return false;

            $u = $username ?: ($row['updated_by'] ?? $row['created_by'] ?? 'system');
            $ins = $db->prepare("INSERT INTO crminternet_contract_info
                (entity_type, entity_id, type_conn, reference_tt, tel_ligne, date_activation,
                 etape, interface_type, fsi, motif_retour_tt, etat, remarque,
                 created_by, updated_by)
                VALUES
                (:et,:eid,:tc,:rt,:tl,:da,:ep,:it,:fsi,:mrt,:etat,:rem,:cb,:ub)");
            $ins->execute([
                ':et'  => $toEntity,
                ':eid' => $toId,
                ':tc'  => $row['type_conn']       ?? '',
                ':rt'  => $row['reference_tt']    ?? '',
                ':tl'  => $row['tel_ligne']       ?? '',
                ':da'  => $row['date_activation'] ?: null,
                ':ep'  => $row['etape']           ?? '',
                ':it'  => $row['interface_type']  ?? '',
                ':fsi' => $row['fsi']             ?? '',
                ':mrt' => $row['motif_retour_tt'] ?? '',
                ':etat'=> $row['etat']            ?? '',
                ':rem' => $row['remarque']        ?? '',
                ':cb'  => $u,
                ':ub'  => $u,
            ]);
            return true;
        } catch (Throwable $e) {
            return false;
        }
    }
}
