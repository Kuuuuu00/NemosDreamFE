import { handMatchup } from "@/lib/handMatchup";
import { hashString, seededRandom } from "./rng";
import type { GameState, Pitcher } from "@/types/api";
import type { ReliefCandidate } from "@/types/recommendation";

/** Mock stand-in for the Contextual Bandit's output. Everything here is
 * "server side": it produces the score the frontend later only displays.
 * Deterministic in (situation, pitcher, mode) — no wall-clock, no session id. */
export type ScoreMode = "precomputed" | "live";

/** Same coordinates a real backend would key a precomputed row by. */
export function situationId(state: GameState): string {
  return `${state.gameId}:${state.inning}${state.half}:o${state.outCount}:b${state.baseState}:${state.currentBatter.batterId}`;
}

/** Monotone LI → league percentile stand-in (LI 1.0 ≈ 50th). */
export function liPercentileOf(li: number): number {
  const p = 100 / (1 + Math.exp(-2.2 * Math.log(Math.max(li, 0.05))));
  return +p.toFixed(1);
}

function qualityPercentileOf(qualityP: number): number {
  return Math.round(Math.max(0, Math.min(100, ((qualityP - 0.45) / 0.45) * 100)));
}

export function computeRanking(
  state: GameState,
  bullpen: readonly Pitcher[],
  mode: ScoreMode,
): { situationId: string; leverageIndex: number; liPercentile: number; candidates: ReliefCandidate[] } {
  const sid = situationId(state);
  const scored = bullpen.map((p) => {
    const noise = seededRandom(`${mode}|${sid}|${p.pitcherId}`)() - 0.5; // ±0.5
    // Expected WPA per PA (fraction): a small positive number, wider spread
    // in higher-leverage spots.
    const modelScore = 0.002 + 0.01 * p.qualityP + 0.0035 * noise * (0.6 + Math.min(state.leverageIndex, 3) / 3);
    return { p, modelScore: +modelScore.toFixed(5) };
  });
  scored.sort((a, b) => b.modelScore - a.modelScore || a.p.pitcherId - b.p.pitcherId);

  const candidates: ReliefCandidate[] = scored.map(({ p, modelScore }, i) => {
    // Fatigue feed is "in preparation": absent for roughly a third of the pool.
    const hasFatigue = hashString(`fatigue-${p.pitcherId}`) % 3 !== 0;
    return {
      pitcherId: String(p.pitcherId),
      name: p.name,
      throws: p.throws,
      modelScore,
      modelRank: i + 1,
      era: p.season.era,
      qualityPercentile: qualityPercentileOf(p.qualityP),
      matchupVsBatter: handMatchup(p.throws, state.currentBatter.hitType),
      ...(hasFatigue
        ? {
            consecutiveDays: p.workload.daysRest === 0 ? Math.min(3, Math.max(1, p.workload.appearancesLast7d)) : 0,
            pitchesLast3d: p.workload.appearancesLast7d * 14 + (p.workload.daysRest === 0 ? 12 : 0),
            daysSinceLastApp: p.workload.daysRest,
          }
        : {}),
    };
  });
  return { situationId: sid, leverageIndex: state.leverageIndex, liPercentile: liPercentileOf(state.leverageIndex), candidates };
}
