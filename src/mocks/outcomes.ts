import type { PAOutcomeCode } from "@/types/api";

export interface OutcomeDef {
  code: PAOutcomeCode;
  label: string;
  description: string;
  tone: "good" | "bad"; // from the defending team's perspective
  fx: "hr" | "hit" | "k" | "dp" | "out" | "bb";
}

/** Base league-average PA outcome distribution. Sums to 1.0 (§2-4). Sampling
 * is nudged by the mound pitcher's quality_p at simulate-pa time. */
export const BASE_PROBS: Record<PAOutcomeCode, number> = {
  SO: 0.212,
  GO: 0.185,
  FO: 0.163,
  "1B": 0.14,
  BB: 0.097,
  "2B": 0.083,
  GDP: 0.06,
  HR: 0.031,
  "3B": 0.029,
};

export const OUTCOME_DEFS: Record<PAOutcomeCode, OutcomeDef> = {
  SO: { code: "SO", label: "삼진", description: "바깥쪽 슬라이더 헛스윙 삼진", tone: "good", fx: "k" },
  GO: { code: "GO", label: "땅볼 아웃", description: "유격수 정면 땅볼 아웃", tone: "good", fx: "out" },
  FO: { code: "FO", label: "플라이 아웃", description: "중견수 플라이 아웃", tone: "good", fx: "out" },
  GDP: { code: "GDP", label: "병살타", description: "유격수 - 2루 - 1루 병살", tone: "good", fx: "dp" },
  "1B": { code: "1B", label: "안타", description: "2루수 옆을 빠져나가는 안타", tone: "bad", fx: "hit" },
  "2B": { code: "2B", label: "2루타", description: "우중간을 가르는 2루타", tone: "bad", fx: "hit" },
  "3B": { code: "3B", label: "3루타", description: "우익선상을 가르는 3루타", tone: "bad", fx: "hit" },
  HR: { code: "HR", label: "홈런", description: "좌중간 담장을 넘어가는 홈런", tone: "bad", fx: "hr" },
  BB: { code: "BB", label: "볼넷", description: "제구가 흔들리며 볼넷 허용", tone: "bad", fx: "bb" },
};

export const DIST_ORDER: PAOutcomeCode[] = ["SO", "GO", "FO", "1B", "BB", "2B", "GDP", "HR", "3B"];
