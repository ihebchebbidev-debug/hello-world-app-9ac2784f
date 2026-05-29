// Helpers de normalisation/validation côté client pour les colonnes geo.
// Le backend ré-applique exactement la même normalisation (geo_helpers.php).

/**
 * Normalise une coordonnée Google Maps "lat,lng".
 * Tolère les virgules françaises "36,123456,10,123698" -> "36.123456,10.123698".
 * Renvoie "" si vide. Si le format est inconnu, renvoie la valeur tronquée à 64.
 */
export function normalizeLocalisationXy(v: unknown): string {
  if (v == null) return "";
  const s = String(v).trim();
  if (s === "") return "";
  let m = s.match(/^\s*(-?\d+)[,.](\d+)\s*[,;]\s*(-?\d+)[,.](\d+)\s*$/);
  if (m) return `${m[1]}.${m[2]},${m[3]}.${m[4]}`;
  m = s.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (m) return `${m[1]},${m[2]}`;
  return s.slice(0, 64);
}

/** Vérifie qu'une chaîne représente bien "lat,lng" (après normalisation). */
export function isValidLocalisationXy(v: unknown): boolean {
  const s = normalizeLocalisationXy(v);
  if (s === "") return true; // optionnel
  return /^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?$/.test(s);
}

/** Code postal libre, max 20 caractères. */
export function normalizeCodePostal(v: unknown): string {
  if (v == null) return "";
  return String(v).trim().slice(0, 20);
}
