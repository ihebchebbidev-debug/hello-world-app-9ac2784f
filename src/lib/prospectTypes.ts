import { api, API_ENABLED } from "@/lib/api";
import type { ProspectType } from "@/lib/types";

export const DEFAULT_PROSPECT_TYPES = [
  "Nouveau",
  "Résiliation",
  "Migration",
  "Basculement",
] as const;

let seedingPromise: Promise<ProspectType[]> | null = null;

/**
 * Ensure the four default prospect types exist (Nouveau, Résiliation,
 * Migration, Basculement). Returns the active list sorted by position.
 * Safe to call multiple times — concurrent calls share the same promise
 * and missing types are created only once.
 */
export async function ensureDefaultProspectTypes(): Promise<ProspectType[]> {
  if (!API_ENABLED) return [];
  if (seedingPromise) return seedingPromise;
  seedingPromise = (async () => {
    try {
      const r = await api<{ types: ProspectType[] }>("/prospect_types.php");
      const existing = r.types ?? [];
      const norm = (s: string) =>
        s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
      const existingNames = new Set(existing.map((t) => norm(t.name)));
      const missing = DEFAULT_PROSPECT_TYPES.filter((n) => !existingNames.has(norm(n)));
      if (missing.length) {
        let pos = existing.length;
        for (const name of missing) {
          pos += 1;
          try {
            await api("/prospect_types.php", {
              method: "POST",
              body: { name, description: "", active: true, position: pos },
            });
          } catch {
            /* ignore — type may already exist or user lacks rights */
          }
        }
        const r2 = await api<{ types: ProspectType[] }>("/prospect_types.php");
        return (r2.types ?? [])
          .filter((t) => t.active)
          .sort((a, b) => a.position - b.position);
      }
      return existing
        .filter((t) => t.active)
        .sort((a, b) => a.position - b.position);
    } catch {
      return [];
    } finally {
      // Allow re-trying later if the page stays open (e.g., after admin adds types).
      setTimeout(() => { seedingPromise = null; }, 5000);
    }
  })();
  return seedingPromise;
}
