<?php
/**
 * Helpers de normalisation pour les colonnes geo (localisation_xy, code_postal)
 * partagés entre prospects.php, opportunities.php et contracts.php.
 *
 * - localisation_xy : "lat,lng" (ex: "36.123456,10.123698").
 *   Tolère les virgules françaises "36,123456,10,123698" -> "36.123456,10.123698".
 * - code_postal : chaîne libre, max 20 caractères.
 */

if (!function_exists('prospect_norm_xy')) {
    function prospect_norm_xy($v): ?string {
        if ($v === null) return null;
        $s = trim((string)$v);
        if ($s === '') return null;
        if (preg_match('/^\s*(-?\d+)[,.](\d+)\s*[,;]\s*(-?\d+)[,.](\d+)\s*$/', $s, $m)) {
            return $m[1] . '.' . $m[2] . ',' . $m[3] . '.' . $m[4];
        }
        if (preg_match('/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/', $s, $m)) {
            return $m[1] . ',' . $m[2];
        }
        return mb_substr($s, 0, 64);
    }
}

if (!function_exists('prospect_norm_cp')) {
    function prospect_norm_cp($v): ?string {
        if ($v === null) return null;
        $s = trim((string)$v);
        return $s === '' ? null : mb_substr($s, 0, 20);
    }
}
