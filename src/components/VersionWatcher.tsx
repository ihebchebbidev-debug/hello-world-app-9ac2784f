import { useEffect, useRef } from "react";
import { toast } from "sonner";

/**
 * Recharge automatiquement l'app quand un nouveau déploiement Vercel est détecté.
 * - Poll /version.json toutes les 60s
 * - Vérifie aussi au focus de l'onglet
 * - Si la version a changé : toast + reload forcé (cache busté)
 */
export function VersionWatcher() {
  const currentVersion = useRef<string | null>(null);
  const reloading = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const VERSION_URL = "/version.json";

    async function fetchVersion(): Promise<string | null> {
      try {
        const res = await fetch(`${VERSION_URL}?t=${Date.now()}`, {
          cache: "no-store",
          headers: { "cache-control": "no-cache" },
        });
        if (!res.ok) return null;
        const data = (await res.json()) as { version?: string };
        return data?.version ?? null;
      } catch {
        return null;
      }
    }

    const STORAGE_KEY = "app_version_seen";
    const RELOAD_GUARD_KEY = "app_version_last_reload";
    const RELOAD_COOLDOWN_MS = 5 * 60_000; // never reload more than once / 5min

    async function check() {
      if (reloading.current) return;
      const v = await fetchVersion();
      if (!v) return;
      // Ignore the dev placeholder — would cause reload loops in preview/local
      if (v === "dev") {
        currentVersion.current = v;
        return;
      }
      if (currentVersion.current === null) {
        // First sighting this session: seed from localStorage if present, else from v
        const stored = localStorage.getItem(STORAGE_KEY);
        currentVersion.current = stored ?? v;
        if (!stored) localStorage.setItem(STORAGE_KEY, v);
        if (currentVersion.current === v) return;
      }
      if (v !== currentVersion.current) {
        // Cooldown guard — avoid reload storms if two edges serve different builds
        const lastReload = Number(localStorage.getItem(RELOAD_GUARD_KEY) ?? 0);
        if (Date.now() - lastReload < RELOAD_COOLDOWN_MS) {
          currentVersion.current = v;
          return;
        }
        reloading.current = true;
        localStorage.setItem(STORAGE_KEY, v);
        localStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
        toast.info("Nouvelle version disponible — rechargement…", { duration: 2000 });
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      }
    }

    // Check immédiatement
    check();

    // Poll régulier
    const interval = window.setInterval(check, 60_000);

    // Check au retour de focus
    const onFocus = () => check();
    const onVisibility = () => {
      if (document.visibilityState === "visible") check();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return null;
}
