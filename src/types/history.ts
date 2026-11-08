/**
 * Interface for `useGameHistory` (implemented in 3-2 by the dashboard
 * agent in `src/hooks/useGameHistory.ts`). Defined first by the main track so
 * the types and function signatures are fixed.
 *
 * One hook owns BOTH the action log and the leverage-index series, and they
 * share ONE undo stack: every forward action (start excluded) pushes the
 * pre-action lengths of both lists; `recordUndo` pops once and truncates both.
 * The server's undo step = one PA, or a whole auto-played offense half, which
 * maps 1:1 to the frontend's forward actions (연동 명세 §3-10-1).
 *
 * The LI series is NOT computed — it records `GameState.leverage_index` from
 * server responses (B-plan), defense states only.
 */
import type { AdvanceHalfSummary, GameState, Half, PAResult } from "./api";

export type LogEntry =
  | {
      id: number;
      kind: "pa";
      inning: number;
      half: Half;
      pitcherId: number;
      pitcherName: string;
      /** The pitcher on the mound was changed by this decision. */
      changed: boolean;
      result: PAResult;
    }
  | {
      id: number;
      kind: "offense";
      inning: number;
      half: Half;
      summary: AdvanceHalfSummary;
    };

/** One point of the leverage chart. `li: null` is a break between half-innings (draw with connectNulls={false}). */
export interface LiPoint {
  /** Recording order — the x key (GameState has no PA number). */
  seq: number;
  li: number | null;
  inning: number;
  half: Half;
  /** Label only on the first point of a half-inning, e.g. "7회말". */
  label?: string;
  isDiverged: boolean;
  /** 1-based PA number within the half-inning, for the tooltip ("7회말 2번째 타석"). */
  paInHalf: number;
}

export interface GameHistory {
  log: LogEntry[];
  liSeries: LiPoint[];
  /** Number of forward actions that can still be undone locally. Should equal the server's `can_undo` steps. */
  undoDepth: number;

  /** `POST /sessions`: reset both lists for this session and record the first point. */
  recordStart(state: GameState): void;
  /** `POST /simulate-pa`: log the PA; record `result.nextState` only when `my_role === "defense"`. Always pushes an undo step (even for a half-ending PA, which records no point). */
  recordPa(args: { result: PAResult; pitcherId: number; pitcherName: string; changed: boolean; prevState: GameState }): void;
  /** `POST /advance-half`: log the summary, break the line, record the next defense state. Pushes one undo step. */
  recordAdvanceHalf(args: { summary: AdvanceHalfSummary; offenseInning: number; offenseHalf: Half; state: GameState }): void;
  /** `POST /undo`: pop one step, truncate log and series to it. Dev assertion: last point's `li` === `state.leverageIndex` (console.warn on mismatch — also checks live finding "undo after an offense half lands on the offense start"). */
  recordUndo(state: GameState): void;
  /** Rehydrate from sessionStorage (`historyStorageKey(sessionId)`); false when absent or for another session. */
  restore(sessionId: string): boolean;
}
