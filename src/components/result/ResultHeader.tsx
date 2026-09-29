import type { SimulationResult } from "@/types/api";

interface ResultHeaderProps {
  result: SimulationResult;
  teamName: (code: string) => string;
}

export function ResultHeader({ result, teamName }: ResultHeaderProps) {
  const halfLabel = result.startHalf === "top" ? "초" : "말";
  return (
    <div className="flex flex-wrap items-baseline gap-3.5 px-1 py-0.5">
      <span className="text-[22px] font-semibold">시뮬레이션 결과</span>
      <span className="text-[13px] text-muted-foreground">
        {result.date} {teamName(result.myTeam)} vs {teamName(result.oppTeam)} · {result.venue} · {result.startInning}회
        {halfLabel}부터 진행
      </span>
    </div>
  );
}
