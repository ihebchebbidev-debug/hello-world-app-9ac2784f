import { useEffect, useState } from "react";
import { api, API_ENABLED } from "@/lib/api";
import type { ProspectType } from "@/lib/types";

// Module-level cache shared across all consumers (sidebar + pages).
let cache: ProspectType[] | null = null;
let inflight: Promise<ProspectType[]> | null = null;
const listeners = new Set<(t: ProspectType[]) => void>();

async function fetchTypes(): Promise<ProspectType[]> {
  if (!API_ENABLED) return [];
  if (inflight) return inflight;
  inflight = api<{ types: ProspectType[] }>("/prospect_types.php?active=1")
    .then((r) => {
      cache = (r.types ?? []).filter((t) => t.active).sort((a, b) => a.position - b.position);
      listeners.forEach((cb) => cb(cache!));
      return cache;
    })
    .catch(() => {
      cache = cache ?? [];
      return cache;
    })
    .finally(() => { inflight = null; });
  return inflight;
}

/** Active prospect types, cached across components. */
export function useProspectTypes(): ProspectType[] {
  const [types, setTypes] = useState<ProspectType[]>(cache ?? []);
  useEffect(() => {
    listeners.add(setTypes);
    if (!cache) void fetchTypes();
    else setTypes(cache);
    return () => { listeners.delete(setTypes); };
  }, []);
  return types;
}
