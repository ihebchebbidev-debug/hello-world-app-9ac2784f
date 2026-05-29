import { ReactNode, useEffect, useMemo, useState } from "react";
import { AppSidebar } from "./AppSidebar";
import { MobileNav } from "./MobileNav";
import { RequireAuth } from "./RequireAuth";
import { PageSkeleton } from "./PageSkeleton";
import { ErpErrorState } from "./ErpErrorState";
import { CommandPalette } from "./CommandPalette";
import { OnboardingTour } from "./OnboardingTour";
import { ForceChangePasswordDialog } from "./ForceChangePasswordDialog";
import { ChatWidget } from "./ChatWidget";
import { IdleLogout } from "./IdleLogout";
import { useAuth } from "@/lib/auth";
import { useErp } from "@/lib/erpStore";
import { Bell, Search, Settings, LogOut, UserCircle2, HelpCircle, Plus, Sparkles, PanelLeftClose, PanelLeftOpen, UserPlus, CalendarPlus, ListPlus, BellOff } from "lucide-react";
import { useSidebarCollapsed } from "@/hooks/use-sidebar-collapsed";
import { Can } from "@/components/Can";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useRouterState, useNavigate, Link } from "@tanstack/react-router";
import { api, API_ENABLED } from "@/lib/api";
import { toast } from "sonner";

const ROUTE_LABELS: Record<string, string> = {
  "/": "Tableau de bord",
  "/prospects": "Prospects",
  "/opportunities": "Opportunités",
  "/contracts": "Contrats",
  "/calendar": "Calendrier",
  "/tasks": "Tâches",
  "/notifications": "Notifications",
  "/reports": "Rapports",
  "/objectives": "Objectifs",
  "/dispatch": "Dispatch",
  "/reconciliation": "Réconciliation",
  "/users": "Utilisateurs",
  "/roles": "Rôles & Permissions",
  "/audit": "Journal d'audit",
  "/security": "Sécurité",
  "/backoffice": "Backoffice",
  "/configuration": "Configuration",
  "/profile": "Profil",
  "/documentation": "Documentation",
  "/journey": "Parcours prospect",
  "/hr": "Ressources Humaines",
};

const ROUTE_LABELS_DEEP: Record<string, string> = {
  "/hr/attendance": "Pointage",
  "/hr/payroll": "Paie",
  "/hr/commissions": "Commissions",
  "/hr/external-agents": "Agents externes",
};

function timeAgo(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return "";
  const diff = Math.max(0, Date.now() - d);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const days = Math.floor(h / 24);
  return `il y a ${days} j`;
}

export function AppLayout({ children, skeleton = "dashboard" }: { children: ReactNode; skeleton?: "dashboard" | "table" | "detail" | "list" | "form" }) {
  const { loading, error, hydrated } = useErp();
  const isHydrating = loading && !hydrated && !error;
  const showError = !!error && !hydrated;
  const path = useRouterState({ select: (s) => s.location.pathname });

  // Audit page-view tracker — silently logs each navigation so admins receive activity.
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      if (cancelled) return;
      import("@/lib/api").then(({ api, API_ENABLED }) => {
        if (!API_ENABLED) return;
        api("/audit_track.php", {
          method: "POST",
          body: { action: "page.view", path },
        }).catch(() => {});
      });
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [path]);

  const segments = path.split("/").filter(Boolean);
  const currentLabel =
    ROUTE_LABELS_DEEP[`/${segments.slice(0, 2).join("/")}`] ??
    ROUTE_LABELS[`/${segments[0] ?? ""}`] ??
    ROUTE_LABELS["/"] ??
    "Tableau de bord";
  const navigate = useNavigate();
  // ----- Real notifications (live from backend) -----
  type Notif = { id: string; title: string; body: string | null; link: string | null; read: boolean; createdAt: string };
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);

  const loadNotifs = useMemo(() => async () => {
    if (!API_ENABLED) return;
    try {
      const r = await api<{ notifications: Notif[]; unread: number }>("/notifications.php");
      setNotifs(r.notifications ?? []);
      setUnread(r.unread ?? 0);
    } catch { /* silent — header bell is best-effort */ }
  }, []);

  useEffect(() => {
    void loadNotifs();
    const t = setInterval(() => { void loadNotifs(); }, 60_000);
    return () => clearInterval(t);
  }, [loadNotifs]);

  // Refresh on popover open so the count + list are always current.
  useEffect(() => { if (notifOpen) void loadNotifs(); }, [notifOpen, loadNotifs]);

  const markAllRead = async () => {
    if (unread === 0) return;
    try {
      await api("/notifications.php", { method: "PATCH", body: { all: true } });
      await loadNotifs();
    } catch (e: any) { toast.error(e?.message ?? "Erreur"); }
  };

  const onNotifClick = async (n: Notif) => {
    try {
      if (!n.read) {
        await api("/notifications.php", { method: "PATCH", body: { id: n.id } });
        await loadNotifs();
      }
    } catch { /* ignore */ }
    setNotifOpen(false);
    if (n.link) navigate({ to: n.link as any }).catch(() => {});
  };

  const { user, logout } = useAuth();
  const displayUsername = user?.username ?? "Utilisateur";
  const displayFullName = user?.fullName ?? displayUsername;
  const displayRole = user?.role ?? "—";
  const displayEmail = user?.email ?? "";
  const initials = displayUsername.split(/[.\s_-]+/).map((n) => n[0]).join("").slice(0, 2).toUpperCase();
  const [sidebarCollapsed, setSidebarCollapsed] = useSidebarCollapsed();

  return (
    <RequireAuth>
    <div className="flex min-h-screen w-full max-w-none bg-background">
      <AppSidebar />
      <div className="flex-1 flex flex-col min-w-0 w-full max-w-none">
        <header className="sticky top-0 z-30 h-16 border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
          <div className="h-full pl-3 pr-3 md:pl-6 md:pr-5 flex items-center gap-3">
            <MobileNav />

            {/* Sidebar collapse toggle (desktop) */}
            <button
              type="button"
              onClick={() => setSidebarCollapsed((v) => !v)}
              aria-label={sidebarCollapsed ? "Étendre le menu" : "Réduire le menu"}
              title={sidebarCollapsed ? "Étendre le menu" : "Réduire le menu"}
              className="hidden md:inline-flex h-9 w-9 rounded-lg border border-border bg-card hover:bg-muted/60 transition-base items-center justify-center text-muted-foreground hover:text-foreground"
            >
              {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </button>

            {/* Breadcrumb / page label */}
            <div className="hidden md:flex items-center gap-2 text-sm">
              <span className="font-medium text-foreground">{currentLabel}</span>
            </div>

            {/* Search */}
            <button
              type="button"
              onClick={() => (window as any).__openCommandPalette?.()}
              data-tour="search"
              className="flex-1 max-w-xl mx-auto hidden sm:flex items-center gap-2 h-10 px-3.5 rounded-lg border border-border bg-muted/40 hover:bg-muted/70 transition-base text-sm text-muted-foreground cursor-pointer text-left"
            >
              <Search className="h-4 w-4" />
              <span className="truncate">Rechercher prospects, contrats, utilisateurs…</span>
              <kbd className="ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded border border-border bg-background text-muted-foreground">
                ⌘K
              </kbd>
            </button>

            {/* Mobile search trigger — opens the same ⌘K palette */}
            <button
              type="button"
              onClick={() => (window as any).__openCommandPalette?.()}
              className="sm:hidden inline-flex items-center justify-center h-9 w-9 rounded-lg border border-border bg-card hover:bg-muted/60 transition-base text-muted-foreground hover:text-foreground"
              aria-label="Rechercher"
              title="Rechercher"
            >
              <Search className="h-4 w-4" />
            </button>

            {/* Right cluster — pinned to right border */}
            <div className="ml-auto flex items-center gap-1.5">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    data-tour="create"
                    className="hidden md:inline-flex items-center gap-1.5 h-9 pl-2.5 pr-3 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-95 transition-base shadow-sm"
                    title="Créer"
                  >
                    <Plus className="h-4 w-4" /> Créer
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Création rapide</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <Can perm="prospect.add">
                    <DropdownMenuItem asChild>
                      <Link to="/prospects/new" className="cursor-pointer">
                        <UserPlus className="h-4 w-4 mr-2" /> Nouveau prospect
                      </Link>
                    </DropdownMenuItem>
                  </Can>
                  <Can perm="calendar.event.add">
                    <DropdownMenuItem asChild>
                      <Link to="/calendar" className="cursor-pointer">
                        <CalendarPlus className="h-4 w-4 mr-2" /> Nouvel événement
                      </Link>
                    </DropdownMenuItem>
                  </Can>
                  <Can perm="task.add">
                    <DropdownMenuItem asChild>
                      <Link to="/tasks" className="cursor-pointer">
                        <ListPlus className="h-4 w-4 mr-2" /> Nouvelle tâche
                      </Link>
                    </DropdownMenuItem>
                  </Can>
                </DropdownMenuContent>
              </DropdownMenu>

              <button
                onClick={() => (window as any).__startOnboardingTour?.()}
                data-tour="help"
                className="hidden md:inline-flex h-9 w-9 rounded-lg border border-border bg-card hover:bg-muted/60 transition-base items-center justify-center text-muted-foreground hover:text-foreground"
                title="Relancer la visite guidée"
              >
                <HelpCircle className="h-4 w-4" />
              </button>

              <Popover open={notifOpen} onOpenChange={setNotifOpen}>
                <PopoverTrigger asChild>
                  <button
                    data-tour="notifications"
                    className="relative h-9 w-9 rounded-lg border border-border bg-card hover:bg-muted/60 transition-base inline-flex items-center justify-center text-muted-foreground hover:text-foreground"
                    title="Notifications"
                  >
                    <Bell className="h-4 w-4" />
                    {unread > 0 && (
                      <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold flex items-center justify-center ring-2 ring-background">
                        {unread > 99 ? "99+" : unread}
                      </span>
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-80 p-0">
                  <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                    <div className="text-sm font-semibold">Notifications</div>
                    <button
                      type="button"
                      onClick={markAllRead}
                      disabled={unread === 0}
                      className="text-xs text-primary hover:underline disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed"
                    >
                      Tout marquer lu
                    </button>
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {notifs.length === 0 ? (
                      <div className="px-4 py-10 flex flex-col items-center text-center gap-2">
                        <div className="h-10 w-10 rounded-full bg-muted/60 flex items-center justify-center">
                          <BellOff className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div className="text-sm font-medium">Aucune notification</div>
                        <div className="text-xs text-muted-foreground">Vous êtes à jour.</div>
                      </div>
                    ) : notifs.slice(0, 8).map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => onNotifClick(n)}
                        className="w-full text-left px-4 py-3 border-b border-border last:border-0 hover:bg-muted/40 cursor-pointer transition-base"
                      >
                        <div className="flex items-start gap-2.5">
                          {!n.read && <span className="mt-1.5 h-2 w-2 rounded-full bg-primary shrink-0" />}
                          <div className={`flex-1 min-w-0 ${n.read ? "pl-4" : ""}`}>
                            <div className="text-sm font-medium truncate">{n.title}</div>
                            {n.body && <div className="text-xs text-muted-foreground truncate">{n.body}</div>}
                            <div className="text-[11px] text-muted-foreground/70 mt-0.5">{timeAgo(n.createdAt)}</div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                  <div className="px-4 py-2 border-t border-border text-center">
                    <Link to="/notifications" className="text-xs text-primary hover:underline">
                      Voir toutes les notifications
                    </Link>
                  </div>
                </PopoverContent>
              </Popover>

              <div className="hidden sm:block h-6 w-px bg-border mx-1" />

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button data-tour="user-menu" className="flex items-center gap-2 h-9 pl-1 pr-2 rounded-lg hover:bg-muted/60 transition-base">
                    <div className="relative">
                      <div className="h-8 w-8 rounded-full bg-gradient-primary flex items-center justify-center text-xs font-semibold text-primary-foreground ring-2 ring-background">
                        {initials}
                      </div>
                      <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full bg-success ring-2 ring-background" />
                    </div>
                    <div className="hidden lg:block text-left leading-tight">
                      <div className="text-sm font-medium">@{displayUsername}</div>
                      <div className="text-[11px] text-muted-foreground">{displayFullName !== displayUsername ? `${displayFullName} • ${displayRole}` : displayRole}</div>
                    </div>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>
                    <div className="font-medium">@{displayUsername}</div>
                    <div className="text-xs text-muted-foreground font-normal">{displayFullName !== displayUsername ? displayFullName : ""}{displayEmail ? ` • ${displayEmail}` : ""}</div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/profile" className="cursor-pointer">
                      <UserCircle2 className="h-4 w-4 mr-2" /> Mon profil
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={logout}
                    className="text-destructive focus:text-destructive cursor-pointer"
                  >
                    <LogOut className="h-4 w-4 mr-2" /> Déconnexion
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>
        <main className="flex-1 min-w-0 w-full max-w-none px-4 md:px-6 lg:px-8 py-8">
          <div key={path} className="animate-in fade-in slide-in-from-bottom-1 duration-300">
            {showError ? <ErpErrorState message={error!} />
              : isHydrating ? <PageSkeleton variant={skeleton} />
              : children}
          </div>
        </main>
      </div>
      <CommandPalette />
      <OnboardingTour />
      <ForceChangePasswordDialog />
      <ChatWidget />
      <IdleLogout />
    </div>
    </RequireAuth>
  );
}
