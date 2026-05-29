import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { FieldDef } from "@/components/CustomFieldsInline";

export type Entity = "prospect" | "contract" | "user" | "opportunity";

/**
 * Load field definitions + every entity's values for the given entity type.
 * Used by list pages to show optional custom columns and filter on them.
 */
export function useCustomFieldsTable(entity: Entity) {
  const [defs, setDefs] = useState<FieldDef[]>([]);
  const [valuesById, setValuesById] = useState<Record<string, Record<string, string>>>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const [d, v] = await Promise.all([
          api<{ fields: FieldDef[] }>("/custom_fields.php", { query: { entity } }),
          api<{ values: Record<string, Record<string, string>> }>(
            "/custom_field_values.php",
            { query: { entity, all: 1 } },
          ),
        ]);
        if (cancel) return;
        setDefs((d.fields ?? []).slice().sort((a, b) => a.position - b.position));
        setValuesById(v.values ?? {});
      } catch {
        /* silent — admin may not have configured anything */
      } finally {
        if (!cancel) setReady(true);
      }
    })();
    return () => { cancel = true; };
  }, [entity]);

  return { defs, valuesById, ready };
}

/** Format a custom value for display based on its type. */
export function formatCustomValue(def: FieldDef, raw: string | undefined): string {
  if (raw === undefined || raw === "") return "—";
  switch (def.type) {
    case "boolean": return raw === "1" || raw === "true" ? "Oui" : "Non";
    case "number":  return raw;
    case "date":    return raw;
    case "multiselect": {
      const s = String(raw).trim();
      if (s.startsWith("[")) {
        try {
          const v = JSON.parse(s);
          if (Array.isArray(v)) return v.join(", ");
        } catch { /* ignore */ }
      }
      return s;
    }
    default:        return raw;
  }
}
