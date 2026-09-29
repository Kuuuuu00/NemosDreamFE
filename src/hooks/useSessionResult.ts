import { useCallback, useEffect, useState } from "react";
import * as api from "@/mocks/api";
import type { RepeatResult, SimulationResult } from "@/types/api";

type Status = "idle" | "loading" | "ready" | "error";

/**
 * Reads back an already-finished session by id — deliberately not built on
 * `useGameSession`, whose whole job is *creating* a new session from
 * onboarding params. `/result` never creates a session, it only reads one.
 */
export function useSessionResult(sessionId: string | undefined) {
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [repeat, setRepeat] = useState<RepeatResult | null>(null);
  const [repeatOpen, setRepeatOpen] = useState(false);
  const [repeatLoading, setRepeatLoading] = useState(false);

  useEffect(() => {
    if (!sessionId) {
      setStatus("idle");
      return;
    }
    let cancelled = false;
    setStatus("loading");
    api
      .getResult(sessionId)
      .then((r) => {
        if (cancelled) return;
        setResult(r);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
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
    setRepeatLoading(true);
    const startedAt = performance.now();
    try {
      const r = await api.getRepeatSimulation(sessionId, 100);
      const elapsedMs = performance.now() - startedAt;
      if (elapsedMs > 3000) {
        console.warn(`repeatSimulation took ${elapsedMs.toFixed(0)}ms for n=100 — over the 3s budget, needs a progress UI`);
      }
      setRepeat(r);
      setRepeatOpen(true);
    } finally {
      setRepeatLoading(false);
    }
  }, [sessionId, repeat, repeatOpen]);

  return { result, status, repeat, repeatOpen, repeatLoading, toggleRepeat };
}
