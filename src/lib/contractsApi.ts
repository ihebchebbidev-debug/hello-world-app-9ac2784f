import { api, ApiError } from "./api";
import { fetchAllPaginated } from "./paginatedFetch";
import type { Contract } from "./types";

export async function fetchContracts(): Promise<Contract[]> {
  // Chunked load (2000 rows per HTTP call) — scales past 200k rows without OOM.
  // Server falls back to single-shot when has_more=false on page 1.
  // Cache-buster (_t) defeats any intermediate HTTP/proxy/ETag caching so the
  // list always reflects the latest backend state (e.g. right after a
  // conversion from opportunity → contract).
  const cacheBuster = { _t: Date.now() };
  try {
    return await fetchAllPaginated<Contract>("/contracts.php", "contracts", {
      baseQuery: cacheBuster,
    });
  } catch (e) {
    // If the backend is mis-routed (returns prospects instead of contracts),
    // surface the same explicit error as before so the user knows to redeploy.
    const data = await api<unknown>(`/contracts.php?_t=${Date.now()}`).catch(() => null);
    if (data && typeof data === "object" && Array.isArray((data as { prospects?: unknown }).prospects)) {
      throw new ApiError(
        "Le serveur exécute prospects.php à la place de contracts.php. Remplacez le fichier backend contracts.php déployé.",
        502,
      );
    }
    throw e;
  }
}
