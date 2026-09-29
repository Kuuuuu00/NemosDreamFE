import { adjustProbsForQuality, applyOutcome, computeLI, computeWE, sampleOutcome, weForTeam } from "./engine";
import { APP_CONFIG } from "./config";
import { computeRanking } from "./modelScore";
import { OUTCOME_DEFS } from "./outcomes";
import { buildGames, perInningRuns, type MockGame } from "./schedule";
import { buildLineup, buildStaff, type TeamStaff } from "./roster";
import { generateName } from "./names";
import { pick, seededRandom } from "./rng";
import type {
  ActualDecision,
  BaseState,
  Batter,
  DecisionModelRank,
  DecisionLogEntry,
  GameState,
  Half,
  LineScore,
  OffenseHalfSummary,
  PAOutcomeCode,
  PAResult,
  Pitcher,
  PitcherUsageSegment,
  RecommendResponse,
  RepeatHistogramBucket,
  RepeatResult,
  SimulationResult,
  WeTraceResponse,
} from "@/types/api";

/** One PA's record for `/result` aggregation (`buildResult`/`repeatSimulation`)
 * — never exposed directly to the client, only the derived, typed shapes in
 * `types/api.ts` are. `wasChange`/`modelRankingAtChange` mark decision points. */
interface PaLogRecord {
  inning: number;
  half: Half;
  outCountBefore: number;
  baseStateBefore: BaseState;
  pitcherId: number;
  pitcherName: string;
  qualityP: number;
  li: number;
  wasChange: boolean;
  modelRankingAtChange?: DecisionModelRank[];
  outcome: PAOutcomeCode;
  outcomeLabel: string;
  runsScored: number;
  deltaWeDefender: number;
}

interface HistorySnapshot {
  state: GameState;
  staff: TeamStaff;
  usedTonight: Pitcher[];
  batterIdx: number;
  liveMyRuns: (number | null)[];
  liveOppRuns: (number | null)[];
  liveMyHits: number;
  liveOppHits: number;
  liveMyWalks: number;
  liveOppWalks: number;
}

interface Session {
  id: string;
  myTeam: string;
  oppTeam: string;
  game: MockGame;
  startInning: number;
  staff: TeamStaff;
  lineup: Batter[]; // [current, ...upcoming]
  batterIdx: number;
  state: GameState;
  usedTonight: Pitcher[];
  history: HistorySnapshot[];
  actualDecision: ActualDecision | null;
  weActual: { inning: number; half: Half; we: number; li: number }[];
  weSimulated: { inning: number; half: Half; we: number; li: number }[];
  /** Chronological per-PA record, defense-only (offense halves are
   * auto-played elsewhere and never touch this) — the raw material
   * `buildResult`/`repeatSimulation` aggregate from (§/result page). */
  paLog: PaLogRecord[];

  /** Per-inning run counts already recorded in the real game before this
   * session's start inning — fixed, never mutated (§3). */
  historicalMyPerInn: number[];
  historicalOppPerInn: number[];
  /** Per-inning run counts from `startInning` onward, filled in live as the
   * session plays out. `null` = that half-inning hasn't been reached yet
   * (renders as "-"); a number (incl. 0) = reached, possibly still in
   * progress — the linescore must show it as soon as it's non-null, not
   * wait for the half-inning to finish (§3). */
  liveMyRuns: (number | null)[];
  liveOppRuns: (number | null)[];
  liveMyHits: number;
  liveOppHits: number;
  liveMyWalks: number;
  liveOppWalks: number;
  /** Hit/walk totals attributable to the historical (pre-session) portion
   * of the game — approximated once at session creation, same way the
   * mock always has, since the real per-PA log for that portion isn't
   * modeled. Live totals add on top of these. */
  baselineMyHits: number;
  baselineOppHits: number;
  baselineMyWalks: number;
  baselineOppWalks: number;
  errorsMy: number;
  errorsOpp: number;

  /** The point from which the user's playthrough can differ from the real
   * game. This is *always* the session's start — PA outcomes are sampled
   * the moment the user takes over, independent of whether they pick the
   * same pitcher the real manager did (see simulatePa's `isDiverged`,
   * which tracks a different, narrower concept: whether the user's first
   * *pitching change* differs from the manager's). The win-probability
   * chart's simulated series and diverge marker use this field; the
   * "actual decision" reveal in `recommend` uses `state.isDiverged`. */
  pathDivergedAt: { inning: number; half: Half };
}

const sessions = new Map<string, Session>();
let seq = 0;

function baseHalfFor(g: MockGame): Half {
  return g.homeIsMine ? "top" : "bot";
}

function scoreDiffAttacker(score: { home: number; away: number }, half: Half): number {
  const attackerIsHome = half === "bot";
  const diff = score.home - score.away; // home - away
  return attackerIsHome ? diff : -diff;
}

const HIT_OUTCOMES = new Set(["1B", "2B", "3B", "HR"]);
const OUT_OUTCOMES = new Set(["SO", "GO", "FO", "GDP"]);

/** The one place a game state gets turned into a WE number for *my* team —
 * both the live session (toGameState/simulatePa) and the "실제 경기 기록"
 * curve (buildActualWeCurve) must go through this, or their values can't be
 * structurally guaranteed to agree at the divergence point (§2). */
function weFor(g: MockGame, inning: number, half: Half, outCount: number, baseState: BaseState, score: { home: number; away: number }): number {
  const weHome = computeWE(inning, half, outCount, baseState, score.home - score.away);
  return weForTeam(weHome, g.homeIsMine);
}

function sumRuns(hist: number[], live: (number | null)[], revealedCount: number): number {
  let total = 0;
  for (let i = 0; i < 9; i++) total += i < revealedCount ? hist[i] : (live[i] ?? 0);
  return total;
}

/** The header score and the linescore's R totals must never disagree, so
 * both are derived from the same per-inning arrays instead of being
 * tracked as separate numbers (§3). */
function currentScore(s: Session | Omit<Session, "state">): { home: number; away: number } {
  const revealedCount = s.startInning - 1;
  const myR = sumRuns(s.historicalMyPerInn, s.liveMyRuns, revealedCount);
  const oppR = sumRuns(s.historicalOppPerInn, s.liveOppRuns, revealedCount);
  return s.game.homeIsMine ? { home: myR, away: oppR } : { home: oppR, away: myR };
}

function buildLinescore(s: Session | Omit<Session, "state">): LineScore {
  const g = s.game;
  const homeIsMine = g.homeIsMine;
  const revealedCount = s.startInning - 1;

  const perInnFor = (hist: number[], live: (number | null)[]): (number | null)[] =>
    Array.from({ length: 9 }, (_, i) => (i < revealedCount ? hist[i] : live[i]));

  const myLine = perInnFor(s.historicalMyPerInn, s.liveMyRuns);
  const oppLine = perInnFor(s.historicalOppPerInn, s.liveOppRuns);

  const { home: homeR, away: awayR } = currentScore(s);
  const myH = s.baselineMyHits + s.liveMyHits;
  const oppH = s.baselineOppHits + s.liveOppHits;
  const myB = s.baselineMyWalks + s.liveMyWalks;
  const oppB = s.baselineOppWalks + s.liveOppWalks;

  const away = homeIsMine ? oppLine : myLine;
  const home = homeIsMine ? myLine : oppLine;

  return {
    away,
    home,
    totals: {
      away: { R: awayR, H: homeIsMine ? oppH : myH, E: homeIsMine ? s.errorsOpp : s.errorsMy, B: homeIsMine ? oppB : myB },
      home: { R: homeR, H: homeIsMine ? myH : oppH, E: homeIsMine ? s.errorsMy : s.errorsOpp, B: homeIsMine ? myB : oppB },
    },
  };
}

function toGameState(s: Omit<Session, "state">, overrides: Partial<GameState>): GameState {
  const g = s.game;
  const half = overrides.half ?? baseHalfFor(g);
  const inning = overrides.inning ?? s.startInning;
  // Every fresh half-inning — including the session's own start — begins
  // 0 outs, bases empty. There is no "dramatic mid-inning" starting state;
  // that was a bug (§1), not a design choice.
  const outCount = overrides.outCount ?? 0;
  const baseState = overrides.baseState ?? "0";

  const linescore = buildLinescore(s);
  const score = { home: linescore.totals.home.R, away: linescore.totals.away.R };
  const scoreDiff = score.home - score.away;
  const scoreDiffDefender = g.homeIsMine ? scoreDiff : -scoreDiff;
  const li = overrides.leverageIndex ?? computeLI(inning, scoreDiffDefender, baseState, outCount);
  const we = overrides.winExpectancy ?? weFor(g, inning, half, outCount, baseState, score);

  return {
    sessionId: s.id,
    gameId: g.gameId,
    date: g.date,
    inning,
    half,
    outCount,
    baseState,
    score,
    scoreDiff,
    scoreDiffAttacker: scoreDiffAttacker(score, half),
    myTeam: s.myTeam,
    opponentTeam: s.oppTeam,
    myRole: "defense",
    homeTeam: g.homeIsMine ? s.myTeam : s.oppTeam,
    awayTeam: g.homeIsMine ? s.oppTeam : s.myTeam,
    currentPitcher: s.staff.current,
    currentBatter: s.lineup[s.batterIdx % s.lineup.length],
    upcomingBatters: [
      s.lineup[(s.batterIdx + 1) % s.lineup.length],
      s.lineup[(s.batterIdx + 2) % s.lineup.length],
      s.lineup[(s.batterIdx + 3) % s.lineup.length],
    ],
    leverageIndex: li,
    winExpectancy: we,
    wePerspective: s.myTeam,
    linescore,
    isDiverged: overrides.isDiverged ?? false,
    divergedAt: overrides.divergedAt ?? null,
    isGameOver: overrides.isGameOver ?? false,
    canUndo: overrides.canUndo ?? false,
  };
}

export function createSession(myTeam: string, oppTeam: string, gameId: string, startInning: number): GameState {
  const games = buildGames(myTeam, oppTeam);
  const game = games.find((g) => g.gameId === gameId) ?? games[0];
  const id = `s_${(++seq).toString(36)}_${Date.now().toString(36)}`;
  const staff = buildStaff(myTeam, oppTeam);
  const lineup = buildLineup(myTeam, oppTeam);

  const historicalMyPerInn = perInningRuns(game.myRuns, game.index + 1);
  const historicalOppPerInn = perInningRuns(game.oppRuns, game.index + 4);
  const revealedCount = startInning - 1;
  const preMyRuns = historicalMyPerInn.slice(0, revealedCount).reduce((a, b) => a + b, 0);
  const preOppRuns = historicalOppPerInn.slice(0, revealedCount).reduce((a, b) => a + b, 0);

  const homeIsMine = game.homeIsMine;
  const preHomeRuns = homeIsMine ? preMyRuns : preOppRuns;
  const preAwayRuns = homeIsMine ? preOppRuns : preMyRuns;
  const boxRand = seededRandom(`${myTeam}-${oppTeam}-boxscore`);
  const baselineHomeHits = Math.round(preHomeRuns * 1.6) + 3;
  const baselineAwayHits = Math.round(preAwayRuns * 1.7) + 2;
  const baselineHomeWalks = Math.floor(boxRand() * 4);
  const baselineAwayWalks = Math.floor(boxRand() * 4);
  const errorsHome = Math.floor(boxRand() * 2);
  const errorsAway = Math.floor(boxRand() * 3);

  const partial: Omit<Session, "state"> = {
    id,
    myTeam,
    oppTeam,
    game,
    startInning,
    staff,
    lineup,
    batterIdx: 0,
    usedTonight: [],
    history: [],
    actualDecision: {
      pitcherId: staff.bullpen[0].pitcherId,
      name: staff.bullpen[0].name,
      wasChange: true,
      rankInModel: 1,
    },
    weActual: [], // filled in below, once `state` (and its WE) exists to patch the divergence point against
    weSimulated: [],
    paLog: [],
    historicalMyPerInn,
    historicalOppPerInn,
    liveMyRuns: new Array(9).fill(null),
    liveOppRuns: new Array(9).fill(null),
    liveMyHits: 0,
    liveOppHits: 0,
    liveMyWalks: 0,
    liveOppWalks: 0,
    baselineMyHits: homeIsMine ? baselineHomeHits : baselineAwayHits,
    baselineOppHits: homeIsMine ? baselineAwayHits : baselineHomeHits,
    baselineMyWalks: homeIsMine ? baselineHomeWalks : baselineAwayWalks,
    baselineOppWalks: homeIsMine ? baselineAwayWalks : baselineHomeWalks,
    errorsMy: homeIsMine ? errorsHome : errorsAway,
    errorsOpp: homeIsMine ? errorsAway : errorsHome,
    pathDivergedAt: { inning: startInning, half: baseHalfFor(game) },
  };
  const state = toGameState(partial, {});
  // The "실제 경기 기록" curve is built from the real per-inning score
  // progression through the SAME weFor()/computeWE() used for the live
  // session (§2) — not a separate random walk. Its value at the exact
  // divergence point (= session start) is set to `state`'s own WE/LI
  // rather than independently recomputed, so the two curves are
  // *structurally* guaranteed to meet there, not just numerically close.
  const weActual = buildActualWeCurve(
    game,
    historicalMyPerInn,
    historicalOppPerInn,
    { inning: startInning, half: baseHalfFor(game) },
    state.winExpectancy,
    state.leverageIndex,
  );
  const session: Session = { ...partial, weActual, state };
  // Seed with the session's starting point so the WE/LI charts have a
  // first point to draw before any PA is simulated (see pathDivergedAt).
  session.weSimulated = [{ inning: state.inning, half: state.half, we: state.winExpectancy, li: state.leverageIndex }];
  sessions.set(id, session);
  return state;
}

function buildActualWeCurve(
  game: MockGame,
  myPerInn: number[],
  oppPerInn: number[],
  divergeAt: { inning: number; half: Half },
  divergeWE: number,
  divergeLI: number,
): { inning: number; half: Half; we: number; li: number }[] {
  const homeIsMine = game.homeIsMine;
  const awayPerInn = homeIsMine ? oppPerInn : myPerInn;
  const homePerInn = homeIsMine ? myPerInn : oppPerInn;
  const points: { inning: number; half: Half; we: number; li: number }[] = [];
  let homeRuns = 0;
  let awayRuns = 0;

  // Each half-inning's point is its *end-of-half* WE/LI (§ spec: "각
  // 반이닝의 종료 시점 WE를 그 반이닝의 값으로 삼는다"), computed from the
  // real cumulative score at that moment via the same computeWE/computeLI
  // the live session uses — so the curve actually bends with real scoring
  // instead of drifting as noise.
  for (let n = 1; n <= 9; n++) {
    awayRuns += awayPerInn[n - 1];
    let diff = homeRuns - awayRuns;
    let myDiff = homeIsMine ? diff : -diff;
    points.push({
      inning: n,
      half: "top",
      we: weForTeam(computeWE(n, "bot", 0, "0", diff), homeIsMine),
      li: computeLI(n, myDiff, "0", 0),
    });

    homeRuns += homePerInn[n - 1];
    diff = homeRuns - awayRuns;
    myDiff = homeIsMine ? diff : -diff;
    const nextInning = n === 9 ? 10 : n + 1;
    points.push({
      inning: n,
      half: "bot",
      we: weForTeam(computeWE(nextInning, "top", 0, "0", diff), homeIsMine),
      li: computeLI(Math.min(9, nextInning), myDiff, "0", 0),
    });
  }

  const idx = points.findIndex((p) => p.inning === divergeAt.inning && p.half === divergeAt.half);
  if (idx >= 0) points[idx] = { ...points[idx], we: divergeWE, li: divergeLI };
  return points;
}

/** Pure — computes the auto-played offense half's runs/hits/walks without
 * touching any session state. The caller applies the returned deltas in one
 * place (§1: no half-transition logic should mutate state as a side effect
 * buried inside a bigger function). */
function simulateOffenseHalf(sessionId: string, inning: number): { runs: number; hits: number; walks: number } {
  const autoRunsRand = seededRandom(`${sessionId}-auto-offense-${inning}`);
  const runs = Math.floor(autoRunsRand() * 3);
  const hitEstRand = seededRandom(`${sessionId}-auto-hits-${inning}`);
  const hits = runs + Math.floor(hitEstRand() * 2);
  const walks = Math.floor(hitEstRand() * 2);
  return { runs, hits, walks };
}

/** Builds the auto-played offense half's PA list so it agrees with the
 * half's `runs`/`hits` totals: exactly `hits` hit PAs, `walks` walks and 3
 * outs, ending on an out; the last `runs` hit PAs each score one run. */
function buildOffensePaLog(
  sessionId: string,
  myTeam: string,
  oppTeam: string,
  inning: number,
  offense: { runs: number; hits: number; walks: number },
): OffenseHalfSummary["paLog"] {
  const rand = seededRandom(`${sessionId}-auto-palog-${inning}`);
  const scoringFrom = offense.hits - offense.runs;
  type Slot = { outcome: PAOutcomeCode; runsScored: number };
  const reached: Slot[] = [];
  for (let i = 0; i < offense.hits; i++) {
    const scores = i >= scoringFrom;
    const outcome = pick(rand, scores ? (["1B", "2B", "HR", "1B"] as const) : (["1B", "1B", "2B"] as const));
    reached.push({ outcome, runsScored: scores ? 1 : 0 });
  }
  for (let i = 0; i < offense.walks; i++) reached.push({ outcome: "BB", runsScored: 0 });
  const outs: Slot[] = [0, 1].map(() => ({ outcome: pick(rand, ["SO", "GO", "FO"] as const), runsScored: 0 }));
  const slots = [...reached, ...outs];
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  slots.push({ outcome: pick(rand, ["SO", "GO", "FO"] as const), runsScored: 0 });
  // Deterministic in (session, inning), so undo/redo of the same half
  // always replays the same batters — no session state to roll back.
  return slots.map((slot, i) => ({
    batter: generateName(`${myTeam}-vs-${oppTeam}-my-bat-${(inning * 4 + i) % 9}`),
    outcome: slot.outcome,
    description: OUTCOME_DEFS[slot.outcome].description,
    runsScored: slot.runsScored,
  }));
}

function requireSession(sessionId: string): Session {
  const s = sessions.get(sessionId);
  if (!s) throw new Error("SESSION_EXPIRED");
  return s;
}

export function getRecommend(sessionId: string): RecommendResponse {
  const s = requireSession(sessionId);
  const band = APP_CONFIG.leverage.bands.find(
    (b) => s.state.leverageIndex >= b.min && s.state.leverageIndex < b.max,
  );
  return {
    leverageIndex: s.state.leverageIndex,
    leverageBand: band?.label ?? "고",
    liMax: APP_CONFIG.leverage.max,
    bullpenSummary: { available: s.staff.bullpen.length, used: s.usedTonight.length + s.staff.usageToday.length, total: 9 },
    bullpenSource: "actual",
    actualDecision: s.state.isDiverged ? null : s.actualDecision,
  };
}

export function simulatePa(sessionId: string, pitcherId: number): PAResult {
  const s = requireSession(sessionId);
  s.history.push({
    state: s.state,
    staff: { ...s.staff, bullpen: [...s.staff.bullpen], usageToday: [...s.staff.usageToday] },
    usedTonight: [...s.usedTonight],
    batterIdx: s.batterIdx,
    liveMyRuns: [...s.liveMyRuns],
    liveOppRuns: [...s.liveOppRuns],
    liveMyHits: s.liveMyHits,
    liveOppHits: s.liveOppHits,
    liveMyWalks: s.liveMyWalks,
    liveOppWalks: s.liveOppWalks,
  });

  const changed = pitcherId !== s.state.currentPitcher.pitcherId;
  let pitcher = s.state.currentPitcher;
  let isDiverged = s.state.isDiverged;

  // Snapshot for the /result decision log — must happen before any of the
  // mutations below touch s.staff/s.state, or it would describe the
  // post-decision world instead of what the user actually saw when deciding.
  const situationInning = s.state.inning;
  const situationHalf = s.state.half;
  const situationOutCount = s.state.outCount;
  const situationBaseState = s.state.baseState;
  const liAtDecision = s.state.leverageIndex;
  const modelRankingAtChange: DecisionModelRank[] | undefined = changed
    ? computeRanking(s.state, s.staff.bullpen, s.state.isDiverged ? "live" : "precomputed").candidates.map((c) => ({
        pitcherId: Number(c.pitcherId),
        name: c.name,
        modelRank: c.modelRank,
      }))
    : undefined;

  if (changed) {
    const idx = s.staff.bullpen.findIndex((p) => p.pitcherId === pitcherId);
    if (idx >= 0) {
      const incoming = { ...s.staff.bullpen[idx], availability: "current" as const };
      const outgoing = { ...s.state.currentPitcher, availability: "used" as const };
      s.staff.bullpen = s.staff.bullpen.filter((_, i) => i !== idx);
      s.usedTonight = [...s.usedTonight, outgoing];
      s.staff = { ...s.staff, current: incoming };
      pitcher = incoming;
    }
    if (!isDiverged) {
      isDiverged = pitcherId !== s.actualDecision?.pitcherId;
    }
  }

  // est_pitch_count = pa_faced_today * avg_pitches_per_pa, accumulated per
  // PA the mound pitcher faces.
  const paFacedToday = pitcher.workload.paFacedToday + 1;
  pitcher = {
    ...pitcher,
    workload: {
      ...pitcher.workload,
      paFacedToday,
      estPitchCount: Math.round(paFacedToday * pitcher.workload.avgPitchesPerPa),
    },
  };
  s.staff = { ...s.staff, current: pitcher };

  const rand = seededRandom(`${sessionId}-pa-${s.batterIdx}-${s.state.outCount}-${Date.now()}`);
  const probs = adjustProbsForQuality(pitcher.qualityP);
  const outcome = sampleOutcome(probs, rand);
  const def = OUTCOME_DEFS[outcome];
  const { base, outs, runs } = applyOutcome(s.state.baseState, s.state.outCount, outcome);
  // This appearance's line (shown on the current-pitcher card).
  pitcher = {
    ...pitcher,
    workload: {
      ...pitcher.workload,
      hitsAllowed: pitcher.workload.hitsAllowed + (HIT_OUTCOMES.has(outcome) ? 1 : 0),
      walksAllowed: pitcher.workload.walksAllowed + (outcome === "BB" ? 1 : 0),
      outsRecorded: pitcher.workload.outsRecorded + Math.max(0, Math.min(3, outs) - s.state.outCount),
    },
  };
  s.staff = { ...s.staff, current: pitcher };

  const g = s.game;
  const weBefore = weFor(g, s.state.inning, s.state.half, s.state.outCount, s.state.baseState, s.state.score);

  // The opponent is always the team batting during the user's defensive
  // half — accrue their runs/hits/walks live so the in-progress inning's
  // linescore cell updates immediately, not just once the half ends (§3).
  const inningIdx = s.state.inning - 1;
  s.liveOppRuns[inningIdx] = (s.liveOppRuns[inningIdx] ?? 0) + runs;
  if (HIT_OUTCOMES.has(outcome)) s.liveOppHits += 1;
  if (outcome === "BB") s.liveOppWalks += 1;

  const inningOver = outs >= 3;
  const nextBase = inningOver ? "0" : base;
  const nextOuts = inningOver ? 0 : outs;

  s.batterIdx += 1;

  let newState: GameState;
  let offenseHalfSummary: OffenseHalfSummary | undefined;
  // This PA's own WE contribution — evaluated at the moment the defensive
  // half-inning's play concludes, *before* any auto-played offense runs
  // are folded in. Using `newState` (which, when the inning ends, already
  // reflects the offense half too) here was exactly the bug: the offense
  // half's swing would get absorbed into whichever PA happened to end the
  // inning (§3).
  let weAfterDefense: number;

  if (inningOver) {
    // The user only ever acts during their team's fixed defense half (§1);
    // the intervening offense half is auto-played here (a lightweight stand-in
    // for POST /advance-half, §3-7) so the loop can continue straight to the
    // next defense half without a separate "상대 수비 진행 중" screen.
    weAfterDefense = weFor(g, s.state.inning, s.state.half, outs, "0", currentScore(s));

    const nextInning = s.state.inning + 1;
    const isGameOver = nextInning > 9;
    let weAfterOffense = weAfterDefense;
    if (!isGameOver) {
      // Pure computation, then a single, explicit application — no state
      // mutation hidden inside the computation itself (§1).
      const offense = simulateOffenseHalf(sessionId, s.state.inning);
      s.liveMyRuns[inningIdx] = offense.runs;
      s.liveMyHits += offense.hits;
      s.liveMyWalks += offense.walks;
      weAfterOffense = weFor(g, nextInning, s.state.half, 0, "0", currentScore(s));
      offenseHalfSummary = {
        inning: s.state.inning,
        half: s.state.half === "top" ? "bot" : "top", // the *other* half of this inning is when my team actually bats
        runs: offense.runs,
        deltaWe: +(weAfterOffense - weAfterDefense).toFixed(3),
        hits: offense.hits,
        paLog: buildOffensePaLog(sessionId, s.myTeam, s.oppTeam, s.state.inning, offense),
      };
    }
    const divergedAt =
      isDiverged && !s.state.divergedAt
        ? { inning: s.state.inning, half: s.state.half, paIndex: s.batterIdx }
        : s.state.divergedAt;
    // Batting order continues uninterrupted across the half-inning boundary
    // (§2) — `s.batterIdx` is never reset here, only ever incremented once
    // per defensive PA (already done above), regardless of inning changes.
    newState = toGameState(s, {
      inning: isGameOver ? s.state.inning : nextInning,
      half: s.state.half,
      outCount: 0,
      baseState: "0",
      isDiverged,
      divergedAt,
      isGameOver,
      canUndo: true,
    });
  } else {
    weAfterDefense = weFor(g, s.state.inning, s.state.half, nextOuts, nextBase, currentScore(s));
    newState = toGameState(s, {
      inning: s.state.inning,
      half: s.state.half,
      outCount: nextOuts,
      baseState: nextBase,
      isDiverged,
      divergedAt: isDiverged && !s.state.divergedAt ? { inning: s.state.inning, half: s.state.half, paIndex: s.batterIdx } : s.state.divergedAt,
      canUndo: true,
    });
  }

  s.state = newState;
  s.weSimulated = [
    ...s.weSimulated,
    { inning: newState.inning, half: newState.half, we: newState.winExpectancy, li: newState.leverageIndex },
  ];

  // A single global negation (deltaWeDefender = -deltaWeAttacker, applied
  // uniformly below) is necessary but not sufficient: the *magnitude* WE
  // formula can still occasionally move against the fielding team on an out
  // (e.g. a sac fly scores a run) or in its favor on a hit, since it's a
  // continuous function of score/inning/outs, not an outcome-aware one.
  // Categorically floor/ceiling by outcome type so "out codes always help
  // the defense, hit codes always hurt it" holds every time (§4) — this is
  // a deliberate simplification on top of the realistic magnitude, not a
  // per-outcome sign branch.
  const rawDeltaDefender = weAfterDefense - weBefore;
  const deltaWeDefender = OUT_OUTCOMES.has(outcome) ? Math.max(0, rawDeltaDefender) : Math.min(0, rawDeltaDefender);

  s.paLog.push({
    inning: situationInning,
    half: situationHalf,
    outCountBefore: situationOutCount,
    baseStateBefore: situationBaseState,
    pitcherId: pitcher.pitcherId,
    pitcherName: pitcher.name,
    qualityP: pitcher.qualityP,
    li: liAtDecision,
    wasChange: changed,
    modelRankingAtChange,
    outcome,
    outcomeLabel: def.label,
    runsScored: runs,
    deltaWeDefender: +deltaWeDefender.toFixed(3),
  });

  return {
    outcome,
    outcomeLabel: def.label,
    description: def.description,
    probability: probs[outcome],
    probs,
    runsScored: runs,
    deltaWeAttacker: +(-deltaWeDefender).toFixed(3),
    deltaWeDefender: +deltaWeDefender.toFixed(3),
    nextState: newState,
    offenseHalfSummary,
  };
}

export function undo(sessionId: string): GameState {
  const s = requireSession(sessionId);
  const prev = s.history.pop();
  if (!prev) throw new Error("CANNOT_UNDO");
  s.state = prev.state;
  s.staff = prev.staff;
  s.usedTonight = prev.usedTonight;
  s.batterIdx = prev.batterIdx;
  s.liveMyRuns = prev.liveMyRuns;
  s.liveOppRuns = prev.liveOppRuns;
  s.liveMyHits = prev.liveMyHits;
  s.liveOppHits = prev.liveOppHits;
  s.liveMyWalks = prev.liveMyWalks;
  s.liveOppWalks = prev.liveOppWalks;
  s.weSimulated = s.weSimulated.slice(0, -1);
  s.state = { ...s.state, canUndo: s.history.length > 0 };
  return s.state;
}

export function getWeTrace(sessionId: string): WeTraceResponse {
  const s = requireSession(sessionId);
  return {
    perspective: s.myTeam,
    actual: s.weActual.map((p) => ({ inning: p.inning, half: p.half, we: p.we, leverageIndex: p.li })),
    simulated: s.weSimulated.map((p) => ({ inning: p.inning, half: p.half, we: p.we, leverageIndex: p.li })),
    divergeAt: { inning: s.pathDivergedAt.inning, half: s.pathDivergedAt.half },
    current: s.state.winExpectancy,
  };
}

export function getUsedTonight(sessionId: string): Pitcher[] {
  return requireSession(sessionId).usedTonight;
}

export function getUsageToday(sessionId: string) {
  return requireSession(sessionId).staff.usageToday;
}

/** Flattened index into a full-game `weActual`/`weSimulated`-style 18-point
 * array (inning1/top, inning1/bot, ..., inning9/top, inning9/bot) — shared
 * by `buildActualWeCurve` and the `/result` aggregation below so both agree
 * on point ordering. */
function flatHalfIndex(inning: number, half: Half): number {
  return 2 * (inning - 1) + (half === "bot" ? 1 : 0);
}

function toPoolEntry(p: Pitcher): { pitcherId: number; name: string } {
  return { pitcherId: p.pitcherId, name: p.name };
}

/** Bullpen as the recommendation source sees it (relievers only). */
export function getBullpen(sessionId: string): Pitcher[] {
  return requireSession(sessionId).staff.bullpen;
}

/**
 * Aggregates a finished session into the `/result` page's data model.
 * Each decision carries the model's ranking at that moment, so the page
 * only displays ranks — it never scores or re-ranks anything.
 */
export function buildResult(sessionId: string): SimulationResult {
  const s = requireSession(sessionId);
  const g = s.game;
  const myDefensiveHalf = baseHalfFor(g);

  console.assert(
    s.paLog.every((r) => r.half === myDefensiveHalf),
    "paLog에 공격 반이닝이 섞였습니다 — buildResult의 수비 전용 가정이 깨졌습니다",
  );

  const halfInningsPlayed = s.paLog.length > 0 ? s.paLog[s.paLog.length - 1].inning - s.startInning + 1 : 0;
  const totalOuts = halfInningsPlayed * 3;
  const globalOutBefore = (r: PaLogRecord) => (r.inning - s.startInning) * 3 + r.outCountBefore;

  const paCountByInning = new Map<number, number>();
  for (const r of s.paLog) paCountByInning.set(r.inning, (paCountByInning.get(r.inning) ?? 0) + 1);

  // ---- pitcherUsage (mine): group paLog by contiguous pitcherId ----
  const pitcherUsage: PitcherUsageSegment[] = [];
  for (let i = 0; i < s.paLog.length; i++) {
    const r = s.paLog[i];
    if (i === 0 || r.pitcherId !== s.paLog[i - 1].pitcherId) {
      pitcherUsage.push({
        pitcherId: r.pitcherId,
        name: r.pitcherName,
        fromInning: r.inning,
        fromHalf: r.half,
        toInning: r.inning,
        toHalf: r.half,
        paCount: 0,
        fromOut: globalOutBefore(r),
        toOut: globalOutBefore(r), // patched below once every segment's fromOut is known
        deltaWeSum: 0,
        enteredLI: r.li,
      });
    }
    const seg = pitcherUsage[pitcherUsage.length - 1];
    seg.toInning = r.inning;
    seg.toHalf = r.half;
    seg.paCount += 1;
    seg.deltaWeSum = +(seg.deltaWeSum + r.deltaWeDefender).toFixed(3);
  }
  for (let i = 0; i < pitcherUsage.length; i++) {
    pitcherUsage[i].toOut = i + 1 < pitcherUsage.length ? pitcherUsage[i + 1].fromOut : totalOuts;
  }

  // ---- decisions: every pitching change I made ----
  const decisions: DecisionLogEntry[] = s.paLog
    .filter((r) => r.wasChange)
    .map((r, idx) => ({
      inning: r.inning,
      half: r.half,
      outCountBefore: r.outCountBefore,
      baseStateBefore: r.baseStateBefore,
      li: r.li,
      modelRanking: r.modelRankingAtChange ?? [],
      chosenPitcherId: r.pitcherId,
      // Only the first decision is ever comparable to the real manager — it's
      // the only one that hasn't already diverged from actual history. Later
      // "actual" choices don't exist as recorded fact, so they must read "—",
      // never a guessed value (§ decision log requirement).
      actualPitcherId: idx === 0 ? (s.actualDecision?.pitcherId ?? null) : null,
      outcome: r.outcome,
      outcomeLabel: r.outcomeLabel,
      runsScored: r.runsScored,
      deltaWeDefender: r.deltaWeDefender,
    }));

  // ---- actualPitcherUsage: procedurally generated, seeded by GAME identity
  // (not sessionId) so re-simulating the same game+inning reproduces the same
  // "real manager" story every time. ----
  const actualRand = seededRandom(`${s.myTeam}-${s.oppTeam}-${g.gameId}-${s.startInning}-actual-manager`);
  const fullBullpenPool = [
    ...s.staff.bullpen.map(toPoolEntry),
    ...s.usedTonight.map(toPoolEntry),
  ].filter((p) => s.paLog.length === 0 || p.pitcherId !== s.paLog[0].pitcherId);

  const actualBoundaries: number[] = [];
  if (totalOuts >= 2) {
    const first = 1 + Math.floor(actualRand() * (totalOuts - 1));
    actualBoundaries.push(first);
    if (totalOuts - first >= 3 && actualRand() < 0.5) {
      const second = first + 1 + Math.floor(actualRand() * (totalOuts - first - 1));
      if (second < totalOuts) actualBoundaries.push(second);
    }
  }
  const actualSegBounds = [0, ...actualBoundaries, totalOuts];

  // Each half-inning's real WE swing (see "이견" note below) is attributed
  // wholly to whichever actual-manager segment recorded that half-inning's
  // FINAL out — weActual has no sub-half-inning resolution, so a split
  // attribution for a mid-inning change isn't possible with real data.
  const deltaForHalfInning: number[] = [];
  for (let hi = 0; hi < halfInningsPlayed; hi++) {
    const inning = s.startInning + hi;
    const idx = flatHalfIndex(inning, myDefensiveHalf);
    // NOTE: no sign flip. weActual[i].we is always myTeam-perspective WE, and
    // myTeam is the defending team on this exact half throughout the game —
    // so a rise in myTeam WE during myTeam's own defense already means "good
    // defense," same convention simulatePa's deltaWeDefender already uses
    // (see plan's "이견" note — flipping this would make bad half-innings
    // score positive, contradicting "양수가 좋음").
    deltaForHalfInning.push(+(s.weActual[idx].we - s.weActual[idx - 1].we).toFixed(3));
  }
  const ownerOfHalfInning = (hi: number): number => {
    const finalOut = hi * 3 + 2;
    for (let i = 0; i < actualSegBounds.length - 1; i++) {
      if (finalOut >= actualSegBounds[i] && finalOut < actualSegBounds[i + 1]) return i;
    }
    return actualSegBounds.length - 2;
  };

  const usedActualIds = new Set<number>(s.paLog.length > 0 ? [s.paLog[0].pitcherId] : []);
  const actualPitcherUsage: PitcherUsageSegment[] = [];
  for (let i = 0; i < actualSegBounds.length - 1; i++) {
    const fromOut = actualSegBounds[i];
    const toOut = actualSegBounds[i + 1];
    let pitcherId: number;
    let name: string;
    if (i === 0) {
      pitcherId = s.paLog[0].pitcherId;
      name = s.paLog[0].pitcherName;
    } else if (i === 1 && s.actualDecision) {
      pitcherId = s.actualDecision.pitcherId;
      name = s.actualDecision.name;
      usedActualIds.add(pitcherId);
    } else {
      const pool = fullBullpenPool.filter((p) => !usedActualIds.has(p.pitcherId));
      const pick = (pool.length > 0 ? pool : fullBullpenPool)[Math.floor(actualRand() * Math.max(1, (pool.length > 0 ? pool : fullBullpenPool).length))];
      pitcherId = pick?.pitcherId ?? s.paLog[0].pitcherId;
      name = pick?.name ?? s.paLog[0].pitcherName;
      usedActualIds.add(pitcherId);
    }

    let deltaWeSum = 0;
    let paCount = 0;
    const fromHi = Math.floor(fromOut / 3);
    const toHiExclusive = Math.ceil(toOut / 3);
    for (let hi = fromHi; hi < toHiExclusive && hi < halfInningsPlayed; hi++) {
      if (ownerOfHalfInning(hi) !== i) continue;
      deltaWeSum += deltaForHalfInning[hi];
      paCount += paCountByInning.get(s.startInning + hi) ?? 0;
    }

    actualPitcherUsage.push({
      pitcherId,
      name,
      fromInning: s.startInning + fromHi,
      fromHalf: myDefensiveHalf,
      toInning: s.startInning + Math.max(fromHi, Math.min(halfInningsPlayed, toHiExclusive) - 1),
      toHalf: myDefensiveHalf,
      paCount,
      fromOut,
      toOut,
      deltaWeSum: +deltaWeSum.toFixed(3),
      // Only the first change is grounded — it's tied to session start,
      // where the real inning/outs/runners state is known (same state
      // `getRecommend()` already uses to surface `actualDecision`). Later
      // segments are pure procedural layout with no real situation behind
      // them, so their LI can't be anything but fabricated — leave null.
      enteredLI: i <= 1 ? (s.paLog[0]?.li ?? null) : null,
    });
  }

  // ---- runs / score / win-loss ----
  const runsAllowedMine = s.liveOppRuns.reduce<number>((a, v) => a + (v ?? 0), 0);
  const runsAllowedActual = s.historicalOppPerInn.slice(s.startInning - 1).reduce((a, b) => a + b, 0);

  const finalScoreHomeAway = currentScore(s);
  const myRunsFinal = g.homeIsMine ? finalScoreHomeAway.home : finalScoreHomeAway.away;
  const oppRunsFinal = g.homeIsMine ? finalScoreHomeAway.away : finalScoreHomeAway.home;
  const myFinalScore = { mine: myRunsFinal, opp: oppRunsFinal };
  const myWin = myRunsFinal === oppRunsFinal ? null : myRunsFinal > oppRunsFinal;

  const actualFinalScore = { mine: g.myRuns, opp: g.oppRuns };
  const actualWin = g.myRuns === g.oppRuns ? null : g.myRuns > g.oppRuns;

  // ---- WE divergence: point of MAXIMUM gap, not game-end (game-end WE
  // collapses to ~0%/100% on both curves once the outcome is known, making
  // an end-of-game diff meaningless — §사용자 지적). ----
  const simByKey = new Map<string, number>();
  for (const p of s.weSimulated) simByKey.set(`${p.inning}-${p.half}`, p.we);
  let maxAbsDiff = -1;
  let finalWeDiff = 0;
  let refPoint: { inning: number; half: Half } | null = null;
  for (const p of s.weActual) {
    const simWe = simByKey.get(`${p.inning}-${p.half}`);
    if (simWe === undefined) continue;
    const diff = simWe - p.we;
    if (Math.abs(diff) > maxAbsDiff) {
      maxAbsDiff = Math.abs(diff);
      finalWeDiff = +diff.toFixed(3);
      refPoint = { inning: p.inning, half: p.half };
    }
  }
  const weDiffReferenceLabel = refPoint
    ? `최대 격차 · ${refPoint.inning}회${refPoint.half === "top" ? "초" : "말"} 시점`
    : "";

  const pitcherChanges = pitcherUsage.length - 1;
  const actualPitcherChanges = actualPitcherUsage.length - 1;
  // usedTonight.length === pitcherUsage.length - 1 always (both count "how
  // many times I pulled someone off the mound") — written via pitcherUsage
  // here (not usedTonight) so this formula is structurally, not just
  // coincidentally, the same shape as actualBullpenUsed below (§사용자 지적).
  const bullpenUsed = s.staff.usageToday.length + pitcherChanges;
  const actualBullpenUsed = s.staff.usageToday.length + actualPitcherChanges;
  const bullpenTotal = 9; // matches getRecommend()'s existing bullpenSummary.total

  // ---- comparison with the model's ranking (reference, not an answer key) ----
  const TOP_K = 3;
  const rankOf = (d: DecisionLogEntry, id: number | null) =>
    id === null ? null : (d.modelRanking.find((c) => c.pitcherId === id)?.modelRank ?? null);
  const modelComparison = {
    topK: TOP_K,
    decisionCount: decisions.length,
    myWithinTopK: decisions.filter((d) => (rankOf(d, d.chosenPitcherId) ?? Infinity) <= TOP_K).length,
    actualComparableCount: decisions.filter((d) => rankOf(d, d.actualPitcherId) !== null).length,
    actualWithinTopK: decisions.filter((d) => (rankOf(d, d.actualPitcherId) ?? Infinity) <= TOP_K).length,
  };

  return {
    date: g.date,
    venue: g.venue,
    myTeam: s.myTeam,
    oppTeam: s.oppTeam,
    startInning: s.startInning,
    startHalf: myDefensiveHalf,
    myFinalScore,
    myWin,
    actualFinalScore,
    actualWin,
    runsAllowedInRange: { mine: runsAllowedMine, actual: runsAllowedActual },
    finalWeDiff,
    weDiffReferenceLabel,
    pitcherUsage,
    actualPitcherUsage,
    decisions,
    pitcherChanges,
    actualPitcherChanges,
    bullpenUsed,
    actualBullpenUsed,
    bullpenTotal,
    modelComparison,
  };
}

/**
 * Replays the session `n` times from its starting state, holding the
 * pitching-change *schedule* fixed (same pitcher at the same out-count
 * trigger every time) and my team's own offense fixed to the real box score
 * (`historicalMyPerInn`) — only the opponent's plate appearances are
 * resampled. This isolates variance to "how well did the chosen pitchers
 * perform," which is what this experiment is for; letting my own offense
 * vary too would just measure baseball's overall randomness instead
 * (§사용자 지적).
 */
export function repeatSimulation(sessionId: string, n: number): RepeatResult {
  const s = requireSession(sessionId);
  const g = s.game;

  interface ScheduleEntry {
    halfInningIndex: number;
    triggerOutCount: number;
    pitcher: Pitcher;
  }
  const pitcherById = new Map<number, Pitcher>();
  for (const p of [s.staff.current, ...s.staff.bullpen, ...s.usedTonight]) pitcherById.set(p.pitcherId, p);

  const schedule: ScheduleEntry[] = [];
  for (let i = 0; i < s.paLog.length; i++) {
    const r = s.paLog[i];
    if (i === 0 || r.pitcherId !== s.paLog[i - 1].pitcherId) {
      const pitcher = pitcherById.get(r.pitcherId);
      if (pitcher) {
        schedule.push({ halfInningIndex: r.inning - s.startInning, triggerOutCount: r.outCountBefore, pitcher });
      }
    }
  }

  const preMyRuns = s.historicalMyPerInn.slice(0, s.startInning - 1).reduce((a, b) => a + b, 0);
  const preOppRuns = s.historicalOppPerInn.slice(0, s.startInning - 1).reduce((a, b) => a + b, 0);

  const runsAllowedTrials: number[] = [];
  const finalWETrials: number[] = [];

  for (let iter = 0; iter < n; iter++) {
    let scheduleIdx = 0;
    let currentPitcher = schedule[0]?.pitcher ?? s.staff.current;
    let myScore = preMyRuns;
    let oppScore = preOppRuns;
    let runsAllowed = 0;
    let paSeq = 0;

    for (let inning = s.startInning; inning <= 9; inning++) {
      const halfIdx = inning - s.startInning;
      let outCount = 0;
      let baseState: BaseState = "0";
      while (outCount < 3) {
        // Consume every schedule entry due at or before this half-inning's
        // current out-count — a trigger fires on the first PA where
        // (inning, outCount) is newly reached, never re-checked afterward
        // (multiple hits/walks at the same out-count don't re-trigger).
        while (
          scheduleIdx + 1 < schedule.length &&
          (schedule[scheduleIdx + 1].halfInningIndex < halfIdx ||
            (schedule[scheduleIdx + 1].halfInningIndex === halfIdx && schedule[scheduleIdx + 1].triggerOutCount <= outCount))
        ) {
          scheduleIdx += 1;
          // Schedule exhaustion (resampled game runs past the last real
          // change point): scheduleIdx simply stays at the last entry, i.e.
          // the last pitcher who actually entered keeps pitching — no
          // further advancement is possible since there's nothing recorded
          // past this point.
          currentPitcher = schedule[scheduleIdx].pitcher;
        }

        const rand = seededRandom(`${sessionId}-repeat-${iter}-${paSeq}`);
        const probs = adjustProbsForQuality(currentPitcher.qualityP);
        const outcome = sampleOutcome(probs, rand);
        const { base, outs, runs } = applyOutcome(baseState, outCount, outcome);
        runsAllowed += runs;
        oppScore += runs;
        outCount = outs >= 3 ? 3 : outs;
        baseState = outs >= 3 ? "0" : base;
        paSeq += 1;
      }
      // My team's offense is fixed to the real record for this inning — see
      // function doc.
      myScore += s.historicalMyPerInn[inning - 1] ?? 0;
    }

    runsAllowedTrials.push(runsAllowed);
    const diff = g.homeIsMine ? myScore - oppScore : oppScore - myScore; // home - away
    const homeWE = computeWE(10, "top", 0, "0", diff);
    finalWETrials.push(weForTeam(homeWE, g.homeIsMine));
  }

  runsAllowedTrials.sort((a, b) => a - b);
  finalWETrials.sort((a, b) => a - b);
  const quantile = (arr: number[], q: number) => arr[Math.min(arr.length - 1, Math.max(0, Math.floor(q * arr.length)))];

  const actualGameRuns = s.historicalOppPerInn.slice(s.startInning - 1).reduce((a, b) => a + b, 0);
  const myActualRuns = s.liveOppRuns.reduce<number>((a, v) => a + (v ?? 0), 0);
  const better = runsAllowedTrials.filter((r) => r < actualGameRuns).length;
  const same = runsAllowedTrials.filter((r) => r === actualGameRuns).length;

  const histogram: RepeatHistogramBucket[] = [0, 1, 2, 3, 4, 5, 6].map((b) => ({
    label: String(b),
    runs: b,
    count: runsAllowedTrials.filter((r) => r === b).length,
  }));
  histogram.push({ label: "7+", runs: 7, count: runsAllowedTrials.filter((r) => r >= 7).length });

  return {
    histogram,
    median: quantile(runsAllowedTrials, 0.5),
    p10WE: quantile(finalWETrials, 0.1),
    p50WE: quantile(finalWETrials, 0.5),
    p90WE: quantile(finalWETrials, 0.9),
    probBetterThanActual: +(better / n).toFixed(2),
    probSameAsActual: +(same / n).toFixed(2),
    n,
    myActualRuns,
    actualGameRuns,
  };
}
