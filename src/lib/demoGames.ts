/**
 * Presentation-only demo games, kept in ONE place. Screens look games up here
 * (`getDemoGame(gameId)`); nobody hard-codes a game_id or the Korean wording.
 *
 * The backend serves these under a season the default `GET /games` does not
 * return (`season` defaults to 2025), so the list request must pass it.
 */
export interface DemoGame {
  /** Button label in the onboarding month-filter row. */
  label: string;
  season: number;
  /** The team pair (either side may be "my team") for which the button shows. */
  teams: [string, string];
  /** Result-screen note: why the 9-inning score differs from the real result. */
  actualResultNote: string;
  /** Short note on the right of the game row. */
  rowNote: string;
}

export const DEMO_GAMES: Record<string, DemoGame> = {
  "77771104SSKT02026": {
    label: "2026 KS",
    season: 2026,
    teams: ["KT", "SS"],
    actualResultNote: "실제 결과: 삼성 3:2 (12회 연장)",
    rowNote: "실제 결과 삼성 3:2 (12회)",
  },
};

export const DEFAULT_SEASON = 2025;

export const DEMO_TEXT = {
  /** Replaces the "2025 정규시즌 맞대결 N경기" block title while a demo season is selected. */
  listTitle: "2026 한국시리즈 · 시연용",
  /** Shown once in the candidate-list header instead of per-row "시즌 기록 없음". */
  noSeasonStats: "시연 경기: 2026 시즌 기록 미반영",
  /** Small badge near the dashboard header. */
  badge: "2026 KS 시연",
  /** Prefix for the result-screen note. */
  resultPrefix: "9회까지 기준",
} as const;

export function getDemoGame(gameId: string | null | undefined): DemoGame | null {
  return gameId ? (DEMO_GAMES[gameId] ?? null) : null;
}

/** The demo (season, label) offered for this team pair, or null (button hidden). */
export function demoOptionFor(myTeam: string | null, oppTeam: string | null): { label: string; season: number } | null {
  if (!myTeam || !oppTeam) return null;
  for (const g of Object.values(DEMO_GAMES)) {
    const [a, b] = g.teams;
    if ((myTeam === a && oppTeam === b) || (myTeam === b && oppTeam === a)) return { label: g.label, season: g.season };
  }
  return null;
}
