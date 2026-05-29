import { useEffect, useState } from "react";
import { api, API_ENABLED } from "./api";

const KEY = "erp.currency";
const EVT = "erp:currency-changed";

export type Currency = {
  code: string; // ISO-like code, e.g. "TND"
  symbol: string; // displayed symbol/suffix, e.g. "TND" or "د.ت"
  decimals: number; // number of decimals
  position: "suffix" | "prefix";
};

export const DEFAULT_CURRENCY: Currency = {
  code: "TND",
  symbol: "TND",
  decimals: 3,
  position: "suffix",
};

// Local cache (so UI is immediate on next load); backend is the source of truth.
export function readCurrency(): Currency {
  if (typeof window === "undefined") return DEFAULT_CURRENCY;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_CURRENCY;
    return { ...DEFAULT_CURRENCY, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_CURRENCY;
  }
}

function cacheCurrency(c: Currency) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(c));
  window.dispatchEvent(new CustomEvent(EVT));
}

/** Persist currency to backend (global setting); falls back to local cache only. */
export async function writeCurrency(c: Currency): Promise<void> {
  cacheCurrency(c);
  if (!API_ENABLED) return;
  try {
    await api("/settings.php", {
      method: "PUT",
      body: { scope: "global", key: "currency", value: c },
    });
  } catch (e) {
    // Soft-fail: keep the local cache so the UI still reflects the change.
    console.warn("Currency persist failed", e);
  }
}

/** Refresh local cache from backend on app load. */
export async function syncCurrencyFromServer(): Promise<void> {
  if (!API_ENABLED) return;
  try {
    const r = await api<{ value: Partial<Currency> | null }>(
      "/settings.php",
      { query: { scope: "global", key: "currency" } },
    );
    if (r?.value && typeof r.value === "object") {
      cacheCurrency({ ...DEFAULT_CURRENCY, ...r.value });
    }
  } catch {
    /* keep local cache */
  }
}

export function formatAmount(value: number, c: Currency = readCurrency()): string {
  const n = Number.isFinite(value) ? value : 0;
  const formatted = n.toLocaleString("fr-FR", {
    minimumFractionDigits: c.decimals,
    maximumFractionDigits: c.decimals,
  });
  return c.position === "prefix" ? `${c.symbol} ${formatted}` : `${formatted} ${c.symbol}`;
}

export function formatCompact(value: number, c: Currency = readCurrency()): string {
  const n = Number.isFinite(value) ? value : 0;
  if (Math.abs(n) >= 1000) {
    const k = (n / 1000).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    return c.position === "prefix" ? `${c.symbol} ${k}k` : `${k}k ${c.symbol}`;
  }
  return formatAmount(n, c);
}

export function useCurrency(): Currency {
  const [c, setC] = useState<Currency>(() => readCurrency());
  useEffect(() => {
    const update = () => setC(readCurrency());
    window.addEventListener(EVT, update);
    window.addEventListener("storage", update);
    // Pull latest from server on mount
    void syncCurrencyFromServer().then(update);
    return () => {
      window.removeEventListener(EVT, update);
      window.removeEventListener("storage", update);
    };
  }, []);
  return c;
}
