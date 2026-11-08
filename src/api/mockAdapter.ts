/**
 * `ApiSurface` over src/mocks, so mock mode (`VITE_USE_MOCK=true`, a
 * presentation fallback if the server is down) goes through the same seam.
 *
 * The real backend ends my defensive half with `my_role: "offense"` and
 * needs a separate `advance-half` call; the mock engine auto-plays the
 * offense half inside `simulatePa`. This shim stashes the mock's offense
 * summary and replays it as `advanceHalf` so hooks see the real flow. It is
 * deliberately cheap: the goal is "the mock runs to the end", not a perfect
 * match (undo, for one, still steps back a whole PA + half as the engine
 * does). If matching gets complicated, stop and simplify — don't grow this.
 */
import * as mock from "@/mocks/api";
import type { GameState } from "@/types/api";
import { ApiRequestError } from "./client";
import type { ApiSurface } from "./types";

const pendingOffense = new Map<string, { next: GameState; summary: NonNullable<Awaited<ReturnType<typeof mock.simulatePa>>["result"]["offenseHalfSummary"]> }>();

export const mockApi: ApiSurface = {
  health: async () => true,
  getConfig: () => mock.getConfig(),
  getTeams: () => mock.getTeams(),
  getGames: (myTeam, oppTeam) => mock.getGames(myTeam, oppTeam),
  createSession: (params) => {
    pendingOffense.clear();
    return mock.createSession(params);
  },

  async recommend(sessionId, state) {
    const [summary, ranking] = await Promise.all([mock.recommend(sessionId), mock.getRecommendations(state)]);
    return { summary, ranking, currentPitcher: state.currentPitcher };
  },

  async simulatePa(sessionId, pitcherId) {
    pendingOffense.delete(sessionId);
    const { result } = await mock.simulatePa(sessionId, Number(pitcherId));
    const summary = result.offenseHalfSummary;
    if (!summary) return { result };
    pendingOffense.set(sessionId, { next: result.nextState, summary });
    const { offenseHalfSummary: _stashed, ...rest } = result;
    void _stashed;
    // Offense start, as the real server reports it. Batter/pitcher fields stay
    // those of the next defensive half (cosmetic: the dashboard shows an overlay).
    const offenseState: GameState = {
      ...result.nextState,
      myRole: "offense",
      inning: summary.inning,
      half: summary.half,
      outCount: 0,
      baseState: "0",
    };
    return { result: { ...rest, nextState: offenseState } };
  },

  async advanceHalf(sessionId) {
    const pending = pendingOffense.get(sessionId);
    if (!pending) throw new ApiRequestError("INVALID_ROLE", "not in an offense half", false);
    pendingOffense.delete(sessionId);
    const s = pending.summary;
    return {
      summary: {
        runs: s.runs,
        hits: s.hits,
        paLog: s.paLog.map((p) => ({ batter: p.batter, outcome: p.outcome, description: p.description, runsScored: p.runsScored ?? null })),
        // The mock only knows the half's net swing: [start, end] = [0, deltaWe]
        // keeps `last - first` equal to it for callers deriving ΔWE.
        weTrace: [0, s.deltaWe],
        source: "simulated",
      },
      state: pending.next,
    };
  },

  undoLast(sessionId) {
    pendingOffense.delete(sessionId);
    return mock.undoLast(sessionId);
  },
  getWeTrace: (sessionId) => mock.getWeTrace(sessionId),
  async getResult(sessionId) {
    const r = await mock.getResult(sessionId);
    // The mock's decision rows carry no `isChange`; derive it (a row is a change
    // when the chosen pitcher differs from the previous row's, the first row vs.
    // the pitcher the session started with) so the "교체 행만" toggle works here too.
    let prev = r.pitcherUsage[0]?.pitcherId;
    const decisions = r.decisions.map((d) => {
      const isChange = prev === undefined || d.chosenPitcherId !== prev;
      prev = d.chosenPitcherId;
      return { ...d, isChange };
    });
    return { ...r, decisions };
  },
  getRepeatSimulation: (sessionId, n) => mock.getRepeatSimulation(sessionId, n),
};

/** Mock-only data with no real endpoint (replaced by real data in 3-2). */
export const mockExtras = {
  getUsageToday: mock.getUsageToday,
  getUsedTonight: mock.getUsedTonight,
};
