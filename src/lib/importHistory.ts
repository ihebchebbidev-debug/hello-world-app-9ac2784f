// Persistent log of CSV import runs — used by /reconciliation.
// Stored in localStorage so it survives reloads without a backend table.

export type ImportEntity = "prospect" | "contract" | "user";

export type ImportRun = {
  id: string;
  ts: string; // ISO
  entity: ImportEntity;
  title: string;
  fileName: string | null;
  user: string | null;
  totals: { added: number; updated: number; skipped: number };
  rowsRead: number;
  rowsValid: number;
  rowsInvalid: number;
  duplicates: number;
  // mapping: ERP field key -> source column header (or null if unmapped)
  mapping: { fieldKey: string; fieldLabel: string; sourceColumn: string | null; required: boolean }[];
};

const KEY = "protection_erp_import_runs";
const LIMIT = 50;
const EVT = "import-runs:changed";

function safeParse(): ImportRun[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as ImportRun[]) : [];
  } catch {
    return [];
  }
}

export function getImportRuns(): ImportRun[] {
  return safeParse();
}

export function recordImportRun(run: Omit<ImportRun, "id" | "ts">): ImportRun {
  const full: ImportRun = {
    ...run,
    id: `IR-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    ts: new Date().toISOString(),
  };
  if (typeof window === "undefined") return full;
  const all = [full, ...safeParse()].slice(0, LIMIT);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(all));
    window.dispatchEvent(new CustomEvent(EVT));
  } catch {
    /* ignore quota */
  }
  return full;
}

export function clearImportRuns() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
  window.dispatchEvent(new CustomEvent(EVT));
}

/** React hook: subscribes to storage + in-tab updates. */
import { useEffect, useState } from "react";

export function useImportRuns(): ImportRun[] {
  const [runs, setRuns] = useState<ImportRun[]>(() => getImportRuns());
  useEffect(() => {
    const sync = () => setRuns(getImportRuns());
    window.addEventListener(EVT, sync);
    window.addEventListener("storage", (e) => { if (e.key === KEY) sync(); });
    return () => {
      window.removeEventListener(EVT, sync);
    };
  }, []);
  return runs;
}
