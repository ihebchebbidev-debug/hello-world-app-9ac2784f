import { useEffect, useState } from "react";

/**
 * Returns a debounced copy of `value`. Useful for search inputs over large
 * lists — keeps the input snappy while the expensive `filter` only runs after
 * the user stops typing.
 */
export function useDebouncedValue<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
