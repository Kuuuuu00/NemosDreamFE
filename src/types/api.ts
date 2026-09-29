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

export interface Team {
  code: string;
  name: string;
  logoUrl: string | null;
}

export interface SeasonPitchingStats {
  era: number;
  whip: number;
  ip: number;
  so: number;
  bb: number;
  g: number;
}

export interface HandSplit {
  avg: number;
  woba: number;
  iso: number;
  pa: number;
}

export interface Workload {
  paFacedToday: number;
  estPitchCount: number;
  avgPitchesPerPa: number;
  daysRest: number;
  appearancesLast7d: number;
  /** This appearance only (reset each time the pitcher enters). */
  hitsAllowed: number;
  walksAllowed: number;
  outsRecorded: number;
}

export type Availability = "available" | "used" | "current" | "unavailable";

export interface Pitcher {
  pitcherId: number;
  name: string;
  throws: Hand;
  photoUrl: string | null;
  season: SeasonPitchingStats;
  vsBatterHand: Record<"L" | "R", HandSplit>;
  workload: Workload;
  availability: Availability;
  unavailableReason: string | null;
  /** Normalized [0,1]. Reference info only — never used to rank. */
  qualityP: number;
}

export interface SeasonBattingStats {
  avg: number;
  obp: number;
  slg: number;
  ops: number;
  hr: number;
}

export interface MatchupStats {
  ab: number;
  h: number;
  avg: number;
  woba: number;
  iso: number;
}

export interface Batter {
  batterId: number;
  name: string;
  hitType: BatterHand;
  photoUrl: string | null;
  order: number;
  position: string;
  season: SeasonBattingStats;
  recentAvg: number;
  vsCurrentPitcher: MatchupStats | null;
  today: { ab: number; h: number; rbi: number; log: string[] };
}

export interface LineScore {
  away: (number | null)[];
  home: (number | null)[];
  totals: {
    away: { R: number; H: number; E: number; B: number };
    home: { R: number; H: number; E: number; B: number };
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
   * need a home/away team code to label against — added as a minimal,
   * backend-compatible extension. */
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
  nextState: GameState;
  /** Present only when this PA ended the half-inning and the intervening
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
  qualityP: { min: number; max: number; description: string };
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
  rankInModel: number;
}

export interface RecommendResponse {
  leverageIndex: number;
  leverageBand: string;
  liMax: number;
  bullpenSummary: { available: number; used: number; total: number };
  bullpenSource: BullpenSource;
  actualDecision: ActualDecision | null;
}

export interface AdvanceHalfSummary {
  runs: number;
  hits: number;
  paLog: { batter: string; outcome: PAOutcomeCode; description: string }[];
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
  fromInning: number;
  fromHalf: Half;
  toInning: number;
  toHalf: Half;
  /** Real observed PA count for this segment. Reference only — never used
   * for the timeline's width (see `fromOut`/`toOut`), since for
   * `actualPitcherUsage` there is no real PA count to measure. */
  paCount: number;
  /** Cumulative out count (session start = 0, 3 outs = one half-inning)
   * spanned by this segment — the shared unit both timeline rows use for
   * width, since PA count differs between my playthrough and the
   * procedurally-generated actual-manager path and can't be compared. */
  fromOut: number;
  toOut: number;
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
  outCountBefore: number;
  baseStateBefore: BaseState;
  li: number;
  /** Model ranking of every available reliever at that moment (rank asc). */
  modelRanking: DecisionModelRank[];
  chosenPitcherId: number;
  /** Real manager's choice at this decision point, or `null` past the
   * divergence point (only the session's first change is ever comparable —
   * see plan notes). */
  actualPitcherId: number | null;
  outcome: PAOutcomeCode;
  outcomeLabel: string;
  runsScored: number;
  deltaWeDefender: number;
}

export interface SimulationResult {
  date: string;
  venue: string;
  myTeam: string;
  oppTeam: string;
  startInning: number;
  startHalf: Half;
  myFinalScore: { mine: number; opp: number };
  /** `null` = tie — possible since extra innings aren't modeled (§9회 종료 동점). */
  myWin: boolean | null;
  actualFinalScore: { mine: number; opp: number };
  actualWin: boolean | null;
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
    myWithinTopK: number;
    /** Decisions where the real manager's choice is known (first change only). */
    actualComparableCount: number;
    actualWithinTopK: number;
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
  probSameAsActual: number;
  n: number;
  myActualRuns: number;
  actualGameRuns: number;
}

export interface ApiError {
  error: {
    code:
      | "SESSION_EXPIRED"
      | "NO_AVAILABLE_PITCHER"
      | "INVALID_ROLE"
      | "CANNOT_UNDO"
      | "MODEL_UNAVAILABLE";
    message: string;
    recoverable: boolean;
  };
}
