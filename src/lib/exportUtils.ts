// Lightweight client-side exporters (no extra deps)
export function downloadBlob(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeCsv(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCSV<T extends Record<string, unknown>>(rows: T[], columns?: (keyof T)[]): string {
  if (rows.length === 0) return "";
  const cols = (columns ?? (Object.keys(rows[0]) as (keyof T)[])) as string[];
  const head = cols.map(escapeCsv).join(",");
  const body = rows.map((r) => cols.map((c) => escapeCsv((r as Record<string, unknown>)[c])).join(",")).join("\n");
  return `${head}\n${body}`;
}

// NOTE: historically this emitted a CSV file. The product now standardises on
// Excel (.xlsx) for every export and every downloadable model. We keep the
// `exportCSV` name so existing call sites continue to compile, but the output
// is always an .xlsx workbook. Any `.csv` extension is rewritten to `.xlsx`.
export function exportCSV<T extends Record<string, unknown>>(filename: string, rows: T[], columns?: (keyof T)[]) {
  const xlsxName = filename.replace(/\.csv$/i, ".xlsx").replace(/\.[a-z0-9]+$/i, (ext) => ext.toLowerCase() === ".xlsx" ? ext : ".xlsx");
  const finalName = /\.xlsx$/i.test(xlsxName) ? xlsxName : `${xlsxName}.xlsx`;
  const projected = columns && columns.length
    ? rows.map((r) => {
        const o: Record<string, unknown> = {};
        for (const c of columns) o[c as string] = (r as Record<string, unknown>)[c as string];
        return o;
      })
    : rows;
  void exportXLSX(finalName, projected as Record<string, unknown>[]);
}

export function exportJSON(filename: string, data: unknown) {
  downloadBlob(filename, JSON.stringify(data, null, 2), "application/json");
}

export function printPage() {
  if (typeof window !== "undefined") window.print();
}

// Excel (XLSX) export — dynamic import keeps initial bundle small.
export async function exportXLSX<T extends Record<string, unknown>>(
  filename: string,
  rows: T[],
  sheetName = "Données",
) {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, filename);
}

// Enrich rows with custom-field columns using human-readable labels.
// Falls back to `cf_<key>` if the label collides with an existing column.
export function withCustomFields<T extends Record<string, unknown>>(
  rows: T[],
  defs: { key: string; label: string; typeId?: string | null }[],
  valuesById: Record<string, Record<string, string>>,
  idField: keyof T = "id" as keyof T,
  rowTypeField: keyof T = "typeId" as keyof T,
): Record<string, unknown>[] {
  if (defs.length === 0) return rows.map((r) => ({ ...r }));
  const baseKeys = new Set(rows[0] ? Object.keys(rows[0]) : []);
  const colName = new Map<string, string>();
  for (const d of defs) {
    const safe = baseKeys.has(d.label) || [...colName.values()].includes(d.label)
      ? `cf_${d.key}` : d.label;
    colName.set(d.key, safe);
  }
  return rows.map((r) => {
    const id = String(r[idField] ?? "");
    const rowType = r[rowTypeField] != null ? String(r[rowTypeField]) : "";
    const vals = valuesById[id] ?? {};
    const out: Record<string, unknown> = { ...r };
    for (const d of defs) {
      // Only export values for fields that belong to this row's type
      // (shared defs always apply; type-scoped defs only when typeId matches).
      const applies = d.typeId == null || d.typeId === rowType;
      out[colName.get(d.key)!] = applies ? (vals[d.key] ?? "") : "";
    }
    return out;
  });
}

// Re-key rows using a friendly label map. Keys not in the map keep their
// original technical name. Useful to make CSV / Excel exports readable for
// end users (UI labels) instead of database field names.
//   relabelRows([{ lastName: "X" }], { lastName: "Nom" }) → [{ Nom: "X" }]
export function relabelRows<T extends Record<string, unknown>>(
  rows: T[],
  labels: Record<string, string>,
): Record<string, unknown>[] {
  if (rows.length === 0) return [];
  return rows.map((r) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) {
      out[labels[k] ?? k] = v;
    }
    return out;
  });
}

// Parse CSV / XLSX file → array of objects (header row required).
export async function parseSpreadsheet(file: File): Promise<Record<string, unknown>[]> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", raw: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
  // ext just informs the user — XLSX.read auto-detects CSV/XLSX
  void ext;
  return rows;
}

