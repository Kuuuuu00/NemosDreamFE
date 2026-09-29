import { TeamEmblem } from "@/components/common/TeamEmblem";
import { Card } from "@/components/ui/card";
import type { SimulationResult } from "@/types/api";

function winLossLabel(win: boolean | null): string {
  return win === null ? "무승부" : win ? "승리" : "패배";
}

interface ResultBannerProps {
  result: SimulationResult;
  teamName: (code: string) => string;
}

export function ResultBanner({ result, teamName }: ResultBannerProps) {
  const { myFinalScore, actualFinalScore, myWin, actualWin, runsAllowedInRange, finalWeDiff, weDiffReferenceLabel, startInning } =
    result;
  const runDiff = runsAllowedInRange.mine - runsAllowedInRange.actual;
  const weDiffPct = +(finalWeDiff * 100).toFixed(1);
  const flat = runDiff === 0 && weDiffPct === 0;
  const good = runDiff < 0 || (runDiff === 0 && weDiffPct > 0);
  const diffColor = flat ? "var(--muted-foreground)" : good ? "var(--primary)" : "var(--destructive)";
  const runDiffText =
    runDiff === 0
      ? `실점 동일 (${runsAllowedInRange.actual}점)`
      : runDiff < 0
        ? `실점 ${Math.abs(runDiff)}점 감소`
        : `실점 ${runDiff}점 증가`;
  const weDiffText = weDiffPct === 0 ? "승률 차이 없음" : `승률 ${weDiffPct > 0 ? "+" : ""}${weDiffPct}%p`;

  return (
    <div className="grid grid-cols-2 items-stretch gap-3 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
      <Card className="flex h-full flex-col justify-between gap-3.5 border border-primary p-[20px_22px]">
        <span className="text-xs text-primary">내 시뮬레이션</span>
        <span className="flex flex-wrap items-center gap-2 text-[34px] font-medium leading-none">
          <TeamEmblem code={result.myTeam} name={teamName(result.myTeam)} size={24} />
          {teamName(result.myTeam)} {myFinalScore.mine} : {myFinalScore.opp} {teamName(result.oppTeam)}
          <TeamEmblem code={result.oppTeam} name={teamName(result.oppTeam)} size={24} />
        </span>
        <div className="flex items-baseline gap-3.5">
          <span className="text-[15px]" style={{ color: myWin === true ? "var(--primary)" : "var(--muted-foreground)" }}>
            {winLossLabel(myWin)}
          </span>
          <span className="text-[13px] text-muted-foreground">
            {startInning}~9회 실점 {runsAllowedInRange.mine}
          </span>
        </div>
      </Card>

      <Card className="order-3 col-span-2 flex h-full min-w-[210px] flex-col justify-center gap-2 p-[20px_26px] lg:order-none lg:col-span-1">
        <span className="text-[11px] text-muted-foreground">실제 경기 대비</span>
        <span className="text-[17px] font-medium" style={{ color: diffColor }}>
          {runDiffText}
        </span>
        <div className="flex flex-col gap-0.5">
          <span className="text-[15px]" style={{ color: diffColor }}>
            {weDiffText}
          </span>
          <span className="text-[11px] text-muted-foreground">{weDiffReferenceLabel}</span>
        </div>
      </Card>

      <Card className="flex h-full flex-col justify-between gap-3.5 border border-border p-[20px_22px]">
        <span className="text-xs text-muted-foreground">실제 경기</span>
        <span className="flex flex-wrap items-center gap-2 text-[34px] font-medium leading-none text-muted-foreground">
          <TeamEmblem code={result.myTeam} name={teamName(result.myTeam)} size={24} />
          {teamName(result.myTeam)} {actualFinalScore.mine} : {actualFinalScore.opp} {teamName(result.oppTeam)}
          <TeamEmblem code={result.oppTeam} name={teamName(result.oppTeam)} size={24} />
        </span>
        <div className="flex items-baseline gap-3.5">
          <span className="text-[15px] text-muted-foreground">{winLossLabel(actualWin)}</span>
          <span className="text-[13px] text-muted-foreground">
            {startInning}~9회 실점 {runsAllowedInRange.actual}
          </span>
        </div>
      </Card>
    </div>
  );
}
