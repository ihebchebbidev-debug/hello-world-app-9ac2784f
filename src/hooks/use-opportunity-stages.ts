import { useEffect, useState } from "react";
import { api, API_ENABLED } from "@/lib/api";
import type { OpportunityStage } from "@/lib/types";

// Module-level cache shared across all consumers (sidebar + pages).
let cache: OpportunityStage[] | null = null;
let inflight: Promise<OpportunityStage[]> | null = null;
const listeners = new Set<(s: OpportunityStage[]) => void>();

async function fetchStages(): Promise<OpportunityStage[]> {
  if (!API_ENABLED) return [];
  if (inflight) return inflight;
  inflight = api<{ stages: OpportunityStage[] }>("/opportunity_stages.php")
    .then((r) => {
      cache = (r.stages ?? []).slice().sort((a, b) => a.position - b.position);
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

/** Opportunity stages, cached across components. */
export function useOpportunityStages(): OpportunityStage[] {
  const [stages, setStages] = useState<OpportunityStage[]>(cache ?? []);
  useEffect(() => {
    listeners.add(setStages);
    if (!cache) void fetchStages();
    else setStages(cache);
    return () => { listeners.delete(setStages); };
  }, []);
  return stages;
}
