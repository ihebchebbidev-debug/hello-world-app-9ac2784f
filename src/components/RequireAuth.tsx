import { useEffect, useMemo, type ReactNode } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { Loader2, ShieldAlert, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ALL_PERMISSION_KEYS,
  permissionForPath,
  PUBLIC_AUTH_ROUTES,
  ROUTE_PERMISSION,
} from "@/lib/permissions";

/**
 * Wraps protected pages. If no user is logged in, redirects to /login.
 * Per-route role permissions are enforced silently: pages the user can't
 * access redirect to the first allowed route — no toast, no "access denied"
 * screen. Buttons / links to forbidden pages are hidden upstream.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading, permissionsLoading, permissions, hasPermission, logout } = useAuth();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (loading) return;
    if (!user && path !== "/login") {
      navigate({ to: "/login" });
    }
  }, [user, loading, path, navigate]);

  const requiredPerm = useMemo(
    () => (PUBLIC_AUTH_ROUTES.has(path) ? null : permissionForPath(path)),
    [path],
  );

  const firstAllowed = useMemo(() => {
    if (!user) return "/";
    // Role-aware fast path: an Agent Guichet must land on /guichet directly.
    // AgentGuichet has /guichet as their sole working page — always send them there,
    // even before permissions hydrate, to avoid a flash on a forbidden page.
    if (user.role === "AgentGuichet") return "/guichet";
    const order = [
      "/",
      "/guichet",
      "/prospects",
      "/opportunities",
      "/contracts",
      "/reclamations",
      "/calendar",
      "/dispatch",
      "/tasks",
      "/notifications",
      "/reports",
      "/objectives",
      "/backoffice",
      "/users",
      "/roles",
      "/configuration",
      "/audit",
      "/security",
    ];
    for (const r of order) {
      const p = ROUTE_PERMISSION[r];
      if (!p || hasPermission(p)) return r;
    }
    // Last-resort: always-available routes so we never loop on a forbidden page.
    return "/profile";
  }, [user, hasPermission]);

  // We no longer silently redirect when the user lacks permission for the
  // current route. Instead we render an explicit "access denied" screen so
  // the user understands why the page is blocked (request from product).
  // We still wait for permissions to hydrate before deciding.
  useEffect(() => {
    if (loading || !user) return;
    if (!requiredPerm) return;
    if (user.role !== "Administrateur" && permissionsLoading) return;
    // no-op: rendering branch below handles the denied state
  }, [loading, permissionsLoading, user, requiredPerm, hasPermission, path, firstAllowed, navigate]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Hold a loader until permissions hydrate for any non-admin user, so we
  // never render a protected page (or the "no permission" screen) before we
  // actually know what they can access. Without this, a user with 0
  // permissions could briefly see a PUBLIC_AUTH_ROUTE (/profile, etc.) or
  // the app shell before the gate kicks in.
  if (user.role !== "Administrateur" && permissionsLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Global "no permissions at all" screen. If the user has been authenticated
  // but their role + grants + overrides resolve to an empty permission set,
  // every page would just show "Accès refusé". Show a clearer, dedicated
  // message instead and only offer logout. Administrators bypass this.
  const hasAnyPermission =
    user.role === "Administrateur" ||
    Object.values(permissions).some((v) => v === true) ||
    ALL_PERMISSION_KEYS.some((k) => hasPermission(k));
  if (!hasAnyPermission && path !== "/login") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="max-w-md text-center space-y-4">
          <ShieldAlert className="h-12 w-12 mx-auto text-destructive" />
          <h1 className="text-2xl font-semibold">Aucune permission</h1>
          <p className="text-sm text-muted-foreground">
            Vous n'avez aucune permission. Veuillez contacter votre administrateur
            pour obtenir l'accès aux fonctionnalités de l'application.
          </p>
          <p className="text-xs text-muted-foreground">
            Compte&nbsp;: <span className="font-medium text-foreground">{user.username}</span>
            {" · "}Rôle&nbsp;: <span className="font-medium text-foreground">{user.role}</span>
          </p>
          <div className="flex items-center justify-center gap-2 pt-2">
            <Button variant="outline" onClick={() => logout()}>
              Se déconnecter
            </Button>
          </div>
        </div>
      </div>
    );
  }


  // Explicit "access denied" screen when the user lacks the required permission.
  if (requiredPerm && !hasPermission(requiredPerm)) {
    const isHome = path === firstAllowed;
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="max-w-md text-center space-y-4">
          <ShieldAlert className="h-12 w-12 mx-auto text-destructive" />
          <h1 className="text-2xl font-semibold">Accès refusé</h1>
          <p className="text-sm text-muted-foreground">
            Vous n'avez pas la permission de voir cette page.
          </p>
          <p className="text-xs text-muted-foreground">
            Compte&nbsp;: <span className="font-medium text-foreground">{user.username}</span>
            {" · "}Rôle&nbsp;: <span className="font-medium text-foreground">{user.role}</span>
            <br />
            Contactez un administrateur si vous pensez qu'il s'agit d'une erreur.
          </p>
          <div className="flex items-center justify-center gap-2 pt-2">
            {!isHome && (
              <Button
                variant="default"
                onClick={() => navigate({ to: firstAllowed, replace: true } as any)}
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Retour à l'accueil
              </Button>
            )}
            <Button variant="outline" onClick={() => logout()}>
              Se déconnecter
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
