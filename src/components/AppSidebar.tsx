import { Link, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import {
  ChevronDown,
  ChevronRight,
  LayoutDashboard,
  GitBranch,
  Users,
  Target,
  FileText,
  ListChecks,
  CalendarDays,
  Bell,
  Clock,
  Wallet,
  TrendingUp,
  UserCog,
  ShieldCheck,
  BarChart3,
  ScrollText,
  Lock,
  Workflow,
  Settings,
  BookOpen,
  MessageSquareWarning,
  MessageCircle,
  Layers,
  Store,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useSidebarCollapsed } from "@/hooks/use-sidebar-collapsed";
import { useProspectTypes } from "@/hooks/use-prospect-types";
import { useOpportunityStages } from "@/hooks/use-opportunity-stages";
import { useContractStages } from "@/hooks/use-contract-stages";
import { useGuichetEntities } from "@/hooks/use-guichet-entities";
import { permissionForPath, PUBLIC_AUTH_ROUTES, HR_PRIV_ROUTES } from "@/lib/permissions";
import { roleLabel, isAgentRole } from "@/lib/roleLabels";
import { useChat } from "@/lib/chatStore";

type NavItem = { title: string; url: string; icon: LucideIcon };

export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Pilotage",
    items: [
      { title: "Tableau de bord", url: "/", icon: LayoutDashboard },
      
    ],
  },
  {
    label: "Commercial",
    items: [
      { title: "Prospects", url: "/prospects", icon: Users },
      { title: "Opportunités", url: "/opportunities", icon: Target },
      { title: "Contrats", url: "/contracts", icon: FileText },
      { title: "Guichet", url: "/guichet", icon: Store },
      { title: "Réclamations", url: "/reclamations", icon: MessageSquareWarning },
      { title: "Tâches", url: "/tasks", icon: ListChecks },
      { title: "Calendrier", url: "/calendar", icon: CalendarDays },
    ],
  },
  {
    label: "Communication",
    items: [
      { title: "Messagerie", url: "/messaging", icon: MessageCircle },
      { title: "Notifications", url: "/notifications", icon: Bell },
    ],
  },
  {
    label: "RH & Paie",
    items: [
      { title: "Pointage", url: "/hr/attendance", icon: Clock },
      { title: "Paie", url: "/hr/payroll", icon: Wallet },
      { title: "Commissions", url: "/hr/commissions", icon: TrendingUp },
      { title: "Agents externes", url: "/hr/external-agents", icon: UserCog },
    ],
  },
  {
    label: "Administration",
    items: [
      { title: "Utilisateurs", url: "/users", icon: Users },
      { title: "Rôles", url: "/roles", icon: ShieldCheck },
      { title: "Rapports", url: "/reports", icon: BarChart3 },
      { title: "Journal d'audit", url: "/audit", icon: ScrollText },
      { title: "Sécurité d'accès", url: "/security", icon: Lock },
      
      { title: "Configuration", url: "/configuration", icon: Settings },
      { title: "Documentation", url: "/documentation", icon: BookOpen },
    ],
  },
];

const GUICHET_ALLOWED = new Set(["/guichet", "/profile"]);

export function useNavVisibility() {
  const { user, hasPermission } = useAuth();
  const isAgent = isAgentRole(user?.role);
  const isGuichet = user?.role === "AgentGuichet";
  const AGENT_HIDDEN = new Set(["/reconciliation", "/objectives", "/reports"]);
  const ADMIN_MANAGER = (r?: string | null) => r === "Administrateur" || r === "Manager";
  return (url: string) => {
    if (isGuichet) {
      if (GUICHET_ALLOWED.has(url)) return true;
      // Honor additional granted roles/permissions on top of base AgentGuichet
      const perm = permissionForPath(url);
      if (perm && hasPermission(perm)) return true;
      return false;
    }
    if (url === "/documentation" || url === "/configuration" || url === "/security")
      return user?.role === "Administrateur";
    if (url === "/audit")
      return user?.role === "Administrateur" || hasPermission("audit.view");
    if (url === "/reports")
      return user?.role === "Administrateur" || hasPermission("report.view");
    if (HR_PRIV_ROUTES.has(url)) {
      const perm = permissionForPath(url);
      return user?.role === "Administrateur" || (!!perm && hasPermission(perm));
    }
    if (isAgent && AGENT_HIDDEN.has(url)) return false;
    if (PUBLIC_AUTH_ROUTES.has(url)) return true;
    const perm = permissionForPath(url);
    if (!perm) return true;
    return hasPermission(perm);
  };
}

export function AppSidebar() {
  const currentPath = useRouterState({ select: (s) => s.location.pathname });
  const isActive = (path: string) =>
    path === "/" ? currentPath === "/" : currentPath.startsWith(path);
  const { user, hasPermission } = useAuth();
  const displayName = user?.fullName ?? user?.username ?? "Utilisateur";
  const displayRole = roleLabel(user?.role);
  const initials = displayName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
  const isAgent = isAgentRole(user?.role);
  const isGuichet = user?.role === "AgentGuichet";
  const AGENT_HIDDEN = new Set(["/reconciliation", "/objectives", "/reports"]);
  const ADMIN_MANAGER = (r?: string | null) => r === "Administrateur" || r === "Manager";

  const isVisible = (url: string) => {
    if (isGuichet) {
      if (GUICHET_ALLOWED.has(url)) return true;
      const perm = permissionForPath(url);
      if (perm && hasPermission(perm)) return true;
      return false;
    }
    if (url === "/documentation" || url === "/configuration" || url === "/security")
      return user?.role === "Administrateur";
    if (url === "/audit")
      return user?.role === "Administrateur" || hasPermission("audit.view");
    if (url === "/reports")
      return ADMIN_MANAGER(user?.role) || hasPermission("report.view");
    if (HR_PRIV_ROUTES.has(url))
      return user?.role === "Administrateur" || user?.role === "Manager";
    if (isAgent && AGENT_HIDDEN.has(url)) return false;
    if (PUBLIC_AUTH_ROUTES.has(url)) return true;
    const perm = permissionForPath(url);
    if (!perm) return true;
    return hasPermission(perm);
  };

  const [collapsed] = useSidebarCollapsed();

  return (
    <aside
      data-collapsed={collapsed ? "true" : "false"}
      className={`hidden md:flex shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground sticky top-0 h-screen self-start transition-[width] duration-200 ${
        collapsed ? "w-[68px]" : "w-64"
      }`}
      data-tour="sidebar"
    >
      {/* Brand */}
      <div className="px-3 py-5 border-b border-sidebar-border">
        <Link to="/" className="flex items-center justify-center group" aria-label="Extranet">
          {collapsed ? (
            <span className="text-white font-extrabold tracking-tight text-2xl leading-none">EMS</span>
          ) : (
            <div className="text-center leading-tight">
              <div className="text-white font-extrabold tracking-tight text-lg uppercase">Extranet</div>
              <div className="text-white/80 font-semibold tracking-[0.22em] text-[10px] uppercase mt-1">Management System</div>
            </div>
          )}
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-4 space-y-2">
        {NAV_GROUPS.map((group) => {
          const visible = group.items.filter((it) => isVisible(it.url));
          if (visible.length === 0) return null;
          return (
            <NavGroup
              key={group.label}
              label={group.label}
              items={visible}
              isActive={isActive}
              collapsed={collapsed}
            />
          );
        })}
      </nav>

      {/* User */}
      <div className="p-2 border-t border-sidebar-border">
        <Link
          to="/profile"
          className={`flex items-center gap-3 rounded-lg hover:bg-sidebar-accent transition-base p-2 ${collapsed ? "justify-center" : ""}`}
          title={collapsed ? displayName : undefined}
        >
          <div className="h-9 w-9 rounded-full bg-gradient-primary text-primary-foreground flex items-center justify-center text-xs font-semibold shadow-sm shrink-0">
            {initials}
          </div>
          {!collapsed && (
            <>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate text-sidebar-foreground">{displayName}</div>
                <div className="text-[11px] text-sidebar-foreground/60 truncate">{displayRole}</div>
              </div>
              <span className="h-2 w-2 rounded-full bg-success ring-2 ring-sidebar" />
            </>
          )}
        </Link>
      </div>
    </aside>
  );
}

export function NavGroup({
  label,
  items,
  isActive,
  collapsed = false,
}: {
  label: string;
  items: NavItem[];
  isActive: (path: string) => boolean;
  collapsed?: boolean;
}) {
  const containsActive = items.some((it) => isActive(it.url));
  const storageKey = `sidebar.group.${label}`;
  const [open, setOpen] = useState<boolean>(true);

  // Restore persisted state; force-open if it contains the active route.
  useEffect(() => {
    if (containsActive) { setOpen(true); return; }
    try {
      const v = localStorage.getItem(storageKey);
      if (v === "0") setOpen(false);
      else if (v === "1") setOpen(true);
    } catch {}
  }, [containsActive, storageKey]);

  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      try { localStorage.setItem(storageKey, next ? "1" : "0"); } catch {}
      return next;
    });
  };

  // When the whole sidebar is collapsed, render icon-only items without the group header.
  if (collapsed) {
    return (
      <ul className="space-y-0.5">
        {items.map((item) => {
          const active = isActive(item.url);
          return (
            <li key={item.url}>
              <Link
                to={item.url}
                title={item.title}
                className={`group relative flex items-center justify-center rounded-lg p-2 transition-base ${
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                    : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                }`}
              >
                {(() => { const Icon = item.icon; return <Icon size={20} className="text-white" strokeWidth={1.75} />; })()}
              </Link>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-3 py-1.5 mb-1 rounded-md text-[10px] uppercase tracking-[0.16em] text-sidebar-foreground/50 hover:text-sidebar-foreground/80 font-semibold transition-base"
      >
        <span>{label}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? "rotate-0" : "-rotate-90"}`}
        />
      </button>
      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
      >
        <ul className="overflow-hidden space-y-0.5">
          {items.map((item) => {
            const active = isActive(item.url);
            return (
              <li key={item.url}>
                <Link
                  to={item.url}
                  className={`group relative flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-base ${
                    active
                      ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium shadow-sm"
                      : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  }`}
                >
                  <span
                    className={`h-7 w-7 rounded-md flex items-center justify-center shrink-0 transition-base ${
                      active ? "bg-white/15" : "bg-transparent"
                    }`}
                  >
                    {(() => { const Icon = item.icon; return <Icon size={18} className="text-white" strokeWidth={1.75} />; })()}
                  </span>
                  <span>{item.title}</span>
                </Link>
                {item.url === "/prospects" && <ProspectTypesSubmenu />}
                {item.url === "/opportunities" && <OpportunityStagesSubmenu />}
                {item.url === "/contracts" && <ContractStagesSubmenu />}
                {item.url === "/guichet" && <GuichetEntitiesSubmenu />}
                {item.url === "/reclamations" && <ReclamationsAuditSubmenu />}
                {item.url === "/messaging" && <MessagingGroupsSubmenu />}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}



function ProspectTypesSubmenu() {
  const types = useProspectTypes();
  const currentPath = useRouterState({ select: (s) => s.location.pathname });
  const currentSearch = useRouterState({ select: (s) => s.location.search as { typeId?: string } });
  const onProspects = currentPath.startsWith("/prospects");
  const activeTypeId = onProspects ? currentSearch?.typeId : undefined;

  const storageKey = "sidebar.prospectTypes.open";
  const [open, setOpen] = useState<boolean>(false);
  useEffect(() => {
    if (activeTypeId) { setOpen(true); return; }
    try {
      const v = localStorage.getItem(storageKey);
      if (v === "1") setOpen(true);
    } catch {}
  }, [activeTypeId]);

  if (!types.length) return null;

  const toggle = () => {
    setOpen((p) => {
      const n = !p;
      try { localStorage.setItem(storageKey, n ? "1" : "0"); } catch {}
      return n;
    });
  };

  return (
    <div className="mt-0.5">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="w-full flex items-center justify-between pl-12 pr-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-sidebar-foreground/45 hover:text-sidebar-foreground/75 font-semibold transition-base"
      >
        <span className="flex items-center gap-1.5"><Layers className="h-3 w-3" />Par type</span>
        <ChevronRight className={`h-3 w-3 transition-transform duration-200 ${open ? "rotate-90" : ""}`} />
      </button>
      <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <ul className="overflow-hidden space-y-0.5 pt-0.5">
          {types.map((t) => {
            const active = activeTypeId === t.id;
            return (
              <li key={t.id}>
                <Link
                  to="/prospects"
                  search={{ typeId: t.id }}
                  className={`flex items-center gap-2 rounded-md ml-12 mr-1 px-2 py-1.5 text-[12px] transition-base ${
                    active
                      ? "bg-sidebar-primary/80 text-sidebar-primary-foreground font-medium"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  }`}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60 shrink-0" />
                  <span className="truncate">{t.name}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function OpportunityStagesSubmenu() {
  const stages = useOpportunityStages();
  const currentPath = useRouterState({ select: (s) => s.location.pathname });
  const currentSearch = useRouterState({ select: (s) => s.location.search as { stage?: string } });
  const onOpps = currentPath.startsWith("/opportunities");
  const activeStage = onOpps ? currentSearch?.stage : undefined;

  const storageKey = "sidebar.opportunityStages.open";
  const [open, setOpen] = useState<boolean>(false);
  useEffect(() => {
    if (activeStage) { setOpen(true); return; }
    try {
      const v = localStorage.getItem(storageKey);
      if (v === "1") setOpen(true);
    } catch {}
  }, [activeStage]);

  if (!stages.length) return null;

  const toggle = () => {
    setOpen((p) => {
      const n = !p;
      try { localStorage.setItem(storageKey, n ? "1" : "0"); } catch {}
      return n;
    });
  };

  return (
    <div className="mt-0.5">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="w-full flex items-center justify-between pl-12 pr-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-sidebar-foreground/45 hover:text-sidebar-foreground/75 font-semibold transition-base"
      >
        <span className="flex items-center gap-1.5"><Layers className="h-3 w-3" />Par statut</span>
        <ChevronRight className={`h-3 w-3 transition-transform duration-200 ${open ? "rotate-90" : ""}`} />
      </button>
      <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <ul className="overflow-hidden space-y-0.5 pt-0.5">
          {stages.map((s) => {
            const active = activeStage === s.name;
            return (
              <li key={s.id}>
                <Link
                  to="/opportunities"
                  search={{ stage: s.name }}
                  className={`flex items-center gap-2 rounded-md ml-12 mr-1 px-2 py-1.5 text-[12px] transition-base ${
                    active
                      ? "bg-sidebar-primary/80 text-sidebar-primary-foreground font-medium"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${s.isWon ? "bg-success" : s.isLost ? "bg-destructive" : "bg-info"}`} />
                  <span className="truncate">{s.name}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function ContractStagesSubmenu() {
  const stages = useContractStages();
  const currentPath = useRouterState({ select: (s) => s.location.pathname });
  const currentSearch = useRouterState({ select: (s) => s.location.search as { statut?: string } });
  const onContracts = currentPath.startsWith("/contracts");
  const activeStage = onContracts ? currentSearch?.statut : undefined;

  const storageKey = "sidebar.contractStages.open";
  const [open, setOpen] = useState<boolean>(false);
  useEffect(() => {
    if (activeStage) { setOpen(true); return; }
    try {
      const v = localStorage.getItem(storageKey);
      if (v === "1") setOpen(true);
    } catch {}
  }, [activeStage]);

  if (!stages.length) return null;

  const toggle = () => {
    setOpen((p) => {
      const n = !p;
      try { localStorage.setItem(storageKey, n ? "1" : "0"); } catch {}
      return n;
    });
  };

  return (
    <div className="mt-0.5">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="w-full flex items-center justify-between pl-12 pr-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-sidebar-foreground/45 hover:text-sidebar-foreground/75 font-semibold transition-base"
      >
        <span className="flex items-center gap-1.5"><Layers className="h-3 w-3" />Par statut</span>
        <ChevronRight className={`h-3 w-3 transition-transform duration-200 ${open ? "rotate-90" : ""}`} />
      </button>
      <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <ul className="overflow-hidden space-y-0.5 pt-0.5">
          {stages.map((s) => {
            const active = activeStage === s.name;
            return (
              <li key={s.id}>
                <Link
                  to="/contracts"
                  search={{ statut: s.name }}
                  className={`flex items-center gap-2 rounded-md ml-12 mr-1 px-2 py-1.5 text-[12px] transition-base ${
                    active
                      ? "bg-sidebar-primary/80 text-sidebar-primary-foreground font-medium"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${s.isWon ? "bg-success" : s.isLost ? "bg-destructive" : "bg-info"}`} />
                  <span className="truncate">{s.name}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function GuichetEntitiesSubmenu() {
  const entities = useGuichetEntities();
  const currentPath = useRouterState({ select: (s) => s.location.pathname });
  const currentSearch = useRouterState({ select: (s) => s.location.search as { entityId?: string } });
  const onGuichet = currentPath.startsWith("/guichet");
  const activeEntity = onGuichet ? currentSearch?.entityId : undefined;

  const storageKey = "sidebar.guichetEntities.open";
  const [open, setOpen] = useState<boolean>(false);
  useEffect(() => {
    if (activeEntity) { setOpen(true); return; }
    try {
      const v = localStorage.getItem(storageKey);
      if (v === "1") setOpen(true);
    } catch {}
  }, [activeEntity]);

  if (!entities.length) return null;

  const toggle = () => {
    setOpen((p) => {
      const n = !p;
      try { localStorage.setItem(storageKey, n ? "1" : "0"); } catch {}
      return n;
    });
  };

  const dotColor = (t: string) =>
    t === "ttshop" ? "bg-info" : t === "franchise" ? "bg-success" : "bg-muted-foreground";

  return (
    <div className="mt-0.5">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="w-full flex items-center justify-between pl-12 pr-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-sidebar-foreground/45 hover:text-sidebar-foreground/75 font-semibold transition-base"
      >
        <span className="flex items-center gap-1.5"><Layers className="h-3 w-3" />Par entité</span>
        <ChevronRight className={`h-3 w-3 transition-transform duration-200 ${open ? "rotate-90" : ""}`} />
      </button>
      <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <ul className="overflow-hidden space-y-0.5 pt-0.5">
          {entities.map((e) => {
            const active = activeEntity === e.id;
            return (
              <li key={e.id}>
                <Link
                  to="/guichet"
                  search={{ entityId: e.id }}
                  className={`flex items-center gap-2 rounded-md ml-12 mr-1 px-2 py-1.5 text-[12px] transition-base ${
                    active
                      ? "bg-sidebar-primary/80 text-sidebar-primary-foreground font-medium"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotColor(e.type)}`} />
                  <span className="truncate">{e.name}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

const RECLAMATION_AUDITS: { value: "en_cours" | "resolu" | "annule"; label: string; tone: string }[] = [
  { value: "en_cours", label: "En cours", tone: "bg-warning" },
  { value: "resolu",   label: "Résolu",   tone: "bg-success" },
  { value: "annule",   label: "Annulé",   tone: "bg-destructive" },
];

function ReclamationsAuditSubmenu() {
  const currentPath = useRouterState({ select: (s) => s.location.pathname });
  const currentSearch = useRouterState({ select: (s) => s.location.search as { audit?: string } });
  const onPage = currentPath.startsWith("/reclamations");
  const activeAudit = onPage ? currentSearch?.audit : undefined;

  const storageKey = "sidebar.reclamationAudit.open";
  const [open, setOpen] = useState<boolean>(false);
  useEffect(() => {
    if (activeAudit) { setOpen(true); return; }
    try {
      const v = localStorage.getItem(storageKey);
      if (v === "1") setOpen(true);
    } catch {}
  }, [activeAudit]);

  const toggle = () => {
    setOpen((p) => {
      const n = !p;
      try { localStorage.setItem(storageKey, n ? "1" : "0"); } catch {}
      return n;
    });
  };

  return (
    <div className="mt-0.5">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="w-full flex items-center justify-between pl-12 pr-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-sidebar-foreground/45 hover:text-sidebar-foreground/75 font-semibold transition-base"
      >
        <span className="flex items-center gap-1.5"><Layers className="h-3 w-3" />Par statut</span>
        <ChevronRight className={`h-3 w-3 transition-transform duration-200 ${open ? "rotate-90" : ""}`} />
      </button>
      <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <ul className="overflow-hidden space-y-0.5 pt-0.5">
          {RECLAMATION_AUDITS.map((a) => {
            const active = activeAudit === a.value;
            return (
              <li key={a.value}>
                <Link
                  to="/reclamations"
                  search={{ audit: a.value }}
                  className={`flex items-center gap-2 rounded-md ml-12 mr-1 px-2 py-1.5 text-[12px] transition-base ${
                    active
                      ? "bg-sidebar-primary/80 text-sidebar-primary-foreground font-medium"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${a.tone}`} />
                  <span className="truncate">{a.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function MessagingGroupsSubmenu() {
  const currentPath = useRouterState({ select: (s) => s.location.pathname });
  const currentSearch = useRouterState({ select: (s) => s.location.search as { conv?: string } });
  const onMessaging = currentPath.startsWith("/messaging");
  const activeConv = onMessaging ? currentSearch?.conv : undefined;

  // Lazy import the chat hook here to avoid circular concerns.
  // useChat is imported at module top.
  const chat = useChat();
  const groups = chat.conversations.filter((c) => c.type === "group" || c.type === "broadcast");

  const storageKey = "sidebar.messagingGroups.open";
  const [open, setOpen] = useState<boolean>(false);
  useEffect(() => {
    if (activeConv) { setOpen(true); return; }
    try {
      const v = localStorage.getItem(storageKey);
      if (v === "1") setOpen(true);
    } catch {}
  }, [activeConv]);

  if (!groups.length) return null;

  const toggle = () => {
    setOpen((p) => {
      const n = !p;
      try { localStorage.setItem(storageKey, n ? "1" : "0"); } catch {}
      return n;
    });
  };

  return (
    <div className="mt-0.5">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="w-full flex items-center justify-between pl-12 pr-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-sidebar-foreground/45 hover:text-sidebar-foreground/75 font-semibold transition-base"
      >
        <span className="flex items-center gap-1.5"><Layers className="h-3 w-3" />Groupes</span>
        <ChevronRight className={`h-3 w-3 transition-transform duration-200 ${open ? "rotate-90" : ""}`} />
      </button>
      <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <ul className="overflow-hidden space-y-0.5 pt-0.5">
          {groups.map((g) => {
            const active = activeConv === g.id;
            const title = g.name || g.members.map((m) => m.fullName).join(", ") || "Groupe";
            return (
              <li key={g.id}>
                <Link
                  to="/messaging"
                  search={{ conv: g.id }}
                  className={`flex items-center gap-2 rounded-md ml-12 mr-1 px-2 py-1.5 text-[12px] transition-base ${
                    active
                      ? "bg-sidebar-primary/80 text-sidebar-primary-foreground font-medium"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${g.type === "broadcast" ? "bg-warning" : "bg-info"}`} />
                  <span className="truncate">{title}</span>
                  {g.unread > 0 && (
                    <span className="ml-auto text-[10px] bg-primary/20 text-primary px-1.5 rounded-full">{g.unread}</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
