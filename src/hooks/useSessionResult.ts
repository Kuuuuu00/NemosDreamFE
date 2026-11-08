import { useCallback, useEffect, useState } from "react";
import { api, isAbortError } from "@/api";
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
    setStatus("loading");
    Promise.all([
      api.getResult(sessionId, { signal: ctrl.signal }),
      // weTrace is its own endpoint, fetched alongside the result.
      api.getWeTrace(sessionId, { signal: ctrl.signal }).catch((e) => {
        if (isAbortError(e)) throw e;
        return null;
      }),
    ])
      .then(([r, wt]) => {
        if (ctrl.signal.aborted) return;
        setResult(r);
        setWeTrace(wt);
        setStatus("ready");
      })
      .catch((e) => {
        if (!isAbortError(e) && !ctrl.signal.aborted) setStatus("error"); // TODO(3-3): ErrorBanner / SESSION_EXPIRED
      });
    return () => ctrl.abort();
  }, [sessionId]);

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
    await run(async () => {
      const startedAt = performance.now();
      const r = await api.getRepeatSimulation(sessionId, 100, { myRunsAllowed: result?.runsAllowedInRange.mine });
      const elapsedMs = performance.now() - startedAt;
      if (elapsedMs > 3000) {
        console.warn(`repeatSimulation took ${elapsedMs.toFixed(0)}ms for n=100 — over the 3s budget, needs a progress UI`);
      }
      setRepeat(r);
      setRepeatOpen(true);
    });
  }, [sessionId, repeat, repeatOpen, result, run]);

  return { result, weTrace, status, repeat, repeatOpen, repeatLoading, toggleRepeat };
}
