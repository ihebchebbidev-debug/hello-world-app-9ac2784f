import { QueryClient, keepPreviousData } from "@tanstack/react-query";
import { useQuery, useMutation, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";
import { api, ApiError } from "./api";

/**
 * Shared QueryClient — tuned for huge lists (prospects / contracts /
 * opportunités / guichet) that may hold hundreds of thousands of rows.
 *
 * Freshness policy:
 *  - staleTime 0 + refetchOnMount "always" + refetchOnWindowFocus:
 *    every navigation/focus triggers a background refetch. The user
 *    never sees stale data — the network call always runs.
 *
 * Perceived-performance policy:
 *  - gcTime 5 min: keep the last successful payload in memory so quick
 *    back-navigation paints the full table INSTANTLY (no spinner, no
 *    blank screen) while a fresh fetch runs in the background.
 *  - placeholderData: keepPreviousData: when the query key changes or
 *    a refetch is in flight, keep showing the previous rows instead of
 *    dropping to an empty/loading state. The grid stays interactive
 *    (sort, scroll, page) while new data streams in.
 *  - structuralSharing: React Query reuses object references when the
 *    payload is identical, so re-renders stay cheap even with 1M rows.
 *
 * Net effect: data is ALWAYS refetched (no client cache lie), but the
 * UI never goes blank — it feels light even on very large datasets.
 */
export function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 0,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: true,
        refetchOnMount: "always",
        refetchOnReconnect: true,
        placeholderData: keepPreviousData,
        structuralSharing: true,
        retry: (failureCount, error) => {
          if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
          return failureCount < 1;
        },
      },
      mutations: {
        retry: 0,
      },
    },
  });
}



/**
 * Convenience hook: GET a JSON endpoint via the shared `api()` client and cache it.
 * Use a stable key like ["opportunities"] or ["prospect", id].
 */
export function useApiQuery<T = unknown>(
  key: readonly unknown[],
  path: string,
  options?: Omit<UseQueryOptions<T, Error, T, readonly unknown[]>, "queryKey" | "queryFn">,
) {
  return useQuery<T, Error, T, readonly unknown[]>({
    queryKey: key,
    queryFn: ({ signal }) => api<T>(path, { signal } as any),
    ...options,
  });
}

export { useQuery, useMutation, useQueryClient };
