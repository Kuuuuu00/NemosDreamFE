import type { PAOutcomeCode } from "@/types/api";

/** Presentation-only classification of the 9 outcome codes (§2-4) — kept
 * here (not in src/mocks) since it's a property of the contract itself, not
 * mock data, so dashboard components can use it directly. */
const BAD_FOR_DEFENSE: ReadonlySet<PAOutcomeCode> = new Set(["1B", "2B", "3B", "HR", "BB"]);

export function outcomeTone(code: PAOutcomeCode): "good" | "bad" {
  return BAD_FOR_DEFENSE.has(code) ? "bad" : "good";
}

export const OUTCOME_LABELS: Record<PAOutcomeCode, string> = {
  SO: "삼진",
  GO: "땅볼",
  FO: "플라이",
  "1B": "안타",
  BB: "볼넷",
  "2B": "2루타",
  GDP: "병살",
  HR: "홈런",
  "3B": "3루타",
};

export const OUTCOME_DISPLAY_ORDER: PAOutcomeCode[] = ["SO", "GO", "FO", "1B", "BB", "2B", "GDP", "HR", "3B"];
