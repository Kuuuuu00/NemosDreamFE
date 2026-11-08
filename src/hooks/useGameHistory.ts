import { useCallback, useRef, useState } from "react";
import type { AdvanceHalfSummary, GameState, Half, PAResult } from "@/types/api";
import type { GameHistory, LiPoint, LogEntry } from "@/types/history";

/**
 * Action log + leverage-index series sharing ONE undo stack (연동 명세 §3-10-1 B안).
 *
 * - The LI series is NOT computed: it records `GameState.leverageIndex` from
 *   server responses, defense states only (an offense-start state is never
 *   recorded). We-trace's `leverage_index` is a half-inning MAX and is never used here.
 * - Every forward action pushes the pre-action lengths of both lists;
 *   `recordUndo` pops once and truncates both (the server's undo step is one
 *   PA, or a whole offense half — 1:1 with the forward actions).
 * - A `{li: null}` break is inserted whenever the half-inning changes, so the
 *   chart (connectNulls={false}) draws one segment per defensive half.
 * - Not persisted here: the session hook saves `exportState()` together with
 *   the server state under ONE sessionStorage key, once per successful response
 *   (so state and history can't drift apart across a refresh).
 *
 * Mutations go through a ref (synchronous, so back-to-back record calls
 * never see stale state) and are mirrored into React state for rendering.
 */

interface Step {
  log: number;
  li: number;
  kind: "pa" | "advance";
}

interface Store {
  sessionId: string | null;
  log: LogEntry[];
  liSeries: LiPoint[];
  stack: Step[];
  nextLogId: number;
  nextSeq: number;
}

const emptyStore = (sessionId: string | null = null): Store => ({
  sessionId,
  log: [],
  liSeries: [],
  stack: [],
  nextLogId: 1,
  nextSeq: 1,
});

const halfLabel = (inning: number, half: Half) => `${inning}회${half === "top" ? "초" : "말"}`;

function lastLi(series: LiPoint[]): LiPoint | null {
  for (let i = series.length - 1; i >= 0; i--) if (series[i].li !== null) return series[i];
  return null;
}

/** Append `state`'s LI (defense only), with a break first when the half changed. */
function pushPoint(store: Store, state: GameState): void {
  if (state.myRole !== "defense" || state.isGameOver) return;
  const series = store.liSeries;
  const prev = series.length ? series[series.length - 1] : null;
  const newHalf = !prev || prev.inning !== state.inning || prev.half !== state.half;
  if (prev && newHalf && prev.li !== null) {
    series.push({
      seq: store.nextSeq++,
      li: null,
      inning: state.inning,
      half: state.half,
      isDiverged: state.isDiverged,
      paInHalf: 0,
    });
  }
  const paInHalf = newHalf ? 1 : series.filter((p) => p.li !== null && p.inning === state.inning && p.half === state.half).length + 1;
  series.push({
    seq: store.nextSeq++,
    li: state.leverageIndex,
    inning: state.inning,
    half: state.half,
    label: paInHalf === 1 ? halfLabel(state.inning, state.half) : undefined,
    isDiverged: state.isDiverged,
    paInHalf,
  });
}

export function useGameHistory(): GameHistory & { log: LogEntry[] } {
  const ref = useRef<Store>(emptyStore());
  const [view, setView] = useState<{ log: LogEntry[]; liSeries: LiPoint[]; undoDepth: number }>({
    log: [],
    liSeries: [],
    undoDepth: 0,
  });

  const commit = useCallback(() => {
    const s = ref.current;
    // New array identities so memoised consumers re-render.
    setView({ log: [...s.log], liSeries: [...s.liSeries], undoDepth: s.stack.length });
  }, []);

  const recordStart = useCallback(
    (state: GameState) => {
      const s = emptyStore(state.sessionId);
      ref.current = s;
      pushPoint(s, state);
      commit();
    },
    [commit],
  );

  const recordPa = useCallback(
    ({ result, pitcherId, pitcherName, changed, prevState }: { result: PAResult; pitcherId: number; pitcherName: string; changed: boolean; prevState: GameState }) => {
      const s = ref.current;
      s.stack.push({ log: s.log.length, li: s.liSeries.length, kind: "pa" });
      s.log.push({
        id: s.nextLogId++,
        kind: "pa",
        inning: prevState.inning,
        half: prevState.half,
        pitcherId,
        pitcherName,
        changed,
        result,
        batter: prevState.currentBatter.name,
      });
      // A half-ending PA lands on an offense state → pushPoint records nothing.
      pushPoint(s, result.nextState);
      commit();
    },
    [commit],
  );

  const recordAdvanceHalf = useCallback(
    ({ summary, offenseInning, offenseHalf, state }: { summary: AdvanceHalfSummary; offenseInning: number; offenseHalf: Half; state: GameState }) => {
      const s = ref.current;
      s.stack.push({ log: s.log.length, li: s.liSeries.length, kind: "advance" });
      s.log.push({ id: s.nextLogId++, kind: "offense", inning: offenseInning, half: offenseHalf, summary });
      pushPoint(s, state); // inserts the null break (half changed)
      commit();
    },
    [commit],
  );

  const recordUndo = useCallback(
    (state: GameState) => {
      const s = ref.current;
      const step = s.stack.pop();
      if (!step) {
        // The server undid something our stack doesn't know about (history lost
        // or never saved). Don't leave a log/chart that disagrees with the
        // screen: drop it and start recording again from the state we just got.
        console.warn("[useGameHistory] undo succeeded with an empty local stack — history reset from the current state");
        const fresh = emptyStore(state.sessionId);
        pushPoint(fresh, state);
        ref.current = fresh;
        commit();
        return;
      }
      s.log.length = step.log;
      s.liSeries.length = step.li;
      if (import.meta.env.DEV) {
        if (step.kind === "advance") {
          // Live finding: undoing an offense half lands on the offense start.
          if (state.myRole !== "offense") console.warn("[useGameHistory] undo of advance-half did not land on the offense start", state.myRole);
        } else if (state.myRole === "defense") {
          const last = lastLi(s.liSeries);
          if (!last || last.li !== state.leverageIndex) {
            console.warn("[useGameHistory] LI series out of sync after undo", { seriesLast: last?.li, state: state.leverageIndex });
          }
        }
      }
      commit();
    },
    [commit],
  );

  const exportState = useCallback((): unknown => ref.current, []);

  const restore = useCallback((data: unknown, sessionId: string) => {
    const parsed = data as Partial<Store> | null;
    if (!parsed || parsed.sessionId !== sessionId || !Array.isArray(parsed.log) || !Array.isArray(parsed.liSeries) || !Array.isArray(parsed.stack)) {
      return false;
    }
    ref.current = parsed as Store;
    setView({ log: [...parsed.log], liSeries: [...parsed.liSeries], undoDepth: parsed.stack.length });
    return true;
  }, []);

  return { ...view, recordStart, recordPa, recordAdvanceHalf, recordUndo, exportState, restore };
}
