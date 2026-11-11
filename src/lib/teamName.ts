import type { Team } from "@/types/api";

/** Fallback display names (used before `GET /teams` answers, when it fails, and in mock mode). Same spelling as the server's names. */
const FIXED_NAMES: Record<string, string> = {
  HH: "한화",
  HT: "KIA",
  KT: "KT",
  LG: "LG",
  LT: "롯데",
  NC: "NC",
  OB: "두산",
  SK: "SSG",
  SS: "삼성",
  WO: "키움",
};

/** Names from the server's `GET /teams` (filled by `useTeams` — no extra request is made for this). */
let serverNames = new Map<string, string>();

export function setServerTeamNames(teams: Team[]): void {
  serverNames = new Map(teams.map((t) => [t.code, t.name]));
}

/** Team code → club name for display. Data keys, emblem file names and API values keep using the code. */
export function teamName(code: string): string {
  return serverNames.get(code) ?? FIXED_NAMES[code] ?? code;
}
