/**
 * Shared mapping helpers. Mapping is always explicit, field by field — never
 * a recursive snake→camel converter (연동 명세 §0-3: `R/H/E/B`, `L/R`,
 * `probs` and `histogram` keys are data, and `appearances_last_7d` style
 * names break naive `_[a-z]` regexes).
 */
import type { BaseState, Half, PAOutcomeCode } from "@/types/api";

export const OUTCOME_CODES: readonly PAOutcomeCode[] = ["1B", "2B", "3B", "HR", "BB", "SO", "GO", "FO", "GDP"];

/** Display labels for PA outcome codes (the server's `outcome_label` is only on simulate-pa). */
export const OUTCOME_LABEL: Record<PAOutcomeCode, string> = {
  "1B": "안타",
  "2B": "2루타",
  "3B": "3루타",
  HR: "홈런",
  BB: "볼넷",
  SO: "삼진",
  GO: "땅볼 아웃",
  FO: "플라이 아웃",
  GDP: "병살타",
};

const BASE_STATES: readonly string[] = ["0", "1", "2", "3", "12", "13", "23", "123"];

export function asOutcome(code: string): PAOutcomeCode {
  if ((OUTCOME_CODES as readonly string[]).includes(code)) return code as PAOutcomeCode;
  console.warn(`[api] unknown PA outcome code "${code}"`);
  return code as PAOutcomeCode;
}

export function asBaseState(code: string): BaseState {
  if (!BASE_STATES.includes(code)) console.warn(`[api] unknown base_state "${code}"`);
  return code as BaseState;
}

export function asHalf(h: string): Half {
  return h === "top" ? "top" : "bot";
}

/** Whether `team` bats in the top (away) or bottom (home) of an inning, i.e. which half it defends. */
export function defensiveHalf(myTeam: string, homeTeam: string): Half {
  return myTeam === homeTeam ? "top" : "bot";
}
