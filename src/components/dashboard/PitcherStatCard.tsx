import { memo } from "react";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { Pitcher } from "@/types/api";

function PitcherStatCardImpl({ pitcher }: { pitcher: Pitcher }) {
  return (
    <Card className="p-4">
      <div className="mb-2 text-[11px] text-muted-foreground">현재 투수</div>
      <div className="mb-3 text-lg font-medium">{pitcher.name}</div>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="WHIP" value={pitcher.season.whip === null ? "—" : pitcher.season.whip.toFixed(2)} />
        <Stat label="삼진" value={typeof pitcher.season.so === "number" ? String(pitcher.season.so) : "—"} />
        <Stat label="IP" value={pitcher.season.ip.toFixed(1)} />
      </div>
      <Separator className="my-3.5" />
      <div className="flex flex-col gap-2">
        <SplitRow label="vs 좌타" split={pitcher.vsBatterHand.L} />
        <SplitRow label="vs 우타" split={pitcher.vsBatterHand.R} />
      </div>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-[3px]">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span className="text-base">{value}</span>
    </div>
  );
}

function SplitRow({ label, split }: { label: string; split: { avg: number | null; woba: number | null } | null }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-[13px]">
        {rate(split?.avg ?? null)}{" "}
        <span className="text-[11px] text-muted-foreground">wOBA {rate(split?.woba ?? null)}</span>
      </span>
    </div>
  );
}

/** Hand splits / rate stats can be null when there is no sample (real backend). */
function rate(v: number | null): string {
  return v === null ? "—" : v.toFixed(3).replace(/^0/, "");
}

/** Memoised: a dashboard re-render caused only by the overlay phase must not re-render this card. */
export const PitcherStatCard = memo(PitcherStatCardImpl);
