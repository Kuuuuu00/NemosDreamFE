import type { Team } from "@/types/api";

export const TEAMS: Team[] = [
  { code: "HH", name: "한화", logoUrl: null },
  { code: "KIA", name: "KIA", logoUrl: null },
  { code: "KT", name: "kt", logoUrl: null },
  { code: "LG", name: "LG", logoUrl: null },
  { code: "LT", name: "롯데", logoUrl: null },
  { code: "NC", name: "NC", logoUrl: null },
  { code: "OB", name: "두산", logoUrl: null },
  { code: "SSG", name: "SSG", logoUrl: null },
  { code: "SS", name: "삼성", logoUrl: null },
  { code: "WO", name: "키움", logoUrl: null },
];

export const VENUES: Record<string, string> = {
  HH: "대전",
  KIA: "광주",
  KT: "수원",
  LG: "잠실",
  LT: "부산",
  NC: "창원",
  OB: "잠실",
  SSG: "인천",
  SS: "대구",
  WO: "고척",
};

export function teamName(code: string): string {
  return TEAMS.find((t) => t.code === code)?.name ?? code;
}
