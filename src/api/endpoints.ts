/**
 * Real backend implementation of `ApiSurface` (spec §1, 12 endpoints).
 * Never calls src/mocks. The only place a pitcher id becomes a number is
 * `simulatePa` below.
 */
import { REPEAT_TIMEOUT_MS, ApiRequestError, ping, request } from "./client";
import { toConfig, toGame, toTeam, toWeTrace } from "./adapters/meta";
import { toAdvanceHalf, toGameState, toPaResult } from "./adapters/state";
import { toRecommendBundle } from "./adapters/recommend";
import { toRepeat, toResult } from "./adapters/result";
import { loadMeta, saveSession } from "./sessionStore";
import type {
  RawAdvanceHalf,
  RawAppConfig,
  RawGameState,
  RawGameSummary,
  RawPaResult,
  RawRecommend,
  RawRepeat,
  RawResult,
  RawTeam,
  RawWeTrace,
} from "./raw";
import type { ApiSurface } from "./types";

const base = (sessionId: string) => `/api/v1/sessions/${encodeURIComponent(sessionId)}`;

export const realApi: ApiSurface = {
  health: () => ping(),

  async getConfig() {
    return toConfig(await request<RawAppConfig>("/api/v1/config"));
  },

  async getTeams() {
    return (await request<RawTeam[]>("/api/v1/teams")).map(toTeam);
  },

  async getGames(myTeam, oppTeam, season) {
    // `team` is required (400 otherwise) — never call before a team is chosen.
    // `season` is sent only when given (the server default is 2025).
    const list = await request<RawGameSummary[]>("/api/v1/games", { query: { team: myTeam, opponent: oppTeam, season } });
    return list.map(toGame);
  },

  async createSession(params) {
    // `mode` is deliberately not sent (watch mode is out of scope).
    const raw = await request<{ state: RawGameState }>("/api/v1/sessions", {
      method: "POST",
      body: { game_id: params.gameId, my_team: params.myTeam, start_inning: params.startInning },
    });
    const state = toGameState(raw.state);
    saveSession(
      { ...params, sessionId: state.sessionId, homeTeam: state.homeTeam, awayTeam: state.awayTeam, date: state.date },
      state,
    );
    return { state };
  },

  async recommend(sessionId) {
    // POST with no body. Only valid while my_role === "defense" (else INVALID_ROLE).
    return toRecommendBundle(sessionId, await request<RawRecommend>(`${base(sessionId)}/recommend`, { method: "POST" }));
  },

  async simulatePa(sessionId, pitcherId) {
    // The single string → number conversion point for pitcher ids.
    const id = Number(pitcherId);
    if (!Number.isInteger(id)) throw new ApiRequestError("INVALID_REQUEST", `invalid pitcher id "${pitcherId}"`, false);
    const raw = await request<{ result: RawPaResult }>(`${base(sessionId)}/simulate-pa`, {
      method: "POST",
      body: { pitcher_id: id },
    });
    return { result: toPaResult(raw.result) };
  },

  async advanceHalf(sessionId) {
    return toAdvanceHalf(await request<RawAdvanceHalf>(`${base(sessionId)}/advance-half`, { method: "POST" }));
  },

  async undoLast(sessionId) {
    const raw = await request<{ state: RawGameState }>(`${base(sessionId)}/undo`, { method: "POST" });
    return { state: toGameState(raw.state) };
  },

  async getWeTrace(sessionId, opts) {
    const raw = await request<RawWeTrace>(`${base(sessionId)}/we-trace`, { signal: opts?.signal });
    return toWeTrace(raw, loadMeta(sessionId)?.myTeam);
  },

  async getResult(sessionId, opts) {
    const meta = loadMeta(sessionId);
    // Needs my_team/home/away/start inning, which only we saved at session
    // start. If storage was cleared there is nothing to rebuild it from.
    if (!meta) throw new ApiRequestError("SESSION_EXPIRED", "세션 정보를 복원할 수 없습니다.", false);
    return toResult(await request<RawResult>(`${base(sessionId)}/result`, { signal: opts?.signal }), meta);
  },

  async getRepeatSimulation(sessionId, n, opts) {
    const raw = await request<RawRepeat>(`${base(sessionId)}/repeat`, {
      method: "POST",
      body: { n },
      timeoutMs: REPEAT_TIMEOUT_MS,
      signal: opts?.signal,
    });
    return toRepeat(raw, { myRunsAllowed: opts?.myRunsAllowed });
  },
};
