/**
 * Shared data contracts. These mirror the backend spec in
 * `K-Moneyball_프론트엔드_백엔드_요구사항_명세.md` §2–3 so that swapping the mock
 * layer (src/mocks/api.ts) for real `fetch` calls requires no component changes.
 */

export type Half = "top" | "bot";
export type BaseState = "0" | "1" | "2" | "3" | "12" | "13" | "23" | "123";
export type Hand = "L" | "R" | "U";
export type BatterHand = "L" | "R" | "S";
export type Role = "defense" | "offense";
export type PAOutcomeCode = "1B" | "2B" | "3B" | "HR" | "BB" | "GO" | "FO" | "GDP" | "SO";
export type BullpenSource = "actual" | "estimated";

/** Onboarding selection → one `POST /sessions` call. */
export interface SessionParams {
  myTeam: string;
  oppTeam: string;
  gameId: string;
  startInning: number;
}

export interface Team {
  code: string;
  name: string;
  logoUrl: string | null;
}

/** `era` / `whip` are null when the pitcher has no season innings yet (live samples). */
export interface SeasonPitchingStats {
  era: number | null;
  whip: number | null;
  ip: number;
  so: number;
  bb: number;
  g: number;
}

export interface HandSplit {
  avg: number | null;
  woba: number | null;
  iso: number | null;
  pa: number;
}

/** Every field may be null from the real backend (render "—"). */
export interface Workload {
  paFacedToday: number | null;
  estPitchCount: number | null;
  avgPitchesPerPa: number | null;
  daysRest: number | null;
  appearancesLast7d: number | null;
  consecutiveDays?: number | null;
  pitchesLast3d?: number | null;
  /** This appearance only (reset each time the pitcher enters). The real
   * backend reports these via `RecommendResponse.currentPitcher.thisOuting`
   * instead, so they're null on real-API `Pitcher`s. */
  hitsAllowed: number | null;
  walksAllowed: number | null;
  outsRecorded: number | null;
}

export type Availability = "available" | "used" | "current" | "unavailable";

export interface Pitcher {
  pitcherId: number;
  name: string;
  throws: Hand;
  photoUrl: string | null;
  season: SeasonPitchingStats;
  /** A side is null when there's no sample against that hand. */
  vsBatterHand: Record<"L" | "R", HandSplit | null>;
  workload: Workload;
  availability: Availability;
  unavailableReason: string | null;
  /** Normalized [0,1]. Reference info only — never used to rank. The real
   * backend doesn't send it (candidates carry `qualityPercentile` instead) → null. */
  qualityP: number | null;
}

/** Rate stats are null before the batter has season data (live samples, opening series). */
export interface SeasonBattingStats {
  avg: number | null;
  obp: number | null;
  slg: number | null;
  ops: number | null;
  hr: number;
}

export interface MatchupStats {
  ab: number;
  h: number;
  avg: number | null;
  woba: number | null;
  iso: number | null;
}

export interface Batter {
  batterId: number;
  name: string;
  hitType: BatterHand;
  photoUrl: string | null;
  order: number;
  position: string;
  season: SeasonBattingStats;
  recentAvg: number | null;
  vsCurrentPitcher: MatchupStats | null;
  today: { ab: number; h: number; rbi: number; log: string[] };
}

export interface LineScore {
  away: (number | null)[];
  home: (number | null)[];
  /** `R/H/E/B` are fixed uppercase wire keys, kept as-is. `E` can be null. */
  totals: {
    away: { R: number; H: number; E: number | null; B: number };
    home: { R: number; H: number; E: number | null; B: number };
  };
}

export interface GameState {
  sessionId: string;
  gameId: string;
  date: string;
  inning: number;
  half: Half;
  outCount: number;
  baseState: BaseState;
  score: { home: number; away: number };
  scoreDiff: number;
  scoreDiffAttacker: number;

  myTeam: string;
  opponentTeam: string;
  myRole: Role;
  /** Not in the spec's GameState example, but the linescore's away/home rows
   * need a home/away team code to label against. The real backend doesn't
   * send them yet (REPORT #1) — the adapter injects them from the games
   * response saved at session start; it prefers server values when present. */
  homeTeam: string;
  awayTeam: string;

  currentPitcher: Pitcher;
  currentBatter: Batter;
  upcomingBatters: Batter[];

  leverageIndex: number;
  winExpectancy: number;
  wePerspective: string;

  linescore: LineScore;

  isDiverged: boolean;
  divergedAt: { inning: number; half: Half; paIndex: number } | null;
  isGameOver: boolean;
  canUndo: boolean;
}

/** The auto-played offense half's own WE swing (§ half-inning transitions)
 * — reported separately from the triggering PA's `deltaWeDefender` so the
 * two are never conflated: the offense half is not the pitcher's doing. */
export interface OffenseHalfSummary {
  inning: number;
  half: Half;
  runs: number;
  /** My-team-perspective WE change during this auto-played batting half.
   * Positive is good for my team — never flip it for display. */
  deltaWe: number;
  hits: number;
  /** Same shape as `AdvanceHalfSummary.paLog` (§3-7), plus a per-PA
   * `runsScored` — a minimal, backend-compatible extension so the overlay
   * can prefer scoring PAs when the list has to be truncated. */
  paLog: { batter: string; outcome: PAOutcomeCode; description: string; runsScored?: number }[];
}

export interface PAResult {
  outcome: PAOutcomeCode;
  outcomeLabel: string;
  description: string;
  probability: number;
  probs: Record<PAOutcomeCode, number>;
  runsScored: number;
  deltaWeAttacker: number;
  deltaWeDefender: number;
  /** `actual` = replay of the real game, `simulated` = sampled (after diverging). */
  source: "actual" | "simulated";
  nextState: GameState;
  /** Mock-only. The real backend never sets this — the offense half is a
   * separate `advanceHalf` call. Present only when this PA ended the half-inning and the intervening
   * offense half was auto-played (i.e. not present on game-ending PAs). */
  offenseHalfSummary?: OffenseHalfSummary;
}

export interface LeverageBandDef {
  label: string;
  min: number;
  max: number;
}

export interface AppConfig {
  leverage: { leagueAvg: number; max: number; bands: LeverageBandDef[] };
  /** Mock-only; the real `/config` has no such block. */
  qualityP?: { min: number; max: number; description: string };
  /** Real `/config` only. `provisional: true` → show the "임시 점수" badge. */
  model?: { scoreUnit: string; description: string; provisional: boolean };
  liSourceNote?: string;
}

/** One line of "오늘 투수 운용" (today's pitching usage timeline) — the
 * starter and any relievers who already pitched before this session began. */
export interface UsageEntry {
  name: string;
  role?: string;
  pitches: number;
  inningsLabel: string;
}

/**
 * Per-inning preview for the onboarding "start inning" picker. Not a spec
 * endpoint on its own (§3-3's `GET /games` only returns `available_innings`)
 * — see the comment on `getInningOptions` in src/mocks/api.ts.
 */
export interface InningOption {
  n: number;
  label: string;
  myScoreAtStart: number;
  oppScoreAtStart: number;
  tone: "앞섬" | "동점" | "뒤짐";
  li: number;
  liHigh: boolean;
  played: boolean;
}

export interface GameListItem {
  gameId: string;
  date: string;
  away: string;
  home: string;
  finalScore: { away: number; home: number };
  availableInnings: number[];
  highLeverageInnings: number[];
}

export interface ActualDecision {
  pitcherId: number;
  name: string;
  wasChange: boolean;
  /** Real backend doesn't send it (REPORT: actual_decision.model_rank). */
  rankInModel?: number | null;
}

/** This outing's line for the pitcher currently on the mound (real backend only). */
export interface ThisOuting {
  pitches: number;
  outs: number;
  hitsAllowed: number;
  walks: number;
  matchupVsBatter: "favorable" | "neutral" | "unfavorable" | null;
}

export interface RecommendResponse {
  leverageIndex: number;
  leverageBand: string;
  liMax: number;
  bullpenSummary: { available: number; used: number; total: number };
  bullpenSource: BullpenSource;
  actualDecision: ActualDecision | null;
  /** Dev-mode badge. */
  source?: "precomputed" | "live" | "mock";
  /** Real backend only; mock leaves it undefined. */
  thisOuting?: ThisOuting | null;
}

export interface AdvanceHalfSummary {
  runs: number;
  hits: number;
  paLog: {
    batterId?: number;
    batter: string;
    outcome: PAOutcomeCode;
    description: string;
    /** TODO(backend): server `pa_log[].runs_scored` (REPORT #3). Absent today. */
    runsScored?: number | null;
    /** My-team-perspective WE change for this PA. Server `delta_we` when sent,
     * else derived from `weTrace[i+1] - weTrace[i]` (TODO(backend), REPORT #3). */
    deltaWe?: number | null;
  }[];
  /** My-team perspective; length = paLog.length + 1, [0] = WE at half start. */
  weTrace: number[];
  source: "actual" | "simulated";
}

export interface AdvanceHalfResponse {
  summary: AdvanceHalfSummary;
  state: GameState;
}

export interface WeTracePoint {
  inning: number;
  half: Half;
  we: number;
  leverageIndex?: number;
}

export interface WeTraceResponse {
  perspective: string;
  actual: WeTracePoint[];
  simulated: WeTracePoint[];
  divergeAt: { inning: number; half: Half } | null;
  current: number;
}

/** `/result` page data model (post-game results dashboard). */
export interface PitcherUsageSegment {
  pitcherId: number;
  name: string;
  /** Estimated pitch count (real backend `pitches_est`); undefined in mock. */
  pitchesEst?: number;
  fromInning: number;
  fromHalf: Half;
  toInning: number;
  toHalf: Half;
  /** PA position inside `fromHalf` / `toHalf` (real backend only; undefined in
   * mock). Live samples show: **0-based** (the half's first PA is 0) and `toPa`
   * is **inclusive** (a pitcher who faced PAs 0 and 1 is `0→1`; a one-PA outing
   * is `2→2`). So a segment inside one half covers `toPa - fromPa + 1` PAs. */
  fromPa?: number;
  toPa?: number;
  /** Real observed PA count for this segment. Reference only — never used
   * for the timeline's width (see `fromOut`/`toOut`), since for
   * `actualPitcherUsage` there is no real PA count to measure. */
  paCount: number;
  /** Mock only (the real backend gives `fromPa`/`toPa`; see `timelineSpans`).
   * Cumulative out count (session start = 0, 3 outs = one half-inning)
   * spanned by this segment — the shared unit both timeline rows use for
   * width, since PA count differs between my playthrough and the
   * procedurally-generated actual-manager path and can't be compared. */
  fromOut?: number;
  toOut?: number;
  deltaWeSum: number;
  /** LI at the moment this pitcher entered. `null` when there's no real
   * game-state basis for it (procedurally-generated actual-manager segments
   * after the first change — see buildResult). */
  enteredLI: number | null;
}

/** One row of the model's ranking at a decision point. */
export interface DecisionModelRank {
  pitcherId: number;
  name: string;
  modelRank: number;
}

export interface DecisionLogEntry {
  inning: number;
  half: Half;
  /** TODO(backend): server `out_count` / `base_state` (REPORT #2). Null from the real backend today → show inning/half only. */
  outCountBefore: number | null;
  baseStateBefore: BaseState | null;
  li: number;
  /** Model ranking of every available reliever at that moment (rank asc). */
  modelRanking: DecisionModelRank[];
  chosenPitcherId: number;
  /** Real manager's choice at this decision point. The mock returns `null`
   * past the divergence point; the real backend fills it in anyway. */
  actualPitcherId: number | null;
  /** Real backend only (undefined in mock). `isChange === false` = kept the
   * current pitcher; the result table shows only changes by default. */
  isChange?: boolean;
  chosenName?: string;
  actualName?: string | null;
  chosenModelRank?: number | null;
  actualModelRank?: number | null;
  /** Did the real manager change pitchers at this row? Derived by the adapter
   * (actual pitcher differs from the previous known actual pitcher). null when
   * `actual_choice` is null (past the divergence point). */
  actualIsChange?: boolean | null;
  /** Model's #1 at that moment, or null while the backend's model ranking is unavailable. */
  modelTop?: { pitcherId: number; name: string } | null;
  outcome: PAOutcomeCode;
  outcomeLabel: string;
  /** Not sent per PA by the real backend. */
  runsScored: number | null;
  deltaWeDefender: number;
}

export type ResultKind = "win" | "loss" | "tie" | "in_progress";

export interface SimulationResult {
  date: string;
  venue: string;
  myTeam: string;
  oppTeam: string;
  startInning: number;
  startHalf: Half;
  myFinalScore: { mine: number; opp: number };
  /** Distinguishes a tie from an in-progress game. */
  result: ResultKind;
  actualFinalScore: { mine: number; opp: number };
  actualResult: ResultKind;
  runsAllowedInRange: { mine: number; actual: number };
  finalWeDiff: number;
  weDiffReferenceLabel: string;
  pitcherUsage: PitcherUsageSegment[];
  actualPitcherUsage: PitcherUsageSegment[];
  decisions: DecisionLogEntry[];
  pitcherChanges: number;
  actualPitcherChanges: number;
  bullpenUsed: number;
  actualBullpenUsed: number;
  bullpenTotal: number;
  /** Compared against the model's ranking — a reference, not an answer key. */
  modelComparison: {
    topK: number;
    decisionCount: number;
    /** null while the backend's model ranking is unavailable → summary falls back to `sameAsActual`. */
    myWithinTopK: number | null;
    /** Decisions where the real manager's choice is known (first change only). */
    actualComparableCount: number;
    actualWithinTopK: number | null;
    /** Real backend only: decisions identical to the real manager's. */
    sameAsActual?: number;
    /** `agreement.my_changes` / `actual_changes` — the denominators of the top-3 sentence. */
    myChanges?: number;
    actualChanges?: number;
  };
}

export interface RepeatHistogramBucket {
  label: string;
  count: number;
  runs: number;
}

export interface RepeatResult {
  histogram: RepeatHistogramBucket[];
  median: number;
  p10WE: number;
  p50WE: number;
  p90WE: number;
  /** P(내 실점 < 실제 실점) — strict. */
  probBetterThanActual: number;
  winRate?: number;
  meanRunsAllowed?: number;
  elapsedMs?: number;
  n: number;
  /** My playthrough's runs allowed (from /result); null when the caller didn't supply it. */
  myActualRuns: number | null;
  actualGameRuns: number;
}

export type ApiErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_ROLE"
  | "GAME_NOT_FOUND"
  | "SESSION_EXPIRED"
  | "CANNOT_UNDO"
  | "NO_AVAILABLE_PITCHER"
  | "MODEL_UNAVAILABLE"
  | "INTERNAL_ERROR"
  /** Client-side only: no response (offline, timeout, proxy down). Always `recoverable: true`. */
  | "NETWORK_ERROR"
  /** Client-side only: caller aborted a superseded request. Never show it. */
  | "ABORTED";

export interface ApiError {
  error: {
    code: ApiErrorCode;
    message: string;
    recoverable: boolean;
  };
}
