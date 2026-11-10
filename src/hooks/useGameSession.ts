import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { api, ApiRequestError, createLatest, isAbortError, isApiError, mockExtras, USE_MOCK } from "@/api";
import { loadSnapshot, saveSnapshot } from "@/api/sessionStore";
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

/** Outcomes that record an out (used only to light the out dots while a half-ending result is shown). */
const OUT_OUTCOMES: ReadonlySet<string> = new Set(["SO", "GO", "FO", "GDP"]);

/** My pitching usage vs. the real manager's, since the session started (`GET /result`). */
export interface UsageTimeline {
  mine: PitcherUsageSegment[];
  actual: PitcherUsageSegment[];
}

export interface SimulateArgs {
  pitcherId: string;
  pitcherName: string;
  changed: boolean;
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
  /** True only while the simulate-pa request itself is running (drives the "타석 진행 중…" placeholder). */
  const [paInFlight, setPaInFlight] = useState(false);
  /**
   * Non-null while the screen deliberately keeps showing the previous state
   * after a half-ending / game-ending PA, so its result effect plays on the
   * state it was decided on. `threeOuts`: display-only hint to light 3 out dots.
   */
  const [viewHold, setViewHold] = useState<{ threeOuts: boolean } | null>(null);
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
  /** What `retry` re-runs: the last failed action (cleared when a new action starts). */
  const retryRef = useRef<(() => void) | null>(null);
  const actionsRef = useRef<{ simulate: (a: SimulateArgs) => Promise<unknown>; advance: () => Promise<unknown>; undo: () => Promise<unknown> } | null>(null);
  // Late responses must not overwrite newer ones.
  const weTraceGuard = useRef(createLatest());
  const resultGuard = useRef(createLatest());
  const recommendSeq = useRef(0);

  // `stateRef` is always the server-confirmed state (all logic reads it). `state`
  // (what renders) normally follows it, except while `viewGate` is up.
  const viewGate = useRef(false);
  // Refresh results (we-trace / usage timeline / recommend) go through `applyRefresh`. While a hold is open
  // they are queued, so the page can keep the dashboard unchanged while an overlay fades in; `open()` then
  // applies everything queued — plus the caller's own update — in ONE transition (one React commit).
  const refreshHeld = useRef(false);
  const refreshQueue = useRef<(() => void)[]>([]);
  const applyRefresh = useCallback((fn: () => void) => {
    if (refreshHeld.current) refreshQueue.current.push(fn);
    else startTransition(fn);
  }, []);
  const holdRefresh = useCallback((): ((alongside?: () => void) => void) => {
    refreshHeld.current = true;
    return (alongside) => {
      refreshHeld.current = false;
      const queued = refreshQueue.current.splice(0);
      startTransition(() => {
        alongside?.();
        queued.forEach((f) => f());
      });
    };
  }, []);
  const applyState = useCallback((s: GameState) => {
    stateRef.current = s;
    if (!viewGate.current) setState(s);
  }, []);

  /** Show the confirmed state now (end of the result-effect hold). */
  const releaseView = useCallback(() => {
    viewGate.current = false;
    setViewHold(null);
    if (stateRef.current) setState(stateRef.current);
  }, []);

  /**
   * Save the confirmed server state and the matching history together, under
   * one sessionStorage key. Call exactly once, after BOTH are updated at the end
   * of a successful response (never between the two updates).
   * TODO(backend): obsolete once `GET /sessions/{id}` exists (REPORT #4).
   */
  const persist = useCallback((id: string, s: GameState) => {
    if (USE_MOCK) return; // mock sessions don't survive a refresh anyway
    saveSnapshot(id, s, historyRef.current.exportState());
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
            applyRefresh(() => {
              if (weReq.isCurrent()) setWeTrace(we);
            });
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
              applyRefresh(() => {
                if (resReq.isCurrent()) setUsageTimeline({ mine: r.pitcherUsage, actual: r.actualPitcherUsage });
              });
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
              applyRefresh(() => {
                if (seq !== recommendSeq.current) return;
                setRecommendData(bundle.summary);
                setRecommendation(bundle.ranking);
                setNoAvailablePitcher(false);
              });
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
    [applyRefresh, fail],
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
      viewGate.current = false;
      setViewHold(null);
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
        if (!snap || !historyRef.current.restore(snap.history, initial.sessionId)) historyRef.current.recordStart(initial);
        persist(initial.sessionId, initial);
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
    async (args: SimulateArgs) => {
      const id = sessionIdRef.current;
      const prev = stateRef.current;
      if (!id || !prev || prev.myRole !== "defense" || prev.isGameOver) return null;
      // Captured before the decision, revealed only after it.
      const actual = recommendDataRef.current?.actualDecision ?? null;
      const out = await run(async () => {
        setError(null);
        retryRef.current = null;
        setPaInFlight(true);
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
          const next = result.nextState;
          // A PA that ends the half (→ offense) or the game: `next` is already the
          // next half (0 outs, empty bases) — don't show it until the result effect
          // has played. Logic uses the confirmed state; only the render is held.
          const ending = next.myRole === "offense" || next.isGameOver;
          if (ending) {
            viewGate.current = true;
            setViewHold({
              threeOuts: OUT_OUTCOMES.has(result.outcome) && !next.isGameOver && (next.inning !== prev.inning || next.half !== prev.half),
            });
          }
          applyState(next); // server state replaces ours wholesale
          persist(id, next);
          setLastResult(result);
          setDecidedActual(actual);
          // Half-ending: play the effect right away (the refresh below keeps running under the lock).
          if (ending) setPaInFlight(false);
          await refreshAll(id, next);
          return { result, prevState: prev, ending };
        } catch (e) {
          // NOTE: no state-read API exists (REPORT #4), so after a lost response we can't tell whether the server applied the PA.
          retryRef.current = () => void actionsRef.current?.simulate(args);
          fail(e);
          return null;
        } finally {
          setPaInFlight(false);
        }
      });
      return out ?? null;
    },
    [applyState, fail, persist, refreshAll, run],
  );

  /**
   * `POST /advance-half`, split in two so the page can overlap the request with
   * the previous PA's result effect:
   *  - `prepareAdvance()` sends the request NOW (nothing is applied or recorded);
   *  - `commit()` waits for the response, then applies the state, records the
   *    log / LI point and refreshes. It resolves right after applying (before
   *    the refresh) so the overlay isn't delayed; the lock covers the refresh.
   * A failed request is reported by `commit()` (resolves null + `error`).
   * Only valid in an offense state.
   */
  const prepareAdvance = useCallback((): { commit: () => Promise<AdvanceOutcome | null> } | null => {
    const id = sessionIdRef.current;
    const off = stateRef.current;
    if (!id || !off || off.myRole !== "offense" || off.isGameOver) return null;
    const req = api.advanceHalf(id);
    req.catch(() => {}); // surfaced through commit()
    const commit = () =>
      new Promise<AdvanceOutcome | null>((resolve) => {
        void run(async () => {
          setError(null);
          retryRef.current = null;
          try {
            const res = await req;
            const outcome: AdvanceOutcome = { summary: res.summary, offenseInning: off.inning, offenseHalf: off.half, state: res.state };
            historyRef.current.recordAdvanceHalf({
              summary: res.summary,
              offenseInning: off.inning,
              offenseHalf: off.half,
              state: res.state,
            });
            applyState(res.state);
            persist(id, res.state);
            resolve(outcome);
            await refreshAll(id, res.state);
          } catch (e) {
            retryRef.current = () => void actionsRef.current?.advance();
            fail(e);
            resolve(null);
          }
        }).then(() => resolve(null)); // lock held (action in flight) → never ran; no-op after a real resolve
      });
    return { commit };
  }, [applyState, fail, persist, refreshAll, run]);

  /** Request + apply in one go (offense-wait card, banner retry). */
  const advance = useCallback(async (): Promise<AdvanceOutcome | null> => {
    const prepared = prepareAdvance();
    return prepared ? prepared.commit() : null;
  }, [prepareAdvance]);

  const undo = useCallback(async () => {
    const id = sessionIdRef.current;
    if (!id) return;
    await run(async () => {
      setError(null);
      retryRef.current = null;
      try {
        const { state: prev } = await api.undoLast(id);
        historyRef.current.recordUndo(prev); // pops log + LI series together
        applyState(prev);
        persist(id, prev);
        setLastResult(null);
        setDecidedActual(null);
        await refreshAll(id, prev);
      } catch (e) {
        retryRef.current = () => void actionsRef.current?.undo();
        fail(e);
      }
    });
  }, [applyState, fail, persist, refreshAll, run]);

  actionsRef.current = { simulate, advance, undo };

  /** Retry whatever failed last: a failed start restarts; otherwise re-sync the current state. */
  const retry = useCallback(() => {
    setError(null);
    const replay = retryRef.current;
    retryRef.current = null;
    if (replay) {
      replay(); // re-run the failed simulate / advance / undo
      return;
    }
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
    /** Dismiss the banner without retrying. */
    clearError: () => {
      retryRef.current = null;
      setError(null);
    },
    /** True while simulate-pa / advance-half / undo is in flight: disable those buttons. */
    simulating: inFlight,
    /** True only while the simulate-pa request itself is running. */
    paInFlight,
    /** Non-null while the previous state is deliberately kept on screen (result effect playing); see `releaseView`. */
    viewHold,
    releaseView,
    holdRefresh,
    prepareAdvance,
    lastResult,
    decidedActual,
    history,
    simulate,
    advance,
    undo,
  };
}
