import { useCallback, useEffect, useRef, useState } from "react";
import { api, createLatest, isAbortError, mockExtras } from "@/api";
import { useInFlight } from "@/hooks/useInFlight";
import type { RecommendationResult } from "@/types/recommendation";
import type {
  AdvanceHalfResponse,
  GameState,
  OffenseHalfSummary,
  PAResult,
  Pitcher,
  RecommendResponse,
  SessionParams,
  UsageEntry,
  WeTraceResponse,
} from "@/types/api";

export type { SessionParams };

type Status = "idle" | "loading" | "ready" | "error";

/** Net WE swing of an advance-half summary: my-team perspective, last − first. */
function offenseDeltaWe(weTrace: number[]): number {
  return weTrace.length >= 2 ? +(weTrace[weTrace.length - 1] - weTrace[0]).toFixed(4) : 0;
}

/**
 * TRANSITIONAL (3-1): keeps the existing dashboard working against the real
 * flow (simulate-pa → my_role "offense" → advance-half). The 3-2 dashboard
 * agent replaces this with proper `my_role` branching, `useGameHistory`,
 * sessionStorage restore and error UI.
 */
function toOffenseSummary(offense: GameState, adv: AdvanceHalfResponse): OffenseHalfSummary {
  return {
    inning: offense.inning,
    half: offense.half,
    runs: adv.summary.runs,
    deltaWe: offenseDeltaWe(adv.summary.weTrace),
    hits: adv.summary.hits,
    paLog: adv.summary.paLog.map((p) => ({
      batter: p.batter,
      outcome: p.outcome,
      description: p.description,
      runsScored: p.runsScored ?? undefined,
    })),
  };
}

export function useGameSession(params: SessionParams | null) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [recommendData, setRecommendData] = useState<RecommendResponse | null>(null);
  const [recommendation, setRecommendation] = useState<RecommendationResult | null>(null);
  const [usageToday, setUsageToday] = useState<UsageEntry[]>([]);
  const [usedTonight, setUsedTonight] = useState<Pitcher[]>([]);
  const [weTrace, setWeTrace] = useState<WeTraceResponse | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [lastResult, setLastResult] = useState<PAResult | null>(null);
  // One lock for every action that mutates the session (simulate-pa,
  // advance-half, undo): calls made while one is in flight are ignored.
  const { inFlight, run } = useInFlight();

  const sessionIdRef = useRef<string | null>(null);
  // Late we-trace responses must not overwrite a newer one.
  const weTraceGuard = useRef(createLatest());

  const refreshAll = useCallback(async (id: string, forState: GameState) => {
    const req = weTraceGuard.current.begin();
    const tasks: Promise<void>[] = [
      api
        .getWeTrace(id, { signal: req.signal })
        .then((we) => {
          if (req.isCurrent()) setWeTrace(we);
        })
        .catch((e) => {
          if (!isAbortError(e)) throw e;
        }),
    ];
    // recommend is only valid on defense (offense → INVALID_ROLE).
    if (forState.myRole === "defense" && !forState.isGameOver) {
      tasks.push(
        api.recommend(id, forState).then((bundle) => {
          setRecommendData(bundle.summary);
          setRecommendation(bundle.ranking);
        }),
      );
    }
    if (mockExtras) {
      // Mock-only data; real equivalents (used chips / usage timeline from
      // recommend + /result) are wired by the 3-2 dashboard agent.
      tasks.push(
        mockExtras.getUsageToday(id).then(setUsageToday),
        mockExtras.getUsedTonight(id).then(setUsedTonight),
      );
    }
    await Promise.all(tasks);
  }, []);

  useEffect(() => {
    if (!params) {
      setStatus("idle");
      return;
    }
    let cancelled = false;
    const guard = weTraceGuard.current;
    setStatus("loading");
    setLastResult(null);
    (async () => {
      try {
        const { state: initial } = await api.createSession(params);
        if (cancelled) return;
        sessionIdRef.current = initial.sessionId;
        setSessionId(initial.sessionId);
        setState(initial);
        await refreshAll(initial.sessionId, initial);
        if (cancelled) return;
        setStatus("ready");
      } catch (e) {
        console.error("[useGameSession] start failed", e); // TODO(3-3): ErrorBanner
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
      guard.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.myTeam, params?.oppTeam, params?.gameId, params?.startInning]);

  /** `pitcherId`: string (ReliefCandidate.pitcherId); a number is accepted for the current pitcher's id. */
  const simulate = useCallback(
    async (pitcherId: string | number) => {
      const id = sessionIdRef.current;
      if (!id) return null;
      const out = await run(async () => {
        const { result } = await api.simulatePa(id, String(pitcherId));
        let merged: PAResult = result;
        let next = result.nextState;
        if (next.myRole === "offense" && !next.isGameOver) {
          const adv = await api.advanceHalf(id);
          merged = { ...result, nextState: adv.state, offenseHalfSummary: toOffenseSummary(next, adv) };
          next = adv.state;
        }
        setState(next);
        setLastResult(merged);
        await refreshAll(id, next);
        return merged;
      });
      return out ?? null;
    },
    [refreshAll, run],
  );

  const undo = useCallback(async () => {
    const id = sessionIdRef.current;
    if (!id) return;
    await run(async () => {
      const { state: prev } = await api.undoLast(id);
      setState(prev);
      setLastResult(null);
      await refreshAll(id, prev);
    });
  }, [refreshAll, run]);

  return {
    sessionId,
    state,
    recommendData,
    recommendation,
    usageToday,
    usedTonight,
    weTrace,
    status,
    /** True while simulate-pa / advance-half / undo is in flight: disable those buttons. */
    simulating: inFlight,
    lastResult,
    simulate,
    undo,
  };
}
