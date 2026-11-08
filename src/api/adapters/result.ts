import type { RawDecisionRow, RawPitcherUsage, RawRepeat, RawResult, RawSide } from "../raw";
import type {
  BaseState,
  DecisionLogEntry,
  PitcherUsageSegment,
  RepeatHistogramBucket,
  RepeatResult,
  ResultKind,
  SimulationResult,
} from "@/types/api";
import type { SessionMeta } from "../sessionStore";
import { OUTCOME_LABEL, asBaseState, asHalf, asOutcome, defensiveHalf } from "./common";

function toKind(v: string): ResultKind {
  if (v === "win" || v === "loss" || v === "tie" || v === "in_progress") return v;
  console.warn(`[api] unknown result kind "${v}" — treated as in_progress`);
  return "in_progress";
}

/**
 * Live responses send `score: {my, opp}`; the OpenAPI schema says
 * `{home, away}` (springdoc name clash — REPORT #6). Accept both so a
 * backend fix doesn't break us.
 */
function toMineOpp(score: RawSide["score"], meta: SessionMeta): { mine: number; opp: number } {
  if (score.my !== undefined && score.opp !== undefined) return { mine: score.my, opp: score.opp };
  const home = score.home ?? 0;
  const away = score.away ?? 0;
  return meta.myTeam === meta.homeTeam ? { mine: home, opp: away } : { mine: away, opp: home };
}

function toSegment(u: RawPitcherUsage): PitcherUsageSegment {
  const sameHalf = u.from.inning === u.to.inning && u.from.half === u.to.half;
  return {
    pitcherId: u.pitcher_id,
    name: u.name,
    pitchesEst: u.pitches_est,
    fromInning: u.from.inning,
    fromHalf: asHalf(u.from.half),
    toInning: u.to.inning,
    toHalf: asHalf(u.to.half),
    // `pa` is 0-based within the half and `to` is inclusive (samples/result.json:
    // 김서현 0→1 = 2 PAs, 와이스 2→2 = 1 PA).
    fromPa: u.from.pa,
    toPa: u.to.pa,
    paCount: sameHalf ? u.to.pa - u.from.pa + 1 : 0,
    deltaWeSum: u.delta_we_defender,
    enteredLI: u.li_at_entry,
  };
}

function toDecision(d: RawDecisionRow): DecisionLogEntry {
  const outcome = asOutcome(d.outcome);
  return {
    inning: d.inning,
    half: asHalf(d.half),
    // TODO(backend): out_count / base_state (REPORT #2) — server values win when sent.
    outCountBefore: d.out_count ?? null,
    baseStateBefore: d.base_state !== undefined ? asBaseState(d.base_state) : (null as BaseState | null),
    li: d.leverage_index,
    // The server only sends the model's #1 (rank 1 by definition); null while the model ranking is unavailable.
    modelRanking: d.model_top ? [{ pitcherId: d.model_top.pitcher_id, name: d.model_top.name, modelRank: 1 }] : [],
    chosenPitcherId: d.user_choice.pitcher_id,
    actualPitcherId: d.actual_choice?.pitcher_id ?? null,
    isChange: d.is_change,
    chosenName: d.user_choice.name,
    actualName: d.actual_choice?.name ?? null,
    chosenModelRank: d.user_choice.model_rank,
    actualModelRank: d.actual_choice?.model_rank ?? null,
    modelTop: d.model_top ? { pitcherId: d.model_top.pitcher_id, name: d.model_top.name } : null,
    outcome,
    outcomeLabel: OUTCOME_LABEL[outcome] ?? d.outcome,
    runsScored: null, // not sent per PA
    deltaWeDefender: d.delta_we_defender,
  };
}

export function toResult(r: RawResult, meta: SessionMeta): SimulationResult {
  const result = toKind(r.simulated.result);
  const actualResult = toKind(r.actual.result);
  const finalWeDiff = +(r.simulated.final_we - r.actual.final_we).toFixed(3);
  return {
    date: meta.date,
    venue: "", // not provided by the API
    myTeam: meta.myTeam,
    oppTeam: meta.oppTeam,
    startInning: meta.startInning,
    startHalf: defensiveHalf(meta.myTeam, meta.homeTeam),
    myFinalScore: toMineOpp(r.simulated.score, meta),
    result,
    actualFinalScore: toMineOpp(r.actual.score, meta),
    actualResult,
    runsAllowedInRange: { mine: r.simulated.runs_allowed_in_range, actual: r.actual.runs_allowed_in_range },
    finalWeDiff,
    weDiffReferenceLabel: "최종 승률 · 실제 경기 대비",
    pitcherUsage: r.pitcher_usage.map((u) => toSegment(u)),
    actualPitcherUsage: r.actual_pitcher_usage.map((u) => toSegment(u)),
    decisions: r.decisions.map(toDecision),
    pitcherChanges: Math.max(0, r.pitcher_usage.length - 1),
    actualPitcherChanges: Math.max(0, r.actual_pitcher_usage.length - 1),
    bullpenUsed: r.bullpen_used.mine,
    actualBullpenUsed: r.bullpen_used.actual,
    bullpenTotal: r.bullpen_used.total,
    modelComparison: {
      topK: 3,
      decisionCount: r.agreement.total_decisions,
      myWithinTopK: r.agreement.mine_in_top3,
      actualComparableCount: r.decisions.filter((d) => d.actual_choice !== null).length,
      actualWithinTopK: r.agreement.actual_in_top3,
      sameAsActual: r.agreement.same_as_actual,
    },
  };
}

export function toRepeat(r: RawRepeat, ctx: { myRunsAllowed?: number }): RepeatResult {
  // `histogram` is a map: run count (as a string key) → number of trials.
  // Object key order is not relied on; buckets are rebuilt as 0..6 and "7+"
  // (same shape the chart already draws), filling empty runs with 0.
  const counts = new Map<number, number>();
  for (const [k, v] of Object.entries(r.runs_allowed.histogram)) counts.set(Number(k), v);
  const histogram: RepeatHistogramBucket[] = [0, 1, 2, 3, 4, 5, 6].map((runs) => ({
    label: String(runs),
    runs,
    count: counts.get(runs) ?? 0,
  }));
  let tail = 0;
  for (const [runs, count] of counts) if (runs >= 7) tail += count;
  histogram.push({ label: "7+", runs: 7, count: tail });

  return {
    histogram,
    median: r.runs_allowed.median,
    meanRunsAllowed: r.runs_allowed.mean,
    p10WE: r.final_we.p10,
    p50WE: r.final_we.median,
    p90WE: r.final_we.p90,
    probBetterThanActual: r.better_than_actual_rate,
    winRate: r.win_rate,
    elapsedMs: r.elapsed_ms,
    n: r.n,
    myActualRuns: ctx.myRunsAllowed ?? null,
    actualGameRuns: r.actual.runs_allowed,
  };
}
