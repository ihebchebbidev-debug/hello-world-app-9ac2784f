import { useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { ALL_PERMISSION_KEYS, PERMISSION_SECTIONS } from "@/lib/permissions";
import { showPermissionDenied } from "@/components/PermissionDeniedDialog";

// Lookup map: permission key → human French label (e.g. "Ajouter prospect").
const PERM_LABELS: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const s of PERMISSION_SECTIONS) for (const p of s.perms) out[p.key] = p.label;
  return out;
})();

export function permissionLabel(key: string): string {
  return PERM_LABELS[key] ?? key;
}

/**
 * Opens the global permission-denied modal. Replaces the old toast-based
 * notification so users see a clear French dialog explaining which exact
 * permission they need to request from their administrator — never a
 * code-looking error message.
 */
export function notifyMissingPermission(
  perm?: string,
  opts?: { description?: string; action?: string },
) {
  showPermissionDenied({
    perm,
    action: opts?.action,
    details: opts?.description,
  });
}

/**
 * Try to infer which permission a 403'd URL was guarding, so the global
 * forbidden toast can name it. Best-effort, falls back to a generic message.
 */
export function inferPermissionFromUrl(url: string): string | undefined {
  try {
    const u = new URL(url, "https://x.local");
    const file = (u.pathname.split("/").pop() ?? "").replace(/\.php$/, "");
    const map: Record<string, string> = {
      prospects: "prospect.edit",
      opportunities: "opportunity.edit",
      contracts: "contract.edit",
      reclamations: "reclamation.edit",
      users: "user.edit",
      roles: "role.edit",
      audit_log: "page.audit",
      attendance: "page.hr.attendance",
      payroll: "page.hr.payroll",
      commissions: "page.hr.commissions",
      external_agents: "page.hr.external-agents",
      guichet_entries: "page.guichet",
      guichet_dossiers: "page.guichet",
      tasks: "task.edit",
      calendar: "page.calendar",
      ip_allowlist: "page.security",
      attachments: "attachment.upload",
    };
    const cand = map[file];
    if (cand && ALL_PERMISSION_KEYS.includes(cand)) return cand;
  } catch { /* ignore */ }
  return undefined;
}

/**
 * Hook: returns a function that wraps a callback with a frontend permission
 * gate. If the user lacks the permission, the callback never runs and a
 * standardised French toast is shown instead.
 *
 *   const guard = useRequirePermission();
 *   <Button onClick={guard("prospect.add", () => openDialog())}>...</Button>
 */
export function useRequirePermission() {
  const { user, hasPermission } = useAuth();
  return useCallback(
    <T extends (...args: any[]) => any>(perm: string, fn: T) =>
      ((...args: Parameters<T>) => {
        if (!user) { notifyMissingPermission(perm); return; }
        if (hasPermission(perm)) return fn(...args);
        notifyMissingPermission(perm);
      }) as T,
    [user, hasPermission],
  );
}

/**
 * Hook: imperative check. Returns true and lets the action proceed, OR
 * shows the toast and returns false.
 *
 *   const ensure = useEnsurePermission();
 *   if (!ensure("prospect.delete")) return;
 *   await api.delete(...)
 */
export function useEnsurePermission() {
  const { user, hasPermission } = useAuth();
  return useCallback(
    (perm: string): boolean => {
      if (!user) { notifyMissingPermission(perm); return false; }
      if (hasPermission(perm)) return true;
      notifyMissingPermission(perm);
      return false;
    },
    [user, hasPermission],
  );
}
