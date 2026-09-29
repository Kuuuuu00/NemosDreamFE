import { generateName } from "./names";
import { pick, range, seededRandom } from "./rng";
import type { Batter, MatchupStats, Pitcher, UsageEntry } from "@/types/api";

export interface TeamStaff {
  usageToday: UsageEntry[]; // starter + already-used relievers, chronological
  current: Pitcher;
  bullpen: Pitcher[]; // available candidates, unsorted
}

function makePitcher(seed: string, overrides: Partial<Pitcher> = {}): Pitcher {
  const rand = seededRandom(seed);
  const era = +range(rand, 2.4, 4.6).toFixed(2);
  const whip = +range(rand, 1.0, 1.55).toFixed(2);
  const base: Pitcher = {
    pitcherId: Math.floor(range(rand, 10000, 99999)),
    name: generateName(seed),
    throws: pick(rand, ["R", "R", "L"] as const),
    photoUrl: null,
    season: {
      era,
      whip,
      ip: +range(rand, 20, 60).toFixed(1),
      so: Math.floor(range(rand, 20, 70)),
      bb: Math.floor(range(rand, 8, 30)),
      g: Math.floor(range(rand, 20, 60)),
    },
    vsBatterHand: {
      L: {
        avg: +range(rand, 0.21, 0.29).toFixed(3),
        woba: +range(rand, 0.26, 0.33).toFixed(3),
        iso: +range(rand, 0.09, 0.17).toFixed(3),
        pa: Math.floor(range(rand, 60, 160)),
      },
      R: {
        avg: +range(rand, 0.21, 0.29).toFixed(3),
        woba: +range(rand, 0.26, 0.33).toFixed(3),
        iso: +range(rand, 0.09, 0.17).toFixed(3),
        pa: Math.floor(range(rand, 60, 160)),
      },
    },
    workload: {
      paFacedToday: 0,
      estPitchCount: 0,
      avgPitchesPerPa: +range(rand, 3.8, 4.4).toFixed(2),
      daysRest: Math.floor(range(rand, 0, 5)),
      appearancesLast7d: Math.floor(range(rand, 0, 4)),
      hitsAllowed: 0,
      walksAllowed: 0,
      outsRecorded: 0,
    },
    availability: "available",
    unavailableReason: null,
    qualityP: +range(rand, 0.5, 0.88).toFixed(2),
  };
  return { ...base, ...overrides };
}

function makeBatter(seed: string, order: number, overrides: Partial<Batter> = {}): Batter {
  const rand = seededRandom(seed);
  const avg = +range(rand, 0.23, 0.31).toFixed(3);
  const obp = +Math.min(0.42, avg + range(rand, 0.04, 0.09)).toFixed(3);
  const slg = +Math.min(0.58, avg + range(rand, 0.12, 0.24)).toFixed(3);
  const matchupAb = Math.floor(range(rand, 0, 9));
  const matchupH = Math.floor(range(rand, 0, matchupAb + 1));
  const vsCurrentPitcher: MatchupStats | null =
    matchupAb === 0
      ? null
      : {
          ab: matchupAb,
          h: matchupH,
          avg: +(matchupH / matchupAb).toFixed(3),
          woba: +range(rand, 0.24, 0.36).toFixed(3),
          iso: +range(rand, 0.06, 0.2).toFixed(3),
        };
  const base: Batter = {
    batterId: Math.floor(range(rand, 10000, 99999)),
    name: generateName(seed),
    hitType: pick(rand, ["R", "L", "R", "S"] as const),
    photoUrl: null,
    order,
    position: pick(rand, ["1B", "2B", "3B", "SS", "LF", "CF", "RF", "C", "DH"] as const),
    season: {
      avg,
      obp,
      slg,
      ops: +(obp + slg).toFixed(3),
      hr: Math.floor(range(rand, 2, 24)),
    },
    recentAvg: +Math.max(0.15, avg + range(rand, -0.05, 0.05)).toFixed(3),
    vsCurrentPitcher,
    today: {
      ab: Math.floor(range(rand, 1, 4)),
      h: Math.floor(range(rand, 0, 2)),
      rbi: Math.floor(range(rand, 0, 2)),
      log: [pick(rand, ["1B", "SO", "GO", "FO", "BB"] as const)],
    },
  };
  return { ...base, ...overrides };
}

/** Hardcoded to match the design mock exactly: 한화(defense) vs kt, 2025-09-02. */
function flagshipStaff(): TeamStaff {
  const currentPitcher: Pitcher = {
    pitcherId: 60841,
    name: "김정운",
    throws: "R",
    photoUrl: null,
    season: { era: 3.24, whip: 1.18, ip: 52.1, so: 61, bb: 24, g: 55 },
    vsBatterHand: {
      L: { avg: 0.241, woba: 0.283, iso: 0.098, pa: 118 },
      R: { avg: 0.267, woba: 0.301, iso: 0.131, pa: 143 },
    },
    workload: {
      paFacedToday: 4,
      estPitchCount: 18,
      avgPitchesPerPa: 4.12,
      daysRest: 1,
      appearancesLast7d: 3,
      hitsAllowed: 1,
      walksAllowed: 0,
      outsRecorded: 4,
    },
    availability: "current",
    unavailableReason: null,
    qualityP: 0.432,
  };
  const seeds: [string, number, number][] = [
    ["주현상", 2.41, 0.82],
    ["박상현", 3.05, 0.74],
    ["우규민", 3.88, 0.63],
    ["김재윤", 2.94, 0.79],
    ["성재헌", 4.12, 0.55],
    ["전용주", 3.61, 0.68],
  ];
  const bullpen = seeds.map(([name, era, quality]) =>
    makePitcher(`HH-bullpen-${name}`, {
      name,
      season: { era, whip: +range(seededRandom(name), 1.05, 1.4).toFixed(2), ip: +range(seededRandom(name + "ip"), 25, 55).toFixed(1), so: Math.floor(range(seededRandom(name + "so"), 25, 65)), bb: Math.floor(range(seededRandom(name + "bb"), 10, 28)), g: Math.floor(range(seededRandom(name + "g"), 30, 58)) },
      availability: "available",
      qualityP: quality,
    }),
  );
  return {
    usageToday: [
      { name: "문동주", role: "선발", pitches: 82, inningsLabel: "1~5회" },
      { name: "김민수", pitches: 14, inningsLabel: "6회" },
      { name: "박영현", pitches: 9, inningsLabel: "6회" },
    ],
    current: currentPitcher,
    bullpen,
  };
}

export function buildStaff(myTeam: string, oppTeam: string): TeamStaff {
  if (myTeam === "HH" && oppTeam === "KT") return flagshipStaff();

  const starterSeed = `${myTeam}-vs-${oppTeam}-starter`;
  const starterRand = seededRandom(starterSeed);
  const usageToday: UsageEntry[] = [
    { name: generateName(starterSeed), role: "선발", pitches: Math.floor(range(starterRand, 70, 95)), inningsLabel: "1~5회" },
    { name: generateName(`${myTeam}-${oppTeam}-mid1`), pitches: Math.floor(range(seededRandom(myTeam + oppTeam + "m1"), 8, 20)), inningsLabel: "6회" },
    { name: generateName(`${myTeam}-${oppTeam}-mid2`), pitches: Math.floor(range(seededRandom(myTeam + oppTeam + "m2"), 8, 20)), inningsLabel: "6회" },
  ];
  const current = makePitcher(`${myTeam}-${oppTeam}-current`, { availability: "current" });
  const bullpen = Array.from({ length: 6 }, (_, i) =>
    makePitcher(`${myTeam}-${oppTeam}-bullpen-${i}`, { availability: "available" }),
  );
  return { usageToday, current, bullpen };
}

/** Hardcoded to match the design mock exactly: kt(offense) lineup vs 김정운. */
function flagshipLineup(): Batter[] {
  const names: [string, number, "L" | "R" | "S", number, string][] = [
    ["배승수", 4, "L", 0, "1B"],
    ["문현빈", 5, "L", 0, "LF"],
    ["채은성", 6, "R", 0, "1B"],
    ["이진영", 7, "L", 0, "RF"],
  ];
  return names.map(([name, order, hand]) => {
    const rand = seededRandom(`KT-${name}`);
    const isCurrent = order === 4;
    const stats: Record<string, { avg: number; ops: number }> = {
      배승수: { avg: 0.286, ops: 0.853 },
      문현빈: { avg: 0.271, ops: 0.742 },
      채은성: { avg: 0.294, ops: 0.831 },
      이진영: { avg: 0.238, ops: 0.655 },
    };
    const s = stats[name];
    return {
      batterId: Math.floor(range(rand, 10000, 99999)),
      name,
      hitType: hand,
      photoUrl: null,
      order,
      position: "DH",
      season: { avg: s.avg, obp: +(s.avg + 0.07).toFixed(3), slg: +(s.ops - (s.avg + 0.07)).toFixed(3), ops: s.ops, hr: Math.floor(range(rand, 5, 20)) },
      recentAvg: isCurrent ? 0.312 : s.avg,
      vsCurrentPitcher: isCurrent ? { ab: 7, h: 2, avg: 0.286, woba: 0.311, iso: 0.143 } : null,
      today: isCurrent
        ? { ab: 3, h: 1, rbi: 1, log: ["1B", "SO", "GO"] }
        : { ab: Math.floor(range(rand, 2, 4)), h: Math.floor(range(rand, 0, 2)), rbi: 0, log: ["GO"] },
    } satisfies Batter;
  });
}

export function buildLineup(myTeam: string, oppTeam: string): Batter[] {
  if (myTeam === "HH" && oppTeam === "KT") return flagshipLineup();
  // Two of the 4 procedurally-named slots can otherwise draw the same
  // surname+given-name pair (400 combinations, birthday-paradox odds are
  // non-trivial across 4 draws) — visually indistinguishable from the same
  // batter facing the pitcher twice in a row. Reseed on a collision until
  // the lineup's 4 names are pairwise distinct; only the name draw is
  // reseeded, so the rest of that slot's stats stay tied to its own seed.
  const usedNames = new Set<string>();
  return [4, 5, 6, 7].map((order) => {
    const seed = `${oppTeam}-vs-${myTeam}-b${order}`;
    let nameSeed = seed;
    let name = generateName(nameSeed);
    let attempt = 0;
    while (usedNames.has(name) && attempt < 20) {
      attempt += 1;
      nameSeed = `${seed}-alt${attempt}`;
      name = generateName(nameSeed);
    }
    usedNames.add(name);
    return makeBatter(seed, order, { name });
  });
}

// Negative deltas use the plain ASCII hyphen-minus (U+002D), matching what
// `Number.prototype.toFixed()` produces everywhere else in the app (e.g.
// AtBatLogCard, CurrentPitcherCard) — never U+2212 MINUS SIGN, which isn't
// covered by the Pretendard dynamic-subset webfont and renders as a tofu box.
export const AT_BAT_LOG_FLAVOR: { batter: string; outcome: string; delta: string }[] = [
  { batter: "배승수", outcome: "2루타", delta: "-6.2%" },
  { batter: "강백호", outcome: "삼진", delta: "+3.1%" },
  { batter: "황재균", outcome: "볼넷", delta: "-2.4%" },
  { batter: "김상수", outcome: "3루 땅볼", delta: "+2.8%" },
  { batter: "장성우", outcome: "중전 안타", delta: "-4.1%" },
  { batter: "배정대", outcome: "우익수 플라이", delta: "+2.2%" },
];
