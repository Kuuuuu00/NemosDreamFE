import { Button } from "@/components/ui/button";
import { ChoiceCell } from "@/components/result/ChoiceCell";
import { comparisonSummary, modelTop, nameOf, rankOf, signed, situationLabel } from "@/lib/resultDisplay";
import type { SimulationResult } from "@/types/api";

interface DecisionComparisonProps {
  /** Already filtered by ResultPage (shared with DecisionLog). */
  decisions: SimulationResult["decisions"];
  totalCount: number;
  showAll: boolean;
  onToggleAll: () => void;
  comparison: SimulationResult["modelComparison"];
}

/** Side-by-side of my choice / the real manager's choice against the model's
 * ranking. Ranks are shown as a reference point, not as right or wrong. */
export function DecisionComparison({ decisions, totalCount, showAll, onToggleAll, comparison: c }: DecisionComparisonProps) {
  const { line1, line2 } = comparisonSummary(c);

  return (
    <div className="rounded-lg bg-card p-[18px_22px_16px]">
      <div className="mb-1 flex items-center justify-between gap-3">
        <span className="text-sm">결정 비교 · 모델 추천과의 비교</span>
        {totalCount > decisions.length || showAll ? (
          <Button variant="muted" size="sm" onClick={onToggleAll} aria-pressed={showAll}>
            {showAll ? "교체 타석만 보기" : "전체 타석 보기"}
          </Button>
        ) : null}
      </div>
      <div className="mb-3 flex flex-col gap-0.5 text-xs text-muted-foreground">
        <span>{line1}</span>
        {line2 && <span>{line2}</span>}
      </div>
      {decisions.length === 0 && totalCount > 0 && (
        <div className="mb-2 text-xs text-muted-foreground">교체한 타석이 없습니다. 전체 타석 보기로 확인할 수 있습니다.</div>
      )}
      {decisions.length > 0 && (
        <div className="om-scroll pb-1">
          <table className="w-full min-w-[640px] border-collapse text-left text-xs">
            <thead>
              <tr className="text-[11px] text-muted-foreground">
                {["상황", "LI", "모델 1위 (교체 시)", "내 선택", "실제 감독", "결과 ΔWE"].map((h) => (
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
                  <td className="whitespace-nowrap px-2 py-2.5"><ChoiceCell name={nameOf(d, "mine")} isChange={d.isChange ?? true} rank={rankOf(d, "mine")} /></td>
                  <td className="whitespace-nowrap px-2 py-2.5 text-muted-foreground">
                    <ChoiceCell name={nameOf(d, "actual")} isChange={d.actualIsChange ?? (d.actualPitcherId === null ? null : true)} rank={rankOf(d, "actual")} />
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
