import type { GameState } from "@/types/api";

/** One reliever in the model's "if you replace, who comes in" ranking.
 * The bandit only ranks relievers for a decided replacement — the pitcher
 * currently on the mound (STAY) has no model score and never appears here. */
export interface ReliefCandidate {
  pitcherId: string;
  name: string;
  throws: "L" | "R" | "U" | null;
  /** Role label from the real backend (e.g. "bullpen"); undefined in mock. */
  role?: string | null;
  /** Bandit expected outcome: WPA per PA, pitcher's perspective, higher is
   * better. Source-provided — the frontend never computes or adjusts it. */
  modelScore: number;
  /** 1-based, ascending with `candidates` order. */
  modelRank: number;
  /** Kept for the server schema, but the real backend always sends null — the UI shows `whip` instead. */
  era?: number | null;
  /** Server's season WHIP, passed through (no derived stats). */
  whip?: number | null;
  /** 0–100, relievers' quality percentile (higher = better). */
  /** null = the backend has no percentile for this pitcher (never render it as 0 / "상위 100%"). */
  qualityPercentile?: number | null;
  matchupVsBatter?: "favorable" | "neutral" | "unfavorable" | null;
  // Fatigue — data in preparation; UI renders "—" when absent.
  consecutiveDays?: number | null;
  pitchesLast3d?: number | null;
  daysSinceLastApp?: number | null;
}

/** A reliever who already pitched (real backend, `availability: "used"`).
 * Kept out of `candidates`: no score/rank, shown as a gray group below the
 * ranking. Empty/undefined in mock mode. */
export interface UsedPitcher {
  pitcherId: string;
  name: string;
  throws: "L" | "R" | "U" | null;
  /** e.g. "이미 등판" — display as the reason text. */
  unavailableReason: string | null;
  qualityPercentile?: number | null;
}

export interface RecommendationResult {
  situationId: string;
  leverageIndex: number;
  /** Percentile of this LI within the league LI distribution (0–100). */
  liPercentile: number;
  /** Ascending by `modelRank`. */
  candidates: ReliefCandidate[];
  /** Real backend only. See `UsedPitcher`. */
  usedPitchers?: UsedPitcher[];
  source: "precomputed" | "live" | "mock";
}

export interface RecommendationSource {
  getRecommendations(state: GameState): Promise<RecommendationResult>;
}
