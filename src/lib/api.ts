// Lightweight typed REST client for the PHP backend.
// API base URL is hardcoded to the production PHP backend.
const BASE = "https://luccibyey.com.tn/crminternet";
export const API_ENABLED = true;
export const API_BASE = BASE;

/** Build absolute URL to any backend file path (e.g. attachments.php?download=...) */
export function apiUrl(path: string): string {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return BASE + (path.startsWith("/") ? path : `/${path}`);
}

/** Build an absolute URL for media loaded by <img>/<iframe>/<a>, where custom auth headers cannot be sent. */
export function authenticatedApiUrl(path: string, query?: Record<string, string | number | boolean | undefined>): string {
  const url = apiUrl(path);
  const token = getToken();
  if (!url) return url;
  try {
    const u = new URL(url);
    if (token) u.searchParams.set("token", token);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== null) u.searchParams.set(key, String(value));
    }
    return u.toString();
  } catch {
    const params = new URLSearchParams();
    if (token) params.set("token", token);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== null) params.set(key, String(value));
    }
    const qs = params.toString();
    return qs ? url + (url.includes("?") ? "&" : "?") + qs : url;
  }
}

/** Upload one file via multipart/form-data. Used by attachments.php. */
export async function apiUpload<T = any>(
  path: string,
  fields: Record<string, string | Blob>,
): Promise<T> {
  if (!API_ENABLED) throw new ApiError("API base URL not configured", 0);
  const url = BASE + (path.startsWith("/") ? path : `/${path}`);
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v as any);
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
    headers["X-Auth-Token"] = token;
  }
  const res = await fetch(url, { method: "POST", headers, body: fd });
  let data: any = null;
  try { data = await res.json(); } catch { /* ignore */ }
  if (!res.ok || (data && data.success === false)) {
    const msg = data?.message ?? `HTTP ${res.status}`;
    if (res.status === 401 && isAuthValidationEndpoint(url)) {
      handleUnauthorized(url);
    } else if (res.status === 401) {
      console.warn("[auth] 401 on non-auth endpoint, keeping session", { url, msg });
    }
    if (res.status === 403) notifyForbidden(url, msg, 403);
    throw new ApiError(msg, res.status);
  }
  return data as T;
}

const TOKEN_KEY = "protection_erp_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(t: string | null) {
  if (typeof window === "undefined") return;
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

/**
 * Returns true only for endpoints whose 401 unambiguously means "the bearer
 * token itself is invalid/expired" (i.e. session validation). For every other
 * endpoint a 401 may be a backend permission/role bug and must NOT wipe the
 * user's session — otherwise a single mis-permissioned endpoint logs the
 * whole user out (this was the guichet-role symptom).
 */
function isAuthValidationEndpoint(url: string): boolean {
  return /\/auth_me\.php(\?|$)/.test(url);
}

/**
 * Centralised handler for a 401 from the session-validation endpoint
 * (`/auth_me.php`). Clears the local token, preserves the current URL as
 * `?next=...` so the user returns to where they were after re-login, and
 * forces a full reload of /login so all in-memory React state (auth
 * context, query cache, providers) is wiped cleanly.
 */
export function handleUnauthorized(sourceUrl?: string) {
  console.warn("[auth] 401 → forcing logout", { sourceUrl });
  setToken(null);
  if (typeof window === "undefined") return;
  const w = window as any;
  if (w.__redirectingToLogin) return;
  const path = window.location.pathname || "";
  if (path.startsWith("/login")) return;
  w.__redirectingToLogin = true;
  const here = window.location.pathname + window.location.search + window.location.hash;
  const safeNext = here && here !== "/" ? `?next=${encodeURIComponent(here)}` : "";
  window.location.href = `/login${safeNext}`;
}

// Cross-tab sync: if the token disappears in another tab (logout / 401
// elsewhere), this tab also bounces to /login.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === TOKEN_KEY && !e.newValue) {
      handleUnauthorized();
    }
  });
}

type ApiOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  signal?: AbortSignal;
  /**
   * If true, the request is sent with `keepalive` so it survives a page
   * navigation/unload (used for clock_out + auth_logout on logout).
   */
  keepalive?: boolean;
};

export class ApiError extends Error {
  status: number;
  /** True when the backend refused the action for permission reasons (403, or 401 on a non-auth endpoint). */
  forbidden: boolean;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.forbidden = status === 403;
  }
}

/**
 * Global 403/Forbidden handler. Any backend response with status 403 (or an
 * error body explicitly saying "Forbidden") is translated into a clear French
 * toast: "Permission refusée — Veuillez contacter l'administrateur pour qu'il
 * vous ajoute cette permission." This is the safety net for cases where the
 * frontend gate (<Can> / useCan) was missed.
 *
 * The handler is injected from src/main entry to avoid a hard dependency on
 * sonner inside api.ts (and to keep this file SSR-safe).
 */
type ForbiddenHandler = (info: { url: string; message: string; status: number }) => void;
let _onForbidden: ForbiddenHandler | null = null;
export function setForbiddenHandler(fn: ForbiddenHandler | null) { _onForbidden = fn; }
function notifyForbidden(url: string, message: string, status: number) {
  try { _onForbidden?.({ url, message, status }); } catch { /* ignore */ }
}

/** Heuristic — does this backend error mean "permission refused"? */
export function isForbiddenError(e: unknown): boolean {
  if (e instanceof ApiError) {
    if (e.status === 403) return true;
    if (e.status === 401 && /forbidden|permission|interdit|refus/i.test(e.message)) return true;
  }
  return false;
}

export async function api<T = any>(path: string, opts: ApiOptions = {}): Promise<T> {
  if (!API_ENABLED) throw new ApiError("API base URL not configured", 0);

  const url = new URL(BASE + (path.startsWith("/") ? path : `/${path}`));
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }
  const method = (opts.method ?? "GET").toUpperCase();
  // Cache-buster on every GET — defeats any HTTP/proxy/browser cache.
  if (method === "GET") url.searchParams.set("_t", String(Date.now()));

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Pragma": "no-cache",
  };
  const token = getToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
    headers["X-Auth-Token"] = token;
  }

  const res = await fetch(url.toString(), {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
    keepalive: opts.keepalive,
    cache: "no-store",
  });

  let data: any = null;
  try { data = await res.json(); } catch { /* ignore */ }

  if (!res.ok || (data && data.success === false)) {
    const msg = data?.message ?? `HTTP ${res.status}`;
    const u = url.toString();
    if (res.status === 401 && isAuthValidationEndpoint(u)) {
      handleUnauthorized(u);
    } else if (res.status === 401) {
      console.warn("[auth] 401 on non-auth endpoint, keeping session", { url: u, msg });
    }
    if (res.status === 403) notifyForbidden(u, msg, 403);
    throw new ApiError(msg, res.status);
  }
  return data as T;
}


