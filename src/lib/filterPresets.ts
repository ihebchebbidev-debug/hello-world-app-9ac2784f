// Filter presets — admin-managed filter templates shared across users for
// Prospects, Opportunities and Contracts.
// Backend: /filter_presets.php (returns snake_case fields; we map to camelCase here).
import { useCallback } from "react";
import { api, API_ENABLED } from "./api";
import { useApiQuery, useQueryClient } from "./queryClient";

export type FilterPresetScope = "prospects" | "opportunities" | "contracts" | "guichet" | "reclamations";

export type FilterPreset = {
  id: string;
  scope: FilterPresetScope;
  name: string;
  description?: string | null;
  filters: Record<string, unknown>;
  isShared: boolean;
  isDefault: boolean;
  defaultRole?: string | null;
  position: number;
  createdBy?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type FilterPresetsResponse = {
  presets: FilterPreset[];
  /** Preset id the user explicitly chose (server-side memorized choice). */
  myChoice: string | null;
  /** Resolved default for current user (role default > global default). */
  effectiveDefault: FilterPreset | null;
  canManage: boolean;
  // Backwards-compat aliases the picker may still consult.
  defaultId: string | null;
  userChoiceId: string | null;
};

// ---- Mapping (PHP snake_case → camelCase) ----------------------------------

type RawPreset = {
  id: number | string;
  scope: FilterPresetScope;
  name: string;
  description: string | null;
  filters: Record<string, unknown> | unknown[];
  is_shared: boolean | number;
  is_default: boolean | number;
  default_role: string | null;
  position: number;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type RawResponse = {
  scope: FilterPresetScope;
  presets: RawPreset[];
  myChoice: number | string | null;
  effectiveDefault: RawPreset | null;
  canManage: boolean;
};

function mapPreset(r: RawPreset): FilterPreset {
  return {
    id: String(r.id),
    scope: r.scope,
    name: r.name,
    description: r.description,
    filters: (r.filters && typeof r.filters === "object" && !Array.isArray(r.filters)
      ? (r.filters as Record<string, unknown>)
      : {}),
    isShared: !!r.is_shared,
    isDefault: !!r.is_default,
    defaultRole: r.default_role,
    position: Number(r.position) || 0,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapResponse(raw: RawResponse): FilterPresetsResponse {
  const effective = raw.effectiveDefault ? mapPreset(raw.effectiveDefault) : null;
  const myChoice = raw.myChoice == null ? null : String(raw.myChoice);
  return {
    presets: (raw.presets ?? []).map(mapPreset),
    myChoice,
    effectiveDefault: effective,
    canManage: !!raw.canManage,
    defaultId: effective?.id ?? null,
    userChoiceId: myChoice,
  };
}

// ---- Hooks -----------------------------------------------------------------

const QK = (scope: FilterPresetScope) => ["filter_presets", scope] as const;

export function useFilterPresets(scope: FilterPresetScope) {
  return useApiQuery<FilterPresetsResponse>(
    QK(scope),
    `/filter_presets.php?scope=${encodeURIComponent(scope)}`,
    {
      enabled: API_ENABLED,
      staleTime: 60_000,
      select: (raw: unknown) => mapResponse(raw as RawResponse),
    } as any,
  );
}

export function useFilterPresetActions(scope: FilterPresetScope) {
  const qc = useQueryClient();
  const invalidate = useCallback(
    () => qc.invalidateQueries({ queryKey: QK(scope) }),
    [qc, scope],
  );

  const create = useCallback(
    async (input: {
      name: string;
      description?: string;
      filters: Record<string, unknown>;
      isShared?: boolean;
      isDefault?: boolean;
      defaultRole?: string | null;
    }) => {
      await api("/filter_presets.php", {
        method: "POST",
        body: {
          scope,
          name: input.name,
          description: input.description ?? null,
          filters: input.filters,
          is_shared: input.isShared ?? true,
          is_default: input.isDefault ?? false,
          default_role: input.defaultRole ?? null,
        },
      });
      await invalidate();
    },
    [scope, invalidate],
  );

  const update = useCallback(
    async (id: string, patch: Partial<Omit<FilterPreset, "id" | "scope">>) => {
      const body: Record<string, unknown> = {};
      if (patch.name !== undefined) body.name = patch.name;
      if (patch.description !== undefined) body.description = patch.description;
      if (patch.filters !== undefined) body.filters = patch.filters;
      if (patch.isShared !== undefined) body.is_shared = patch.isShared;
      if (patch.isDefault !== undefined) body.is_default = patch.isDefault;
      if (patch.defaultRole !== undefined) body.default_role = patch.defaultRole;
      if (patch.position !== undefined) body.position = patch.position;
      await api("/filter_presets.php", {
        method: "PATCH",
        query: { id },
        body,
      });
      await invalidate();
    },
    [invalidate],
  );

  const remove = useCallback(
    async (id: string) => {
      await api("/filter_presets.php", { method: "DELETE", query: { id } });
      await invalidate();
    },
    [invalidate],
  );

  const choose = useCallback(
    async (presetId: string | null) => {
      await api("/filter_presets.php", {
        method: "POST",
        body: { action: "choose", scope, preset_id: presetId },
      });
      await invalidate();
    },
    [scope, invalidate],
  );

  const reorder = useCallback(
    async (orderedIds: string[]) => {
      await api("/filter_presets.php", {
        method: "POST",
        body: { action: "reorder", scope, order: orderedIds },
      });
      await invalidate();
    },
    [scope, invalidate],
  );

  return { create, update, remove, choose, reorder };
}

/** Pick the preset to auto-apply on first mount. User choice > effective default. */
export function resolveInitialPreset(
  data: FilterPresetsResponse | undefined,
): FilterPreset | null {
  if (!data) return null;
  if (data.myChoice) {
    const chosen = data.presets.find((p) => p.id === data.myChoice);
    if (chosen) return chosen;
  }
  return data.effectiveDefault ?? null;
}
