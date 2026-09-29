import type { BaseState, DecisionLogEntry, Half } from "@/types/api";

function halfLabel(half: Half): "초" | "말" {
  return half === "top" ? "초" : "말";
}

function outCountLabel(n: number): string {
  return n === 0 ? "무사" : `${n}사`;
}

function baseStateLabel(base: BaseState): string {
  switch (base) {
    case "0":
      return "";
    case "1":
      return "1루";
    case "2":
      return "2루";
    case "3":
      return "3루";
    case "12":
      return "1·2루";
    case "13":
      return "1·3루";
    case "23":
      return "2·3루";
    case "123":
      return "만루";
  }
}

export function situationLabel(inning: number, half: Half, outCount: number, base: BaseState): string {
  const baseTxt = baseStateLabel(base);
  return `${inning}회${halfLabel(half)} ${outCountLabel(outCount)}${baseTxt ? ` ${baseTxt}` : ""}`;
}

export function inningHalfLabel(inning: number, half: Half): string {
  return `${inning}회${halfLabel(half)}`;
}

export function modelTop(d: DecisionLogEntry): { name: string; modelRank: number } | null {
  return d.modelRanking[0] ?? null;
}

/** The model's rank of a pitcher at that decision, or null if unknown. */
export function modelRankOf(d: DecisionLogEntry, pitcherId: number | null): number | null {
  if (pitcherId === null) return null;
  return d.modelRanking.find((c) => c.pitcherId === pitcherId)?.modelRank ?? null;
}

/** "이름 (N위)" — the model's rank as a reference, never a verdict. */
export function choiceWithRank(d: DecisionLogEntry, pitcherId: number | null): string | null {
  if (pitcherId === null) return null;
  const found = d.modelRanking.find((c) => c.pitcherId === pitcherId);
  return found ? `${found.name} (${found.modelRank}위)` : null;
}

export function signed(n: number, digits = 2): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(digits)}`;
}
