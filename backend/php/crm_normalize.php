<?php
/**
 * Helper partagé : normalise les payloads envoyés par le front vers les noms
 * canoniques (camelCase) attendus par les handlers prospects.php / contracts.php
 * AVANT toute validation.
 *
 * Le front envoie parfois "nom"/"prenom"/"telephone" (FR) au lieu de
 * "lastName"/"firstName"/"phone". Sans normalisation, l'INSERT est bloqué
 * avec MISSING_REQUIRED: lastName.
 *
 * Idempotent : si la clé canonique est déjà présente et non vide, on n'y touche pas.
 */

if (!function_exists('crm_normalize_row')) {

    function crm_normalize_row(array $r): array {
        static $aliases = [
            // identité
            'lastName'        => ['nom', 'last_name', 'family_name'],
            'firstName'       => ['prenom', 'first_name', 'given_name'],
            'civility'        => ['civilite'],
            'birthDate'       => ['dateNaissance', 'date_naissance', 'birth_date'],
            'cin'             => ['CIN', 'numCin', 'num_cin'],

            // contact
            'phone'           => ['telephone', 'tel', 'gsm', 'mobile'],
            'phone2'          => ['telephone2', 'tel2', 'gsm2'],
            'email'           => ['mail', 'courriel'],

            // adresse / géo
            'address'         => ['adresse'],
            'city'            => ['ville'],
            'gouvernorat'     => ['governorate', 'wilaya'],
            'delegation'      => ['delegate'],
            'codePostal'      => ['code_postal', 'postalCode', 'postal_code', 'zip', 'cp'],
            'localisationXy'  => ['localisation_xy', 'coords', 'gps', 'latlng'],

            // commercial
            'source'          => ['origine'],
            'status'          => ['statut', 'state'],
            'assignedTo'      => ['assigned_to', 'agent', 'commercial'],
            'comment'         => ['commentaire', 'note'],
            'comment2'        => ['commentaire2', 'note2'],

            // contrat
            'premium'         => ['montant', 'price', 'prix'],
            'partner'         => ['partenaire'],
            'signatureDate'   => ['signature_date', 'dateSignature'],
            'effectiveDate'   => ['effective_date', 'dateEffet'],
            'validationDate'  => ['validation_date', 'dateValidation'],
        ];

        foreach ($aliases as $canonical => $alts) {
            if (array_key_exists($canonical, $r) && $r[$canonical] !== null && $r[$canonical] !== '') {
                continue;
            }
            foreach ($alts as $alt) {
                if (array_key_exists($alt, $r) && $r[$alt] !== null && $r[$alt] !== '') {
                    $r[$canonical] = $r[$alt];
                    break;
                }
            }
        }

        // Nettoyages communs
        if (!empty($r['phone']))  $r['phone']  = preg_replace('/\s+/', '', (string)$r['phone']);
        if (!empty($r['phone2'])) $r['phone2'] = preg_replace('/\s+/', '', (string)$r['phone2']);
        if (!empty($r['email']))  $r['email']  = strtolower(trim((string)$r['email']));
        if (isset($r['birthDate']) && $r['birthDate'] === '') $r['birthDate'] = null;

        return $r;
    }
}
