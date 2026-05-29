import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MultiSelect, parseMulti, serializeMulti } from "@/components/ui/multi-select";
import { api } from "@/lib/api";

export type FieldDef = {
  id: string;
  entity: string;
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "date" | "boolean" | "select" | "multiselect";
  options: string[];
  required: boolean;
  position: number;
  /** null = shared field (applies to all types); otherwise scoped to a prospect_type id */
  typeId?: string | null;
};

type Entity = "prospect" | "contract" | "user" | "opportunity";

/**
 * Controlled inline editor for custom fields, designed to be embedded
 * in create dialogs. Loads field definitions for the entity and lets
 * the parent collect values via `onChange`.
 *
 * Use `validate()` (returned from the parent via ref-like prop) to
 * enforce required-field rules before submit.
 */
export function CustomFieldsInline({
  entity,
  values,
  onChange,
  typeId,
}: {
  entity: Entity;
  values: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  /**
   * When provided, loads shared fields (type_id NULL) plus per-type fields
   * for this type id. When undefined, only shared fields are returned.
   */
  typeId?: string | null;
}) {
  const [fields, setFields] = useState<FieldDef[]>([]);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const query: Record<string, string> = { entity };
        if (typeId) query.type_id = typeId;
        const r = await api<{ fields: FieldDef[] }>("/custom_fields.php", { query });
        if (!cancel) setFields((r.fields ?? []).slice().sort((a, b) => a.position - b.position));
      } catch {
        /* silent — admin may not have configured any */
      }
    })();
    return () => { cancel = true; };
  }, [entity, typeId]);

  if (fields.length === 0) return null;
  const set = (k: string, v: string) => onChange({ ...values, [k]: v });

  return (
    <div className="col-span-2 mt-1 border-t pt-3 space-y-2">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Champs personnalisés
      </div>
      <div className="grid grid-cols-2 gap-3">
        {fields.map((f) => {
          const v = values[f.key] ?? "";
          return (
            <div key={f.id} className={f.type === "textarea" ? "col-span-2 space-y-1.5" : "space-y-1.5"}>
              <Label>
                {f.label}
                {f.required && <span className="text-destructive ml-1">*</span>}
              </Label>
              {f.type === "textarea" ? (
                <Textarea value={v} onChange={(e) => set(f.key, e.target.value)} rows={2} />
              ) : f.type === "number" ? (
                <Input type="number" value={v} onChange={(e) => set(f.key, e.target.value)} />
              ) : f.type === "date" ? (
                <DatePicker value={v} onChange={(val) => set(f.key, val)} />
              ) : f.type === "boolean" ? (
                <div className="flex items-center h-10">
                  <Switch checked={v === "1" || v === "true"} onCheckedChange={(c) => set(f.key, c ? "1" : "0")} />
                </div>
              ) : f.type === "select" ? (
                <Select value={v} onValueChange={(val) => set(f.key, val)}>
                  <SelectTrigger><SelectValue placeholder="Choisir…" /></SelectTrigger>
                  <SelectContent>
                    {(f.options ?? []).map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : f.type === "multiselect" ? (
                <MultiSelect
                  options={f.options ?? []}
                  values={parseMulti(v)}
                  onChange={(vals) => set(f.key, serializeMulti(vals))}
                />
              ) : (
                <Input value={v} onChange={(e) => set(f.key, e.target.value)} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Validate required custom-field values against fetched defs. Returns first error label, or null. */
export async function validateRequiredCustomValues(
  entity: Entity,
  values: Record<string, string>,
  typeId?: string | null,
): Promise<string | null> {
  try {
    const query: Record<string, string> = { entity };
    if (typeId) query.type_id = typeId;
    const r = await api<{ fields: FieldDef[] }>("/custom_fields.php", { query });
    for (const f of r.fields ?? []) {
      if (f.required && !String(values[f.key] ?? "").trim()) return f.label;
    }
  } catch { /* ignore — backend unavailable */ }
  return null;
}
