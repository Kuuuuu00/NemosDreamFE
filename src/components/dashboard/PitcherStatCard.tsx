import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { Pitcher } from "@/types/api";

export function PitcherStatCard({ pitcher }: { pitcher: Pitcher }) {
  return (
    <Card className="p-4">
      <div className="mb-2 text-[11px] text-muted-foreground">현재 투수</div>
      <div className="mb-3 text-lg font-medium">{pitcher.name}</div>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="ERA" value={pitcher.season.era.toFixed(2)} />
        <Stat label="WHIP" value={pitcher.season.whip.toFixed(2)} />
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

function SplitRow({ label, split }: { label: string; split: { avg: number; woba: number } }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-[13px]">
        {split.avg.toFixed(3).replace(/^0/, "")}{" "}
        <span className="text-[11px] text-muted-foreground">wOBA {split.woba.toFixed(3).replace(/^0/, "")}</span>
      </span>
    </div>
  );
}
