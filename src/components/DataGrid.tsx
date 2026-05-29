import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, MoreHorizontal, Pencil, Trash2, Check, X, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const PAGE_SIZE_OPTIONS = [25, 50, 100, 500, 1000, 2000, 5000] as const;

/**
 * Reusable Excel-style data grid with:
 *   - sticky header, dense rows
 *   - sortable columns
 *   - row selection (single / all-on-page)
 *   - per-row inline edit (per-column `editor`)
 *   - delete + custom row actions
 *   - paginated client-side
 */
export type ColumnEditorProps<T> = {
  row: T;
  value: any;
  setValue: (v: any) => void;
};

export type DataGridColumn<T> = {
  key: string;
  header: ReactNode;
  /** How wide the column should be (CSS value). */
  width?: string;
  /** Pull a primitive sort/display key from the row. */
  accessor?: (row: T) => any;
  /** Custom display cell. */
  cell?: (row: T) => ReactNode;
  /** When provided, the cell becomes editable in edit mode. */
  editor?: (props: ColumnEditorProps<T>) => ReactNode;
  /** Defaults to true if `accessor` is set. */
  sortable?: boolean;
  /** Right-align numeric columns. */
  align?: "left" | "right" | "center";
  /** Hide on small viewports. */
  hideBelow?: "sm" | "md" | "lg" | "xl";
  className?: string;
};

export type RowAction<T> = {
  label: string;
  icon?: ReactNode;
  onClick: (row: T) => void;
  destructive?: boolean;
  hidden?: (row: T) => boolean;
};

type Props<T> = {
  rows: T[];
  columns: DataGridColumn<T>[];
  rowKey: (row: T) => string;
  /** Persist save to backend; resolve when done. */
  onSaveRow?: (row: T, patch: Record<string, any>) => Promise<void> | void;
  onDeleteRow?: (row: T) => Promise<void> | void;
  onRowClick?: (row: T) => void;
  rowActions?: RowAction<T>[];
  selectable?: boolean;
  selected?: Set<string>;
  onSelectedChange?: (next: Set<string>) => void;
  pageSize?: number;
  emptyState?: ReactNode;
  /** Stable identifier for sort/page resets. */
  storageKey?: string;
  /** Optional per-row class (e.g. highlight). */
  rowClassName?: (row: T) => string | undefined;
};

const HIDE_CLASS: Record<NonNullable<DataGridColumn<unknown>["hideBelow"]>, string> = {
  sm: "hidden sm:table-cell",
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
  xl: "hidden xl:table-cell",
};

export function DataGrid<T>(props: Props<T>) {
  const {
    rows, columns, rowKey, onSaveRow, onDeleteRow, onRowClick, rowActions = [],
    selectable = true, selected, onSelectedChange,
    pageSize = 50, emptyState, storageKey, rowClassName,
  } = props;

  // Persist sort + page across navigations when storageKey is provided.
  const readPersist = <V,>(suffix: string, fallback: V): V => {
    if (!storageKey || typeof window === "undefined") return fallback;
    try {
      const raw = sessionStorage.getItem(`${storageKey}:${suffix}`);
      return raw == null ? fallback : (JSON.parse(raw) as V);
    } catch { return fallback; }
  };
  const writePersist = (suffix: string, value: unknown) => {
    if (!storageKey || typeof window === "undefined") return;
    try { sessionStorage.setItem(`${storageKey}:${suffix}`, JSON.stringify(value)); } catch { /* ignore */ }
  };

  const [sortKey, setSortKey] = useState<string | null>(() => readPersist("sortKey", null as string | null));
  const [sortDir, setSortDir] = useState<"asc" | "desc">(() => readPersist("sortDir", "asc" as "asc" | "desc"));
  const [page, setPage] = useState(() => readPersist("page", 0));
  const [currentPageSize, setCurrentPageSize] = useState<number>(() => readPersist("pageSize", pageSize));
  useEffect(() => { writePersist("sortKey", sortKey); }, [sortKey]);
  useEffect(() => { writePersist("sortDir", sortDir); }, [sortDir]);
  useEffect(() => { writePersist("page", page); }, [page]);
  useEffect(() => { writePersist("pageSize", currentPageSize); }, [currentPageSize]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBuffer, setEditBuffer] = useState<Record<string, any>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  // Reset to first page when row count drops below current page.
  useEffect(() => { setPage((p) => Math.min(p, Math.max(0, Math.ceil(rows.length / currentPageSize) - 1))); }, [rows.length, currentPageSize]);

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.accessor) return rows;
    const arr = [...rows];
    arr.sort((a, b) => {
      const av = col.accessor!(a); const bv = col.accessor!(b);
      if (av === bv) return 0;
      if (av == null) return 1; if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return sortDir === "asc" ? av - bv : bv - av;
      const cmp = String(av).localeCompare(String(bv), "fr", { numeric: true });
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [rows, columns, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / currentPageSize));
  const pageRows = sorted.slice(page * currentPageSize, page * currentPageSize + currentPageSize);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const tableRef = useRef<HTMLTableElement | null>(null);
  const [contentWidth, setContentWidth] = useState(0);
  useEffect(() => {
    const el = tableRef.current;
    if (!el) return;
    const update = () => setContentWidth(el.scrollWidth);
    update();
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(update);
      ro.observe(el);
      return () => ro.disconnect();
    }
  }, [pageRows.length, columns.length]);

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const allOnPage = pageRows.length > 0 && pageRows.every((r) => selected?.has(rowKey(r)));
  const toggleAll = (v: boolean) => {
    if (!onSelectedChange) return;
    const next = new Set(selected ?? []);
    if (v) for (const r of pageRows) next.add(rowKey(r));
    else for (const r of pageRows) next.delete(rowKey(r));
    onSelectedChange(next);
  };
  const toggleOne = (id: string, v: boolean) => {
    if (!onSelectedChange) return;
    const next = new Set(selected ?? []);
    if (v) next.add(id); else next.delete(id);
    onSelectedChange(next);
  };

  const startEdit = (row: T) => {
    const id = rowKey(row);
    const buf: Record<string, any> = {};
    for (const c of columns) {
      if (c.editor) buf[c.key] = c.accessor ? c.accessor(row) : (row as any)[c.key];
    }
    setEditBuffer(buf);
    setEditingId(id);
  };
  const cancelEdit = () => { setEditingId(null); setEditBuffer({}); };
  const commitEdit = async (row: T) => {
    if (!onSaveRow) { cancelEdit(); return; }
    const id = rowKey(row);
    setSavingId(id);
    try {
      await onSaveRow(row, editBuffer);
      cancelEdit();
    } finally {
      setSavingId(null);
    }
  };

  return (
    <Card className="overflow-hidden p-0 shadow-sm w-full max-w-none">
      <TopScrollbar targetRef={scrollRef} contentWidth={contentWidth} />
      <div ref={scrollRef} className="w-full overflow-x-auto data-grid-scroll">
        <table ref={tableRef} className="data-grid w-max min-w-full">
          <thead>
            <tr>
              {selectable && (
                <th style={{ width: 36 }}>
                  <Checkbox checked={allOnPage} onCheckedChange={(v) => toggleAll(!!v)} aria-label="Tout sélectionner" />
                </th>
              )}
              {columns.map((c) => {
                const cls = c.hideBelow ? HIDE_CLASS[c.hideBelow] : "";
                const align = c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left";
                const sortable = c.sortable ?? !!c.accessor;
                const active = sortKey === c.key;
                return (
                  <th key={c.key} className={`${cls} ${align}`} style={c.width ? { width: c.width } : undefined}>
                    {sortable ? (
                      <button onClick={() => toggleSort(c.key)} className="inline-flex items-center gap-1 hover:text-foreground">
                        {c.header}
                        {active ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                      </button>
                    ) : c.header}
                  </th>
                );
              })}
              {(onSaveRow || onDeleteRow || rowActions.length > 0) && <th style={{ width: 80, position: "sticky", right: 0 }} className="text-right bg-card z-10 shadow-[-4px_0_6px_-4px_rgba(0,0,0,0.08)]">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (selectable ? 1 : 0) + 1} className="text-center py-12 text-muted-foreground text-sm">
                  {emptyState ?? "Aucun résultat."}
                </td>
              </tr>
            ) : pageRows.map((row) => {
              const id = rowKey(row);
              const isEditing = editingId === id;
              const isSelected = selected?.has(id);
              return (
                <tr
                  key={id}
                  data-selected={isSelected || undefined}
                  className={`${onRowClick && !isEditing ? "cursor-pointer" : ""} ${rowClassName?.(row) ?? ""}`.trim()}
                  onClick={(e) => {
                    if (isEditing) return;
                    const t = e.target as HTMLElement;
                    if (t.closest("button, input, [data-no-row-click], [role='menu']")) return;
                    onRowClick?.(row);
                  }}
                >
                  {selectable && (
                    <td onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={!!isSelected} onCheckedChange={(v) => toggleOne(id, !!v)} aria-label="Sélectionner" />
                    </td>
                  )}
                  {columns.map((c) => {
                    const cls = c.hideBelow ? HIDE_CLASS[c.hideBelow] : "";
                    const align = c.align === "right" ? "text-right cell-num" : c.align === "center" ? "text-center" : "text-left";
                    return (
                      <td key={c.key} className={`${cls} ${align} ${c.className ?? ""}`}>
                        {isEditing && c.editor ? (
                          <div data-no-row-click>
                            {c.editor({ row, value: editBuffer[c.key], setValue: (v) => setEditBuffer((b) => ({ ...b, [c.key]: v })) })}
                          </div>
                        ) : c.cell ? c.cell(row) : String(c.accessor?.(row) ?? "")}
                      </td>
                    );
                  })}
                  <td className="text-right whitespace-nowrap bg-card sticky right-0 z-[1] shadow-[-4px_0_6px_-4px_rgba(0,0,0,0.08)]" onClick={(e) => e.stopPropagation()}>
                    {isEditing ? (
                      <div className="inline-flex gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => commitEdit(row)} disabled={savingId === id} title="Enregistrer">
                          <Check className="h-3.5 w-3.5 text-success" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={cancelEdit} disabled={savingId === id} title="Annuler">
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <div className="inline-flex gap-0.5">
                        {onSaveRow && columns.some((c) => c.editor) && (
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(row)} title="Modifier">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {(rowActions.length > 0 || onDeleteRow) && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-7 w-7"><MoreHorizontal className="h-3.5 w-3.5" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              {rowActions.filter((a) => !a.hidden?.(row)).map((a, i) => (
                                <DropdownMenuItem key={i} onClick={() => a.onClick(row)} className={a.destructive ? "text-destructive focus:text-destructive" : ""}>
                                  {a.icon}<span className="ml-2">{a.label}</span>
                                </DropdownMenuItem>
                              ))}
                              {onDeleteRow && (
                                <>
                                  {rowActions.length > 0 && <DropdownMenuSeparator />}
                                  <DropdownMenuItem onClick={() => onDeleteRow(row)} className="text-destructive focus:text-destructive">
                                    <Trash2 className="h-4 w-4" /><span className="ml-2">Supprimer</span>
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2.5 border-t border-border flex items-center justify-between text-xs text-muted-foreground gap-2 flex-wrap">
        <span className="cell-num">
          {sorted.length === 0
            ? "Aucun résultat"
            : `${page * currentPageSize + 1}–${Math.min((page + 1) * currentPageSize, sorted.length)} sur ${sorted.length.toLocaleString("fr-FR")}`}
        </span>
        <div className="flex gap-2 items-center">
          <span>Lignes :</span>
          <Select value={String(currentPageSize)} onValueChange={(v) => { setCurrentPageSize(Number(v)); setPage(0); }}>
            <SelectTrigger className="h-7 w-[88px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)}>{n.toLocaleString("fr-FR")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="icon" variant="outline" className="h-7 w-7" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="px-2 cell-num">{page + 1} / {totalPages}</span>
          <Button size="icon" variant="outline" className="h-7 w-7" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </Card>
  );
}

/** Small text editor cell — the standard inline editor. */
export function CellInput({ value, setValue, type = "text", ...rest }: { value: any; setValue: (v: any) => void; type?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type={type}
      value={value ?? ""}
      onChange={(e) => setValue(type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)}
      className="cell-edit"
      {...rest}
    />
  );
}

/** Select editor cell. */
export function CellSelect({ value, setValue, options }: { value: any; setValue: (v: any) => void; options: { value: string; label: string }[] }) {
  return (
    <select value={value ?? ""} onChange={(e) => setValue(e.target.value)} className="cell-edit">
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

/** Mirror scrollbar shown above the table so users can scroll horizontally
 *  from the top without reaching the bottom. Synced both ways. */
function TopScrollbar({
  targetRef,
  contentWidth,
}: {
  targetRef: React.RefObject<HTMLDivElement | null>;
  contentWidth: number;
}) {
  const barRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const top = barRef.current;
    const bot = targetRef.current;
    if (!top || !bot) return;

    // Use a "syncing" flag to break the feedback loop. Whichever element
    // the user scrolls is the source; we mirror to the other and ignore the
    // resulting echo scroll event. No driver lock needed.
    let syncing = false;

    const onTop = () => {
      if (syncing) { syncing = false; return; }
      if (bot.scrollLeft === top.scrollLeft) return;
      syncing = true;
      bot.scrollLeft = top.scrollLeft;
    };
    const onBot = () => {
      if (syncing) { syncing = false; return; }
      if (top.scrollLeft === bot.scrollLeft) return;
      syncing = true;
      top.scrollLeft = bot.scrollLeft;
    };

    top.addEventListener("scroll", onTop, { passive: true });
    bot.addEventListener("scroll", onBot, { passive: true });

    return () => {
      top.removeEventListener("scroll", onTop);
      bot.removeEventListener("scroll", onBot);
    };
  }, [targetRef, contentWidth]);

  if (!contentWidth) return null;
  return (
    <div
      ref={barRef}
      className="data-grid-top-scroll w-full overflow-x-auto overflow-y-hidden border-b border-border"
      aria-hidden="true"
    >
      <div style={{ width: contentWidth, height: 1 }} />
    </div>
  );
}
