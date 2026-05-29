<?php
/**
 * conversion_helpers.php
 *
 * Centralise les INSERT lors des conversions
 *   prospect → opportunité
 *   prospect → contrat (raccourci)
 *   opportunité → contrat
 *
 * Garantit que **toutes** les colonnes identité/contact/adresse/observation
 * sont propagées entre étapes (exigence client : 100% des infos prospect
 * doivent rester visibles côté opportunité et contrat).
 */

if (!function_exists('conv_v')) {
    /** Récupère une valeur de tableau associatif en tolérant la clé absente. */
    function conv_v(array $row, string $key, $default = null) {
        return array_key_exists($key, $row) ? $row[$key] : $default;
    }
}

/**
 * Insère une opportunité construite à partir d'un prospect (snapshot complet).
 * Les éventuelles surcharges (titre, montant, probabilité, stage, créateur)
 * passent par $extra.
 */
function conversion_insert_opportunity_from_prospect(PDO $db, string $oid, array $p, array $extra = []): void {
    $title = $extra['title'] ?? trim((string)conv_v($p, 'last_name', '').' '.(string)conv_v($p, 'first_name', ''));
    $stage = $extra['stage'] ?? 'Qualification';
    $sql = "INSERT INTO crminternet_opportunities
        (id, prospect_id, civility, last_name, first_name,
         phone, phone2, animateur, ancien_ligne, cin, birth_date, email,
         city, gouvernorat, delegation, zone, address, localisation_xy, code_postal,
         comment1, comment2, source, type_id, lead_status, lost_reason,
         title, stage, amount, probability, expected_close_date,
         assigned_to, notes, created_by)
        VALUES
        (:id, :pid, :civ, :ln, :fn,
         :ph, :ph2, :anim, :anc, :cin, :bd, :em,
         :ci, :gv, :dl, :zn, :ad, :gps, :cp,
         :c1, :c2, :src, :tid, :lst, :lr,
         :title, :stg, :amt, :prob, :ecd,
         :at, :notes, :cb)";
    $db->prepare($sql)->execute([
        ':id'    => $oid,
        ':pid'   => $p['id'] ?? null,
        ':civ'   => $p['civility'] ?? 'M',
        ':ln'    => $p['last_name'] ?? '',
        ':fn'    => $p['first_name'] ?? '',
        ':ph'    => $p['phone'] ?? '',
        ':ph2'   => $p['phone2'] ?? '',
        ':anim'  => $p['animateur'] ?? null,
        ':anc'   => $p['ancien_ligne'] ?? null,
        ':cin'   => ($p['cin'] ?? null) ?: null,
        ':bd'    => $p['birth_date'] ?? null,
        ':em'    => $p['email'] ?? '',
        ':ci'    => $p['city'] ?? '',
        ':gv'    => $p['gouvernorat'] ?? '',
        ':dl'    => $p['delegation'] ?? '',
        ':zn'    => $p['zone'] ?? '',
        ':ad'    => $p['address'] ?? '',
        ':gps'   => $p['localisation_xy'] ?? null,
        ':cp'    => $p['code_postal'] ?? null,
        ':c1'    => $p['comment'] ?? null,
        ':c2'    => $p['comment2'] ?? null,
        ':src'   => $p['source'] ?? '',
        ':tid'   => $p['type_id'] ?? null,
        ':lst'   => $p['status'] ?? null,
        ':lr'    => $p['lost_reason'] ?? null,
        ':title' => $title,
        ':stg'   => $stage,
        ':amt'   => (float)($extra['amount'] ?? 0),
        ':prob'  => (int)($extra['probability'] ?? 50),
        ':ecd'   => $extra['expected_close_date'] ?? null,
        ':at'    => $extra['assigned_to'] ?? ($p['assigned_to'] ?? null),
        ':notes' => $extra['notes'] ?? '',
        ':cb'    => $extra['created_by'] ?? null,
    ]);
}

/**
 * Insère un contrat construit à partir d'une opportunité (snapshot complet).
 * Les éventuelles surcharges spécifiques contrat (partner, cabinet, dates,
 * premium, billing/stage) passent par $extra.
 */
function conversion_insert_contract_from_opportunity(PDO $db, string $cid, array $o, array $extra = []): void {
    $today = date('Y-m-d');
    $sql = "INSERT INTO crminternet_contracts
        (id, opportunity_id, prospect_id, civility, last_name, first_name,
         phone, phone2, animateur, ancien_ligne, cin, birth_date, email,
         city, gouvernorat, delegation, zone, address, localisation_xy, code_postal,
         comment1, comment2, source, type_id, lead_status,
         partner, cabinet, signature_date, effective_date,
         premium, billing_status, stage_id, assigned_to)
        VALUES
        (:id, :oid, :pid, :civ, :ln, :fn,
         :ph, :ph2, :anim, :anc, :cin, :bd, :em,
         :ci, :gv, :dl, :zn, :ad, :gps, :cp,
         :c1, :c2, :src, :tid, :lst,
         :pa, :ca, :sd, :ed,
         :pr, :bs, :sid, :at)";
    $db->prepare($sql)->execute([
        ':id'   => $cid,
        ':oid'  => $o['id'] ?? null,
        ':pid'  => $o['prospect_id'] ?? null,
        ':civ'  => $o['civility'] ?? 'M',
        ':ln'   => $o['last_name'] ?? '',
        ':fn'   => $o['first_name'] ?? '',
        ':ph'   => $o['phone'] ?? '',
        ':ph2'  => $o['phone2'] ?? '',
        ':anim' => $o['animateur'] ?? null,
        ':anc'  => $o['ancien_ligne'] ?? null,
        ':cin'  => ($o['cin'] ?? null) ?: null,
        ':bd'   => $o['birth_date'] ?? null,
        ':em'   => $o['email'] ?? '',
        ':ci'   => $o['city'] ?? '',
        ':gv'   => $o['gouvernorat'] ?? '',
        ':dl'   => $o['delegation'] ?? '',
        ':zn'   => $o['zone'] ?? '',
        ':ad'   => $o['address'] ?? '',
        ':gps'  => $o['localisation_xy'] ?? null,
        ':cp'   => $o['code_postal'] ?? null,
        ':c1'   => $o['comment1'] ?? null,
        ':c2'   => $o['comment2'] ?? null,
        ':src'  => $o['source'] ?: 'Web',
        ':tid'  => $o['type_id'] ?? null,
        ':lst'  => $o['lead_status'] ?? null,
        ':pa'   => $extra['partner']      ?? 'NEOLIANE',
        ':ca'   => $extra['cabinet']      ?? 'Cabinet Paris 1',
        ':sd'   => $extra['signature_date'] ?? $today,
        ':ed'   => $extra['effective_date'] ?? ($extra['signature_date'] ?? $today),
        ':pr'   => (float)($extra['premium'] ?? ($o['amount'] ?? 0)),
        ':bs'   => $extra['billing_status'] ?? 'Pré-validé',
        ':sid'  => $extra['stage_id']     ?? null,
        ':at'   => $extra['assigned_to']  ?? ($o['assigned_to'] ?? ''),
    ]);
}

/**
 * Insère un contrat directement depuis un prospect (raccourci lead → contrat).
 * On passe par un faux array "opportunité" pour réutiliser la même fonction.
 */
function conversion_insert_contract_from_prospect(PDO $db, string $cid, array $p, array $extra = []): void {
    $oFake = [
        'id'              => null,
        'prospect_id'     => $p['id'] ?? null,
        'civility'        => $p['civility'] ?? 'M',
        'last_name'       => $p['last_name'] ?? '',
        'first_name'      => $p['first_name'] ?? '',
        'phone'           => $p['phone'] ?? '',
        'phone2'          => $p['phone2'] ?? '',
        'animateur'       => $p['animateur'] ?? null,
        'ancien_ligne'    => $p['ancien_ligne'] ?? null,
        'cin'             => $p['cin'] ?? null,
        'birth_date'      => $p['birth_date'] ?? null,
        'email'           => $p['email'] ?? '',
        'city'            => $p['city'] ?? '',
        'gouvernorat'     => $p['gouvernorat'] ?? '',
        'delegation'      => $p['delegation'] ?? '',
        'zone'            => $p['zone'] ?? '',
        'address'         => $p['address'] ?? '',
        'localisation_xy' => $p['localisation_xy'] ?? null,
        'code_postal'     => $p['code_postal'] ?? null,
        'comment1'        => $p['comment'] ?? null,
        'comment2'        => $p['comment2'] ?? null,
        'source'          => $p['source'] ?? '',
        'type_id'         => $p['type_id'] ?? null,
        'lead_status'     => $p['status'] ?? null,
        'amount'          => 0,
        'assigned_to'     => $p['assigned_to'] ?? '',
    ];
    conversion_insert_contract_from_opportunity($db, $cid, $oFake, $extra);
}