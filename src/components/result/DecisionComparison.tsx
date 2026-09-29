import { choiceWithRank, modelTop, signed, situationLabel } from "@/lib/resultDisplay";
import type { SimulationResult } from "@/types/api";

interface DecisionComparisonProps {
  decisions: SimulationResult["decisions"];
  comparison: SimulationResult["modelComparison"];
}

/** Side-by-side of my choice / the real manager's choice against the model's
 * ranking. Ranks are shown as a reference point, not as right or wrong. */
export function DecisionComparison({ decisions, comparison: c }: DecisionComparisonProps) {
  const summary =
    c.decisionCount === 0
      ? "이 세션에서는 투수 교체가 없어 비교할 결정이 없습니다."
      : `내 선택 ${c.decisionCount}회 중 ${c.myWithinTopK}회가 모델 상위 ${c.topK}위 이내였습니다.` +
        (c.actualComparableCount > 0
          ? ` 실제 감독은 ${c.actualComparableCount}회 중 ${c.actualWithinTopK}회였습니다.`
          : "");

  return (
    <div className="rounded-lg bg-card p-[18px_22px_16px]">
      <div className="mb-1 text-sm">결정 비교 · 모델 추천과의 비교</div>
      <div className="mb-3 text-xs text-muted-foreground">{summary}</div>
      {decisions.length > 0 && (
        <div className="om-scroll pb-1">
          <table className="w-full min-w-[640px] border-collapse text-left text-xs">
            <thead>
              <tr className="text-[11px] text-muted-foreground">
                {["상황", "LI", "모델 1위", "내 선택 (모델 순위)", "실제 감독 (모델 순위)", "결과 ΔWE"].map((h) => (
                  <th key={h} scope="col" className="whitespace-nowrap border-b border-border px-2 py-2 font-normal">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {decisions.map((d, i) => (
                <tr key={i} className="border-b border-border last:border-b-0">
                  <td className="whitespace-nowrap px-2 py-2.5">
                    {situationLabel(d.inning, d.half, d.outCountBefore, d.baseStateBefore)}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2.5 text-chart-5">{d.li.toFixed(2)}</td>
                  <td className="whitespace-nowrap px-2 py-2.5">{modelTop(d)?.name ?? "—"}</td>
                  <td className="whitespace-nowrap px-2 py-2.5">{choiceWithRank(d, d.chosenPitcherId) ?? "—"}</td>
                  <td className="whitespace-nowrap px-2 py-2.5 text-muted-foreground">
                    {choiceWithRank(d, d.actualPitcherId) ?? "—"}
                  </td>
                  <td
                    className="whitespace-nowrap px-2 py-2.5"
                    style={{ color: d.deltaWeDefender >= 0 ? "var(--primary)" : "var(--destructive)" }}
                  >
                    {signed(d.deltaWeDefender)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-2 text-[11px] text-muted-foreground">
        모델 순위는 비교를 위한 참고 지표입니다. 결정의 좋고 나쁨을 판정하지 않습니다.
      </div>
    </div>
  );
}
