import { useMemo } from "react";
import { Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { liPercentileLabel } from "@/lib/leverageDisplay";
import type { LeverageBandDef } from "@/types/api";
import type { LiPoint } from "@/types/history";

interface LeverageChartProps {
  /** Recorded server `GameState.leverage_index` per defensive PA (null = break between half-innings). */
  liSeries: LiPoint[];
  bands: LeverageBandDef[];
  leagueAvg: number;
  currentLI: number;
  /** Share of the league LI distribution this LI sits below (0–100); null = unknown (hidden). */
  liPercentile: number | null;
}

function bandLabel(li: number, bands: LeverageBandDef[]): string {
  return bands.find((b) => li >= b.min && li < b.max)?.label ?? bands[bands.length - 1]?.label ?? "";
}

export function LeverageChart({ liSeries, bands, leagueAvg, currentLI, liPercentile }: LeverageChartProps) {
  // Nothing is computed here: points are the server's per-state LI, recorded by
  // useGameHistory (defense states only). A `li: null` point breaks the line
  // (connectNulls=false) so each defensive half-inning is its own segment.
  // X is the recording order; only the first point of a half carries a label.
  const data = useMemo(
    () =>
      liSeries.map((p) => ({
        key: p.seq,
        tickLabel: p.label ?? "",
        paLabel: `${p.inning}회${p.half === "top" ? "초" : "말"} ${p.paInHalf}번째 타석`,
        li: p.li,
      })),
    [liSeries],
  );
  // X is keyed by the unique recording order. (Keying by the label made almost
  // every category "" — Recharts merges equal categories, so hovering any point
  // past the 2nd showed the 2nd point's tooltip.)
  const labelByKey = useMemo(() => new Map(data.map((d) => [d.key, d.tickLabel])), [data]);
  // A half-inning with a single recorded point has no line to draw — show it as a dot.
  const isolated = useMemo(() => data.map((d, i) => d.li !== null && data[i - 1]?.li == null && data[i + 1]?.li == null), [data]);
  const highMin = bands.length > 0 ? bands[bands.length - 1].min : 1.5;
  const boundaries = bands.map((b) => b.min).filter((m) => m > 0 && m !== leagueAvg);

  const maxLi = Math.max(3, ...data.map((d) => d.li ?? 0), currentLI);

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
            {liPercentile != null ? liPercentileLabel(liPercentile) : ""}
          </span>
        </div>
      </div>
      <div className="h-[150px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <YAxis domain={[0, maxLi]} tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} tickFormatter={(v: number) => v.toFixed(1)} width={26} axisLine={false} tickLine={false} />
            <XAxis
              dataKey="key"
              tickFormatter={(k: number) => labelByKey.get(k) ?? ""}
              tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
              interval={0}
              axisLine={{ stroke: "var(--border)" }}
              tickLine={false}
            />
            <ReferenceArea y1={highMin} y2={maxLi} fill="var(--chart-5)" fillOpacity={0.09} />
            {boundaries.map((m) => (
              <ReferenceLine key={m} y={m} stroke="var(--muted-foreground)" strokeOpacity={0.5} strokeDasharray="1 3" />
            ))}
            <ReferenceLine y={leagueAvg} stroke="var(--muted-foreground)" strokeDasharray="3 3" label={{ value: `리그평균 ${leagueAvg.toFixed(1)}`, position: "insideTopRight", fontSize: 9, fill: "var(--muted-foreground)" }} />
            <Tooltip
              contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 11 }}
              labelStyle={{ color: "var(--foreground)" }}
              labelFormatter={(_, payload) => (payload?.[0]?.payload as { paLabel?: string } | undefined)?.paLabel ?? ""}
              formatter={(value) => [`${Number(value).toFixed(2)} (${bandLabel(Number(value), bands)})`, "LI"]}
            />
            <Line type="linear" dataKey="li" connectNulls={false} stroke="var(--chart-5)" strokeWidth={2} dot={(p: { cx?: number; cy?: number; index?: number }) =>
                isolated[p.index ?? -1] && p.cx !== undefined && p.cy !== undefined ? (
                  <circle key={`dot-${p.index}`} cx={p.cx} cy={p.cy} r={2.5} fill="var(--chart-5)" />
                ) : (
                  <g key={`dot-${p.index}`} />
                )
              }
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
