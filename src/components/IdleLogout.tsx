import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { fetchIdleTimeouts, getRoleTimeoutMinutes } from "@/lib/idleTimeouts";

/**
 * Auto-logout users after a period of inactivity. The auth provider's
 * `logout()` already calls /attendance.php?action=clock_out, so the
 * worked-hours report only reflects time the user was actually active.
 *
 * Timeout is configurable per role via `idle_timeouts.php` (see
 * src/lib/idleTimeouts.ts). A value of 0 disables the timeout for that role
 * (default behaviour for "Administrateur").
 *
 * Multi-tab sync: a BroadcastChannel ("idle-sync") relays activity pings and
 * logout events between tabs of the same user. Activity in any tab resets
 * the idle timer in all other tabs; auto-logout (or a manual logout) closes
 * every tab at once. localStorage acts as a fallback for browsers without
 * BroadcastChannel support.
 */

const WARN_BEFORE_MS = 2 * 60 * 1000; // 2 min warning before logout
const STORAGE_KEY = "lastActivityAt";
const CHANNEL_NAME = "idle-sync";
const ACTIVITY_BROADCAST_THROTTLE_MS = 5_000; // limit cross-tab traffic

export function IdleLogout() {
  const { user, logout } = useAuth();
  const [, setReady] = useState(0);
  const warnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hydrate per-role config once when a user is present. fetchIdleTimeouts
  // updates the cache that getRoleTimeoutMinutes reads from.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void fetchIdleTimeouts().then(() => { if (!cancelled) setReady((n) => n + 1); });
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const minutes = getRoleTimeoutMinutes(user.role);
    if (!minutes || minutes <= 0) return; // disabled for this role
    const limitMs = minutes * 60 * 1000;
    const warnBefore = Math.min(WARN_BEFORE_MS, Math.floor(limitMs / 2));

    // Cross-tab channel. Falls back to `null` on browsers without support;
    // the storage event below still keeps tabs roughly in sync.
    const channel: BroadcastChannel | null =
      typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CHANNEL_NAME) : null;
    let lastBroadcastTs = 0;
    let loggingOut = false;

    const clearTimers = () => {
      if (warnTimer.current) clearTimeout(warnTimer.current);
      if (logoutTimer.current) clearTimeout(logoutTimer.current);
      warnTimer.current = null;
      logoutTimer.current = null;
    };

    const performLogout = (broadcast: boolean) => {
      if (loggingOut) return;
      loggingOut = true;
      clearTimers();
      if (broadcast && channel) {
        try { channel.postMessage({ type: "logout" }); } catch { /* ignore */ }
      }
      toast.error(`Déconnexion automatique après ${minutes} min d'inactivité`);
      setTimeout(() => logout(), 250);
    };

    const scheduleFromActivity = (lastTs: number) => {
      clearTimers();
      const remaining = limitMs - (Date.now() - lastTs);
      if (remaining <= 0) { performLogout(true); return; }
      const warnIn = remaining - warnBefore;
      if (warnIn > 0) {
        warnTimer.current = setTimeout(() => {
          toast.warning(`Vous serez déconnecté dans ${Math.round(warnBefore / 60000)} min sans activité.`);
        }, warnIn);
      }
      logoutTimer.current = setTimeout(() => performLogout(true), remaining);
    };

    const markActivity = () => {
      const now = Date.now();
      try { localStorage.setItem(STORAGE_KEY, String(now)); } catch { /* ignore */ }
      scheduleFromActivity(now);
      // Throttled broadcast to peer tabs.
      if (channel && now - lastBroadcastTs >= ACTIVITY_BROADCAST_THROTTLE_MS) {
        lastBroadcastTs = now;
        try { channel.postMessage({ type: "activity", ts: now }); } catch { /* ignore */ }
      }
    };

    let initialTs = Date.now();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? Number(raw) : NaN;
      if (Number.isFinite(parsed) && parsed > 0) initialTs = parsed;
      else localStorage.setItem(STORAGE_KEY, String(initialTs));
    } catch { /* ignore */ }
    scheduleFromActivity(initialTs);

    const events: (keyof WindowEventMap)[] = [
      "mousemove", "mousedown", "keydown", "wheel", "touchstart", "scroll", "focus",
    ];
    for (const e of events) window.addEventListener(e, markActivity, { passive: true });

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          const parsed = raw ? Number(raw) : NaN;
          scheduleFromActivity(Number.isFinite(parsed) && parsed > 0 ? parsed : Date.now());
        } catch { scheduleFromActivity(Date.now()); }
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    // Cross-tab: react to peer messages WITHOUT re-broadcasting.
    const onChannelMessage = (ev: MessageEvent) => {
      const msg = ev.data;
      if (!msg || typeof msg !== "object") return;
      if (msg.type === "activity" && typeof msg.ts === "number") {
        try { localStorage.setItem(STORAGE_KEY, String(msg.ts)); } catch { /* ignore */ }
        scheduleFromActivity(msg.ts);
      } else if (msg.type === "logout") {
        // Peer logged out — mirror it locally without re-broadcasting.
        if (loggingOut) return;
        loggingOut = true;
        clearTimers();
        setTimeout(() => logout(), 0);
      }
    };
    if (channel) channel.addEventListener("message", onChannelMessage);

    // Storage-event fallback: a peer tab updating lastActivityAt wakes us up.
    const onStorage = (ev: StorageEvent) => {
      if (ev.key !== STORAGE_KEY || !ev.newValue) return;
      const ts = Number(ev.newValue);
      if (Number.isFinite(ts) && ts > 0) scheduleFromActivity(ts);
    };
    window.addEventListener("storage", onStorage);

    return () => {
      clearTimers();
      for (const e of events) window.removeEventListener(e, markActivity);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("storage", onStorage);
      if (channel) {
        try { channel.removeEventListener("message", onChannelMessage); } catch { /* ignore */ }
        try { channel.close(); } catch { /* ignore */ }
      }
    };
  }, [user, logout]);

  return null;
}
