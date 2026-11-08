import { resolvePhotoUrl } from "../client";
import { resolveGameTeams } from "../sessionStore";
import type {
  RawAdvanceHalf,
  RawBatter,
  RawGameState,
  RawHandSplit,
  RawPaResult,
  RawPitcher,
} from "../raw";
import type { AdvanceHalfResponse, Batter, GameState, HandSplit, PAResult, Pitcher } from "@/types/api";
import { OUTCOME_CODES, asBaseState, asHalf, asOutcome } from "./common";

function toHandSplit(r: RawHandSplit | null): HandSplit | null {
  return r ? { avg: r.avg, woba: r.woba, iso: r.iso, pa: r.pa } : null;
}

export function toPitcher(r: RawPitcher): Pitcher {
  const w = r.workload;
  return {
    pitcherId: r.pitcher_id,
    name: r.name,
    throws: r.throws,
    photoUrl: resolvePhotoUrl(r.photo_url),
    season: { era: r.season.era, whip: r.season.whip, ip: r.season.ip, so: r.season.so, bb: r.season.bb, g: r.season.g },
    // L / R are fixed uppercase keys (not field names) — copied as-is.
    vsBatterHand: { L: toHandSplit(r.vs_batter_hand.L), R: toHandSplit(r.vs_batter_hand.R) },
    workload: {
      paFacedToday: w.pa_faced_today,
      estPitchCount: w.est_pitch_count,
      avgPitchesPerPa: w.avg_pitches_per_pa,
      daysRest: w.days_rest,
      appearancesLast7d: w.appearances_last_7d,
      consecutiveDays: w.consecutive_days,
      pitchesLast3d: w.pitches_last_3d,
      // This appearance's line comes from recommend.current_pitcher.this_outing, not Pitcher.
      hitsAllowed: null,
      walksAllowed: null,
      outsRecorded: null,
    },
    availability: r.availability,
    unavailableReason: r.unavailable_reason,
    qualityP: null, // not sent; candidates carry quality_percentile instead
  };
}

export function toBatter(r: RawBatter): Batter {
  return {
    batterId: r.batter_id,
    name: r.name,
    hitType: r.hit_type,
    photoUrl: resolvePhotoUrl(r.photo_url),
    order: r.order,
    position: r.position,
    season: { avg: r.season.avg, obp: r.season.obp, slg: r.season.slg, ops: r.season.ops, hr: r.season.hr },
    recentAvg: r.recent_avg,
    vsCurrentPitcher: r.vs_current_pitcher
      ? {
          ab: r.vs_current_pitcher.ab,
          h: r.vs_current_pitcher.h,
          avg: r.vs_current_pitcher.avg,
          woba: r.vs_current_pitcher.woba,
          iso: r.vs_current_pitcher.iso,
        }
      : null,
    today: { ab: r.today.ab, h: r.today.h, rbi: r.today.rbi, log: r.today.log },
  };
}

/**
 * Map a server `GameState`. The whole state is always replaced by a fresh
 * server response — nothing is patched client-side (연동 명세 §1-1).
 */
export function toGameState(r: RawGameState): GameState {
  // TODO(backend): GameState.home_team/away_team (REPORT #1). Prefer the
  // server's value; otherwise the games response / game_id (see sessionStore).
  const fallback = resolveGameTeams(r.game_id);
  const homeTeam = r.home_team ?? fallback?.home ?? r.my_team;
  const awayTeam = r.away_team ?? fallback?.away ?? r.opponent_team;

  if (import.meta.env?.DEV && r.we_perspective !== r.my_team) {
    console.warn(`[api] we_perspective (${r.we_perspective}) !== my_team (${r.my_team})`);
  }

  return {
    sessionId: r.session_id,
    gameId: r.game_id,
    date: r.date,
    inning: r.inning,
    half: asHalf(r.half),
    outCount: r.out_count,
    baseState: asBaseState(r.base_state),
    score: { home: r.score.home, away: r.score.away },
    scoreDiff: r.score_diff,
    // Already converted to the attacking team's perspective — never re-flip.
    scoreDiffAttacker: r.score_diff_attacker,
    myTeam: r.my_team,
    opponentTeam: r.opponent_team,
    myRole: r.my_role,
    homeTeam,
    awayTeam,
    currentPitcher: toPitcher(r.current_pitcher),
    currentBatter: toBatter(r.current_batter),
    upcomingBatters: r.upcoming_batters.map(toBatter),
    leverageIndex: r.leverage_index,
    winExpectancy: r.win_expectancy,
    wePerspective: r.we_perspective,
    linescore: {
      away: r.linescore.away,
      home: r.linescore.home,
      totals: {
        away: { R: r.linescore.totals.away.R, H: r.linescore.totals.away.H, E: r.linescore.totals.away.E, B: r.linescore.totals.away.B },
        home: { R: r.linescore.totals.home.R, H: r.linescore.totals.home.H, E: r.linescore.totals.home.E, B: r.linescore.totals.home.B },
      },
    },
    isDiverged: r.is_diverged,
    divergedAt: r.diverged_at
      ? { inning: r.diverged_at.inning, half: asHalf(r.diverged_at.half), paIndex: r.diverged_at.pa_index }
      : null,
    isGameOver: r.is_game_over,
    canUndo: r.can_undo,
  };
}

export function toPaResult(r: RawPaResult): PAResult {
  // `probs` is a code → probability map: keep the server's keys, just make
  // sure all 9 exist (missing → 0).
  const probs = {} as PAResult["probs"];
  for (const code of OUTCOME_CODES) probs[code] = r.probs[code] ?? 0;
  return {
    outcome: asOutcome(r.outcome),
    outcomeLabel: r.outcome_label,
    description: r.description,
    probability: r.probability,
    probs,
    runsScored: r.runs_scored,
    deltaWeAttacker: r.delta_we_attacker,
    deltaWeDefender: r.delta_we_defender,
    source: r.source,
    nextState: toGameState(r.next_state),
  };
}

export function toAdvanceHalf(r: RawAdvanceHalf): AdvanceHalfResponse {
  const trace = r.summary.we_trace;
  // Live finding: we_trace.length === pa_log.length + 1, [0] = WE at half
  // start, my_team perspective. So per-PA ΔWE = trace[i+1] - trace[i].
  const traceAligned = trace.length === r.summary.pa_log.length + 1;
  return {
    summary: {
      runs: r.summary.runs,
      hits: r.summary.hits,
      paLog: r.summary.pa_log.map((p, i) => ({
        batterId: p.batter_id,
        batter: p.batter,
        outcome: asOutcome(p.outcome),
        description: p.description,
        // TODO(backend): pa_log[].runs_scored / delta_we (REPORT #3). Server
        // values win when present; per-PA runs can't be derived from we_trace.
        runsScored: p.runs_scored ?? null,
        deltaWe: p.delta_we ?? (traceAligned ? +(trace[i + 1] - trace[i]).toFixed(4) : null),
      })),
      weTrace: trace,
      source: r.summary.source,
    },
    state: toGameState(r.state),
  };
}
