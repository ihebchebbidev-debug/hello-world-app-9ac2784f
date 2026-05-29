import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, API_ENABLED, getToken, setToken } from "./api";

export type AuthUser = {
  id: string;
  username: string;
  fullName: string;
  email: string;
  role: "Administrateur" | "Manager" | "Agent" | "Backoffice" | "AgentSuivi" | "AgentActivation" | "AgentVente" | string;
  team: string;
  active: boolean;
  mustChangePassword?: boolean;
  grantedRoles?: string[];
  grantedPermissions?: string[];
  allowedPermissions?: string[];
  deniedPermissions?: string[];
  // HR / personnel
  jobTitle?: string | null;
  birthDate?: string | null;
  cin?: string | null;
  company?: string | null;
  contractType?: string | null;
  salary?: number | null;
  salaryIncrease?: number | null;
  contractStart?: string | null;
  contractEnd?: string | null;
  renewalStart?: string | null;
  renewalEnd?: string | null;
  observations?: string | null;
  phone?: string | null;
  rib?: string | null;
  hireDate?: string | null;
  guichetEntityId?: string | null;
  teamId?: string | null;
  teamName?: string | null;
  teamRoles?: string[];
};

export type SignupInput = {
  username: string;
  fullName: string;
  email: string;
  password: string;
  team?: string;
};

export type OtpChallenge = {
  challenge: string;
  maskedEmail: string;
  expiresAt: string;
  codeLength: number;
};

type AuthState = {
  user: AuthUser | null;
  loading: boolean;
  permissionsLoading: boolean;
  apiEnabled: boolean;
  permissions: Record<string, boolean>;
  hasPermission: (key: string) => boolean;
  refreshPermissions: () => Promise<void>;
  login: (username: string, password: string) => Promise<OtpChallenge | null>;
  verifyOtp: (challenge: string, code: string) => Promise<void>;
  resendOtp: (challenge: string) => Promise<{ expiresAt: string }>;
  signup: (input: SignupInput) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  updateProfile: (patch: Partial<AuthUser>) => Promise<AuthUser>;
  clearMustChange: () => void;
  logout: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

// Legacy permission-cache prefix. We only use it for cleanup now: permissions
// must come from the backend on each session, never from localStorage, otherwise
// a user whose role was emptied can keep stale page access from a previous login.
const PERMS_CACHE_PREFIX = "erp_perms_cache_";
function isPlainObject(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === "object" && !Array.isArray(x);
}
function collectTruePermissions(source: unknown): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  if (!isPlainObject(source)) return out;
  for (const [k, v] of Object.entries(source)) {
    if (v === true) out[k] = true;
  }
  return out;
}
function hasAnyTrue(source: Record<string, boolean>): boolean {
  return Object.values(source).some((v) => v === true);
}

function lookupRolePerms(
  permsMap: Record<string, unknown>,
  roleName: string | undefined | null,
): Record<string, boolean> {
  if (!roleName) return {};
  // Try exact match first, then case-insensitive — the backend has historically
  // had inconsistent casing for role names (e.g. "HumainResource" vs "HumainRessource").
  if (permsMap[roleName] !== undefined) return collectTruePermissions(permsMap[roleName]);
  const lower = roleName.toLowerCase();
  for (const [k, v] of Object.entries(permsMap)) {
    if (k.toLowerCase() === lower) return collectTruePermissions(v);
  }
  return {};
}

async function loadPermissionsForUser(user: AuthUser): Promise<Record<string, boolean>> {
  if (user.role === "Administrateur") {
    return new Proxy({} as Record<string, boolean>, { get: () => true }) as any;
  }
  try {
    const r = await api<{
      permissions?: Record<string, Record<string, boolean> | unknown[]> | null;
      effectivePermissions?: Record<string, boolean> | null;
    }>("/roles.php");

    const permsMap = isPlainObject(r?.permissions) ? r.permissions as Record<string, unknown> : {};
    const ownRolePerms = lookupRolePerms(permsMap, user.role);
    const grantedRolePerms: Record<string, boolean> = {};
    for (const role of user.grantedRoles ?? []) {
      Object.assign(grantedRolePerms, lookupRolePerms(permsMap, role));
    }

    // Security rule: if the user's own role has 0 permissions, do not accept
    // permissions inherited indirectly from team/effective backend logic. Only
    // explicit per-user grants/overrides may unlock access later.
    if (!hasAnyTrue(ownRolePerms)) {
      const scoped: Record<string, boolean> = { ...grantedRolePerms };
      for (const p of user.grantedPermissions ?? []) scoped[p] = true;
      for (const p of user.allowedPermissions ?? []) scoped[p] = true;
      for (const p of user.deniedPermissions ?? []) scoped[p] = false;
      if (import.meta.env?.DEV) {
        console.info("[auth] perms hydrated (empty own role)", {
          user: user.username, role: user.role,
          granted: Object.keys(scoped).filter((k) => scoped[k]),
        });
      }
      return scoped;
    }

    // Server-computed effective set is the preferred path once the user's own
    // role is not empty (or they have explicit per-user access).
    if (isPlainObject(r?.effectivePermissions)) {
      const eff: Record<string, boolean> = {};
      for (const [k, v] of Object.entries(r.effectivePermissions as Record<string, unknown>)) {
        if (typeof v === "boolean") eff[k] = v;
      }
      for (const p of user.allowedPermissions ?? []) eff[p] = true;
      for (const p of user.deniedPermissions ?? []) eff[p] = false;
      if (import.meta.env?.DEV) {
        console.info("[auth] perms hydrated (effective)", {
          user: user.username, role: user.role,
          count: Object.keys(eff).filter((k) => eff[k]).length,
        });
      }
      return eff;
    }

    // Fallback: build from per-role map + temporary grants.
    const base: Record<string, boolean> = { ...ownRolePerms, ...grantedRolePerms };
    for (const p of user.grantedPermissions ?? []) base[p] = true;
    for (const p of user.allowedPermissions ?? []) base[p] = true;
    for (const p of user.deniedPermissions ?? []) base[p] = false;
    if (import.meta.env?.DEV) {
      console.info("[auth] perms hydrated (fallback)", {
        user: user.username, role: user.role,
        count: Object.keys(base).filter((k) => base[k]).length,
      });
    }
    return base;
  } catch (e: any) {
    // Fail closed. A stale localStorage permission snapshot is a security bug:
    // if an admin removes every permission from a role, the user must be blocked
    // immediately instead of keeping old access on this browser.
    console.warn("[auth] /roles.php failed, blocking non-admin permissions", {
      status: e?.status, message: e?.message,
    });
    return {};
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState<boolean>(API_ENABLED && !!getToken());
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [permissionsLoading, setPermissionsLoading] = useState<boolean>(API_ENABLED && !!getToken());

  const applyPermsForUser = useCallback(async (u: AuthUser | null) => {
    if (!u) { setPermissions({}); setPermissionsLoading(false); return; }
    setPermissionsLoading(true);
    try {
      const perms = await loadPermissionsForUser(u);
      setPermissions(perms);
    } finally {
      setPermissionsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!API_ENABLED) { setLoading(false); setPermissionsLoading(false); return; }
    const t = getToken();
    if (!t) { setLoading(false); setPermissionsLoading(false); return; }
    api<{ user: AuthUser }>("/auth_me.php")
      .then((r) => {
        // Unblock the UI as soon as the user is known.
        // Permissions hydrate in the background — Administrateurs are granted
        // everything via the proxy regardless, and other roles fall back to
        // an empty set until roles.php returns.
        setUser(r.user);
        setLoading(false);
        void applyPermsForUser(r.user);
      })
      .catch((e: any) => {
        // Only drop the session on a real auth failure (401). On 404/500/network
        // errors we keep the token so a transient backend issue (e.g. missing
        // column on /auth_me.php) doesn't silently log everyone out.
        const status = Number(e?.status ?? 0);
        console.warn("[auth] /auth_me.php failed", { status, message: e?.message });
        if (status === 401) {
          setToken(null);
          setUser(null);
        }
        setLoading(false);
        setPermissionsLoading(false);
      });
  }, [applyPermsForUser]);

  // Keep permissions fresh in the background: when the tab regains focus or
  // becomes visible again, re-fetch /roles.php so an admin's change (revoke
  // or grant) reaches the user without requiring a logout/login cycle.
  useEffect(() => {
    if (!API_ENABLED || !user || user.role === "Administrateur") return;
    let last = Date.now();
    const MIN_MS = 15_000; // throttle: at most one refresh every 15 s
    const maybeRefresh = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - last < MIN_MS) return;
      last = now;
      void applyPermsForUser(user);
    };
    document.addEventListener("visibilitychange", maybeRefresh);
    window.addEventListener("focus", maybeRefresh);
    const interval = window.setInterval(maybeRefresh, 5 * 60_000); // safety net: every 5 min
    return () => {
      document.removeEventListener("visibilitychange", maybeRefresh);
      window.removeEventListener("focus", maybeRefresh);
      window.clearInterval(interval);
    };
  }, [user, applyPermsForUser]);


  const login = async (username: string, password: string): Promise<OtpChallenge | null> => {
    if (!API_ENABLED) {
      const u: AuthUser = {
        id: "U-DEMO", username: username || "demo", fullName: "Demo User",
        email: `${username || "demo"}@demo.local`, role: "Administrateur",
        team: "Direction", active: true,
      };
      setUser(u);
      await applyPermsForUser(u);
      return null;
    }
    const r = await api<
      | { otpRequired: true; challenge: string; maskedEmail: string; expiresAt: string; codeLength: number }
      | { token: string; user: AuthUser }
    >("/auth_login.php", { method: "POST", body: { username, password } });

    if ("otpRequired" in r && r.otpRequired) {
      return {
        challenge: r.challenge,
        maskedEmail: r.maskedEmail,
        expiresAt: r.expiresAt,
        codeLength: r.codeLength ?? 4,
      };
    }
    // Backward-compat (si OTP désactivé côté serveur)
    const direct = r as { token: string; user: AuthUser };
    setToken(direct.token);
    setUser(direct.user);
    // /auth_login.php renvoie un user "léger" (sans guichetEntityId, teamId, HR…).
    // On hydrate immédiatement avec /auth_me.php pour que l'AgentGuichet voie
    // sa franchise affectée dès la première action.
    try {
      const me = await api<{ user: AuthUser }>("/auth_me.php");
      setUser(me.user);
      await applyPermsForUser(me.user);
    } catch {
      await applyPermsForUser(direct.user);
    }
    api("/attendance.php?action=clock_in", { method: "POST", body: {} }).catch(() => {});
    return null;
  };

  const verifyOtp = async (challenge: string, code: string) => {
    const r = await api<{ token: string; user: AuthUser }>("/auth_otp_verify.php", {
      method: "POST",
      body: { challenge, code },
    });
    setToken(r.token);
    setUser(r.user);
    try {
      const me = await api<{ user: AuthUser }>("/auth_me.php");
      setUser(me.user);
      await applyPermsForUser(me.user);
    } catch {
      await applyPermsForUser(r.user);
    }
    // Auto clock-in (silencieux)
    api("/attendance.php?action=clock_in", { method: "POST", body: {} }).catch(() => {});
  };

  const resendOtp = async (challenge: string) => {
    return api<{ expiresAt: string }>("/auth_otp_resend.php", {
      method: "POST",
      body: { challenge },
    });
  };

  const signup = async (input: SignupInput) => {
    if (!API_ENABLED) {
      const u: AuthUser = {
        id: "U-DEMO", username: input.username, fullName: input.fullName,
        email: input.email, role: "Agent",
        team: input.team || "Lead-Actifs", active: true,
      };
      setUser(u);
      await applyPermsForUser(u);
      return;
    }
    const r = await api<{ token: string; user: AuthUser }>("/auth_signup.php", {
      method: "POST",
      body: input,
    });
    setToken(r.token);
    setUser(r.user);
    await applyPermsForUser(r.user);
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    if (!newPassword || newPassword.length < 8) {
      throw new Error("Le nouveau mot de passe doit contenir au moins 8 caractères.");
    }
    if (currentPassword === newPassword) {
      throw new Error("Le nouveau mot de passe doit être différent de l'actuel.");
    }
    if (!API_ENABLED) {
      // Demo mode: no real backend, just simulate success.
      return;
    }
    await api("/auth_change_password.php", {
      method: "POST",
      body: { currentPassword, newPassword },
    });
    setUser((u) => (u ? { ...u, mustChangePassword: false } : u));
  };

  const updateProfile = async (patch: Partial<AuthUser>): Promise<AuthUser> => {
    if (!API_ENABLED) {
      const next = { ...(user as AuthUser), ...patch };
      setUser(next);
      return next;
    }
    const r = await api<{ user: AuthUser }>("/auth_update_profile.php", {
      method: "POST",
      body: patch,
    });
    setUser((u) => (u ? { ...u, ...r.user } : r.user));
    return r.user;
  };

  const clearMustChange = () => setUser((u) => (u ? { ...u, mustChangePassword: false } : u));

  const logout = async () => {
    if (API_ENABLED) {
      // CRITICAL: await clock_out BEFORE navigating away. Without await + keepalive,
      // window.location.href below cancels the in-flight fetch and the attendance
      // session stays open forever (logout_at NULL, total_minutes 0), then every
      // subsequent login reuses that stale row.
      await Promise.allSettled([
        api("/attendance.php?action=clock_out", { method: "POST", body: {}, keepalive: true }),
        api("/auth_logout.php", { method: "POST", keepalive: true }),
      ]);
    }
    // Wipe the per-user permissions cache so the next user on this machine
    // doesn't inherit a stale snapshot.
    if (typeof window !== "undefined") {
      try {
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const k = localStorage.key(i);
          if (k && k.startsWith(PERMS_CACHE_PREFIX)) localStorage.removeItem(k);
        }
      } catch { /* ignore */ }
    }
    setToken(null);
    setUser(null);
    setPermissions({});
    if (typeof window !== "undefined") window.location.href = "/login";
  };



  const hasPermission = useCallback(
    (key: string) => {
      if (!user) return false;
      if (user.role === "Administrateur") return true;
      return !!permissions[key];
    },
    [user, permissions],
  );

  const refreshPermissions = useCallback(async () => {
    await applyPermsForUser(user);
  }, [user, applyPermsForUser]);

  return (
    <AuthContext.Provider
      value={{
        user, loading, permissionsLoading, apiEnabled: API_ENABLED,
        permissions, hasPermission, refreshPermissions,
        login, verifyOtp, resendOtp, signup, changePassword, updateProfile, clearMustChange, logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
