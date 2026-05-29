import { useEffect, useState } from "react";

const STORAGE_KEY = "sidebar.collapsed";
const EVENT = "sidebar-collapsed-change";

function readInitial(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function useSidebarCollapsed(): [boolean, (next: boolean | ((prev: boolean) => boolean)) => void] {
  const [collapsed, setCollapsed] = useState<boolean>(readInitial);

  useEffect(() => {
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<boolean>).detail;
      setCollapsed(detail);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setCollapsed(e.newValue === "1");
    };
    window.addEventListener(EVENT, onChange as EventListener);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVENT, onChange as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const update = (next: boolean | ((prev: boolean) => boolean)) => {
    setCollapsed((prev) => {
      const value = typeof next === "function" ? (next as (p: boolean) => boolean)(prev) : next;
      try { window.localStorage.setItem(STORAGE_KEY, value ? "1" : "0"); } catch {}
      window.dispatchEvent(new CustomEvent(EVENT, { detail: value }));
      return value;
    });
  };

  return [collapsed, update];
}
