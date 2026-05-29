import { useEffect, useState } from "react";
import { api, API_ENABLED } from "@/lib/api";
import type { PipelineStage } from "@/lib/types";

let cache: PipelineStage[] | null = null;
let inflight: Promise<PipelineStage[]> | null = null;
const listeners = new Set<(s: PipelineStage[]) => void>();

async function fetchStages(): Promise<PipelineStage[]> {
  if (!API_ENABLED) return [];
  if (inflight) return inflight;
  inflight = api<{ stages: PipelineStage[] }>("/contract_stages.php")
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

/** Contract stages, cached across components. */
export function useContractStages(): PipelineStage[] {
  const [stages, setStages] = useState<PipelineStage[]>(cache ?? []);
  useEffect(() => {
    listeners.add(setStages);
    if (!cache) void fetchStages();
    else setStages(cache);
    return () => { listeners.delete(setStages); };
  }, []);
  return stages;
}
