import { useMemo } from "react";
import { Area, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { inningHalfLabel } from "@/lib/resultDisplay";
import type { PitcherUsageSegment, WeTraceResponse } from "@/types/api";

interface ResultWinProbChartProps {
  weTrace: WeTraceResponse;
  teamName: string;
  pitcherUsage: PitcherUsageSegment[];
}

function keyOf(p: { inning: number; half: string }) {
  return `${p.inning}-${p.half}`;
}

/** Full-game (1회초~9회말) version of `WinProbabilityChart` — `weTrace.actual`
 * already spans the whole game (see `buildActualWeCurve` in mocks/session.ts),
 * so this reuses the exact same data, just without slicing it to the
 * session's own window. `computeWE` itself is never called here — only the
 * already-computed points the session engine produced. */
export function ResultWinProbChart({ weTrace, teamName, pitcherUsage }: ResultWinProbChartProps) {
  const data = useMemo(() => {
    const simByKey = new Map<string, number>();
    for (const p of weTrace.simulated) simByKey.set(keyOf(p), p.we);
    return weTrace.actual.map((p) => {
      const actual = +(p.we * 100).toFixed(1);
      const simulated = simByKey.has(keyOf(p)) ? +((simByKey.get(keyOf(p)) as number) * 100).toFixed(1) : undefined;
      return {
        key: keyOf(p),
        label: inningHalfLabel(p.inning, p.half),
        actual,
        simulated,
        band: simulated === undefined ? undefined : ([Math.min(actual, simulated), Math.max(actual, simulated)] as [number, number]),
      };
    });
  }, [weTrace]);

  const divergeKey = weTrace.divergeAt ? keyOf(weTrace.divergeAt) : null;
  const divergeLabel = divergeKey ? data.find((d) => d.key === divergeKey)?.label : undefined;

  // Every segment after the first is a pitching change — mark where it started.
  const changeMarks = useMemo(
    () => pitcherUsage.slice(1).map((seg) => ({ name: seg.name, label: inningHalfLabel(seg.fromInning, seg.fromHalf) })),
    [pitcherUsage],
  );

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2.5 flex items-baseline justify-between gap-4">
        <div className="text-sm">{teamName} 기대 승률</div>
        <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0 w-4 border-t border-dashed border-muted-foreground" />
            실제 경기 기록
          </span>
          {weTrace.simulated.length > 0 && (
            <span className="flex items-center gap-1.5 text-primary">
              <span className="inline-block h-0.5 w-4 bg-primary" />내 시뮬레이션
            </span>
          )}
        </div>
      </div>
      <div className="min-h-[280px] flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 20, right: 8, bottom: 24, left: 0 }}>
            <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} width={30} axisLine={false} tickLine={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} interval={1} axisLine={{ stroke: "var(--border)" }} tickLine={false} />
            <Tooltip
              contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 11 }}
              labelStyle={{ color: "var(--foreground)" }}
              formatter={(value, name) => [`${value}%`, name === "actual" ? "실제" : "시뮬레이션"]}
            />
            {divergeLabel && (
              <ReferenceLine
                x={divergeLabel}
                stroke="var(--chart-5)"
                strokeDasharray="2 3"
                label={{ value: "여기서 갈라졌습니다", position: "insideTopLeft", fontSize: 11, fill: "var(--chart-5)" }}
              />
            )}
            {changeMarks.map((c, i) => (
              <ReferenceLine
                key={i}
                x={c.label}
                stroke="var(--border)"
                strokeDasharray="1 3"
                label={{ value: c.name, position: "bottom", fontSize: 10, fill: "var(--muted-foreground)" }}
              />
            ))}
            <Area
              type="monotone"
              dataKey="band"
              stroke="none"
              fill="var(--primary)"
              fillOpacity={0.08}
              connectNulls
              isAnimationActive={false}
              legendType="none"
              tooltipType="none"
            />
            <Line type="monotone" dataKey="actual" stroke="var(--muted-foreground)" strokeWidth={1.4} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
            <Line
              type="monotone"
              dataKey="simulated"
              stroke="var(--primary)"
              strokeWidth={2.4}
              dot={{ r: 3, fill: "var(--primary)", strokeWidth: 0 }}
              activeDot={{ r: 4 }}
              connectNulls
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
