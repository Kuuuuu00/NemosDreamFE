import { Bar, BarChart, Cell, ResponsiveContainer, XAxis } from "recharts";
import { Card } from "@/components/ui/card";
import type { RepeatResult } from "@/types/api";

interface RepeatSimulationPanelProps {
  repeat: RepeatResult;
  startInning: number;
}

export function RepeatSimulationPanel({ repeat, startInning }: RepeatSimulationPanelProps) {
  const data = repeat.histogram.map((h) => {
    const isMine = h.runs === repeat.myActualRuns || (h.runs === 7 && repeat.myActualRuns >= 7);
    const isActual = h.runs === repeat.actualGameRuns || (h.runs === 7 && repeat.actualGameRuns >= 7);
    return {
      ...h,
      isMine,
      isActual,
      mark: isMine && isActual ? "내 결과 · 실제" : isMine ? "내 결과" : isActual ? "실제 경기" : "",
    };
  });

  return (
    <Card className="p-[18px_22px_18px]">
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-sm">반복 시뮬레이션 · {repeat.n}회</span>
        <span className="text-xs text-muted-foreground">
          중앙값 {repeat.median}실점 · 실제 경기({repeat.actualGameRuns}실점)보다 좋을 확률{" "}
          {(repeat.probBetterThanActual * 100).toFixed(0)}% · 같을 확률 {(repeat.probSameAsActual * 100).toFixed(0)}%
        </span>
      </div>
      <div className="mb-4 text-[11px] text-muted-foreground">
        같은 시작 상황과 같은 결정을 {repeat.n}회 반복했을 때의 {startInning}~9회 실점 분포 · 우리 팀 공격은 실제
        기록으로 고정됩니다
      </div>
      <div className="om-scroll pb-1">
        <div className="min-w-[600px]">
          <div className="h-[190px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 20, right: 8, bottom: 4, left: 8 }}>
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={{ stroke: "var(--border)" }} tickLine={false} />
                <Bar
                  dataKey="count"
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={false}
                  label={{ position: "top", fontSize: 11, fill: "var(--muted-foreground)" }}
                >
                  {data.map((d, i) => (
                    <Cell key={i} fill={d.isMine ? "var(--primary)" : d.isActual ? "var(--muted-foreground)" : "var(--bar)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-1.5 grid" style={{ gridTemplateColumns: `repeat(${data.length}, 1fr)` }}>
            {data.map((d, i) => (
              <span
                key={i}
                className="text-center text-[10px]"
                style={{ color: d.isMine ? "var(--primary)" : d.isActual ? "var(--muted-foreground)" : "transparent" }}
              >
                {d.mark || " "}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}
