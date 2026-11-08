import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiRequestError, createLatest, isAbortError, isApiError, mockExtras } from "@/api";
import { loadSnapshot } from "@/api/sessionStore";
import { useGameHistory } from "@/hooks/useGameHistory";
import { useInFlight } from "@/hooks/useInFlight";
import type { RecommendationResult } from "@/types/recommendation";
import type {
  ActualDecision,
  AdvanceHalfSummary,
  GameState,
  Half,
  PAResult,
  Pitcher,
  PitcherUsageSegment,
  RecommendResponse,
  SessionParams,
  UsageEntry,
  WeTraceResponse,
} from "@/types/api";

export type { SessionParams };

type Status = "idle" | "loading" | "ready" | "error";

/** `advance-half` is held at least this long so the half-inning transition
 * keeps its pacing even when the server answers instantly (spec §3-8). */
const MIN_ADVANCE_MS = 2000;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** My pitching usage vs. the real manager's, since the session started (`GET /result`). */
export interface UsageTimeline {
  mine: PitcherUsageSegment[];
  actual: PitcherUsageSegment[];
}

export interface AdvanceOutcome {
  summary: AdvanceHalfSummary;
  offenseInning: number;
  offenseHalf: Half;
  state: GameState;
}

/** React StrictMode runs the start effect twice in dev; sharing the pending
 * `POST /sessions` keeps that from creating (and persisting) two sessions. */
const pendingStarts = new Map<string, Promise<{ state: GameState }>>();
function startOnce(params: SessionParams): Promise<{ state: GameState }> {
  const key = JSON.stringify(params);
  let p = pendingStarts.get(key);
  if (!p) {
    p = api.createSession(params).finally(() => pendingStarts.delete(key));
    pendingStarts.set(key, p);
  }
  return p;
}

function toRequestError(e: unknown): ApiRequestError {
  return isApiError(e) ? e : new ApiRequestError("INTERNAL_ERROR", e instanceof Error ? e.message : String(e), true);
}

/**
 * Live session lifecycle, branching on `state.myRole` (연동 명세 §1-1):
 * - defense: `recommend` → the user picks → `simulate`
 * - offense (after a 3rd out, or after undoing an offense half): `advance`;
 *   `recommend` is never called (INVALID_ROLE)
 *
 * The server's `GameState` always replaces the local one wholesale; nothing
 * here edits outs / runners / score. Errors are exposed (`error`, `retry`)
 * rather than rendered — the page decides how to show them.
 */
export function useGameSession(params: SessionParams | null, resumeSessionId: string | null = null) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [recommendData, setRecommendData] = useState<RecommendResponse | null>(null);
  const [recommendation, setRecommendation] = useState<RecommendationResult | null>(null);
  /** `recommend` answered 409 NO_AVAILABLE_PITCHER: only "stay" is possible. */
  const [noAvailablePitcher, setNoAvailablePitcher] = useState(false);
  const [usageToday, setUsageToday] = useState<UsageEntry[]>([]); // mock only
  const [usedTonight, setUsedTonight] = useState<Pitcher[]>([]); // mock only
  const [usageTimeline, setUsageTimeline] = useState<UsageTimeline | null>(null); // real API only
  const [weTrace, setWeTrace] = useState<WeTraceResponse | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<ApiRequestError | null>(null);
  const [lastResult, setLastResult] = useState<PAResult | null>(null);
  /** The real manager's choice for the PA the user just decided — only set AFTER the decision. */
  const [decidedActual, setDecidedActual] = useState<ActualDecision | null>(null);
  // One lock for every action that mutates the session (simulate-pa,
  // advance-half, undo): calls made while one is in flight are ignored.
  const { inFlight, run } = useInFlight();
  const history = useGameHistory();

  const historyRef = useRef(history);
  historyRef.current = history;
  const sessionIdRef = useRef<string | null>(null);
  const stateRef = useRef<GameState | null>(null);
  const recommendDataRef = useRef<RecommendResponse | null>(null);
  const startRef = useRef<() => void>(() => {});
  // Late responses must not overwrite newer ones.
  const weTraceGuard = useRef(createLatest());
  const resultGuard = useRef(createLatest());
  const recommendSeq = useRef(0);

  const applyState = useCallback((s: GameState) => {
    stateRef.current = s;
    setState(s);
  }, []);

  const fail = useCallback((e: unknown) => {
    if (isAbortError(e)) return;
    console.error("[useGameSession]", e);
    setError(toRequestError(e));
  }, []);

  /** Re-fetch everything the dashboard shows for `forState`. Returns false if a required call failed (error is set). */
  const refreshAll = useCallback(
    async (id: string, forState: GameState): Promise<boolean> => {
      // Game over → the page navigates to /result; nothing more to load here.
      if (forState.isGameOver) return true;
      let ok = true;
      const tasks: Promise<void>[] = [];

      const weReq = weTraceGuard.current.begin();
      tasks.push(
        api
          .getWeTrace(id, { signal: weReq.signal })
          .then((we) => {
            if (weReq.isCurrent()) setWeTrace(we);
          })
          .catch((e) => {
            if (isAbortError(e)) return;
            ok = false;
            fail(e);
          }),
      );

      if (mockExtras) {
        tasks.push(mockExtras.getUsageToday(id).then(setUsageToday), mockExtras.getUsedTonight(id).then(setUsedTonight));
      } else {
        // The usage timeline comes from /result (pitcher_usage / actual_pitcher_usage) — never recorded client-side.
        const resReq = resultGuard.current.begin();
        tasks.push(
          api
            .getResult(id, { signal: resReq.signal })
            .then((r) => {
              if (resReq.isCurrent()) setUsageTimeline({ mine: r.pitcherUsage, actual: r.actualPitcherUsage });
            })
            .catch((e) => {
              // Auxiliary card: don't fail the whole refresh over it.
              if (!isAbortError(e)) console.warn("[useGameSession] usage timeline unavailable", e);
            }),
        );
      }

      if (forState.myRole === "defense") {
        const seq = ++recommendSeq.current;
        tasks.push(
          api
            .recommend(id, forState)
            .then((bundle) => {
              if (seq !== recommendSeq.current) return;
              recommendDataRef.current = bundle.summary;
              setRecommendData(bundle.summary);
              setRecommendation(bundle.ranking);
              setNoAvailablePitcher(false);
            })
            .catch((e) => {
              if (seq !== recommendSeq.current || isAbortError(e)) return;
              if (isApiError(e) && e.code === "NO_AVAILABLE_PITCHER") {
                recommendDataRef.current = null;
                setRecommendData(null);
                setRecommendation(null);
                setNoAvailablePitcher(true);
                return;
              }
              ok = false;
              fail(e);
            }),
        );
      } else {
        // Offense: recommend would be INVALID_ROLE. Invalidate any in-flight one.
        recommendSeq.current++;
        setNoAvailablePitcher(false);
      }

      await Promise.all(tasks);
      return ok;
    },
    [fail],
  );

  useEffect(() => {
    if (!params) {
      setStatus("idle");
      return;
    }
    let cancelled = false;
    const weGuard = weTraceGuard.current;
    const resGuard = resultGuard.current;

    const begin = async () => {
      setStatus("loading");
      setError(null);
      setLastResult(null);
      setDecidedActual(null);
      setNoAvailablePitcher(false);
      try {
        // Page refresh: resume the server session from our saved snapshot.
        // TODO(backend): replace with `GET /sessions/{id}` once it exists (REPORT #4);
        // an expired session then surfaces as SESSION_EXPIRED from recommend/we-trace below.
        const snap = resumeSessionId ? loadSnapshot(resumeSessionId) : null;
        const initial = snap ? snap.state : (await startOnce(params)).state;
        if (cancelled) return;
        sessionIdRef.current = initial.sessionId;
        setSessionId(initial.sessionId);
        applyState(initial);
        if (!snap || !historyRef.current.restore(initial.sessionId)) historyRef.current.recordStart(initial);
        const ok = await refreshAll(initial.sessionId, initial);
        if (cancelled) return;
        setStatus(ok ? "ready" : "error");
      } catch (e) {
        if (cancelled) return;
        fail(e);
        setStatus("error");
      }
    };
    startRef.current = () => void begin();
    void begin();

    return () => {
      cancelled = true;
      weGuard.cancel();
      resGuard.cancel();
      recommendSeq.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.myTeam, params?.oppTeam, params?.gameId, params?.startInning, resumeSessionId]);

  /**
   * `pitcherId`: string (ReliefCandidate.pitcherId, or String(current pitcher id) for "stay").
   * Returns null if ignored (action in flight) or failed (see `error`).
   */
  const simulate = useCallback(
    async (args: { pitcherId: string; pitcherName: string; changed: boolean }) => {
      const id = sessionIdRef.current;
      const prev = stateRef.current;
      if (!id || !prev || prev.myRole !== "defense" || prev.isGameOver) return null;
      // Captured before the decision, revealed only after it.
      const actual = recommendDataRef.current?.actualDecision ?? null;
      const out = await run(async () => {
        setError(null);
        try {
          const { result } = await api.simulatePa(id, args.pitcherId);
          // pitcherId as a number is log metadata only; the request used the string.
          historyRef.current.recordPa({
            result,
            pitcherId: Number(args.pitcherId),
            pitcherName: args.pitcherName,
            changed: args.changed,
            prevState: prev,
          });
          applyState(result.nextState); // server state replaces ours wholesale
          setLastResult(result);
          setDecidedActual(actual);
          await refreshAll(id, result.nextState);
          return { result, prevState: prev };
        } catch (e) {
          fail(e);
          return null;
        }
      });
      return out ?? null;
    },
    [applyState, fail, refreshAll, run],
  );

  /** `POST /advance-half` (held ≥ 2s). Only valid in an offense state. */
  const advance = useCallback(async (): Promise<AdvanceOutcome | null> => {
    const id = sessionIdRef.current;
    const off = stateRef.current;
    if (!id || !off || off.myRole !== "offense" || off.isGameOver) return null;
    const out = await run(async () => {
      setError(null);
      try {
        const [res] = await Promise.all([api.advanceHalf(id), sleep(MIN_ADVANCE_MS)]);
        const outcome: AdvanceOutcome = { summary: res.summary, offenseInning: off.inning, offenseHalf: off.half, state: res.state };
        historyRef.current.recordAdvanceHalf({
          summary: res.summary,
          offenseInning: off.inning,
          offenseHalf: off.half,
          state: res.state,
        });
        applyState(res.state);
        await refreshAll(id, res.state);
        return outcome;
      } catch (e) {
        fail(e);
        return null;
      }
    });
    return out ?? null;
  }, [applyState, fail, refreshAll, run]);

  const undo = useCallback(async () => {
    const id = sessionIdRef.current;
    if (!id) return;
    await run(async () => {
      setError(null);
      try {
        const { state: prev } = await api.undoLast(id);
        historyRef.current.recordUndo(prev); // pops log + LI series together
        applyState(prev);
        setLastResult(null);
        setDecidedActual(null);
        await refreshAll(id, prev);
      } catch (e) {
        fail(e);
      }
    });
  }, [applyState, fail, refreshAll, run]);

  /** Retry whatever failed last: a failed start restarts; otherwise re-sync the current state. */
  const retry = useCallback(() => {
    setError(null);
    const id = sessionIdRef.current;
    const s = stateRef.current;
    if (!id || !s) {
      startRef.current();
      return;
    }
    void refreshAll(id, s).then((ok) => {
      if (ok) setStatus("ready");
    });
  }, [refreshAll]);

  return {
    sessionId,
    state,
    recommendData,
    recommendation,
    noAvailablePitcher,
    usageToday,
    usedTonight,
    usageTimeline,
    weTrace,
    status,
    /** Last failed call (never `ABORTED`); the page / banner decides how to show it. */
    error,
    retry,
    /** True while simulate-pa / advance-half / undo is in flight: disable those buttons. */
    simulating: inFlight,
    lastResult,
    decidedActual,
    history,
    simulate,
    advance,
    undo,
  };
}
