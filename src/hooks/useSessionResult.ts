import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiRequestError, createLatest, isAbortError, isApiError } from "@/api";
import { useInFlight } from "@/hooks/useInFlight";
import type { RepeatResult, SimulationResult, WeTraceResponse } from "@/types/api";

type Status = "idle" | "loading" | "ready" | "error";

/**
 * Reads back an already-finished session by id — deliberately not built on
 * `useGameSession`, whose whole job is *creating* a new session from
 * onboarding params. `/result` never creates a session, it only reads one.
 */
export function useSessionResult(sessionId: string | undefined) {
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [weTrace, setWeTrace] = useState<WeTraceResponse | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  // Load error. Only SESSION_EXPIRED should leave the page; the rest is exposed for the 3-3 banner.
  const [error, setError] = useState<ApiRequestError | null>(null);
  const [repeatError, setRepeatError] = useState<ApiRequestError | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // A repeat answered after the session changed (or after a newer click) must not be applied.
  const repeatGuard = useRef(createLatest());
  const [repeat, setRepeat] = useState<RepeatResult | null>(null);
  const [repeatOpen, setRepeatOpen] = useState(false);
  // One lock for repeat: a second click while the first is running is ignored.
  const { inFlight: repeatLoading, run } = useInFlight();

  useEffect(() => {
    if (!sessionId) {
      setStatus("idle");
      return;
    }
    const ctrl = new AbortController();
    // New session → the cached repeat result belongs to the old one.
    repeatGuard.current.cancel();
    setRepeat(null);
    setRepeatOpen(false);
    setRepeatError(null);
    setStatus("loading");
    setError(null);
    Promise.all([
      api.getResult(sessionId, { signal: ctrl.signal }),
      // weTrace is its own endpoint, fetched alongside the result.
      // The result page can't draw without it, so its failure is a load error (banner + retry), not a null.
      api.getWeTrace(sessionId, { signal: ctrl.signal }),
    ])
      .then(([r, wt]) => {
        if (ctrl.signal.aborted) return;
        setResult(r);
        setWeTrace(wt);
        setStatus("ready");
      })
      .catch((e) => {
        if (isAbortError(e) || ctrl.signal.aborted) return;
        setError(isApiError(e) ? e : new ApiRequestError("INTERNAL_ERROR", String(e), true));
        setStatus("error");
      });
    return () => ctrl.abort();
  }, [sessionId, reloadKey]);

  /** Re-run the initial load (for the 3-3 retry button). */
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  const toggleRepeat = useCallback(async () => {
    if (repeatOpen) {
      setRepeatOpen(false);
      return;
    }
    if (repeat) {
      setRepeatOpen(true);
      return;
    }
    if (!sessionId) return;
    setRepeatError(null);
    await run(async () => {
      try {
      const req = repeatGuard.current.begin();
      const startedAt = performance.now();
      const r = await api.getRepeatSimulation(sessionId, 100, { myRunsAllowed: result?.runsAllowedInRange.mine, signal: req.signal });
      if (!req.isCurrent()) return;
      const elapsedMs = performance.now() - startedAt;
      if (elapsedMs > 3000) {
        console.warn(`repeatSimulation took ${elapsedMs.toFixed(0)}ms for n=100 — over the 3s budget, needs a progress UI`);
      }
      setRepeat(r);
      setRepeatOpen(true);
      } catch (e) {
        // Same n returns the same result (measured), so a successful repeat stays cached; a failure is retried by clicking again.
        if (!isAbortError(e) && isApiError(e)) setRepeatError(e);
      }
    });
  }, [sessionId, repeat, repeatOpen, result, run]);

  return { result, weTrace, status, error, reload, repeat, repeatOpen, repeatLoading, repeatError, toggleRepeat };
}
