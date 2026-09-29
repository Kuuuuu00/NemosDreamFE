import type { BatterHand, Hand } from "@/types/api";

export type HandMatchup = "favorable" | "neutral" | "unfavorable";

/** Pitcher-side platoon read: same-side is favorable to the pitcher,
 * opposite-side is not; switch hitters and underhand throwers are neutral. */
export function handMatchup(throws: Hand, batter: BatterHand): HandMatchup {
  if (throws === "U" || batter === "S") return "neutral";
  return throws === batter ? "favorable" : "unfavorable";
}

export const MATCHUP_LABEL: Record<HandMatchup, string> = {
  favorable: "유리",
  neutral: "보통",
  unfavorable: "불리",
};
