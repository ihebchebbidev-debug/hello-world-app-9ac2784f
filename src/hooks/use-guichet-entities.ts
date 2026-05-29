import { useEffect, useState } from "react";
import { api, API_ENABLED } from "@/lib/api";
import type { GuichetEntity } from "@/lib/guichetApi";

let cache: GuichetEntity[] | null = null;
let inflight: Promise<GuichetEntity[]> | null = null;
const listeners = new Set<(s: GuichetEntity[]) => void>();

async function fetchEntities(): Promise<GuichetEntity[]> {
  if (!API_ENABLED) return [];
  if (inflight) return inflight;
  inflight = api<{ entities: GuichetEntity[] }>("/guichet_entities.php", { query: { active: 1 } })
    .then((r) => {
      cache = (r.entities ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));
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

/** Active guichet entities, cached across components. */
export function useGuichetEntities(): GuichetEntity[] {
  const [entities, setEntities] = useState<GuichetEntity[]>(cache ?? []);
  useEffect(() => {
    listeners.add(setEntities);
    if (!cache) void fetchEntities();
    else setEntities(cache);
    return () => { listeners.delete(setEntities); };
  }, []);
  return entities;
}