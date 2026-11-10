/**
 * Server DTOs exactly as sent over the wire (snake_case). Source of truth
 * order: live samples (docs/integration/samples) > docs/API_연동명세_nemosdream.md
 * §2 > docs/api-docs.json. Nothing here is ever handed to a component — the
 * adapters in `./adapters/*` map these to the camelCase types in
 * `@/types/api`.
 *
 * Do NOT run a generic snake→camel converter over these: `R/H/E/B`,
 * `L/R`, `PaResultRaw.probs` and `RunsAllowedRaw.histogram` keys are data,
 * not field names (연동 명세 §0-3).
 */

export type RawHalf = "top" | "bot";
export type RawOutcome = "1B" | "2B" | "3B" | "HR" | "BB" | "SO" | "GO" | "FO" | "GDP";

export interface RawErrorBody {
  error?: { code?: string; message?: string; recoverable?: boolean };
}

export interface RawAppConfig {
  leverage: { league_avg: number; max: number; bands: { label: string; min: number; max: number }[] };
  model: { score_unit: string; description: string; provisional: boolean };
  li_source_note: string;
}

export interface RawTeam {
  code: string;
  name: string;
  logo_url: string | null;
}

export interface RawGameSummary {
  game_id: string;
  date: string;
  away: string;
  home: string;
  final_score: { away: number; home: number };
  available_innings: number[];
  high_leverage_innings: number[];
}

export interface RawHandSplit {
  avg: number | null;
  woba: number | null;
  iso: number | null;
  pa: number;
}

export interface RawWorkload {
  pa_faced_today: number | null;
  est_pitch_count: number | null;
  avg_pitches_per_pa: number | null;
  days_rest: number | null;
  appearances_last_7d: number | null;
  consecutive_days: number | null;
  pitches_last_3d: number | null;
}

export interface RawPitcher {
  pitcher_id: number;
  name: string;
  throws: "L" | "R" | "U";
  photo_url: string | null;
  season: { era: number | null; whip: number | null; ip: number; so: number; bb: number; g: number };
  vs_batter_hand: { L: RawHandSplit | null; R: RawHandSplit | null };
  workload: RawWorkload;
  availability: "available" | "used" | "current" | "unavailable";
  unavailable_reason: string | null;
}

export interface RawCandidatePitcher extends RawPitcher {
  model_score: number | null;
  model_rank: number | null;
  quality_percentile: number | null;
  matchup_vs_batter: "favorable" | "neutral" | "unfavorable" | null;
  role: string | null;
}

export interface RawBatter {
  batter_id: number;
  name: string;
  hit_type: "L" | "R" | "S";
  photo_url: string | null;
  order: number;
  position: string;
  season: { avg: number | null; obp: number | null; slg: number | null; ops: number | null; hr: number };
  recent_avg: number | null;
  vs_current_pitcher: { ab: number; h: number; avg: number | null; woba: number | null; iso: number | null } | null;
  today: { ab: number; h: number; rbi: number; log: string[] };
}

export interface RawTeamTotals {
  R: number;
  H: number;
  E: number | null;
  B: number;
}

export interface RawGameState {
  session_id: string;
  game_id: string;
  date: string;
  inning: number;
  half: RawHalf;
  out_count: number;
  base_state: string;
  score: { home: number; away: number };
  score_diff: number;
  score_diff_attacker: number;
  my_team: string;
  opponent_team: string;
  /** TODO(backend): not sent yet (REPORT #1). Prefer these when present. */
  home_team?: string;
  away_team?: string;
  my_role: "defense" | "offense";
  current_pitcher: RawPitcher;
  current_batter: RawBatter;
  upcoming_batters: RawBatter[];
  leverage_index: number;
  win_expectancy: number;
  we_perspective: string;
  linescore: {
    away: (number | null)[];
    home: (number | null)[];
    totals: { away: RawTeamTotals; home: RawTeamTotals };
  };
  is_diverged: boolean;
  diverged_at: { inning: number; half: RawHalf; pa_index: number } | null;
  is_game_over: boolean;
  can_undo: boolean;
}

export interface RawPaResult {
  outcome: RawOutcome;
  outcome_label: string;
  description: string;
  probability: number;
  probs: Record<string, number>;
  runs_scored: number;
  delta_we_attacker: number;
  delta_we_defender: number;
  source: "actual" | "simulated";
  next_state: RawGameState;
}

export interface RawThisOuting {
  pitches: number;
  outs: number;
  hits_allowed: number;
  walks: number;
  matchup_vs_batter: "favorable" | "neutral" | "unfavorable" | null;
}

export interface RawRecommend {
  leverage_index: number;
  leverage_band: string;
  li_percentile: number;
  li_max: number;
  source: "precomputed" | "live" | "mock";
  current_pitcher: { pitcher: RawPitcher; this_outing: RawThisOuting };
  candidates: { pitcher: RawCandidatePitcher }[];
  bullpen_summary: { available: number; used: number; total: number };
  bullpen_source: "actual" | "estimated";
  actual_decision: { pitcher_id: number; name: string; was_change: boolean } | null;
}

export interface RawAdvanceHalf {
  summary: {
    runs: number;
    hits: number;
    /** TODO(backend): `runs_scored` / `delta_we` not sent yet (REPORT #3). */
    pa_log: { batter_id: number; batter: string; outcome: RawOutcome; description: string; runs_scored?: number; delta_we?: number }[];
    we_trace: number[];
    source: "actual" | "simulated";
  };
  state: RawGameState;
}

export interface RawHalfPoint {
  inning: number;
  half: RawHalf;
  we: number;
  leverage_index: number;
}

export interface RawWeTrace {
  perspective: string;
  actual: RawHalfPoint[];
  simulated: RawHalfPoint[];
  diverge_at: { inning: number; half: RawHalf } | null;
  current: number;
}

export interface RawPaPoint {
  inning: number;
  half: RawHalf;
  pa: number;
}

export interface RawPitcherUsage {
  pitcher_id: number;
  name: string;
  from: RawPaPoint;
  to: RawPaPoint;
  delta_we_defender: number;
  pitches_est: number;
  li_at_entry: number;
}

export interface RawChoice {
  pitcher_id: number;
  name: string;
  model_rank: number | null;
}

export interface RawDecisionRow {
  inning: number;
  half: RawHalf;
  leverage_index: number;
  model_top: { pitcher_id: number; name: string } | null;
  user_choice: RawChoice;
  actual_choice: RawChoice | null;
  outcome: string;
  delta_we_defender: number;
  is_change: boolean;
  /** TODO(backend): `out_count` / `base_state` not sent yet (REPORT #2). */
  out_count?: number | null;
  base_state?: string | null;
}

export interface RawSide {
  /** Live samples send `{my, opp}`; the OpenAPI `Score` schema says `{home, away}`
   * (springdoc name clash, REPORT #6). The adapter accepts both. */
  score: { my?: number; opp?: number; home?: number; away?: number };
  runs_allowed_in_range: number;
  final_we: number;
  result: string;
}

export interface RawResult {
  simulated: RawSide;
  actual: RawSide;
  pitcher_usage: RawPitcherUsage[];
  actual_pitcher_usage: RawPitcherUsage[];
  decisions: RawDecisionRow[];
  agreement: {
    total_decisions: number;
    mine_in_top3: number | null;
    actual_in_top3: number | null;
    same_as_actual: number;
    /** Absent in the oldest recorded samples. */
    my_changes?: number;
    actual_changes?: number;
  };
  bullpen_used: { mine: number; actual: number; total: number };
}

export interface RawRepeat {
  n: number;
  /** `histogram` keys are run counts ("0","1",…) — a map, never camel-cased. */
  runs_allowed: { histogram: Record<string, number>; median: number; mean: number };
  final_we: { median: number; p10: number; p90: number };
  win_rate: number;
  better_than_actual_rate: number;
  actual: { runs_allowed: number; result: string };
  elapsed_ms: number;
}
