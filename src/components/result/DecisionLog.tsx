import { choiceWithRank, modelTop, situationLabel } from "@/lib/resultDisplay";
import type { DecisionLogEntry } from "@/types/api";

interface DecisionLogProps {
  decisions: DecisionLogEntry[];
}

export function DecisionLog({ decisions }: DecisionLogProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 text-sm">결정 로그</div>
      <div className="flex flex-1 flex-col justify-between gap-3.5">
        {decisions.length === 0 && (
          <div className="text-xs text-muted-foreground">이 세션에서는 투수 교체가 없었습니다.</div>
        )}
        {decisions.map((d, i) => {
          const top = modelTop(d);
          const mine = choiceWithRank(d, d.chosenPitcherId);
          const real = choiceWithRank(d, d.actualPitcherId);
          const goodOutcome = d.deltaWeDefender >= 0;
          return (
            <div key={i} className="flex flex-col gap-2.5 border-b border-border pb-3.5 last:border-b-0 last:pb-0">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[13px]">{situationLabel(d.inning, d.half, d.outCountBefore, d.baseStateBefore)}</span>
                <span className="text-xs text-chart-5">LI {d.li.toFixed(2)}</span>
              </div>
              <div className="grid grid-cols-[74px_1fr] gap-x-3 gap-y-[7px] text-xs">
                <span className="text-muted-foreground">모델 1위</span>
                <span>{top ? top.name : "—"}</span>
                <span className="text-muted-foreground">내 선택</span>
                <span>{mine ?? "—"}</span>
                <span className="text-muted-foreground">실제 감독</span>
                <span className="text-muted-foreground">{real ?? "— (분기 이후라 비교 불가)"}</span>
                <span className="text-muted-foreground">결과</span>
                <span style={{ color: goodOutcome ? "var(--primary)" : "var(--destructive)" }}>
                  {d.outcomeLabel} → {d.runsScored > 0 ? `${d.runsScored}실점` : "무실점"} · ΔWE {goodOutcome ? "+" : ""}
                  {d.deltaWeDefender.toFixed(2)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
