import { VENUES } from "./teams";
import type { GameListItem, InningOption } from "@/types/api";

export const AVAILABLE_MONTHS = [3, 4, 5, 6, 7, 8, 9];

/** Fixed mock 2025 regular-season head-to-head dates/final-scores, reused
 * across every team pairing (mirrors the design's own generic schedule). */
const DAYS: [number, number][] = [
  [3, 29], [4, 8], [4, 9], [4, 27], [5, 6], [5, 7], [5, 30], [6, 11],
  [6, 12], [7, 4], [7, 5], [8, 1], [8, 2], [8, 26], [9, 2], [9, 3],
];
const SCORES: [number, number][] = [
  [2, 5], [7, 3], [4, 4], [1, 6], [8, 2], [3, 3], [5, 9], [6, 1],
  [2, 2], [9, 4], [0, 3], [4, 7], [11, 5], [3, 6], [6, 9], [5, 2],
];

function pad(n: number) {
  return n < 10 ? "0" + n : "" + n;
}

export interface MockGame {
  gameId: string;
  index: number;
  myTeam: string;
  oppTeam: string;
  homeIsMine: boolean;
  month: number;
  date: string;
  myRuns: number;
  oppRuns: number;
  venue: string;
}

export function buildGames(myTeam: string, oppTeam: string): MockGame[] {
  return DAYS.map((d, i) => {
    const homeIsMine = i % 2 === 1;
    const [a, b] = SCORES[i];
    const home = homeIsMine ? myTeam : oppTeam;
    return {
      gameId: `2025${pad(d[0])}${pad(d[1])}${myTeam}${oppTeam}${i}`,
      index: i,
      myTeam,
      oppTeam,
      homeIsMine,
      month: d[0],
      date: `2025.${pad(d[0])}.${pad(d[1])}`,
      myRuns: homeIsMine ? b : a,
      oppRuns: homeIsMine ? a : b,
      venue: VENUES[home] ?? "-",
    };
  });
}

/** Distributes final runs backwards over 9 innings so every pre-inning score
 * is monotonically non-decreasing and never exceeds the box score. Ported
 * from the design's `progression()` so schedules stay reproducible. */
export function progression(total: number, seed: number): number[] {
  const per = new Array(9).fill(0);
  let left = total;
  for (let i = 0; i < 9 && left > 0; i++) {
    const idx = (seed * 7 + i * 3) % 9;
    const give = Math.min(left, (seed + idx) % 3 === 0 ? 2 : 1);
    per[idx] += give;
    left -= give;
  }
  if (left > 0) per[8] += left;
  const cum: number[] = [];
  let run = 0;
  for (let i = 0; i < 9; i++) {
    cum.push(run);
    run += per[i];
  }
  return cum; // cum[k] = runs scored before inning k+1
}

export function perInningRuns(total: number, seed: number): number[] {
  const cum = progression(total, seed);
  return cum.map((v, i) => (i === 8 ? total : cum[i + 1]) - v);
}


/** Candidate starting innings (5~9, defense half only — §1-4). */
export function inningsFor(g: MockGame): InningOption[] {
  const homeDef = g.homeIsMine;
  const half = homeDef ? "초" : "말";
  const mineCum = progression(g.myRuns, g.index + 1);
  const themCum = progression(g.oppRuns, g.index + 4);
  return [5, 6, 7, 8, 9].map((n) => {
    const mine = mineCum[n - 1];
    const theirs = homeDef ? themCum[n - 1] : Math.min(g.oppRuns, themCum[Math.min(8, n)]);
    const margin = mine - theirs;
    const tone = margin > 0 ? "앞섬" : margin === 0 ? "동점" : "뒤짐";
    const played = !(n === 9 && !homeDef && g.oppRuns > g.myRuns);
    const li = Math.max(
      0.2,
      (0.55 + (n - 5) * 0.42) *
        (Math.abs(margin) <= 1 ? 1.5 : Math.abs(margin) === 2 ? 1.0 : Math.abs(margin) === 3 ? 0.6 : 0.3),
    );
    return {
      n,
      label: n + "회" + half,
      myScoreAtStart: mine,
      oppScoreAtStart: theirs,
      tone,
      li: +li.toFixed(2),
      liHigh: li >= 1.5,
      played,
    };
  });
}

export function toGameListItem(g: MockGame): GameListItem {
  const innings = inningsFor(g).filter((i) => i.played);
  return {
    gameId: g.gameId,
    date: g.date,
    away: g.homeIsMine ? g.oppTeam : g.myTeam,
    home: g.homeIsMine ? g.myTeam : g.oppTeam,
    finalScore: {
      away: g.homeIsMine ? g.oppRuns : g.myRuns,
      home: g.homeIsMine ? g.myRuns : g.oppRuns,
    },
    availableInnings: innings.map((i) => i.n),
    highLeverageInnings: innings.filter((i) => i.liHigh).map((i) => i.n),
  };
}
