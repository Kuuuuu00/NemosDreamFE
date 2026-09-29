import { Card } from "@/components/ui/card";
import type { Pitcher, UsageEntry } from "@/types/api";

interface UsageTimelineCardProps {
  usageToday: UsageEntry[];
  current: Pitcher;
  currentInningsLabel: string;
}

export function UsageTimelineCard({ usageToday, current, currentInningsLabel }: UsageTimelineCardProps) {
  const rows = [
    ...usageToday.map((u) => ({ ...u, isCurrent: false })),
    { name: current.name, role: undefined, pitches: current.workload.estPitchCount, inningsLabel: currentInningsLabel, isCurrent: true },
  ];

  return (
    <Card className="p-4">
      <div className="mb-3.5 text-[11px] text-muted-foreground">오늘 투수 운용</div>
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
                    {r.pitches}구
                  </span>
                </div>
                <span className="text-[11px] text-muted-foreground">{r.inningsLabel}</span>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
