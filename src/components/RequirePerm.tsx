import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ShieldAlert, ArrowLeft } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { permissionLabel } from "@/lib/permissionGuard";

/**
 * Page-level permission guard. Use inside a route component:
 *
 *   function EditPage() {
 *     return (
 *       <RequirePerm perm="prospect.edit" backTo="/prospects">
 *         <EditForm />
 *       </RequirePerm>
 *     );
 *   }
 *
 * If the user lacks the permission, renders a clear French "Accès refusé"
 * page with a link back, instead of the form.
 *
 * Administrators always pass.
 */
export function RequirePerm({
  perm,
  anyOf,
  backTo = "/",
  backLabel = "Retour",
  children,
}: {
  perm?: string;
  anyOf?: string[];
  backTo?: string;
  backLabel?: string;
  children: ReactNode;
}) {
  const { user, hasPermission, permissionsLoading } = useAuth();

  // Wait for permissions to hydrate before deciding — avoids a flash of
  // "Accès refusé" right after login while /roles.php is still in flight.
  if (permissionsLoading) {
    return (
      <AppLayout>
        <div className="p-6 text-sm text-muted-foreground">Chargement…</div>
      </AppLayout>
    );
  }

  const allowed =
    !!user &&
    (user.role === "Administrateur" ||
      (perm ? hasPermission(perm) : false) ||
      (anyOf ? anyOf.some(hasPermission) : false));

  if (allowed) return <>{children}</>;

  const missing = perm ?? anyOf?.[0];
  return (
    <AppLayout>
      <PageHeader title="Accès refusé" />
      <div className="p-4 md:p-6">
        <Card className="p-6 max-w-2xl space-y-4 border-destructive/30 bg-destructive/5">
          <div className="flex items-start gap-3">
            <ShieldAlert className="h-6 w-6 text-destructive shrink-0 mt-0.5" />
            <div className="space-y-2">
              <h2 className="text-lg font-semibold">Vous n'avez pas l'autorisation d'accéder à cette page.</h2>
              {missing && (
                <p className="text-sm text-muted-foreground">
                  Permission requise :{" "}
                  <code className="px-1.5 py-0.5 rounded bg-muted text-foreground text-xs">
                    {permissionLabel(missing)}
                  </code>
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                Demandez à un administrateur de vous accorder cet accès.
              </p>
            </div>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to={backTo}>
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              {backLabel}
            </Link>
          </Button>
        </Card>
      </div>
    </AppLayout>
  );
}
