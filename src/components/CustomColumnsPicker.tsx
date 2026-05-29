import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { FieldDef } from "@/components/CustomFieldsInline";

export function CustomColumnsPicker({
  defs,
  visible,
  onToggle,
}: {
  defs: FieldDef[];
  visible: Set<string>;
  onToggle: (key: string, v: boolean) => void;
}) {
  if (defs.length === 0) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings2 className="h-4 w-4 mr-1.5" /> Colonnes
          <span className="ml-1.5 text-[10px] text-muted-foreground">({visible.size}/{defs.length})</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-3 space-y-2">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Champs personnalisés
        </div>
        <div className="space-y-2 max-h-72 overflow-auto">
          {defs.map((f) => (
            <Label
              key={f.id}
              htmlFor={`col-${f.id}`}
              className="flex items-center gap-2 cursor-pointer text-sm font-normal"
            >
              <Checkbox
                id={`col-${f.id}`}
                checked={visible.has(f.key)}
                onCheckedChange={(c) => onToggle(f.key, !!c)}
              />
              <span className="truncate">{f.label}</span>
            </Label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
