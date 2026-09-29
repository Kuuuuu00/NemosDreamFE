import type { BaseState } from "@/types/api";

const LABELS: Record<BaseState, string> = {
  "0": "주자 없음",
  "1": "주자 1루",
  "2": "주자 2루",
  "3": "주자 3루",
  "12": "주자 1·2루",
  "13": "주자 1·3루",
  "23": "주자 2·3루",
  "123": "만루",
};

export function baseStateLabel(baseState: BaseState): string {
  return LABELS[baseState];
}
