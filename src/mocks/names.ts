import { pick, seededRandom } from "./rng";

/** Synthetic Korean name generator for procedurally-built rosters (non-flagship
 * teams). Not tied to any real roster — used only to fill out mock data. */
const SURNAMES = [
  "김", "이", "박", "최", "정", "강", "조", "윤", "장", "임",
  "한", "오", "서", "신", "권", "황", "안", "송", "전", "홍",
];
const GIVEN = [
  "민준", "서준", "도윤", "시우", "지호", "준우", "현우", "우진", "선우", "연우",
  "지훈", "동현", "재현", "성민", "태윤", "규현", "재원", "승우", "한결", "찬영",
];

export function generateName(seedSrc: string): string {
  const rand = seededRandom(seedSrc);
  return pick(rand, SURNAMES) + pick(rand, GIVEN);
}
