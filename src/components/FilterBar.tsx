import { useState, type ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, SlidersHorizontal, RotateCcw, X, ChevronDown } from "lucide-react";

export type FilterChip = { key: string; label: string; onClear: () => void };

type Props = {
  searchValue: string;
  onSearchChange: (v: string) => void;
  searchPlaceholder?: string;
  onSearch: () => void;
  onReset: () => void;
  activeChips: FilterChip[];
  children: ReactNode; // advanced filters grid
  resultsCount?: number;
};

/**
 * Compact filter UX:
 *  - Always-visible search bar + primary action
 *  - "Filtres" toggle reveals the advanced grid
 *  - Active filters shown as removable chips so users always understand what's applied
 */
export function FilterBar({
  searchValue,
  onSearchChange,
  searchPlaceholder = "Rechercher…",
  onSearch,
  onReset,
  activeChips,
  children,
  resultsCount,
}: Props) {
  const [open, setOpen] = useState(false);
  const hasFilters = activeChips.length > 0;

  return (
    <Card className="shadow-elegant overflow-hidden">
      <div className="p-3 flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onSearch(); }}
            placeholder={searchPlaceholder}
            className="pl-9 h-10"
          />
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant={open ? "default" : "outline"}
            size="sm"
            onClick={() => setOpen((o) => !o)}
            className="h-10 relative"
          >
            <SlidersHorizontal className="h-4 w-4 mr-1.5" />
            Filtres
            {hasFilters && (
              <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-semibold px-1.5">
                {activeChips.length}
              </span>
            )}
            <ChevronDown className={`h-3.5 w-3.5 ml-1 transition-transform ${open ? "rotate-180" : ""}`} />
          </Button>
          {hasFilters && (
            <Button type="button" variant="ghost" size="sm" onClick={onReset} className="h-10">
              <RotateCcw className="h-4 w-4 mr-1.5" />
              Effacer
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            onClick={onSearch}
            className="h-10 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Search className="h-4 w-4 mr-1.5" />
            Rechercher
          </Button>
        </div>
      </div>

      {hasFilters && (
        <div className="px-3 pb-3 flex items-center flex-wrap gap-1.5 border-t border-border pt-2">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground mr-1">
            Filtres actifs
            {typeof resultsCount === "number" && (
              <span className="ml-2 normal-case tracking-normal text-foreground/70">
                · {resultsCount.toLocaleString("fr-FR")} résultat{resultsCount > 1 ? "s" : ""}
              </span>
            )}
          </span>
          {activeChips.map((c) => (
            <Badge
              key={c.key}
              variant="outline"
              className="bg-primary/5 border-primary/20 text-foreground gap-1 pl-2 pr-1 py-0.5 cursor-pointer hover:bg-primary/10"
              onClick={c.onClear}
            >
              {c.label}
              <X className="h-3 w-3 text-muted-foreground" />
            </Badge>
          ))}
        </div>
      )}

      {open && (
        <div className="px-3 pb-3 pt-3 border-t border-border bg-muted/20">
          {children}
        </div>
      )}
    </Card>
  );
}
