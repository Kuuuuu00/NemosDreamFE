import type { GameState } from "@/types/api";

/** One reliever in the model's "if you replace, who comes in" ranking.
 * The bandit only ranks relievers for a decided replacement — the pitcher
 * currently on the mound (STAY) has no model score and never appears here. */
export interface ReliefCandidate {
  pitcherId: string;
  name: string;
  throws: "L" | "R" | "U" | null;
  /** Bandit expected outcome: WPA per PA, pitcher's perspective, higher is
   * better. Source-provided — the frontend never computes or adjusts it. */
  modelScore: number;
  /** 1-based, ascending with `candidates` order. */
  modelRank: number;
  era?: number;
  /** 0–100, relievers' quality percentile (higher = better). */
  qualityPercentile?: number;
  matchupVsBatter?: "favorable" | "neutral" | "unfavorable" | null;
  // Fatigue — data in preparation; UI renders "—" when absent.
  consecutiveDays?: number;
  pitchesLast3d?: number;
  daysSinceLastApp?: number;
}

export interface RecommendationResult {
  situationId: string;
  leverageIndex: number;
  /** Percentile of this LI within the league LI distribution (0–100). */
  liPercentile: number;
  /** Ascending by `modelRank`. */
  candidates: ReliefCandidate[];
  source: "precomputed" | "live" | "mock";
}

export interface RecommendationSource {
  getRecommendations(state: GameState): Promise<RecommendationResult>;
}
