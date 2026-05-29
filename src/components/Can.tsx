import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth";

/**
 * Permission gate. Hides children unless the current user has the permission.
 * Administrators always pass.
 *
 *   <Can perm="prospect.add"><Button>...</Button></Can>
 *   <Can anyOf={["contract.edit","contract.validate"]}>...</Can>
 *   <Can perm="user.delete" fallback={<DisabledHint/>}>...</Can>
 */
export function Can({
  perm,
  anyOf,
  allOf,
  children,
  fallback = null,
}: {
  perm?: string;
  anyOf?: string[];
  allOf?: string[];
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { user, hasPermission } = useAuth();
  if (!user) return <>{fallback}</>;
  if (user.role === "Administrateur") return <>{children}</>;

  const ok =
    (perm ? hasPermission(perm) : true) &&
    (anyOf ? anyOf.some(hasPermission) : true) &&
    (allOf ? allOf.every(hasPermission) : true);

  return <>{ok ? children : fallback}</>;
}

/** Hook variant — useful when gating logic, not just rendering. */
export function useCan() {
  const { user, hasPermission } = useAuth();
  return (perm: string) =>
    !!user && (hasPermission(perm));
}
