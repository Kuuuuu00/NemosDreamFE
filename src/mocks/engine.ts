import { BASE_PROBS } from "./outcomes";
import type { BaseState, Half, PAOutcomeCode } from "@/types/api";

function occupied(base: BaseState): Set<1 | 2 | 3> {
  const set = new Set<1 | 2 | 3>();
  if (base.includes("1")) set.add(1);
  if (base.includes("2")) set.add(2);
  if (base.includes("3")) set.add(3);
  return set;
}

function toBaseState(set: Set<1 | 2 | 3>): BaseState {
  const s = [...set].sort().join("");
  return (s === "" ? "0" : s) as BaseState;
}

/**
 * Deterministic base-advancement per §9-1's "average runner" proposal,
 * extended to cover every base state. This is a frontend placeholder —
 * the real backend owns baserunning per the spec (§5).
 */
export function applyOutcome(
  base: BaseState,
  outs: number,
  outcome: PAOutcomeCode,
): { base: BaseState; outs: number; runs: number } {
  const occ = occupied(base);
  let runs = 0;

  switch (outcome) {
    case "SO":
    case "GO":
    case "FO": {
      let newOuts = outs + 1;
      if (outcome === "FO" && occ.has(3) && outs < 2) {
        // sacrifice fly
        occ.delete(3);
        runs += 1;
      }
      return { base: toBaseState(occ), outs: newOuts, runs };
    }
    case "GDP": {
      if (occ.has(1) && outs < 2) {
        occ.delete(1);
        return { base: toBaseState(occ), outs: outs + 2, runs: 0 };
      }
      return { base: toBaseState(occ), outs: outs + 1, runs: 0 };
    }
    case "BB": {
      // Force-advance: a runner only has to move if the base behind them is
      // occupied too. A base with an unforced occupant simply stays put —
      // "forced-in" and "already-there-unforced" both just mean "occupied"
      // in the resulting base state, so the two collapse into one OR check.
      const had1 = occ.has(1);
      const had2 = occ.has(2);
      const had3 = occ.has(3);
      if (had1 && had2 && had3) runs += 1;
      const next = new Set<1 | 2 | 3>([1]);
      if (had1 || had2) next.add(2);
      if ((had1 && had2) || had3) next.add(3);
      return { base: toBaseState(next), outs, runs };
    }
    case "1B": {
      if (occ.has(3)) runs += 1;
      if (occ.has(2)) runs += 1;
      const next = new Set<1 | 2 | 3>([1]);
      if (occ.has(1)) next.add(3);
      return { base: toBaseState(next), outs, runs };
    }
    case "2B": {
      runs += occ.size; // every runner scores per §9-1 table
      return { base: toBaseState(new Set<1 | 2 | 3>([2])), outs, runs };
    }
    case "3B": {
      runs += occ.size;
      return { base: toBaseState(new Set<1 | 2 | 3>([3])), outs, runs };
    }
    case "HR": {
      runs += occ.size + 1;
      return { base: "0", outs, runs };
    }
  }
}

/** Nudges the league-average distribution toward the mound pitcher's
 * quality_p: higher quality → more outs, fewer hits/walks. Frontend-only
 * placeholder for the real CatBoost distribution (§5). */
export function adjustProbsForQuality(qualityP: number): Record<PAOutcomeCode, number> {
  const tilt = (qualityP - 0.6) * 0.5; // roughly [-0.15, 0.14]
  const outsCodes: PAOutcomeCode[] = ["SO", "GO", "FO", "GDP"];
  const hitCodes: PAOutcomeCode[] = ["1B", "2B", "3B", "HR", "BB"];
  const out: Record<string, number> = { ...BASE_PROBS };
  for (const c of outsCodes) out[c] *= 1 + tilt;
  for (const c of hitCodes) out[c] *= 1 - tilt;
  const sum = Object.values(out).reduce((a, b) => a + b, 0);
  for (const k of Object.keys(out)) out[k] = out[k] / sum;
  const total = Object.values(out).reduce((a, b) => a + b, 0) * 100;
  if (Math.abs(total - 100) > 0.5) {
    console.warn(`adjustProbsForQuality: 9-outcome probabilities sum to ${total.toFixed(2)}, expected 100 ± 0.5`);
  }
  return out as Record<PAOutcomeCode, number>;
}

export function sampleOutcome(probs: Record<PAOutcomeCode, number>, rand: () => number): PAOutcomeCode {
  let r = rand();
  for (const [code, p] of Object.entries(probs)) {
    r -= p;
    if (r <= 0) return code as PAOutcomeCode;
  }
  return "GO";
}

/** Heuristic Leverage Index — stand-in for the server's `compute_li()`
 * (§5: LI is server-owned; this only exists so the mock dashboard has
 * plausible numbers to react to). */
export function computeLI(inning: number, scoreDiffDefender: number, base: BaseState, outs: number): number {
  const occ = occupied(base).size;
  const inningFactor = 0.55 + Math.max(0, inning - 5) * 0.42;
  const absDiff = Math.abs(scoreDiffDefender);
  const marginFactor = absDiff <= 1 ? 1.5 : absDiff === 2 ? 1.0 : absDiff === 3 ? 0.6 : 0.3;
  const baseFactor = 1 + occ * 0.18 + (outs === 2 ? -0.1 : 0.05);
  return Math.max(0.2, +(inningFactor * marginFactor * baseFactor).toFixed(2));
}

// Calibrated against a sanity-check table covering both score/inning
// situations and baserunner situations (see the scratch tuning script
// referenced in the fix that introduced this): 1회초 0:0 ~50-56%, 5회말 0:0
// 무사 ~50-55%, 6회말 -2 ~15-25%, 8회말 -1 ~18-27%, 9회초 +3 ~95%+, 9회초
// 0아웃 무주자 동점 ~53-56%, 9회초 1아웃 1·2루 동점 ~42-47%, 9회말 0아웃
// 무주자 동점 ~60-65%, 9회말 0아웃 만루 동점 ~85%+. Nine target windows
// against six coefficients is over-determined — no exact fit exists, so
// these were chosen to minimize the worst single deviation (all land
// within ~1.5 points of their window; see the tuning script for the
// full table). The point of this second pass was the *direction*, not
// decimal precision: runner state now moves WE by double-digit points at
// a tied score, instead of a same-state formula that was flat regardless
// of baserunners.
const WE_HOME_ADV = 0.0474;
const WE_LATE_BASE = 0.0428;
const WE_LATE_SLOPE = 1.5143;
const WE_BATTING_BONUS = 0.0739;
// Home's "batting last" edge: applies whenever it's late, regardless of
// which half it currently is (anticipating the last at-bat is worth
// something even before it arrives), on top of WE_BATTING_BONUS's extra
// while home is actually at bat right now.
const WE_LAST_LICKS = 0.2734;
// Runners threaten more the more outs remain to bring them home —
// multiplicative in occupied-bases × outs-remaining, not a flat per-out or
// per-runner bonus (an additive form couldn't satisfy the 1·2루 and 만루
// cases at once; see the tuning script's notes).
const WE_THREAT_RUNNERS = 0.1383;

/**
 * Single source of truth for win expectancy (§5, §6-2) — home team's win
 * probability, as a pure function of the game state alone. Both the "실제
 * 경기 기록" curve and the live/simulated curve must be built by feeding
 * their respective state sequences through this exact function (see
 * session.ts's `weFor`/`buildActualWeCurve`); that's what guarantees they
 * agree at the divergence point without any separate correction term.
 *
 * `scoreDiff` is home − away (raw, unconverted — the caller decides whose
 * perspective the *output* should be flipped to, via `1 - we`).
 *
 * Deliberately treats `outCount` as *not* modulating how much `scoreDiff`
 * matters (unlike a naive "innings remaining" blend): if it did, recording
 * an out while trailing would move WE the wrong way for the team that just
 * got the out, since fewer outs remain in the game overall. Outs (and
 * baserunners) instead only feed a same-half "threat" term — this keeps WE
 * moving the right direction for outs/hits in the ordinary case.
 * `simulatePa` additionally clamps `deltaWeDefender` by outcome category
 * (§4) as a hard guarantee, since this continuous formula alone can't
 * promise it for every edge case (e.g. a sac fly is an out that also
 * scores a run).
 */
export function computeWE(inning: number, half: Half, outCount: number, base: BaseState, scoreDiff: number): number {
  const halfsCompleted = (inning - 1) * 2 + (half === "bot" ? 1 : 0);
  const progress = Math.min(1, halfsCompleted / 18);
  const lateness = WE_LATE_BASE + WE_LATE_SLOPE * progress;
  const z = scoreDiff * lateness;

  const battingIsHome = half === "bot";
  const battingLogit = (battingIsHome ? WE_BATTING_BONUS * progress : -0.05) + WE_LAST_LICKS * progress;

  const occ = occupied(base).size;
  const outsLeft = 3 - outCount;
  const threat = WE_THREAT_RUNNERS * occ * outsLeft;
  const threatLogit = battingIsHome ? threat : -threat;

  const logit = z + WE_HOME_ADV + battingLogit + threatLogit;
  const we = 1 / (1 + Math.exp(-logit));
  return +Math.min(0.99, Math.max(0.01, we)).toFixed(3);
}

/** Converts a home-perspective WE into an arbitrary team's perspective. */
export function weForTeam(homeWE: number, teamIsHome: boolean): number {
  return teamIsHome ? homeWE : +(1 - homeWE).toFixed(3);
}

export function nextHalfInning(inning: number, half: Half): { inning: number; half: Half } {
  return half === "top" ? { inning, half: "bot" } : { inning: inning + 1, half: "top" };
}
