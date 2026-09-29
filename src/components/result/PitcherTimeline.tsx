import { Card } from "@/components/ui/card";
import { signed } from "@/lib/resultDisplay";
import type { PitcherUsageSegment } from "@/types/api";

function Bars({ segments, accent }: { segments: PitcherUsageSegment[]; accent: boolean }) {
  return (
    <div className="flex gap-1">
      {segments.map((seg, i) => (
        <div key={i} className="flex min-w-0 flex-col gap-1.5" style={{ flex: Math.max(1, seg.toOut - seg.fromOut) }}>
          <div
            className="flex h-[38px] items-center justify-center overflow-hidden rounded-md bg-muted px-1.5"
            style={{ border: `1px solid ${accent ? "var(--primary)" : "var(--border)"}` }}
          >
            <span className="truncate text-xs" style={{ color: accent ? "var(--foreground)" : "var(--muted-foreground)" }}>
              {seg.name}
            </span>
          </div>
          <span className="text-center text-xs" style={{ color: seg.deltaWeSum >= 0 ? "var(--primary)" : "var(--destructive)" }}>
            {signed(seg.deltaWeSum)}
          </span>
        </div>
      ))}
    </div>
  );
}

interface PitcherTimelineProps {
  pitcherUsage: PitcherUsageSegment[];
  actualPitcherUsage: PitcherUsageSegment[];
  startInning: number;
}

/** Both rows share one out-count axis (`fromOut`/`toOut` — see plan: PA count
 * differs between my real playthrough and the procedurally-generated actual-
 * manager path, so it can't be the shared unit). 3 outs = one half-inning, so
 * inning-boundary divider lines land exactly on multiples of 3 regardless of
 * where either row's segment boundaries fall. */
export function PitcherTimeline({ pitcherUsage, actualPitcherUsage, startInning }: PitcherTimelineProps) {
  const totalOut = Math.max(
    pitcherUsage[pitcherUsage.length - 1]?.toOut ?? 0,
    actualPitcherUsage[actualPitcherUsage.length - 1]?.toOut ?? 0,
    1,
  );
  const inningCount = Math.max(1, Math.ceil(totalOut / 3));
  const innerBoundaries = Array.from({ length: inningCount - 1 }, (_, i) => (i + 1) * 3);

  return (
    <Card className="p-[18px_22px_20px]">
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <span className="text-sm">투수 운용 타임라인</span>
        <span className="text-[11px] text-muted-foreground">구간 아래 값은 ΔWE 기여 · 수비팀 관점 · 양수가 좋음</span>
      </div>
      <div className="om-scroll pb-1">
        <div className="grid min-w-[620px] gap-x-3 gap-y-[18px]" style={{ gridTemplateColumns: "78px 1fr" }}>
          <span style={{ gridColumn: 1, gridRow: 1 }} />
          <div style={{ gridColumn: 2, gridRow: 1 }} className="relative h-4">
            {Array.from({ length: inningCount }, (_, i) => (
              <span
                key={i}
                className="absolute top-0 whitespace-nowrap text-[11px] text-muted-foreground"
                style={{ left: `${((i * 3 + 1.5) / totalOut) * 100}%`, transform: "translateX(-50%)" }}
              >
                {startInning + i}회
              </span>
            ))}
          </div>

          {/* Inning-boundary guide lines, painted first so the bars below draw over them. */}
          <div style={{ gridColumn: 2, gridRow: "2 / 4" }} className="relative">
            <div className="pointer-events-none absolute inset-0">
              {innerBoundaries.map((b) => (
                <div key={b} className="absolute inset-y-0 border-l border-border" style={{ left: `${(b / totalOut) * 100}%` }} />
              ))}
            </div>
          </div>

          <span style={{ gridColumn: 1, gridRow: 2 }} className="pt-3 text-xs text-primary">
            내 운용
          </span>
          <div style={{ gridColumn: 2, gridRow: 2 }}>
            <Bars segments={pitcherUsage} accent />
          </div>

          <span style={{ gridColumn: 1, gridRow: 3 }} className="pt-3 text-xs text-muted-foreground">
            실제 감독
          </span>
          <div style={{ gridColumn: 2, gridRow: 3 }}>
            <Bars segments={actualPitcherUsage} accent={false} />
          </div>
        </div>
      </div>
    </Card>
  );
}
