// CRM MVP — Tableau de bord recentré sur les KPI du cahier des charges §4.4 :
// total leads, répartition par statut, ventes, performance par agent (taux conv.),
// temps moyen de traitement, leads en attente, + tâches du jour de l'utilisateur.
import { createFileRoute, Link } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import {
  Users, Trophy, Clock, Inbox, Sparkles, BellRing, Target,
  ClipboardList, CheckSquare, UserPlus, Layers, Building2, Hourglass,
} from "lucide-react";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  ResponsiveContainer, Tooltip, PieChart, Pie, Cell, Legend,
} from "recharts";
import { useErp } from "@/lib/erpStore";
import { useAuth } from "@/lib/auth";
import { roleLabel, isAgentRole, AGENT_ROLES } from "@/lib/roleLabels";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, API_ENABLED } from "@/lib/api";
import { Search, ArrowUpDown, IdCard, Save, RotateCcw, Check, Bookmark, Plus, Trash2, Loader2, CloudOff } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Tableau de bord — CRM" },
      { name: "description", content: "Vue d'ensemble: leads, conversion et performance des commerciaux." },
    ],
  }),
  component: Dashboard,
});

const STATUS_COLORS: Record<string, string> = {
  "Nouveau":  "var(--primary)",
  "En cours": "var(--chart-3)",
  "Rappel":   "var(--chart-4)",
  "Vendu":    "oklch(0.65 0.16 155)",
  "Refus":    "oklch(0.6 0.21 15)",
};

type DashStats = {
  totalLeads: number;
  soldLeads: number;
  newLeads: number;
  inProgressLeads: number;
  callbackLeads: number;
  refusedLeads: number;
  mvpConversionRate: number;
  avgHandlingDays: number;
};

type Task = {
  id: string; title: string; dueDate: string | null;
  priority: "low" | "normal" | "high"; status: string;
  relatedEntity: string | null; relatedId: string | null;
};

function Dashboard() {
  const { prospects, users, contracts } = useErp();
  const { user } = useAuth();
  const myUsername = user?.username ?? "";
  const isAgent = isAgentRole(user?.role);
  const firstName = user?.fullName?.split(" ")[0] ?? user?.username ?? "Utilisateur";
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const monthStr = todayStr.slice(0, 7);
  const dateLabel = today.toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  const visibleProspects = useMemo(
    () => isAgent ? prospects.filter((p) => p.assignedTo === myUsername) : prospects,
    [prospects, isAgent, myUsername],
  );

  // Fetch opportunities for KPI counts
  const [opportunities, setOpportunities] = useState<Array<{ createdAt: string; assignedTo: string | null }>>([]);
  useEffect(() => {
    if (!API_ENABLED) return;
    api<{ opportunities: Array<{ createdAt: string; assignedTo: string | null }> }>("/opportunities.php")
      .then((r) => setOpportunities(r.opportunities ?? []))
      .catch(() => {});
  }, []);

  const visibleOpps = useMemo(
    () => isAgent ? opportunities.filter((o) => o.assignedTo === myUsername) : opportunities,
    [opportunities, isAgent, myUsername],
  );
  const visibleContracts = useMemo(
    () => isAgent ? contracts.filter((c: any) => c.assignedTo === myUsername || c.agent === myUsername) : contracts,
    [contracts, isAgent, myUsername],
  );

  const isWonStatus = (s: string) => s === "Vendu" || s === "Ok" || s === "ok";
  const prospectsWonToday = visibleProspects.filter((p) => isWonStatus(p.status) && (p.createdAt ?? "").slice(0, 10) === todayStr).length;
  const prospectsWonMonth = visibleProspects.filter((p) => isWonStatus(p.status) && (p.createdAt ?? "").slice(0, 7) === monthStr).length;
  const oppsToday = visibleOpps.filter((o) => (o.createdAt ?? "").slice(0, 10) === todayStr).length;
  const oppsMonth = visibleOpps.filter((o) => (o.createdAt ?? "").slice(0, 7) === monthStr).length;
  const contractsMonth = visibleContracts.filter((c: any) => (c.signatureDate ?? c.createdAt ?? "").slice(0, 7) === monthStr).length;
  const contractsToday = visibleContracts.filter((c: any) => (c.signatureDate ?? c.createdAt ?? "").slice(0, 10) === todayStr).length;

  // CRM MVP §4.4 — filtres par zone géographique + agence (équipe de l'agent assigné)
  const [zoneFilter, setZoneFilter] = useState<string>("__all__");
  const [agencyFilter, setAgencyFilter] = useState<string>("__all__");
  const [search, setSearch] = useState<string>("");
  const [cinSearch, setCinSearch] = useState<string>("");
  const [sortBy, setSortBy] = useState<string>("recent"); // recent | name | status | city
  const [prefsLoaded, setPrefsLoaded] = useState<boolean>(false);
  const [savedAt, setSavedAt] = useState<number>(0);
  const [saveState, setSaveState] = useState<"idle" | "pending" | "saving" | "saved" | "error">("idle");

  // Debounce intelligent : on attend que la frappe se stabilise.
  // - Délai plus long quand le terme est court (1-2 caractères → bruyant)
  // - Délai court quand on tape vite plusieurs caractères stables.
  // Les valeurs `*Debounced` sont utilisées pour le filtrage ET la persistance,
  // ce qui évite tout recalcul/sauvegarde tant que l'utilisateur tape.
  const [searchDebounced, setSearchDebounced] = useState<string>("");
  const [cinDebounced, setCinDebounced] = useState<string>("");
  useEffect(() => {
    const v = search.trim();
    const delay = v.length === 0 ? 0 : v.length < 3 ? 500 : 300;
    const t = setTimeout(() => setSearchDebounced(v), delay);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => {
    const v = cinSearch.trim();
    // CIN: typiquement 6-10 chars → on attend une saisie significative
    const delay = v.length === 0 ? 0 : v.length < 4 ? 600 : 350;
    const t = setTimeout(() => setCinDebounced(v), delay);
    return () => clearTimeout(t);
  }, [cinSearch]);

  // Vues sauvegardées (multi-presets) par utilisateur
  type SavedView = { id: string; name: string; filters: { zone: string; agency: string; search: string; cin: string; sortBy: string } };
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [activeViewId, setActiveViewId] = useState<string>("");
  const [showSaveDialog, setShowSaveDialog] = useState<boolean>(false);
  const [newViewName, setNewViewName] = useState<string>("");

  // Charge les vues sauvegardées
  useEffect(() => {
    if (!API_ENABLED || !myUsername) return;
    api<{ value: any }>("/settings.php", { query: { scope: myUsername, key: "dashboard_views" } })
      .then((r) => {
        if (Array.isArray(r?.value)) setSavedViews(r.value as SavedView[]);
      })
      .catch(() => {});
  }, [myUsername]);

  const persistViews = (views: SavedView[]) => {
    setSavedViews(views);
    if (!API_ENABLED || !myUsername) return;
    api("/settings.php", {
      method: "PUT",
      body: { scope: myUsername, key: "dashboard_views", value: views },
    }).catch(() => {});
  };

  const applyView = (v: SavedView) => {
    setZoneFilter(v.filters.zone);
    setAgencyFilter(v.filters.agency);
    setSearch(v.filters.search);
    setCinSearch(v.filters.cin);
    setSortBy(v.filters.sortBy);
    setActiveViewId(v.id);
  };

  const saveCurrentAsView = () => {
    const name = newViewName.trim();
    if (!name) return;
    const v: SavedView = {
      id: `v_${Date.now().toString(36)}`,
      name: name.slice(0, 60),
      filters: { zone: zoneFilter, agency: agencyFilter, search, cin: cinSearch, sortBy },
    };
    persistViews([...savedViews, v]);
    setActiveViewId(v.id);
    setNewViewName("");
    setShowSaveDialog(false);
  };

  const deleteView = (id: string) => {
    persistViews(savedViews.filter((v) => v.id !== id));
    if (activeViewId === id) setActiveViewId("");
  };

  // Charge les filtres sauvegardés de l'utilisateur (scope = username)
  useEffect(() => {
    if (!API_ENABLED || !myUsername) { setPrefsLoaded(true); return; }
    api<{ value: any }>("/settings.php", { query: { scope: myUsername, key: "dashboard_filters" } })
      .then((r) => {
        const v = r?.value;
        if (v && typeof v === "object") {
          if (typeof v.zone === "string") setZoneFilter(v.zone);
          if (typeof v.agency === "string") setAgencyFilter(v.agency);
          if (typeof v.search === "string") setSearch(v.search);
          if (typeof v.cin === "string") setCinSearch(v.cin);
          if (typeof v.sortBy === "string") setSortBy(v.sortBy);
        }
      })
      .catch(() => {})
      .finally(() => setPrefsLoaded(true));
  }, [myUsername]);

  // Sauvegarde automatique : déclenchée uniquement par les valeurs déjà
  // debouncées (pas par chaque touche), et déduplique le payload pour éviter
  // les PUT identiques (ex: même filtre rechargé via une vue).
  const lastSavedRef = useRef<string>("");
  useEffect(() => {
    if (!API_ENABLED || !prefsLoaded || !myUsername) return;
    const value = {
      zone: zoneFilter, agency: agencyFilter,
      search: searchDebounced, cin: cinDebounced, sortBy,
    };
    const payload = JSON.stringify(value);
    if (payload === lastSavedRef.current) return;
    setSaveState("pending");
    const t = setTimeout(() => {
      lastSavedRef.current = payload;
      setSaveState("saving");
      api("/settings.php", {
        method: "PUT",
        body: { scope: myUsername, key: "dashboard_filters", value },
      })
        .then(() => { setSavedAt(Date.now()); setSaveState("saved"); })
        .catch(() => setSaveState("error"));
    }, 400);
    return () => clearTimeout(t);
  }, [prefsLoaded, myUsername, zoneFilter, agencyFilter, searchDebounced, cinDebounced, sortBy]);

  const resetFilters = () => {
    setZoneFilter("__all__"); setAgencyFilter("__all__");
    setSearch(""); setCinSearch(""); setSortBy("recent");
    setActiveViewId("");
  };

  // Map username -> team ("agence")
  const userTeamByUsername = useMemo(() => {
    const m = new Map<string, string>();
    users.forEach((u) => { if (u.username) m.set(u.username, u.team || ""); });
    return m;
  }, [users]);

  const zoneOptions = useMemo(() => {
    const set = new Set<string>();
    visibleProspects.forEach((p) => { if (p.zone) set.add(p.zone); });
    return Array.from(set).sort();
  }, [visibleProspects]);

  const agencyOptions = useMemo(() => {
    const set = new Set<string>();
    users.forEach((u) => { if (u.team) set.add(u.team); });
    return Array.from(set).sort();
  }, [users]);

  const filteredProspects = useMemo(() => {
    const cinQ = cinDebounced.toLowerCase();
    return visibleProspects.filter((p) => {
      if (zoneFilter !== "__all__" && p.zone !== zoneFilter) return false;
      if (agencyFilter !== "__all__") {
        const team = p.assignedTo ? userTeamByUsername.get(p.assignedTo) ?? "" : "";
        if (team !== agencyFilter) return false;
      }
      if (cinQ && !(p.cin || "").toLowerCase().includes(cinQ)) return false;
      return true;
    });
  }, [visibleProspects, zoneFilter, agencyFilter, cinDebounced, userTeamByUsername]);

  // Real CRM lexicon — see LEAD_STATUSES in src/lib/types.ts. We classify
  // every status into 3 outcome buckets so the cards aren't fooled by status
  // names that don't match the legacy {Nouveau, En cours, Rappel, Vendu, Refus}
  // set (which left 31k+ leads unaccounted for).
  const isWonStatusFn  = (s?: string | null) => /^(vendu|ok)$/i.test((s ?? "").trim());
  const isLostStatusFn = (s?: string | null) => /^(refus|refuse|pas\s*int|pas\s*intersse|déjà\s*conn|deja\s*conn|autre|autr\s*dde)/i.test((s ?? "").trim());
  const isPendingStatusFn = (s?: string | null) => {
    const v = (s ?? "").trim();
    if (!v) return true; // empty status = brand-new lead
    return !isWonStatusFn(v) && !isLostStatusFn(v);
  };

  // Répartition par statut — agrège tous les statuts non-canoniques en buckets.
  const statusBreakdown = useMemo(() => {
    let won = 0, lost = 0, pending = 0;
    filteredProspects.forEach((p) => {
      if (isWonStatusFn(p.status)) won++;
      else if (isLostStatusFn(p.status)) lost++;
      else pending++;
    });
    return [
      { status: "En attente", count: pending },
      { status: "Vendu", count: won },
      { status: "Refus", count: lost },
    ];
  }, [filteredProspects]);

  const totalLeads = filteredProspects.length;
  const soldLeads = statusBreakdown.find((s) => s.status === "Vendu")?.count ?? 0;
  const pendingLeads = statusBreakdown.find((s) => s.status === "En attente")?.count ?? 0;
  // Compat: alias historiques utilisés ailleurs dans la page.
  const newLeads = pendingLeads;
  const callbackLeads = filteredProspects.filter((p) => /rappel/i.test(p.status ?? "")).length;
  const inProgressLeads = filteredProspects.filter((p) => /^(en\s*cours|att|ing|nrp|pas\s*de\s*rep)/i.test((p.status ?? "").trim())).length;
  // « En file d'attente » = leads non attribués (cohérent avec /dispatch).
  const queueLeads = filteredProspects.filter((p) => !p.assignedTo).length;
  const conversionRate = totalLeads > 0 ? Math.round((soldLeads / totalLeads) * 1000) / 10 : 0;

  // Prospects « non traités et non convertis » : pending bucket + jamais converti
  // + ni opportunité ni contrat lié. Couvre maintenant TOUTES les variantes de
  // statut (Att cin, Nrp, Pas de rep, Ing, vide…), plus juste "Nouveau".
  const untouchedProspects = useMemo(() => {
    const now = Date.now();
    return filteredProspects
      .filter((p) => isPendingStatusFn(p.status) && !p.converted && !p.opportunityId)
      .map((p) => {
        const t = p.createdAt ? new Date(p.createdAt).getTime() : now;
        const ageDays = Number.isFinite(t) ? Math.max(0, Math.floor((now - t) / 86400000)) : 0;
        return { ...p, ageDays };
      })
      .sort((a, b) => b.ageDays - a.ageDays);
  }, [filteredProspects]);
  const untouchedCount = untouchedProspects.length;
  const untouchedStale = untouchedProspects.filter((p) => p.ageDays >= 7).length;
  const untouchedUnassigned = untouchedProspects.filter((p) => !p.assignedTo).length;

  // KPI serveur (temps moyen de traitement global, fallback)
  const [serverStats, setServerStats] = useState<Partial<DashStats>>({});
  useEffect(() => {
    if (!API_ENABLED) return;
    api<{ stats: DashStats }>("/dashboard.php")
      .then((r) => setServerStats(r.stats ?? {}))
      .catch(() => {});
  }, [totalLeads]);

  // Temps moyen de traitement (jours) calculé localement pour refléter les filtres :
  // moyenne des jours écoulés depuis la création pour les leads dont le statut n'est plus "Nouveau".
  const localAvgHandlingDays = useMemo(() => {
    const handled = filteredProspects.filter((p) => p.status && p.status !== "Nouveau" && p.createdAt);
    if (handled.length === 0) return null;
    const now = Date.now();
    const sum = handled.reduce((acc, p) => {
      const t = new Date(p.createdAt).getTime();
      if (Number.isNaN(t)) return acc;
      return acc + Math.max(0, (now - t) / 86400000);
    }, 0);
    return Math.round((sum / handled.length) * 10) / 10;
  }, [filteredProspects]);
  const isFiltered = zoneFilter !== "__all__" || agencyFilter !== "__all__";
  const avgHandlingDisplay = isFiltered
    ? (localAvgHandlingDays ?? 0)
    : (serverStats.avgHandlingDays ?? localAvgHandlingDays ?? 0);

  // Performance par agent — respecte filtres Zone/Agence + recherche + tri
  const agentPerf = useMemo(() => {
    const q = searchDebounced.toLowerCase();
    let agents = users.filter((u) => AGENT_ROLES.has(u.role) || u.role === "Manager");
    if (agencyFilter !== "__all__") agents = agents.filter((a) => (a.team || "") === agencyFilter);
    if (q) agents = agents.filter((a) =>
      (a.fullName || "").toLowerCase().includes(q) ||
      (a.username || "").toLowerCase().includes(q) ||
      (a.team || "").toLowerCase().includes(q),
    );
    const rows = agents.map((a) => {
      const leads = filteredProspects.filter((p) => p.assignedTo === a.username);
      const sold = leads.filter((p) => p.status === "Vendu").length;
      const handled = leads.filter((p) => p.status !== "Nouveau").length;
      const rate = leads.length > 0 ? Math.round((sold / leads.length) * 1000) / 10 : 0;
      return { ...a, leadsCount: leads.length, handled, sold, rate };
    });
    rows.sort((x, y) => {
      if (sortBy === "name") return (x.fullName || x.username).localeCompare(y.fullName || y.username);
      if (sortBy === "rate") return y.rate - x.rate;
      if (sortBy === "leads") return y.leadsCount - x.leadsCount;
      return y.sold - x.sold; // default: ventes
    });
    return rows.slice(0, 6);
  }, [users, filteredProspects, agencyFilter, searchDebounced, sortBy]);
  const maxSold = agentPerf[0]?.sold || 1;

  // Mes tâches/relances du jour (échéance ≤ aujourd'hui, status != done)
  const [todayTasks, setTodayTasks] = useState<Task[]>([]);
  const [leadsToProcess, setLeadsToProcess] = useState<typeof visibleProspects>([]);
  useEffect(() => {
    if (!API_ENABLED) return;
    api<{ tasks: Task[] }>("/tasks.php", { query: { mine: "1" } })
      .then((r) => {
        const items = (r.tasks ?? []).filter(
          (t) => t.status !== "done" && t.status !== "cancelled" && t.dueDate && t.dueDate <= todayStr,
        );
        setTodayTasks(items);
      })
      .catch(() => {});
  }, [todayStr, myUsername]);

  useEffect(() => {
    const q = searchDebounced.toLowerCase();
    let list = filteredProspects.filter((p) => p.status === "Nouveau" || p.status === "En cours");
    if (q) list = list.filter((p) =>
      `${p.firstName} ${p.lastName}`.toLowerCase().includes(q) ||
      (p.phone || "").toLowerCase().includes(q) ||
      (p.phone2 || "").toLowerCase().includes(q) ||
      (p.city || "").toLowerCase().includes(q) ||
      (p.zone || "").toLowerCase().includes(q) ||
      (p.cin || "").toLowerCase().includes(q),
    );
    list = [...list].sort((a, b) => {
      if (sortBy === "name") return `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`);
      if (sortBy === "status") return (a.status || "").localeCompare(b.status || "");
      if (sortBy === "city") return (a.city || "").localeCompare(b.city || "");
      // recent (default)
      return (b.createdAt || "").localeCompare(a.createdAt || "");
    });
    setLeadsToProcess(list.slice(0, 6));
  }, [filteredProspects, searchDebounced, sortBy]);

  const isEmpty = totalLeads === 0;

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Greeting */}
        <div className="flex flex-col gap-1">
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Tableau de bord</div>
          <h1 className="text-3xl md:text-[32px] font-semibold tracking-tight">
            Bonjour, <span className="text-primary">{firstName}</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            {totalLeads.toLocaleString("fr-FR")} lead(s) au total · {queueLeads.toLocaleString("fr-FR")} non attribué(s) · {soldLeads.toLocaleString("fr-FR")} vente(s) · {dateLabel}
          </p>
        </div>

        {/* Hero KPI cards */}
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          <HeroKpi
            label="Prospects gagnés aujourd'hui"
            value={prospectsWonToday}
            icon={<Trophy className="h-5 w-5" />}
            gradient="linear-gradient(135deg, oklch(0.55 0.16 152), oklch(0.70 0.15 155))"
          />
          <HeroKpi
            label="Prospects gagnés ce mois"
            value={prospectsWonMonth}
            icon={<Trophy className="h-5 w-5" />}
            gradient="linear-gradient(135deg, oklch(0.50 0.18 145), oklch(0.62 0.17 160))"
          />
          <HeroKpi
            label="Opportunités aujourd'hui"
            value={oppsToday}
            icon={<Target className="h-5 w-5" />}
            gradient="linear-gradient(135deg, oklch(0.55 0.20 255), oklch(0.68 0.16 245))"
          />
          <HeroKpi
            label="Opportunités ce mois"
            value={oppsMonth}
            icon={<Target className="h-5 w-5" />}
            gradient="linear-gradient(135deg, oklch(0.50 0.20 270), oklch(0.62 0.18 250))"
          />
          <HeroKpi
            label="Contrats aujourd'hui"
            value={contractsToday}
            icon={<ClipboardList className="h-5 w-5" />}
            gradient="linear-gradient(135deg, oklch(0.58 0.18 25), oklch(0.72 0.16 40))"
          />
          <HeroKpi
            label="Contrats ce mois"
            value={contractsMonth}
            icon={<ClipboardList className="h-5 w-5" />}
            gradient="linear-gradient(135deg, oklch(0.55 0.18 35), oklch(0.70 0.16 50))"
          />
        </div>

        {/* Compact filter bar */}
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card/50 p-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher lead, agent…"
              className="h-8 w-[200px] pl-7 text-xs rounded-md bg-background"
            />
          </div>
          <div className="relative">
            <IdCard className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={cinSearch}
              onChange={(e) => setCinSearch(e.target.value.toUpperCase())}
              placeholder="CIN"
              maxLength={20}
              className="h-8 w-[120px] pl-7 text-xs rounded-md bg-background uppercase tracking-wider"
            />
          </div>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="h-8 w-[150px] text-xs rounded-md bg-background">
              <span className="inline-flex items-center gap-1.5">
                <ArrowUpDown className="h-3.5 w-3.5 opacity-70" />
                <SelectValue placeholder="Trier" />
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Plus récents</SelectItem>
              <SelectItem value="name">Nom (A-Z)</SelectItem>
              <SelectItem value="status">Statut</SelectItem>
              <SelectItem value="city">Ville</SelectItem>
              <SelectItem value="rate">Taux conv. (agent)</SelectItem>
              <SelectItem value="leads">Nb leads (agent)</SelectItem>
            </SelectContent>
          </Select>
          {zoneOptions.length > 0 && (
            <Select value={zoneFilter} onValueChange={setZoneFilter}>
              <SelectTrigger className="h-8 w-[150px] text-xs rounded-md bg-background">
                <SelectValue placeholder="Zone" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Toutes les zones</SelectItem>
                {zoneOptions.map((z) => (
                  <SelectItem key={z} value={z}>{z}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {agencyOptions.length > 0 && (
            <Select value={agencyFilter} onValueChange={setAgencyFilter}>
              <SelectTrigger className="h-8 w-[160px] text-xs rounded-md bg-background">
                <span className="inline-flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5 opacity-70" />
                  <SelectValue placeholder="Agence" />
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Toutes les agences</SelectItem>
                {agencyOptions.map((a) => (
                  <SelectItem key={a} value={a}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <button
            type="button"
            onClick={resetFilters}
            title="Réinitialiser"
            className="inline-flex items-center gap-1 rounded-md bg-background border border-border px-2.5 py-1.5 text-[11px] hover:bg-accent"
          >
            <RotateCcw className="h-3 w-3" />Reset
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                title="Vues sauvegardées"
                className="inline-flex items-center gap-1 rounded-md bg-background border border-border px-2.5 py-1.5 text-[11px] hover:bg-accent"
              >
                <Bookmark className="h-3 w-3" />
                {activeViewId
                  ? (savedViews.find((v) => v.id === activeViewId)?.name ?? "Vues")
                  : `Vues${savedViews.length ? ` (${savedViews.length})` : ""}`}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel className="text-xs">Mes vues sauvegardées</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {savedViews.length === 0 ? (
                <div className="px-2 py-3 text-[11px] text-muted-foreground text-center">Aucune vue sauvegardée</div>
              ) : savedViews.map((v) => (
                <div key={v.id} className="flex items-center gap-1 px-1">
                  <DropdownMenuItem
                    className="flex-1 text-xs"
                    onSelect={(e) => { e.preventDefault(); applyView(v); }}
                  >
                    {activeViewId === v.id && <Check className="h-3 w-3 mr-1 text-success" />}
                    <span className="truncate">{v.name}</span>
                  </DropdownMenuItem>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); deleteView(v.id); }}
                    className="p-1 text-muted-foreground hover:text-destructive"
                    title="Supprimer cette vue"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={(e) => { e.preventDefault(); setShowSaveDialog(true); }}
                className="text-xs text-primary"
              >
                <Plus className="h-3 w-3 mr-1" />Sauvegarder la vue actuelle
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <SaveIndicator state={saveState} savedAt={savedAt} />
        </div>

        <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base">Sauvegarder la vue actuelle</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              <Input
                value={newViewName}
                onChange={(e) => setNewViewName(e.target.value)}
                placeholder="Ex: CIN actifs, Zone Casablanca…"
                maxLength={60}
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") saveCurrentAsView(); }}
              />
              <div className="text-[11px] text-muted-foreground">
                Filtres mémorisés : zone, agence, recherche, CIN, tri.
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setShowSaveDialog(false)}>Annuler</Button>
              <Button size="sm" onClick={saveCurrentAsView} disabled={!newViewName.trim()}>
                <Save className="h-3.5 w-3.5 mr-1" />Sauvegarder
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {isEmpty && <EmptyDashboard />}

        {/* KPI cards */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <Kpi label="Prospects en attente" value={pendingLeads} icon={<Hourglass className="h-4 w-4" />} tone="info" sub={`${newLeads} Nouveau · ${callbackLeads} Rappel`} />
          <Kpi label="Non traités & non convertis" value={untouchedCount} icon={<Inbox className="h-4 w-4" />} tone="warning" sub={`${untouchedStale} >7j · ${untouchedUnassigned} sans agent`} />
          <Kpi label="Temps moyen de traitement" value={`${avgHandlingDisplay} j`} icon={<Clock className="h-4 w-4" />} tone="warning" sub={isFiltered ? "Sur la sélection" : "Tous leads traités"} />
        </div>

        {/* Tuile dédiée « Leads en attente » MVP §4.4 */}
        <Card className="shadow-elegant border-info/30">
          <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4 bg-gradient-to-r from-info/5 via-card to-card">
            <div className="flex items-center gap-3 sm:flex-1">
              <div className="h-12 w-12 rounded-xl bg-info/15 text-info flex items-center justify-center shrink-0">
                <Hourglass className="h-6 w-6" />
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Leads en attente</div>
                <div className="text-3xl font-semibold tabular-nums leading-tight">{pendingLeads}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  À contacter ou à rappeler — {totalLeads > 0 ? Math.round((pendingLeads / totalLeads) * 100) : 0}% du portefeuille
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 sm:gap-4 sm:flex-1">
              <MiniStat label="Nouveau" value={newLeads} color="var(--primary)" />
              <MiniStat label="Rappel" value={callbackLeads} color="var(--chart-4)" />
              <MiniStat label="En cours" value={inProgressLeads} color="var(--chart-3)" />
            </div>
            <Link to="/prospects" className="inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground px-4 py-2 text-xs font-medium shadow-sm hover:opacity-90 shrink-0">
              Traiter les leads
            </Link>
          </CardContent>
        </Card>

        {/* Prospects non traités & non convertis (statut Nouveau, jamais converti) */}
        <Card className="shadow-elegant border-warning/30">
          <CardHeader className="pb-2 flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Inbox className="h-4 w-4 text-warning" /> Prospects non traités
              </CardTitle>
              <CardDescription>
                Leads encore au statut « Nouveau » et jamais convertis — {untouchedCount} au total
                {untouchedStale > 0 && <> · <span className="text-destructive font-medium">{untouchedStale} en retard ({'>'}7 j)</span></>}
              </CardDescription>
            </div>
            <Link to="/prospects" className="text-xs text-primary hover:underline shrink-0">Voir tout →</Link>
          </CardHeader>
          <CardContent>
            {untouchedCount === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                🎉 Tous les leads ont été pris en charge.
              </div>
            ) : (
              <div className="space-y-1.5">
                {untouchedProspects.slice(0, 8).map((p) => {
                  const tone =
                    p.ageDays >= 14 ? "bg-destructive/15 text-destructive border-destructive/30"
                    : p.ageDays >= 7 ? "bg-warning/15 text-warning-foreground border-warning/30"
                    : "bg-muted text-muted-foreground border-border";
                  return (
                    <Link
                      key={p.id}
                      to="/prospects/$prospectId"
                      params={{ prospectId: p.id }}
                      className="flex items-center gap-2 py-2 border-b border-border/60 last:border-0 hover:bg-accent/40 -mx-2 px-2 rounded"
                    >
                      <div className="h-7 w-7 rounded-full bg-warning/15 text-warning-foreground flex items-center justify-center text-[10px] font-semibold shrink-0">
                        {p.firstName[0]}{p.lastName[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{p.lastName} {p.firstName}</div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {p.phone || "—"} • {p.city || "—"} • {p.assignedTo ? `Agent: ${p.assignedTo}` : "Non assigné"}
                        </div>
                      </div>
                      <Badge variant="outline" className={`text-[10px] shrink-0 ${tone}`}>
                        {p.ageDays === 0 ? "Aujourd'hui" : `${p.ageDays} j`}
                      </Badge>
                    </Link>
                  );
                })}
                {untouchedCount > 8 && (
                  <div className="pt-2 text-center">
                    <Link to="/prospects" className="text-xs text-primary hover:underline">
                      + {untouchedCount - 8} autre(s) prospect(s) non traité(s) →
                    </Link>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Charts: répartition + performance agents */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="shadow-elegant">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Répartition par statut</CardTitle>
              <CardDescription>{totalLeads} leads</CardDescription>
            </CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusBreakdown}
                    dataKey="count"
                    nameKey="status"
                    innerRadius={50}
                    outerRadius={85}
                    paddingAngle={2}
                    isAnimationActive={false}
                  >
                    {statusBreakdown.map((s) => (
                      <Cell key={s.status} fill={STATUS_COLORS[s.status]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid var(--border)" }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2 shadow-elegant">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-warning" /> Performance des commerciaux
                </CardTitle>
                <CardDescription>Ventes, leads traités et taux de conversion</CardDescription>
              </div>
              <Link to="/users" className="text-xs text-primary hover:underline">Voir tout →</Link>
            </CardHeader>
            <CardContent>
              {agentPerf.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">Aucun commercial.</div>
              ) : (
                <div className="space-y-2.5">
                  {agentPerf.map((a, idx) => {
                    const pct = (a.sold / maxSold) * 100;
                    return (
                      <div key={a.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-accent/40 transition-colors">
                        <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[11px] font-bold shrink-0">
                          {idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-sm font-medium truncate">{a.fullName || a.username}</div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground tabular-nums shrink-0">
                              <span className="hidden sm:inline">{a.handled} traités</span>
                              <span className="font-semibold text-foreground">{a.sold} ventes</span>
                              <span className="text-success font-medium">{a.rate}%</span>
                            </div>
                          </div>
                          <div className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div className="h-full rounded-full bg-gradient-to-r from-primary to-primary-glow" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Tâches du jour + leads à traiter */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="shadow-elegant">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <BellRing className="h-4 w-4 text-warning" /> Mes relances du jour
              </CardTitle>
              <CardDescription>Tâches échues à aujourd'hui</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {todayTasks.length === 0 ? (
                <div className="py-6 text-center text-xs text-muted-foreground">Aucune relance pour aujourd'hui 🎉</div>
              ) : todayTasks.map((t) => (
                <div key={t.id} className="flex items-center gap-2 py-2 border-b border-border/60 last:border-0">
                  <CheckSquare className="h-3.5 w-3.5 text-warning shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{t.title}</div>
                    <div className="text-[11px] text-muted-foreground">Échéance {t.dueDate}</div>
                  </div>
                  {t.relatedEntity === "prospect" && t.relatedId && (
                    <Link
                      to="/prospects/$prospectId"
                      params={{ prospectId: t.relatedId }}
                      className="text-[11px] text-primary hover:underline shrink-0"
                    >
                      Ouvrir
                    </Link>
                  )}
                </div>
              ))}
              <div className="pt-2">
                <Link to="/tasks" className="text-xs text-primary hover:underline">Voir toutes les relances →</Link>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-elegant">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-primary" /> Leads à traiter
              </CardTitle>
              <CardDescription>Statut Nouveau ou En cours</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {leadsToProcess.length === 0 ? (
                <div className="py-6 text-center text-xs text-muted-foreground">Aucun lead à traiter.</div>
              ) : leadsToProcess.map((p) => (
                <Link
                  key={p.id}
                  to="/prospects/$prospectId"
                  params={{ prospectId: p.id }}
                  className="flex items-center gap-2 py-2 border-b border-border/60 last:border-0 hover:bg-accent/40 -mx-2 px-2 rounded"
                >
                  <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-semibold shrink-0">
                    {p.firstName[0]}{p.lastName[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{p.lastName} {p.firstName}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{p.phone || "—"} • {p.city || "—"}</div>
                  </div>
                  <Badge variant="outline" className="text-[10px] shrink-0">{p.status}</Badge>
                </Link>
              ))}
              <div className="pt-2">
                <Link to="/prospects" className="text-xs text-primary hover:underline">Voir tous les leads →</Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}

function HeroKpi({ label, value, icon, gradient }: {
  label: string; value: number | string; icon: React.ReactNode; gradient: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl p-4 text-white shadow-lg" style={{ background: gradient }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.14em] text-white/85 leading-tight">{label}</div>
          <div className="text-3xl font-semibold mt-1 tabular-nums">{value}</div>
        </div>
        <div className="h-9 w-9 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
          {icon}
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, icon, tone, sub }: {
  label: string; value: number | string; icon: React.ReactNode;
  tone: "primary" | "success" | "info" | "warning"; sub?: string;
}) {
  const iconTone = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/10 text-success",
    info:    "bg-info/10 text-info",
    warning: "bg-warning/15 text-warning-foreground",
  }[tone];
  return (
    <Card className="h-full shadow-elegant">
      <CardContent className="p-4 h-full flex flex-col justify-between bg-card">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className={`h-7 w-7 rounded-lg flex items-center justify-center ${iconTone}`}>{icon}</div>
        </div>
        <div>
          <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
          {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

function MiniStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-lg border border-border bg-card/60 px-3 py-2">
      <div className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full" style={{ background: color }} />
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function SaveIndicator({ state, savedAt }: {
  state: "idle" | "pending" | "saving" | "saved" | "error"; savedAt: number;
}) {
  const [tick, setTick] = useState(0);
  // Rafraîchit le libellé "il y a X s" toutes les 30 s
  useEffect(() => {
    if (state !== "saved") return;
    const id = setInterval(() => setTick((v) => v + 1), 30000);
    return () => clearInterval(id);
  }, [state, savedAt]);

  let icon: React.ReactNode;
  let label: string;
  let cls = "text-muted-foreground";
  if (state === "pending") {
    icon = <Loader2 className="h-3 w-3 animate-spin" />;
    label = "Modifications en attente…";
  } else if (state === "saving") {
    icon = <Loader2 className="h-3 w-3 animate-spin text-primary" />;
    label = "Sauvegarde…"; cls = "text-primary";
  } else if (state === "saved") {
    const ago = savedAt ? Math.round((Date.now() - savedAt) / 1000) : 0;
    void tick; // dépendance pour re-render
    icon = <Check className="h-3 w-3 text-success" />;
    label = ago < 5 ? "Sauvegardé" : ago < 60 ? `Sauvegardé · ${ago}s` : `Sauvegardé · ${Math.round(ago / 60)}min`;
    cls = "text-success";
  } else if (state === "error") {
    icon = <CloudOff className="h-3 w-3 text-destructive" />;
    label = "Échec de sauvegarde"; cls = "text-destructive";
  } else {
    icon = <Save className="h-3 w-3" />;
    label = "Auto-save";
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-card border border-border px-2.5 py-1.5 text-[11px] ${cls}`}
      title="Vos filtres sont enregistrés automatiquement par utilisateur"
      aria-live="polite"
    >
      {icon}{label}
    </span>
  );
}

function EmptyDashboard() {
  return (
    <Card className="bg-gradient-mesh">
      <CardContent className="p-6 sm:p-10 text-center">
        <Sparkles className="h-8 w-8 text-primary mx-auto" />
        <h2 className="mt-3 text-xl font-semibold">Bienvenue sur votre CRM</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Commencez par créer votre premier lead pour activer le pipeline et le reporting.
        </p>
        <Button asChild className="mt-4">
          <Link to="/prospects">
            <UserPlus className="h-4 w-4 mr-1.5" />Créer un lead
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
