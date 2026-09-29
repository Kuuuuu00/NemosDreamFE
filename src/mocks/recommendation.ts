import { computeRanking } from "./modelScore";
import { getBullpen } from "./session";
import type { GameState } from "@/types/api";
import type { RecommendationResult, RecommendationSource } from "@/types/recommendation";

/** Real game state (not diverged): the backend serves a precomputed row. */
export class MockPrecomputedSource implements RecommendationSource {
  async getRecommendations(state: GameState): Promise<RecommendationResult> {
    // `source` stays "mock" until a real backend replaces this class.
    return { ...computeRanking(state, getBullpen(state.sessionId), "precomputed"), source: "mock" };
  }
}

/** User-diverged state: the backend would score it live. */
export class MockLiveSource implements RecommendationSource {
  async getRecommendations(state: GameState): Promise<RecommendationResult> {
    return { ...computeRanking(state, getBullpen(state.sessionId), "live"), source: "mock" };
  }
}

const precomputed = new MockPrecomputedSource();
const live = new MockLiveSource();

export function sourceFor(state: GameState): RecommendationSource {
  return state.isDiverged ? live : precomputed;
}
