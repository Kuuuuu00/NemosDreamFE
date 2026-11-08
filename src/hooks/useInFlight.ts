import { useCallback, useRef, useState } from "react";

/**
 * Action lock: while one request of a group is in flight, further calls are
 * ignored (returns `undefined`) and `inFlight` is exposed so buttons can
 * disable. Used for simulate-pa / advance-half / undo (one lock for all
 * three — they mutate the same session) and for repeat.
 *
 * The ref makes the guard synchronous (a double click before React re-renders
 * is still dropped); the state drives the UI.
 */
export function useInFlight() {
  const lock = useRef(false);
  const [inFlight, setInFlight] = useState(false);

  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    if (lock.current) return undefined;
    lock.current = true;
    setInFlight(true);
    try {
      return await fn();
    } finally {
      lock.current = false;
      setInFlight(false);
    }
  }, []);

  return { inFlight, run };
}
