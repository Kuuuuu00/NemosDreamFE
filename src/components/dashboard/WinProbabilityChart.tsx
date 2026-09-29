import { useMemo } from "react";
import { Area, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { WeTraceResponse } from "@/types/api";

interface WinProbabilityChartProps {
  weTrace: WeTraceResponse;
  teamName: string;
}

function keyOf(p: { inning: number; half: string }) {
  return `${p.inning}-${p.half}`;
}

export function WinProbabilityChart({ weTrace, teamName }: WinProbabilityChartProps) {
  const data = useMemo(() => {
    const simByKey = new Map<string, number>();
    for (const p of weTrace.simulated) simByKey.set(keyOf(p), p.we); // later entries (same half) overwrite — end-of-half value wins
    return weTrace.actual.map((p) => {
      const actual = +(p.we * 100).toFixed(1);
      const simulated = simByKey.has(keyOf(p)) ? +((simByKey.get(keyOf(p)) as number) * 100).toFixed(1) : undefined;
      return {
        key: keyOf(p),
        label: `${p.inning}회${p.half === "top" ? "초" : "말"}`,
        actual,
        simulated,
        // Recharts range-Area: an [min, max] pair fills the band between the
        // two curves wherever both are defined, and is simply absent (no
        // fill) anywhere `simulated` is undefined.
        band: simulated === undefined ? undefined : ([Math.min(actual, simulated), Math.max(actual, simulated)] as [number, number]),
      };
    });
  }, [weTrace]);

  const divergeKey = weTrace.divergeAt ? keyOf(weTrace.divergeAt) : null;
  const divergeLabel = divergeKey ? data.find((d) => d.key === divergeKey)?.label : undefined;

  return (
    <div className="flex flex-col">
      <div className="mb-1.5 flex items-baseline justify-between gap-4">
        <div className="text-[13px]">{teamName} 기대 승률</div>
        <div className="flex items-center gap-3.5 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0 w-3.5 border-t border-dashed border-muted-foreground" />
            실제 경기 기록
          </span>
          {weTrace.simulated.length > 0 && (
            <span className="flex items-center gap-1.5 text-primary">
              <span className="inline-block h-0.5 w-3.5 bg-primary" />내 시뮬레이션
            </span>
          )}
        </div>
      </div>
      <div className="h-[150px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} width={26} axisLine={false} tickLine={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
              interval={1}
              axisLine={{ stroke: "var(--border)" }}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 11 }}
              labelStyle={{ color: "var(--foreground)" }}
              formatter={(value, name) => [`${value}%`, name === "actual" ? "실제" : "시뮬레이션"]}
            />
            {divergeLabel && <ReferenceLine x={divergeLabel} stroke="var(--chart-5)" strokeDasharray="2 3" />}
            <Area
              type="monotone"
              dataKey="band"
              stroke="none"
              fill="var(--primary)"
              fillOpacity={0.08}
              // The user only ever plays one fixed half per inning (§1), so
              // the *opponent's* interleaved half is always a real gap in
              // `simulated` between two played points — bridge across those,
              // same as the Line below. There's nothing to wrongly bridge
              // before the divergence point or after the game ends, since
              // connectNulls only interpolates between two non-null points.
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
