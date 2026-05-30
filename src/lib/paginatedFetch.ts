// Chunked fetch utility for very large datasets (1M+ rows).
// Backend endpoints accept ?count=1 (just total) and ?page=N&per_page=2000
// (one chunk). This helper:
//   1. Asks the server for the total first (cheap COUNT).
//   2. Fetches all pages in parallel with bounded concurrency.
//   3. Reports progress and supports cancellation.
import { api } from "./api";

// Tuned for high-volume datasets (100k–1M+ rows).
// 25000 rows × 12 parallel workers ≈ 300k rows in flight per round trip.
// For 500k rows: 20 pages → 2 batches of 12. Backend maxPerPage is 50000.
export const DEFAULT_PER_PAGE = 25000;
export const DEFAULT_CONCURRENCY = 12;
// Safety ceiling — 2000 pages × 25000 rows = 50M rows.
export const MAX_PAGES = 2000;

export type CountResponse = { total: number };

export type PaginatedFetchOptions = {
  /** Rows per HTTP call. Defaults to 2000. */
  perPage?: number;
  /** Parallel in-flight page requests. Defaults to 5. */
  concurrency?: number;
  /** Extra query params (e.g. include_converted=1). */
  baseQuery?: Record<string, string | number>;
  /** Hard cap on rows pulled (safety net). 0 = no cap. */
  maxRows?: number;
  /** Called after every chunk. */
  onProgress?: (loaded: number, total: number) => void;
  /** Aborts the loop when set. */
  signal?: AbortSignal;
};

function buildQuery(
  base: Record<string, string | number> | undefined,
  extra: Record<string, string | number>,
): string {
  const qs = new URLSearchParams();
  if (base) for (const [k, v] of Object.entries(base)) qs.set(k, String(v));
  for (const [k, v] of Object.entries(extra)) qs.set(k, String(v));
  return qs.toString();
}

/** Fetch just the total — used for headers, sanity checks, progress bars. */
export async function fetchCount(
  endpoint: string,
  baseQuery: Record<string, string | number> = {},
  signal?: AbortSignal,
): Promise<number> {
  const qs = buildQuery(baseQuery, { count: 1 });
  const r = await api<CountResponse>(`${endpoint}?${qs}`, { signal });
  return r.total ?? 0;
}

/** Fetch a single page. */
export async function fetchPage<T>(
  endpoint: string,
  itemsKey: string,
  page: number,
  perPage: number = DEFAULT_PER_PAGE,
  baseQuery: Record<string, string | number> = {},
  signal?: AbortSignal,
): Promise<{ items: T[]; total: number; hasMore: boolean }> {
  const qs = buildQuery(baseQuery, { page, per_page: perPage });
  const r = await api<Record<string, unknown>>(`${endpoint}?${qs}`, { signal });
  const items = (r[itemsKey] as T[] | undefined) ?? [];
  return {
    items,
    total: Number(r.total ?? items.length),
    hasMore: Boolean(r.has_more),
  };
}

/**
 * Load every row by fetching pages in parallel (bounded concurrency).
 * Strategy:
 *   1. Probe total via ?count=1 (cheap).
 *   2. Compute number of pages.
 *   3. Run a worker pool that pulls page indices from a shared queue.
 *
 * Falls back to sequential walk if the count probe fails.
 */
export async function fetchAllPaginated<T>(
  endpoint: string,
  itemsKey: string,
  opts: PaginatedFetchOptions = {},
): Promise<T[]> {
  const perPage = opts.perPage ?? DEFAULT_PER_PAGE;
  const concurrency = Math.max(1, opts.concurrency ?? DEFAULT_CONCURRENCY);
  const baseQuery = opts.baseQuery ?? {};

  // ---- 1. Probe total ----------------------------------------------------
  let total = 0;
  try {
    total = await fetchCount(endpoint, baseQuery, opts.signal);
  } catch {
    // Old server without ?count=1 support — fall back to sequential walk.
    return fetchSequential<T>(endpoint, itemsKey, perPage, opts);
  }

  if (total === 0) {
    opts.onProgress?.(0, 0);
    return [];
  }

  const cap = opts.maxRows && opts.maxRows > 0 ? Math.min(total, opts.maxRows) : total;
  const pageCount = Math.min(MAX_PAGES, Math.ceil(cap / perPage));

  // ---- 2. Parallel worker pool ------------------------------------------
  // Pre-allocate the result array so workers can write to their slot
  // without lock contention or splice cost.
  const buckets: T[][] = new Array(pageCount);
  let nextPage = 1;
  let loaded = 0;

  async function worker() {
    while (true) {
      if (opts.signal?.aborted) throw new DOMException("aborted", "AbortError");
      const myPage = nextPage++;
      if (myPage > pageCount) return;
      const r = await fetchPage<T>(endpoint, itemsKey, myPage, perPage, baseQuery, opts.signal);
      buckets[myPage - 1] = r.items;
      loaded += r.items.length;
      opts.onProgress?.(loaded, total);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, pageCount) }, () => worker());
  await Promise.all(workers);

  // ---- 3. Flatten in page order ----------------------------------------
  const out: T[] = [];
  for (const b of buckets) if (b) out.push(...b);
  return out;
}

/** Legacy sequential walker — used only when ?count=1 isn't supported. */
async function fetchSequential<T>(
  endpoint: string,
  itemsKey: string,
  perPage: number,
  opts: PaginatedFetchOptions,
): Promise<T[]> {
  const all: T[] = [];
  let page = 1;
  let total = 0;
  while (true) {
    if (opts.signal?.aborted) throw new DOMException("aborted", "AbortError");
    const r = await fetchPage<T>(endpoint, itemsKey, page, perPage, opts.baseQuery, opts.signal);
    all.push(...r.items);
    total = r.total || all.length;
    opts.onProgress?.(all.length, total);
    if (!r.hasMore || r.items.length === 0) break;
    if (opts.maxRows && all.length >= opts.maxRows) break;
    page++;
    if (page > MAX_PAGES) break;
  }
  return all;
}
