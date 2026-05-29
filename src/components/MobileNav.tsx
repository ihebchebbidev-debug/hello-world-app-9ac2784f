import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { Menu, X, LogOut } from "lucide-react";
import { NAV_GROUPS, NavGroup, useNavVisibility } from "@/components/AppSidebar";
import { roleLabel } from "@/lib/roleLabels";

/**
 * Mobile drawer navigation — renders the exact same nav structure as the
 * desktop AppSidebar (same groups, items, ordering, visibility rules and
 * collapsible NavGroup behavior). The only difference is the slide-in drawer
 * shell + close button instead of being permanently docked.
 */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const currentPath = useRouterState({ select: (s) => s.location.pathname });
  const isActive = (p: string) => (p === "/" ? currentPath === "/" : currentPath.startsWith(p));
  const { user, logout } = useAuth();
  const isVisible = useNavVisibility();

  const displayName = user?.fullName ?? user?.username ?? "Utilisateur";
  const displayRole = roleLabel(user?.role);
  const initials = displayName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  // Close on route change
  useEffect(() => { setOpen(false); }, [currentPath]);

  // Lock body scroll when open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="md:hidden inline-flex items-center justify-center h-9 w-9 rounded-lg border border-border bg-card hover:bg-muted/60 transition-base text-foreground"
        aria-label="Ouvrir le menu"
      >
        <Menu className="h-4 w-4" />
      </button>

      {/* Overlay */}
      <div
        className={`fixed inset-0 md:hidden transition-opacity duration-300 ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        style={{ zIndex: 100 }}
        aria-hidden={!open}
      >
        <div
          className="absolute inset-0"
          style={{ backgroundColor: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
          onClick={() => setOpen(false)}
        />

        {/* Drawer — mirrors AppSidebar body structure */}
        <aside
          style={{ zIndex: 101 }}
          className={`absolute left-0 top-0 bottom-0 h-[100dvh] w-[86%] max-w-xs shadow-2xl flex flex-col bg-sidebar text-sidebar-foreground transform transition-transform duration-300 ease-out ${
            open ? "translate-x-0" : "-translate-x-full"
          }`}
          role="dialog"
          aria-label="Navigation"
        >
          {/* Brand (same as desktop) */}
          <div className="px-3 py-5 border-b border-sidebar-border flex items-center justify-between gap-2">
            <Link to="/" className="flex-1 flex items-center justify-center" aria-label="Extranet">
              <div className="text-center leading-tight">
                <div className="text-white font-extrabold tracking-tight text-lg uppercase">Extranet</div>
                <div className="text-white/80 font-semibold tracking-[0.22em] text-[10px] uppercase mt-1">Management System</div>
              </div>
            </Link>
            <button
              onClick={() => setOpen(false)}
              className="h-9 w-9 inline-flex items-center justify-center rounded-lg hover:bg-sidebar-accent/50 text-sidebar-foreground/70 hover:text-sidebar-foreground transition-base"
              aria-label="Fermer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Nav — identical to desktop AppSidebar (groups, order, visibility, collapsible) */}
          <nav
            className="flex-1 overflow-y-auto px-2 py-4 space-y-2"
            onClickCapture={(e) => {
              const t = e.target as HTMLElement;
              if (t.closest("a")) setOpen(false);
            }}
          >
            {NAV_GROUPS.map((group) => {
              const visible = group.items.filter((it) => isVisible(it.url));
              if (visible.length === 0) return null;
              return (
                <NavGroup
                  key={group.label}
                  label={group.label}
                  items={visible}
                  isActive={isActive}
                  collapsed={false}
                />
              );
            })}
          </nav>

          {/* User (same as desktop) */}
          <div className="p-2 border-t border-sidebar-border flex items-center gap-2">
            <Link
              to="/profile"
              onClick={() => setOpen(false)}
              className="flex-1 flex items-center gap-3 rounded-lg hover:bg-sidebar-accent transition-base p-2"
            >
              <div className="h-9 w-9 rounded-full bg-gradient-primary text-primary-foreground flex items-center justify-center text-xs font-semibold shadow-sm shrink-0">
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate text-sidebar-foreground">{displayName}</div>
                <div className="text-[11px] text-sidebar-foreground/60 truncate">{displayRole}</div>
              </div>
            </Link>
            <button
              onClick={logout}
              className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/60 transition-base shrink-0"
              aria-label="Déconnexion"
              title="Déconnexion"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </aside>
      </div>
    </>
  );
}
