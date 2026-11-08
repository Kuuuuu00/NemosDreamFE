import { Card } from "@/components/ui/card";
import type { Batter } from "@/types/api";

const HAND_LABEL: Record<string, string> = { L: "좌", R: "우", S: "스" };

export function NextBattersCard({ batters }: { batters: Batter[] }) {
  return (
    <Card className="p-4">
      <div className="mb-2.5 text-[11px] text-muted-foreground">다음 타자</div>
      <div className="flex flex-col gap-2.5">
        {batters.map((b) => (
          <div key={b.batterId} className="flex items-baseline justify-between gap-2">
            <span className="truncate text-[13px]">
              {b.order}번 {b.name} <span className="text-[11px] text-muted-foreground">{HAND_LABEL[b.hitType]}</span>
            </span>
            <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
              {rate(b.season.avg)} · OPS {rate(b.season.ops)}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

/** Season rate stats are null before the batter has data (real backend). */
function rate(v: number | null): string {
  return v === null ? "—" : v.toFixed(3).replace(/^0/, "");
}
