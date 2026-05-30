import { createContext, useContext, useMemo, useState, useCallback, useEffect, type ReactNode } from "react";
import type { Prospect, AppUser, Contract, CalEvent } from "./types";

import { formatAmount } from "./currency";
import { api, API_ENABLED } from "./api";
import { useAuth } from "./auth";
import { fetchContracts } from "./contractsApi";
import { fetchAllPaginated } from "./paginatedFetch";

export type ActivityField = "billingStatus" | "premium" | "attachment_added" | "attachment_removed";
export type ActivityEntry = {
  id: string;
  contractId: string;
  field: ActivityField;
  previousValue: string;
  newValue: string;
  user: string;
  timestamp: string; // ISO
};

export type ImportBlockedRow = {
  row: number;
  reason: string;
  field?: string | null;
  message?: string;
  conflictId?: string;
};
export type ImportResult = {
  added: number;
  updated: number;
  skipped: number;
  ids?: string[];
  blocked?: ImportBlockedRow[];
};

export type RoleDef = {
  name: string;
  label: string;
  description: string;
  color: string;
  isSystem: boolean;
  sortOrder?: number;
};

type ErpState = {
  prospects: Prospect[];
  users: AppUser[];
  contracts: Contract[];
  activity: ActivityEntry[];
  events: CalEvent[];
  loading: boolean;
  error: string | null;
  hydrated: boolean;
  roles: RoleDef[];
  fetchRoles: () => Promise<void>;
  createRole: (r: { name: string; label: string; description?: string; color?: string }) => Promise<void>;
  updateRole: (r: { name: string; label: string; description?: string; color?: string }) => Promise<void>;
  deleteRole: (name: string, fallback: string) => Promise<void>;
  assignUserRole: (userId: string, role: string) => Promise<void>;
  // actions
  claimLead: (prospectId: string, agentUsername: string) => Promise<void> | void;
  markWon: (prospectId: string, premium?: number, partner?: string) => Promise<void> | void;
  markLost: (prospectId: string, reason?: string) => Promise<void> | void;
  updateContractBilling: (contractId: string, billingStatus: Contract["billingStatus"]) => Promise<void> | void;
  updateContractPremium: (contractId: string, premium: number) => Promise<void> | void;
  updateContract: (id: string, patch: Partial<Contract>) => Promise<void> | void;
  deleteContract: (id: string) => Promise<void> | void;
  // prospect updates
  updateProspect: (id: string, patch: Partial<Prospect>) => Promise<void> | void;
  deleteProspect: (id: string) => Promise<void> | void;
  // user CRUD
  saveUser: (u: Partial<AppUser> & { password?: string }) => Promise<void> | void;
  deleteUser: (id: string) => Promise<void> | void;
  // calendar CRUD
  saveEvent: (e: Partial<CalEvent>) => Promise<void> | void;
  deleteEvent: (id: string) => Promise<void> | void;
  // bulk imports — upsert by id, returns add/update counts
  importProspects: (rows: Partial<Prospect>[]) => Promise<ImportResult> | ImportResult;
  importContracts: (rows: Partial<Contract>[]) => Promise<ImportResult> | ImportResult;
  importUsers: (rows: Partial<AppUser>[]) => Promise<ImportResult> | ImportResult;
  // selectors
  getAgentStats: (username: string) => { handled: number; won: number; lost: number; pending: number; conversion: number };
  getContractActivity: (contractId: string) => ActivityEntry[];
  logActivity: (contractId: string, field: ActivityField, previousValue: string, newValue: string) => void;
  refresh: () => Promise<void>;
};

const ErpContext = createContext<ErpState | null>(null);

function recomputeUsers(users: AppUser[], prospects: Prospect[]): AppUser[] {
  return users.map((u) => {
    const mine = prospects.filter((p) => p.assignedTo === u.username);
    const won = mine.filter((p) => p.outcome === "won").length;
    const handled = mine.length;
    const conv = handled > 0 ? (won / handled) * 100 : 0;
    if (u.role !== "Agent" && u.role !== "Manager") return u;
    return { ...u, leadsHandled: handled, contractsWon: won, conversionRate: Number(conv.toFixed(1)) };
  });
}

function mergeImportedProspectRows(
  previous: Prospect[],
  rows: Partial<Prospect>[],
  resolvedIds: string[] = [],
): Prospect[] {
  const today = new Date().toISOString().slice(0, 10);
  const byId = new Map(previous.map((p) => [p.id, p]));

  rows.forEach((row, index) => {
    const resolvedId = String(resolvedIds[index] ?? row.id ?? `P-IMP-${Date.now()}-${index}`);
    const existing = byId.get(resolvedId);
    const next: Prospect = {
      id: resolvedId,
      civility: row.civility === "Mme" ? "Mme" : (existing?.civility ?? "M"),
      lastName: String(row.lastName ?? existing?.lastName ?? "").trim(),
      firstName: String(row.firstName ?? existing?.firstName ?? "").trim(),
      phone: String(row.phone ?? existing?.phone ?? "").trim(),
      phone2: String(row.phone2 ?? existing?.phone2 ?? "").trim(),
      ancienLigne: row.ancienLigne !== undefined ? (row.ancienLigne ? String(row.ancienLigne) : null) : (existing?.ancienLigne ?? null),
      cin: String(row.cin ?? existing?.cin ?? "").trim(),
      birthDate: row.birthDate !== undefined ? (row.birthDate ? String(row.birthDate) : null) : (existing?.birthDate ?? null),
      email: String(row.email ?? existing?.email ?? "").trim(),
      source: String(row.source ?? existing?.source ?? "Terrain"),
      status: String(row.status ?? existing?.status ?? "Nouveau"),
      assignedTo: row.assignedTo !== undefined
        ? (row.assignedTo ? String(row.assignedTo) : null)
        : (existing?.assignedTo ?? null),
      createdAt: String(row.createdAt ?? existing?.createdAt ?? today),
      city: String(row.city ?? row.gouvernorat ?? existing?.city ?? "").trim().toUpperCase(),
      address: String(row.address ?? existing?.address ?? "").trim(),
      zone: String(row.zone ?? row.delegation ?? existing?.zone ?? "").trim(),
      gouvernorat: String(row.gouvernorat ?? row.city ?? existing?.gouvernorat ?? existing?.city ?? "").trim().toUpperCase(),
      delegation: String(row.delegation ?? row.zone ?? existing?.delegation ?? existing?.zone ?? "").trim(),
      localisationXy: row.localisationXy !== undefined
        ? (row.localisationXy ? String(row.localisationXy) : null)
        : (existing?.localisationXy ?? null),
      codePostal: row.codePostal !== undefined
        ? (row.codePostal ? String(row.codePostal) : null)
        : (existing?.codePostal ?? null),
      outcome: (row.outcome ?? existing?.outcome ?? "pending") as Prospect["outcome"],
      lostReason: row.lostReason !== undefined
        ? (row.lostReason ? String(row.lostReason) : undefined)
        : existing?.lostReason,
      comment: row.comment !== undefined ? (row.comment ? String(row.comment) : undefined) : existing?.comment,
      comment2: row.comment2 !== undefined ? (row.comment2 ? String(row.comment2) : null) : (existing?.comment2 ?? null),
      checkValeur: (row.checkValeur ?? existing?.checkValeur ?? "pending") as Prospect["checkValeur"],
      converted: row.converted ?? existing?.converted ?? false,
      opportunityId: row.opportunityId !== undefined
        ? (row.opportunityId ? String(row.opportunityId) : null)
        : (existing?.opportunityId ?? null),
      typeId: row.typeId !== undefined ? (row.typeId ? String(row.typeId) : null) : (existing?.typeId ?? null),
    };

    if (!next.lastName) return;
    byId.set(resolvedId, next);
  });

  return Array.from(byId.values()).sort((a, b) => {
    const dateCmp = String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? ""));
    return dateCmp !== 0 ? dateCmp : b.id.localeCompare(a.id);
  });
}


export function ErpProvider({ children }: { children: ReactNode }) {
  const auth = (() => { try { return useAuth(); } catch { return null; } })();
  const isLogged = !!auth?.user;

  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [importedUsers, setImportedUsers] = useState<AppUser[]>([]);
  const [serverUsers, setServerUsers] = useState<AppUser[] | null>(null);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(API_ENABLED);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState<boolean>(!API_ENABLED);
  const [roles, setRoles] = useState<RoleDef[]>([
    { name: "Administrateur", label: "Administrateur", description: "Accès complet", color: "primary", isSystem: true },
    { name: "Manager", label: "Manager", description: "Pilotage d'équipe", color: "info", isSystem: false },
    { name: "Agent", label: "Agent", description: "Gestion des leads", color: "success", isSystem: false },
    { name: "Backoffice", label: "Backoffice", description: "Validation contrats", color: "warning", isSystem: false },
  ]);

  const fetchRoles = useCallback(async () => {
    if (!API_ENABLED || !isLogged) return;
    try {
      const r = await api<{ roles: RoleDef[] }>("/roles.php");
      if (Array.isArray(r.roles) && r.roles.length) setRoles(r.roles);
    } catch { /* keep defaults */ }
  }, [isLogged]);

  const createRole = useCallback(async (r: { name: string; label: string; description?: string; color?: string }) => {
    await api("/roles.php?action=create", { method: "POST", body: r });
    await fetchRoles();
  }, [fetchRoles]);

  const updateRole = useCallback(async (r: { name: string; label: string; description?: string; color?: string }) => {
    await api("/roles.php?action=update", { method: "PUT", body: r });
    await fetchRoles();
  }, [fetchRoles]);

  const deleteRole = useCallback(async (name: string, fallback: string) => {
    await api(`/roles.php?action=delete&name=${encodeURIComponent(name)}&fallback=${encodeURIComponent(fallback)}`, { method: "DELETE" });
    await fetchRoles();
  }, [fetchRoles]);

  const assignUserRole = useCallback(async (userId: string, role: string) => {
    await api("/roles.php?action=assign", { method: "POST", body: { userId, role } });
  }, []);

  const liveUsers = serverUsers;
  const users = useMemo(
    () => recomputeUsers(liveUsers ?? importedUsers, prospects),
    [liveUsers, importedUsers, prospects],
  );

  // Concurrency guard: while a refresh is already running we hand back the
  // same promise instead of starting a second wave of 5 HTTP calls. Rapid
  // successive mutations therefore coalesce into a single backend hit.
  const inflightRefresh = useMemo(() => ({ p: null as Promise<void> | null }), []);

  const loadProspectsWithFallback = useCallback(async (): Promise<Prospect[]> => {
    return fetchAllPaginated<Prospect>("/prospects.php", "prospects", {
      baseQuery: { _t: Date.now() },
    });
  }, []);

  // Granular helpers — every mutation refetches ONLY the entity it touched
  // (was: any update triggered a full 5-endpoint refresh).
  const refreshProspects = useCallback(async () => {
    if (!API_ENABLED || !isLogged) return;
    try {
      setProspects(await loadProspectsWithFallback());
    } catch (e) {
      console.warn("refreshProspects", e);
      // Surface the error so the user understands the table is stale rather
      // than thinking their data was lost (e.g. PHP OOM after a big import).
      const msg = e instanceof Error ? e.message : "Erreur inconnue";
      try {
        const { toast } = await import("sonner");
        toast.error("Impossible de recharger les prospects", { description: msg });
      } catch { /* sonner unavailable */ }
    }
  }, [isLogged, loadProspectsWithFallback]);

  const refreshContracts = useCallback(async () => {
    if (!API_ENABLED || !isLogged) return;
    try {
      setContracts(await fetchContracts());
    } catch (e) { console.warn("refreshContracts", e); }
  }, [isLogged]);

  const refreshUsers = useCallback(async () => {
    if (!API_ENABLED || !isLogged) return;
    try {
      const r = await api<{ users: AppUser[] }>("/users.php");
      setServerUsers(r.users ?? []);
    } catch (e) { console.warn("refreshUsers", e); }
  }, [isLogged]);

  const refreshEvents = useCallback(async () => {
    if (!API_ENABLED || !isLogged) return;
    try {
      const r = await api<{ events: CalEvent[] }>("/calendar.php");
      setEvents(r.events ?? []);
    } catch (e) { console.warn("refreshEvents", e); }
  }, [isLogged]);

  const refresh = useCallback(async () => {
    if (!API_ENABLED || !isLogged) return;
    if (inflightRefresh.p) return inflightRefresh.p;
    setError(null);

    const handleErr = (e: any) => {
      console.warn("ERP refresh partial failure", e);
      const msg = e?.status === 401
        ? "Votre session a expiré. Veuillez vous reconnecter."
        : e?.status === 0 || e?.message === "Failed to fetch"
        ? "Impossible de joindre le serveur. Vérifiez votre connexion."
        : e?.status >= 500
        ? "Le serveur est momentanément indisponible. Réessayez dans un instant."
        : (e?.message ?? "Une erreur est survenue lors du chargement des données.");
      setError(msg);
    };

    setLoading(true);
    let firstResolved = false;
    const markReady = () => {
      if (firstResolved) return;
      firstResolved = true;
      setHydrated(true);
      setLoading(false);
    };

    const tasks = [
      loadProspectsWithFallback()
        .then((p) => setProspects(p))
        .catch(handleErr).finally(markReady),
      fetchContracts()
        .then((contracts) => setContracts(contracts))
        .catch(handleErr).finally(markReady),
      api<{ users: AppUser[] }>("/users.php")
        .then((u) => setServerUsers(u.users ?? []))
        .catch(handleErr).finally(markReady),
      api<{ events: CalEvent[] }>("/calendar.php")
        .then((ev) => setEvents(ev.events ?? []))
        .catch(handleErr).finally(markReady),
      api<{ activity: ActivityEntry[] }>("/activity.php")
        .then((ac) => setActivity(ac.activity ?? []))
        .catch(handleErr).finally(markReady),
    ];
    const p = Promise.allSettled(tasks).then(() => {
      setLoading(false);
      setHydrated(true);
    });
    inflightRefresh.p = p;
    try { await p; } finally { inflightRefresh.p = null; }
  }, [isLogged, inflightRefresh, loadProspectsWithFallback]);


  useEffect(() => { void refresh(); void fetchRoles(); }, [refresh, fetchRoles]);

  // ---------- Local fallback helpers ----------
  const logActivityLocal = useCallback(
    (contractId: string, field: ActivityField, previousValue: string, newValue: string) => {
      setActivity((prev) => [
        {
          id: `A-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          contractId, field, previousValue, newValue,
          user: auth?.user?.username ?? "system",
          timestamp: new Date().toISOString(),
        },
        ...prev,
      ]);
    },
    [auth?.user?.username],
  );

  // ---------- Mutations ----------
  const claimLead = useCallback(async (prospectId: string, agentUsername: string) => {
    if (API_ENABLED) {
      await api("/prospects.php", { method: "POST", body: { action: "claim", id: prospectId } });
      await refreshProspects();
      return;
    }
    setProspects((prev) =>
      prev.map((p) =>
        p.id === prospectId && p.assignedTo === null
          ? { ...p, assignedTo: agentUsername, status: "A recontacter (Voir Commentaire)" }
          : p,
      ),
    );
  }, [refreshProspects]);

  const markWon = useCallback(async (prospectId: string, premium = 950, partner = "NEOLIANE") => {
    if (API_ENABLED) {
      await api("/prospects.php", { method: "POST", body: { action: "mark_won", id: prospectId, premium, partner } });
      // mark_won creates a contract → refresh both, in parallel.
      await Promise.all([refreshProspects(), refreshContracts()]);
      return;
    }
    setProspects((prev) => prev.map((p) =>
      p.id === prospectId ? { ...p, outcome: "won", status: "Vente" } : p,
    ));
    setContracts((prev) => {
      const p = prospects.find((x) => x.id === prospectId);
      if (!p) return prev;
      const today = new Date().toISOString().slice(0, 10);
      const newContract: Contract = {
        id: `C-${6000 + prev.length}`,
        lastName: p.lastName, firstName: p.firstName, city: p.city,
        partner, cabinet: "Cabinet Paris 1",
        signatureDate: today, effectiveDate: today, validationDate: null,
        premium, billingStatus: "Pré-validé",
        source: p.source, assignedTo: p.assignedTo ?? "—",
      };
      return [newContract, ...prev];
    });
  }, [refreshProspects, refreshContracts, prospects]);

  const markLost = useCallback(async (prospectId: string, reason = "Non précisé") => {
    if (API_ENABLED) {
      await api("/prospects.php", { method: "POST", body: { action: "mark_lost", id: prospectId, reason } });
      await refreshProspects();
      return;
    }
    setProspects((prev) => prev.map((p) =>
      p.id === prospectId ? { ...p, outcome: "lost", status: "Sans réponse", lostReason: reason } : p,
    ));
  }, [refreshProspects]);

  const updateContractBilling = useCallback(async (contractId: string, billingStatus: Contract["billingStatus"]) => {
    if (API_ENABLED) {
      // Optimistic UI: patch locally first so the UI reacts instantly.
      setContracts((prev) => prev.map((c) => c.id === contractId ? { ...c, billingStatus } : c));
      try {
        await api("/contracts.php", { method: "PATCH", body: { id: contractId, billingStatus } });
        await refreshContracts();
      } catch (e) { await refreshContracts(); throw e; }
      return;
    }
    setContracts((prev) => prev.map((c) => {
      if (c.id !== contractId) return c;
      if (c.billingStatus !== billingStatus) {
        logActivityLocal(contractId, "billingStatus", c.billingStatus, billingStatus);
      }
      return {
        ...c, billingStatus,
        validationDate: billingStatus === "Validé Confirmation"
          ? new Date().toISOString().slice(0, 10)
          : c.validationDate,
      };
    }));
  }, [refreshContracts, logActivityLocal]);

  const updateContractPremium = useCallback(async (contractId: string, premium: number) => {
    if (API_ENABLED) {
      setContracts((prev) => prev.map((c) => c.id === contractId ? { ...c, premium } : c));
      try {
        await api("/contracts.php", { method: "PATCH", body: { id: contractId, premium } });
        await refreshContracts();
      } catch (e) { await refreshContracts(); throw e; }
      return;
    }
    setContracts((prev) => prev.map((c) => {
      if (c.id !== contractId) return c;
      if (c.premium !== premium) {
        logActivityLocal(contractId, "premium", formatAmount(c.premium), formatAmount(premium));
      }
      return { ...c, premium };
    }));
  }, [refreshContracts, logActivityLocal]);

  const updateContract = useCallback(async (id: string, patch: Partial<Contract>) => {
    if (API_ENABLED) {
      setContracts((prev) => prev.map((c) => c.id === id ? { ...c, ...patch } : c));
      try {
        await api("/contracts.php", { method: "PATCH", body: { id, ...patch } });
        await refreshContracts();
      } catch (e) { await refreshContracts(); throw e; }
      return;
    }
    setContracts((prev) => prev.map((c) => c.id === id ? { ...c, ...patch } : c));
  }, [refreshContracts]);

  const deleteContract = useCallback(async (id: string) => {
    if (API_ENABLED) {
      // Optimistic remove
      setContracts((prev) => prev.filter((c) => c.id !== id));
      try {
        await api(`/contracts.php?id=${encodeURIComponent(id)}`, { method: "DELETE" });
        await refreshContracts();
      } catch (e) { await refreshContracts(); throw e; }
      return;
    }
    setContracts((prev) => prev.filter((c) => c.id !== id));
  }, [refreshContracts]);

  const updateProspect = useCallback(async (id: string, patch: Partial<Prospect>) => {
    if (API_ENABLED) {
      setProspects((prev) => prev.map((p) => p.id === id ? { ...p, ...patch } : p));
      try {
        await api("/prospects.php", { method: "PATCH", body: { id, ...patch } });
        await refreshProspects();
      } catch (e) { await refreshProspects(); throw e; }
      return;
    }
    setProspects((prev) => prev.map((p) => p.id === id ? { ...p, ...patch } : p));
  }, [refreshProspects]);

  const deleteProspect = useCallback(async (id: string) => {
    if (API_ENABLED) {
      setProspects((prev) => prev.filter((p) => p.id !== id));
      try {
        await api(`/prospects.php?id=${encodeURIComponent(id)}`, { method: "DELETE" });
        await refreshProspects();
      } catch (e) { await refreshProspects(); throw e; }
      return;
    }
    setProspects((prev) => prev.filter((p) => p.id !== id));
  }, [refreshProspects]);


  const saveUser = useCallback(async (u: Partial<AppUser> & { password?: string }) => {
    if (API_ENABLED) {
      await api("/users.php", { method: "POST", body: u });
      await refreshUsers();
      return;
    }
    setImportedUsers((prev) => {
      const exists = prev.findIndex((x) => x.username === u.username);
      const next: AppUser = {
        id: u.id ?? `U-${Date.now()}`,
        username: u.username ?? "",
        fullName: u.fullName ?? "",
        email: u.email ?? "",
        role: (u.role ?? "Agent") as AppUser["role"],
        team: u.team ?? "Lead-Actifs",
        active: u.active ?? true,
        contractsWon: u.contractsWon ?? 0,
        leadsHandled: u.leadsHandled ?? 0,
        conversionRate: u.conversionRate ?? 0,
      };
      if (exists >= 0) { const c = [...prev]; c[exists] = next; return c; }
      return [...prev, next];
    });
  }, [refreshUsers]);

  const deleteUser = useCallback(async (id: string) => {
    if (API_ENABLED) {
      await api(`/users.php?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      await refreshUsers();
      return;
    }
    setImportedUsers((prev) => prev.filter((u) => u.id !== id));
  }, [refreshUsers]);

  const saveEvent = useCallback(async (e: Partial<CalEvent>) => {
    const currentUser = auth?.user?.username ?? "system";
    const payload: Partial<CalEvent> = { ...e, agent: e.agent ?? currentUser };
    if (API_ENABLED) {
      if (payload.id && events.some((x) => x.id === payload.id)) {
        await api("/calendar.php", { method: "PUT", body: payload });
      } else {
        await api("/calendar.php", { method: "POST", body: payload });
      }
      await refreshEvents();
      return;
    }
    setEvents((prev) => {
      if (payload.id && prev.some((x) => x.id === payload.id)) {
        return prev.map((x) => x.id === payload.id ? { ...x, ...payload } as CalEvent : x);
      }
      return [...prev, {
        id: payload.id ?? `E-${Date.now()}`,
        title: payload.title ?? "Sans titre",
        date: payload.date ?? new Date().toISOString().slice(0, 10),
        time: payload.time ?? "09:00",
        type: (payload.type ?? "rdv") as CalEvent["type"],
        agent: payload.agent ?? currentUser,
      }];
    });
  }, [refreshEvents, events, auth?.user?.username]);

  const deleteEvent = useCallback(async (id: string) => {
    if (API_ENABLED) {
      await api(`/calendar.php?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      await refreshEvents();
      return;
    }
    setEvents((prev) => prev.filter((e) => e.id !== id));
  }, [refreshEvents]);

  // ---------- Selectors ----------
  const getContractActivity = useCallback(
    (contractId: string) => activity.filter((a) => a.contractId === contractId),
    [activity],
  );

  const getAgentStats = useCallback((username: string) => {
    const mine = prospects.filter((p) => p.assignedTo === username);
    const won = mine.filter((p) => p.outcome === "won").length;
    const lost = mine.filter((p) => p.outcome === "lost").length;
    const pending = mine.filter((p) => p.outcome === "pending").length;
    const handled = mine.length;
    const conversion = handled ? (won / handled) * 100 : 0;
    return { handled, won, lost, pending, conversion };
  }, [prospects]);

  // ---------- Bulk imports ----------
  const importProspects = useCallback(async (rows: Partial<Prospect>[]): Promise<ImportResult> => {
    if (API_ENABLED) {
      const r = await api<ImportResult>("/prospects.php", { method: "POST", body: { rows } });
      setProspects((prev) => mergeImportedProspectRows(prev, rows, r.ids ?? []));
      return {
        added: r.added,
        updated: r.updated,
        skipped: r.skipped,
        ids: r.ids ?? [],
        blocked: r.blocked,
      };
    }
    let skipped = 0;
    for (const row of rows) {
      if (!String(row.lastName ?? "").trim()) skipped++;
    }
    setProspects((prev) => mergeImportedProspectRows(prev, rows));
    const nextIds = rows
      .filter((row) => String(row.lastName ?? "").trim())
      .map((row, index) => String(row.id ?? `P-IMP-${Date.now()}-${index}`));
    const existingIds = new Set(prospects.map((p) => p.id));
    const updated = nextIds.filter((id) => existingIds.has(id)).length;
    const added = nextIds.length - updated;
    return { added, updated, skipped };
  }, [prospects, refreshProspects]);

  const importContracts = useCallback(async (rows: Partial<Contract>[]): Promise<ImportResult> => {
    if (API_ENABLED) {
      const r = await api<ImportResult>("/contracts.php", { method: "POST", body: { rows } });
      await refresh();
      return { added: r.added, updated: r.updated, skipped: r.skipped };
    }
    const today = new Date().toISOString().slice(0, 10);
    let added = 0, updated = 0, skipped = 0;
    setContracts((prev) => {
      const byId = new Map(prev.map((c) => [c.id, c]));
      for (const r of rows) {
        const lastName = String(r.lastName ?? "").trim();
        if (!lastName) { skipped++; continue; }
        const id = String(r.id ?? `C-IMP-${Date.now()}-${added + updated}`);
        const existing = byId.get(id);
        const next: Contract = {
          id, lastName,
          firstName: String(r.firstName ?? existing?.firstName ?? "").trim(),
          city: String(r.city ?? existing?.city ?? "").toUpperCase(),
          partner: String(r.partner ?? existing?.partner ?? "NEOLIANE"),
          cabinet: String(r.cabinet ?? existing?.cabinet ?? "Cabinet Paris 1"),
          signatureDate: String(r.signatureDate ?? existing?.signatureDate ?? today),
          effectiveDate: String(r.effectiveDate ?? existing?.effectiveDate ?? today),
          validationDate: r.validationDate !== undefined ? (r.validationDate ? String(r.validationDate) : null) : (existing?.validationDate ?? null),
          premium: Number(r.premium ?? existing?.premium ?? 0) || 0,
          billingStatus: (r.billingStatus ?? existing?.billingStatus ?? "Pré-validé") as Contract["billingStatus"],
          source: String(r.source ?? existing?.source ?? "Web"),
          assignedTo: String(r.assignedTo ?? existing?.assignedTo ?? "—"),
        };
        byId.set(id, next);
        if (existing) updated++; else added++;
      }
      return Array.from(byId.values());
    });
    return { added, updated, skipped };
  }, [refresh]);

  const importUsers = useCallback(async (rows: Partial<AppUser>[]): Promise<ImportResult> => {
    // Normalize rows coming from the client's `personel.xlsx`-style file:
    //  - derive a username from fullName / email when missing (backend requires one)
    //  - convert Date objects (from XLSX) to YYYY-MM-DD strings the backend expects
    const slugify = (s: string) =>
      s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
       .replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "").slice(0, 60) || "user";
    const toDate = (v: unknown): unknown => {
      if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
      return v;
    };
    const DATE_KEYS = ["birthDate","hireDate","contractStart","contractEnd","renewalStart","renewalEnd"] as const;
    const usedNames = new Set<string>();
    const normalized = rows.map((r) => {
      const out: Record<string, unknown> = { ...r };
      for (const k of DATE_KEYS) if (out[k] !== undefined) out[k] = toDate(out[k]);
      let username = String(out.username ?? "").trim();
      if (!username) {
        const base = String(out.fullName ?? out.email ?? "").trim();
        const email = String(out.email ?? "").trim();
        username = slugify(email.includes("@") ? email.split("@")[0] : base);
      }
      let candidate = username; let i = 1;
      while (usedNames.has(candidate)) { candidate = `${username}.${++i}`; }
      usedNames.add(candidate);
      out.username = candidate;
      return out as Partial<AppUser>;
    });
    if (API_ENABLED) {
      const r = await api<ImportResult>("/users.php", { method: "POST", body: { rows: normalized } });
      await refresh();
      return { added: r.added, updated: r.updated, skipped: r.skipped };
    }
    let added = 0, updated = 0, skipped = 0;
    const allCurrent = [...importedUsers];
    const byUsername = new Map(allCurrent.map((u) => [u.username, u]));
    const newOnes: AppUser[] = [];
    const patches = new Map<string, AppUser>();
    for (const r of rows) {
      const username = String(r.username ?? "").trim();
      const fullName = String(r.fullName ?? "").trim();
      if (!username || !fullName) { skipped++; continue; }
      const role = (["Administrateur", "Manager", "Agent", "Backoffice"].includes(String(r.role))
        ? r.role : "Agent") as AppUser["role"];
      const existing = byUsername.get(username);
      const next: AppUser = {
        id: String(r.id ?? existing?.id ?? `U-IMP-${Date.now()}-${added + updated}`),
        username, fullName,
        email: String(r.email ?? existing?.email ?? ""),
        role,
        team: String(r.team ?? existing?.team ?? "Lead-Actifs"),
        active: r.active === false ? false : (existing?.active ?? true),
        contractsWon: Number(r.contractsWon ?? existing?.contractsWon ?? 0) || 0,
        leadsHandled: Number(r.leadsHandled ?? existing?.leadsHandled ?? 0) || 0,
        conversionRate: Number(r.conversionRate ?? existing?.conversionRate ?? 0) || 0,
      };
      if (existing) { patches.set(username, next); updated++; }
      else { newOnes.push(next); added++; }
    }
    setImportedUsers((prev) => {
      const merged = [...prev];
      for (let i = 0; i < merged.length; i++) {
        const p = patches.get(merged[i].username);
        if (p) merged[i] = p;
      }
      return [...merged, ...newOnes];
    });
    return { added, updated, skipped };
  }, [refresh, importedUsers]);

  const value: ErpState = {
    prospects, users, contracts, activity, events, loading, error, hydrated,
    roles, fetchRoles, createRole, updateRole, deleteRole, assignUserRole,
    claimLead, markWon, markLost,
    updateContractBilling, updateContractPremium, updateContract, deleteContract,
    updateProspect, deleteProspect,
    saveUser, deleteUser,
    saveEvent, deleteEvent,
    importProspects, importContracts, importUsers,
    getAgentStats, getContractActivity, logActivity: logActivityLocal, refresh,
  };
  return <ErpContext.Provider value={value}>{children}</ErpContext.Provider>;
}

export function useErp() {
  const ctx = useContext(ErpContext);
  if (!ctx) throw new Error("useErp must be used within ErpProvider");
  return ctx;
}

export function useDashboardStats() {
  const { prospects, contracts } = useErp();
  const [server, setServer] = useState<Partial<{
    totalLeads: number; newLeadsToday: number; contractsThisMonth: number;
    contractsToday: number; conversionRate: number; revenueThisMonth: number;
    wonLeads: number; lostLeads: number; pendingLeads: number;
  }> | null>(null);

  useEffect(() => {
    let cancel = false;
    if (!API_ENABLED) return;
    api<{ stats: typeof server }>("/dashboard.php")
      .then((r) => { if (!cancel && r?.stats) setServer(r.stats as any); })
      .catch(() => { /* fall back to client-computed */ });
    return () => { cancel = true; };
  }, [prospects.length, contracts.length]);

  return useMemo(() => {
    const total = prospects.length;
    const won = prospects.filter((p) => p.outcome === "won").length;
    const lost = prospects.filter((p) => p.outcome === "lost").length;
    const pending = prospects.filter((p) => p.outcome === "pending").length;
    const unclaimed = prospects.filter((p) => p.assignedTo === null).length;
    const conv = total ? (won / total) * 100 : 0;
    const today = new Date().toISOString().slice(0, 10);
    const contractsToday = contracts.filter((c) => c.signatureDate === today).length;
    const local = {
      totalLeads: total,
      newLeadsToday: unclaimed,
      contractsThisMonth: contracts.length,
      contractsToday,
      conversionRate: Number(conv.toFixed(1)),
      revenueThisMonth: contracts.reduce((s, c) => s + c.premium, 0),
      wonLeads: won,
      lostLeads: lost,
      pendingLeads: pending,
    };
    return { ...local, ...(server ?? {}) };
  }, [prospects, contracts, server]);
}
