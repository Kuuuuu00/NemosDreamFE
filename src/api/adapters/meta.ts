import type { RawAppConfig, RawGameSummary, RawTeam, RawWeTrace } from "../raw";
import type { AppConfig, GameListItem, Team, WeTracePoint, WeTraceResponse } from "@/types/api";
import { rememberGame } from "../sessionStore";
import { asHalf } from "./common";

export function toTeam(r: RawTeam): Team {
  return { code: r.code, name: r.name, logoUrl: r.logo_url };
}

export function toConfig(r: RawAppConfig): AppConfig {
  return {
    leverage: { leagueAvg: r.leverage.league_avg, max: r.leverage.max, bands: r.leverage.bands.map((b) => ({ label: b.label, min: b.min, max: b.max })) },
    model: { scoreUnit: r.model.score_unit, description: r.model.description, provisional: r.model.provisional },
    liSourceNote: r.li_source_note,
  };
}

/** "2025-09-02" → "2025.09.02", the format the onboarding game list parses (month filter). */
function dotted(date: string): string {
  return date.replace(/-/g, ".");
}

export function toGame(r: RawGameSummary): GameListItem {
  // Remember home/away: the session state doesn't carry them yet (REPORT #1).
  rememberGame(r.game_id, r.home, r.away, r.date);
  return {
    gameId: r.game_id,
    date: dotted(r.date),
    away: r.away,
    home: r.home,
    finalScore: { away: r.final_score.away, home: r.final_score.home },
    availableInnings: r.available_innings,
    highLeverageInnings: r.high_leverage_innings,
  };
}

const point = (p: RawWeTrace["actual"][number]): WeTracePoint => ({
  inning: p.inning,
  half: asHalf(p.half),
  we: p.we,
  // This is the half-inning's MAX LI (not the current LI) and is 0.0 for
  // halves not played yet. Do not feed the leverage chart with it (§3-10-1).
  leverageIndex: p.leverage_index,
});

export function toWeTrace(r: RawWeTrace, expectedPerspective?: string): WeTraceResponse {
  if (import.meta.env?.DEV && expectedPerspective && r.perspective !== expectedPerspective) {
    console.warn(`[api] we-trace perspective (${r.perspective}) !== my_team (${expectedPerspective})`);
  }
  return {
    perspective: r.perspective,
    actual: r.actual.map(point),
    simulated: r.simulated.map(point), // [] before the user diverges — normal
    divergeAt: r.diverge_at ? { inning: r.diverge_at.inning, half: asHalf(r.diverge_at.half) } : null,
    current: r.current,
  };
}
