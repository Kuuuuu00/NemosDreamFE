import { Card } from "@/components/ui/card";
import type { Half, Pitcher, PitcherUsageSegment, UsageEntry } from "@/types/api";

interface UsageTimelineCardProps {
  /** Real backend: `GET /result` `pitcher_usage` (mine) / `actual_pitcher_usage` (real manager), since session start. */
  usage?: { mine: PitcherUsageSegment[]; actual: PitcherUsageSegment[] } | null;
  /** Mock only. */
  usageToday: UsageEntry[];
  current: Pitcher;
  currentInningsLabel: string;
}

const halfLabel = (inning: number, half: Half) => `${inning}회${half === "top" ? "초" : "말"}`;

interface Row {
  name: string;
  role?: string;
  pitches: number | null | undefined;
  inningsLabel: string;
  isCurrent: boolean;
}

export function UsageTimelineCard({ usage, usageToday, current, currentInningsLabel }: UsageTimelineCardProps) {
  // TODO(backend): REPORT #7 — starters / pre-session relievers are not in the API, so the range is "세션 시작 이후".
  const real = !!usage && usage.mine.length > 0;
  const rows: Row[] = real
    ? usage.mine.map((s, i, arr) => {
        const isCurrent = i === arr.length - 1;
        return {
          name: s.name,
          pitches: s.pitchesEst,
          inningsLabel: isCurrent ? `${halfLabel(s.fromInning, s.fromHalf)}~` : `${halfLabel(s.fromInning, s.fromHalf)}~${halfLabel(s.toInning, s.toHalf)}`,
          isCurrent,
        };
      })
    : [
        ...usageToday.map((u) => ({ ...u, isCurrent: false })),
        { name: current.name, role: undefined, pitches: current.workload.estPitchCount, inningsLabel: currentInningsLabel, isCurrent: true },
      ];
  const actualRows = usage?.actual ?? [];

  return (
    <Card className="p-4">
      <div className="mb-3.5 text-[11px] text-muted-foreground">오늘 투수 운용{usage ? " · 세션 시작 이후" : ""}</div>
      <div className="flex flex-col">
        {rows.map((r, i) => {
          const last = i === rows.length - 1;
          return (
            <div key={`${r.name}-${i}`} className="grid grid-cols-[14px_1fr] gap-2.5">
              <div className="flex flex-col items-center">
                <span className={r.isCurrent ? "mt-1 h-[9px] w-[9px] rounded-full bg-primary" : "mt-[5px] h-[7px] w-[7px] rounded-full bg-muted-foreground"} />
                {!last && <span className="w-px flex-1 bg-border" />}
              </div>
              <div className={`flex flex-col gap-[3px] ${last ? "" : "pb-4"}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className={`truncate text-[13px] ${r.isCurrent ? "text-primary" : ""}`}>
                    {r.name}
                    {r.role && <span className="ml-1 text-[10px] text-muted-foreground">{r.role}</span>}
                    {r.isCurrent && <span className="ml-1 text-[10px]">현재</span>}
                  </span>
                  <span className={`shrink-0 whitespace-nowrap text-xs ${r.isCurrent ? "text-primary" : "text-muted-foreground"}`}>
                    {r.pitches == null ? "—" : `${r.pitches}구`}
                  </span>
                </div>
                <span className="text-[11px] text-muted-foreground">{r.inningsLabel}</span>
              </div>
            </div>
          );
        })}
      </div>
      {actualRows.length > 0 && (
        <div className="mt-3.5 flex flex-col gap-1.5 border-t border-border pt-3">
          <span className="text-[11px] text-muted-foreground">실제 감독 운용</span>
          {actualRows.map((s, i) => (
            <div key={`${s.name}-${i}`} className="flex items-baseline justify-between gap-2 text-[11px] text-muted-foreground">
              <span className="truncate">{s.name}</span>
              <span className="shrink-0 whitespace-nowrap">
                {halfLabel(s.fromInning, s.fromHalf)}~{halfLabel(s.toInning, s.toHalf)}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
