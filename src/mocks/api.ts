import { APP_CONFIG } from "./config";
import * as engine from "./session";
import { buildGames, inningsFor, toGameListItem } from "./schedule";
import { sourceFor } from "./recommendation";
import { TEAMS } from "./teams";
import type {
  AppConfig,
  GameListItem,
  GameState,
  InningOption,
  PAResult,
  Pitcher,
  RecommendResponse,
  RepeatResult,
  SimulationResult,
  Team,
  UsageEntry,
  WeTraceResponse,
} from "@/types/api";
import type { RecommendationResult } from "@/types/recommendation";

/**
 * Mock implementation of the `/api/v1/*` surface described in
 * K-Moneyball_프론트엔드_백엔드_요구사항_명세.md §3. Every function here has the
 * same shape (args in, awaited value out) the real backend endpoints will
 * have — swapping the bodies for `fetch()` calls should not require touching
 * any hook or component.
 */

function delay<T>(value: T, ms = 180): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

export async function getConfig(): Promise<AppConfig> {
  return delay(APP_CONFIG, 60);
}

export async function getTeams(): Promise<Team[]> {
  return delay(TEAMS, 60);
}

export async function getGames(myTeam: string, oppTeam: string): Promise<GameListItem[]> {
  const list = buildGames(myTeam, oppTeam).map(toGameListItem);
  return delay(list, 150);
}

/**
 * Not a spec endpoint on its own — the design's onboarding "start inning"
 * cards need per-inning score/LI preview beyond what `GET /games` returns
 * (§3-3 only gives `available_innings`). A real backend can fold this into
 * the games response or expose it alongside; the mock keeps it separate so
 * the shape is easy to relocate later.
 */
export async function getInningOptions(myTeam: string, oppTeam: string, gameId: string): Promise<InningOption[]> {
  const game = buildGames(myTeam, oppTeam).find((g) => g.gameId === gameId);
  return delay(game ? inningsFor(game) : [], 100);
}

export async function createSession(params: {
  myTeam: string;
  oppTeam: string;
  gameId: string;
  startInning: number;
}): Promise<{ state: GameState }> {
  const state = engine.createSession(params.myTeam, params.oppTeam, params.gameId, params.startInning);
  return delay({ state }, 220);
}

export async function recommend(sessionId: string): Promise<RecommendResponse> {
  return delay(engine.getRecommend(sessionId), 150);
}

/** The recommendation seam: precomputed for the real game state, live once
 * the user has diverged. Swap `sourceFor` for real HTTP sources later. */
export async function getRecommendations(state: GameState): Promise<RecommendationResult> {
  const result = await sourceFor(state).getRecommendations(state);
  return delay(result, 120);
}

export async function simulatePa(
  sessionId: string,
  pitcherId: number,
): Promise<{ result: PAResult }> {
  const result = engine.simulatePa(sessionId, pitcherId);
  return delay({ result }, 380);
}

export async function undoLast(sessionId: string): Promise<{ state: GameState }> {
  const state = engine.undo(sessionId);
  return delay({ state }, 150);
}

export async function getWeTrace(sessionId: string): Promise<WeTraceResponse> {
  return delay(engine.getWeTrace(sessionId), 120);
}

export async function getUsageToday(sessionId: string): Promise<UsageEntry[]> {
  return delay(engine.getUsageToday(sessionId), 60);
}

export async function getUsedTonight(sessionId: string): Promise<Pitcher[]> {
  return delay(engine.getUsedTonight(sessionId), 60);
}

export async function getResult(sessionId: string): Promise<SimulationResult> {
  return delay(engine.buildResult(sessionId), 200);
}

export async function getRepeatSimulation(sessionId: string, n: number): Promise<RepeatResult> {
  return delay(engine.repeatSimulation(sessionId, n), 0);
}
