import { useEffect, useRef, useState } from "react";

/**
 * useState backed by sessionStorage, so values survive a navigation away
 * and back to the same page within the tab session.
 */
export function usePersistedState<T>(key: string, initial: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return initial;
    try {
      const raw = sessionStorage.getItem(key);
      if (raw == null) return initial;
      const parsed = JSON.parse(raw);
      // Re-hydrate Set if initial value is a Set
      if (initial instanceof Set && Array.isArray(parsed)) {
        return new Set(parsed) as unknown as T;
      }
      return parsed as T;
    } catch {
      return initial;
    }
  });

  const keyRef = useRef(key);
  useEffect(() => { keyRef.current = key; }, [key]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const toStore = value instanceof Set ? Array.from(value) : value;
      sessionStorage.setItem(keyRef.current, JSON.stringify(toStore));
    } catch {
      // ignore quota errors
    }
  }, [value]);

  return [value, setValue];
}
