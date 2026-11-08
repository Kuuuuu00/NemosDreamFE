import type {
  AdvanceHalfResponse,
  AppConfig,
  GameListItem,
  GameState,
  PAResult,
  Pitcher,
  RecommendResponse,
  RepeatResult,
  SessionParams,
  SimulationResult,
  Team,
  WeTraceResponse,
} from "@/types/api";
import type { RecommendationResult } from "@/types/recommendation";

/** One `/recommend` call → summary + model ranking + the pitcher on the mound. */
export interface RecommendBundle {
  summary: RecommendResponse;
  ranking: RecommendationResult;
  currentPitcher: Pitcher;
}

/** Pass `signal` to invalidate a superseded request (see `createLatest`). */
export interface ReadOptions {
  signal?: AbortSignal;
}

/**
 * The single seam between the app and a backend. `./endpoints` (real HTTP)
 * and `./mockAdapter` (src/mocks) both implement it; hooks import only
 * `api` from `@/api`. 12 endpoints (spec §1).
 */
export interface ApiSurface {
  health(): Promise<boolean>;
  getConfig(): Promise<AppConfig>;
  getTeams(): Promise<Team[]>;
  getGames(myTeam: string, oppTeam: string): Promise<GameListItem[]>;
  createSession(params: SessionParams): Promise<{ state: GameState }>;
  /** `state` is only used by the mock (its ranking is computed from state); the real API ignores it. */
  recommend(sessionId: string, state: GameState): Promise<RecommendBundle>;
  /**
   * `pitcherId` stays a string in the frontend (ReliefCandidate.pitcherId).
   * The number conversion happens in exactly one place: the real
   * `simulatePa` in endpoints.ts. Keep the current pitcher's id when "staying".
   */
  simulatePa(sessionId: string, pitcherId: string): Promise<{ result: PAResult }>;
  advanceHalf(sessionId: string): Promise<AdvanceHalfResponse>;
  undoLast(sessionId: string): Promise<{ state: GameState }>;
  getWeTrace(sessionId: string, opts?: ReadOptions): Promise<WeTraceResponse>;
  getResult(sessionId: string, opts?: ReadOptions): Promise<SimulationResult>;
  /** `myRunsAllowed` (from /result) lets the histogram mark "my result". */
  getRepeatSimulation(
    sessionId: string,
    n: number,
    opts?: ReadOptions & { myRunsAllowed?: number },
  ): Promise<RepeatResult>;
}
