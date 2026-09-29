import { useMemo } from "react";
import { Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { WeTraceResponse } from "@/types/api";

interface LeverageChartProps {
  weTrace: WeTraceResponse;
  currentLI: number;
  /** Share of the league LI distribution this LI sits below (0–100). */
  liPercentile: number;
}

export function LeverageChart({ weTrace, currentLI, liPercentile }: LeverageChartProps) {
  // LI has no "actual full game" reference curve the way WE does — it's
  // derived purely from live session state (inning/outs/base/score), so the
  // chart only ever shows what's actually been played so far, appended one
  // point per PA as the session progresses (never a precomputed 9-inning
  // array sliced down). The last point is always `weTrace.current`'s LI
  // source (`state.leverageIndex`), matching the "현재" figure above.
  const data = useMemo(() => {
    // Each PA appends its own point, so a half-inning with several PAs
    // would otherwise repeat its label ("6회말 · 6회말 · 6회말 · 7회말").
    // Only the first PA of a half-inning gets a tick label; later PAs in
    // the same half plot a point with a blank tick and carry the specific
    // "N회X M번째 타석" text for the tooltip instead.
    const seenCount = new Map<string, number>();
    return weTrace.simulated.map((p) => {
      const halfKey = `${p.inning}-${p.half}`;
      const n = (seenCount.get(halfKey) ?? 0) + 1;
      seenCount.set(halfKey, n);
      const halfLabel = `${p.inning}회${p.half === "top" ? "초" : "말"}`;
      return {
        key: `${halfKey}-${n}`,
        tickLabel: n === 1 ? halfLabel : "",
        paLabel: `${halfLabel} ${n}번째 타석`,
        li: p.leverageIndex ?? 0,
      };
    });
  }, [weTrace]);

  const maxLi = Math.max(3, ...data.map((d) => d.li), currentLI);

  return (
    <div className="flex flex-col">
      <div className="mb-1.5 flex items-baseline justify-between gap-4">
        <div className="text-[13px]">레버리지 지수 추이</div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-[11px] text-muted-foreground">현재</span>
          <span
            className="text-2xl font-medium leading-none text-chart-5"
            title="상황 중요도. 문형우 외(2016) 승리확률 테이블 기반"
          >
            {currentLI.toFixed(2)}
          </span>
          <span
            className="whitespace-nowrap text-[11px] text-muted-foreground"
            title="상황 중요도. 문형우 외(2016) 승리확률 테이블 기반"
          >
            리그 상위 {Math.max(1, Math.round(100 - liPercentile))}%
          </span>
        </div>
      </div>
      <div className="h-[150px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <YAxis domain={[0, maxLi]} tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} width={22} axisLine={false} tickLine={false} />
            <XAxis
              dataKey="tickLabel"
              tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
              interval={0}
              axisLine={{ stroke: "var(--border)" }}
              tickLine={false}
            />
            <ReferenceArea y1={1.5} y2={maxLi} fill="var(--chart-5)" fillOpacity={0.09} />
            <ReferenceLine y={1.0} stroke="var(--muted-foreground)" strokeDasharray="3 3" label={{ value: "리그평균 1.0", position: "insideTopRight", fontSize: 9, fill: "var(--muted-foreground)" }} />
            <Tooltip
              contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 11 }}
              labelStyle={{ color: "var(--foreground)" }}
              labelFormatter={(_, payload) => (payload?.[0]?.payload as { paLabel?: string } | undefined)?.paLabel ?? ""}
              formatter={(value) => [Number(value).toFixed(2), "LI"]}
            />
            <Line type="monotone" dataKey="li" stroke="var(--chart-5)" strokeWidth={2} dot={data.length < 2} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
