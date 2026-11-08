import type { RawCandidatePitcher, RawRecommend } from "../raw";
import type { RecommendResponse } from "@/types/api";
import type { ReliefCandidate, RecommendationResult, UsedPitcher } from "@/types/recommendation";
import type { RecommendBundle } from "../types";
import { toPitcher } from "./state";

function toCandidate(c: RawCandidatePitcher, index: number): ReliefCandidate | null {
  // Score-less candidates can't be ranked or drawn as a fit bar.
  if (c.model_score === null) return null;
  return {
    pitcherId: String(c.pitcher_id),
    name: c.name,
    throws: c.throws,
    role: c.role,
    modelScore: c.model_score,
    // Server order is already by score; its rank is shown as-is.
    modelRank: c.model_rank ?? index + 1,
    era: c.season.era,
    qualityPercentile: c.quality_percentile,
    matchupVsBatter: c.matchup_vs_batter,
    consecutiveDays: c.workload.consecutive_days,
    pitchesLast3d: c.workload.pitches_last_3d,
    daysSinceLastApp: c.workload.days_rest,
  };
}

function toUsed(c: RawCandidatePitcher): UsedPitcher {
  return {
    pitcherId: String(c.pitcher_id),
    name: c.name,
    throws: c.throws,
    unavailableReason: c.unavailable_reason,
    qualityPercentile: c.quality_percentile,
  };
}

/**
 * One `POST /recommend` feeds both the summary (`RecommendResponse`) and the
 * ranking (`RecommendationResult`). The server's order is kept untouched —
 * the frontend never re-sorts or re-scores (CLAUDE.md, 연동 명세 §3-6).
 */
export function toRecommendBundle(sessionId: string, r: RawRecommend): RecommendBundle {
  const available: ReliefCandidate[] = [];
  const used: UsedPitcher[] = [];
  r.candidates.forEach(({ pitcher: c }, i) => {
    if (c.availability === "available") {
      const cand = toCandidate(c, i);
      if (cand) available.push(cand);
      else console.warn(`[api] available candidate ${c.pitcher_id} has no model_score — omitted from the ranking`);
    } else {
      // "used" (already pitched) and "unavailable": gray group, no score.
      used.push(toUsed(c));
    }
  });

  const summary: RecommendResponse = {
    leverageIndex: r.leverage_index,
    leverageBand: r.leverage_band,
    liMax: r.li_max,
    bullpenSummary: { available: r.bullpen_summary.available, used: r.bullpen_summary.used, total: r.bullpen_summary.total },
    bullpenSource: r.bullpen_source,
    actualDecision: r.actual_decision
      ? { pitcherId: r.actual_decision.pitcher_id, name: r.actual_decision.name, wasChange: r.actual_decision.was_change }
      : null,
    source: r.source,
    thisOuting: {
      pitches: r.current_pitcher.this_outing.pitches,
      outs: r.current_pitcher.this_outing.outs,
      hitsAllowed: r.current_pitcher.this_outing.hits_allowed,
      walks: r.current_pitcher.this_outing.walks,
      matchupVsBatter: r.current_pitcher.this_outing.matchup_vs_batter,
    },
  };

  const ranking: RecommendationResult = {
    situationId: sessionId,
    leverageIndex: r.leverage_index,
    liPercentile: r.li_percentile,
    candidates: available,
    usedPitchers: used,
    source: r.source,
  };

  return { summary, ranking, currentPitcher: toPitcher(r.current_pitcher.pitcher) };
}
