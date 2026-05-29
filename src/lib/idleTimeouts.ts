// Per-role idle timeout configuration.
// Source of truth (when deployed): GET/PUT /idle_timeouts.php on the PHP backend.
// Returns { timeouts: Record<role, minutes> } where 0 (or null) = disabled.
// Until the endpoint is deployed, falls back to DEFAULT_IDLE_TIMEOUTS and
// caches admin overrides in localStorage so the feature works end-to-end.
import { api } from "./api";

export type IdleTimeoutMap = Record<string, number>;

/** Roles known to the app. Admin defaults to 0 = exempt. */
export const KNOWN_ROLES = [
  "Administrateur",
  "Manager",
  "Agent",
  "Backoffice",
  "AgentSuivi",
  "AgentActivation",
  "AgentVente",
] as const;

export const DEFAULT_IDLE_TIMEOUTS: IdleTimeoutMap = {
  Administrateur: 0, // disabled
  Manager: 30,
  Agent: 30,
  Backoffice: 30,
  AgentSuivi: 30,
  AgentActivation: 30,
  AgentVente: 30,
};

const CACHE_KEY = "idleTimeouts.cache";

function readCache(): IdleTimeoutMap | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as IdleTimeoutMap;
  } catch { /* ignore */ }
  return null;
}

function writeCache(map: IdleTimeoutMap) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(map)); } catch { /* ignore */ }
}

export async function fetchIdleTimeouts(): Promise<IdleTimeoutMap> {
  try {
    const r = await api<{ timeouts: IdleTimeoutMap }>("/idle_timeouts.php");
    if (r && r.timeouts && typeof r.timeouts === "object") {
      const merged = { ...DEFAULT_IDLE_TIMEOUTS, ...r.timeouts };
      writeCache(merged);
      return merged;
    }
  } catch { /* endpoint not deployed yet — fall back */ }
  return readCache() ?? { ...DEFAULT_IDLE_TIMEOUTS };
}

export async function saveIdleTimeouts(map: IdleTimeoutMap): Promise<IdleTimeoutMap> {
  // Persist locally immediately (so admins see changes even before backend deploy).
  writeCache(map);
  try {
    const r = await api<{ timeouts: IdleTimeoutMap }>("/idle_timeouts.php", {
      method: "PUT",
      body: { timeouts: map },
    });
    if (r?.timeouts) {
      writeCache(r.timeouts);
      return r.timeouts;
    }
  } catch { /* ignore — local cache still applied */ }
  return map;
}

/** Upsert a single role override (used by the "Add custom role" UI). */
export async function upsertIdleTimeout(role: string, minutes: number): Promise<IdleTimeoutMap> {
  const cur = readCache() ?? { ...DEFAULT_IDLE_TIMEOUTS };
  const next = { ...cur, [role]: minutes };
  writeCache(next);
  try {
    const r = await api<{ timeouts: IdleTimeoutMap }>("/idle_timeouts.php", {
      method: "POST",
      body: { role, minutes },
    });
    if (r?.timeouts) { writeCache(r.timeouts); return r.timeouts; }
  } catch { /* ignore */ }
  return next;
}

/** Remove a role override. */
export async function deleteIdleTimeout(role: string): Promise<IdleTimeoutMap> {
  const cur = readCache() ?? { ...DEFAULT_IDLE_TIMEOUTS };
  const next = { ...cur };
  delete next[role];
  writeCache(next);
  try {
    const r = await api<{ timeouts: IdleTimeoutMap }>("/idle_timeouts.php", {
      method: "DELETE",
      query: { role },
    });
    if (r?.timeouts) { writeCache(r.timeouts); return r.timeouts; }
  } catch { /* ignore */ }
  return next;
}

/** Read the cached/default timeout (in minutes) for a role, synchronously. */
export function getRoleTimeoutMinutes(role: string | undefined | null): number {
  if (!role) return 0;
  const cached = readCache();
  const map = cached ?? DEFAULT_IDLE_TIMEOUTS;
  const v = map[role];
  if (typeof v === "number" && v >= 0) return v;
  return 0;
}
