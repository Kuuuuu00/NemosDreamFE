import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { Batter } from "@/types/api";

const HAND_LABEL: Record<string, string> = { L: "좌타", R: "우타", S: "스위치" };

export function MatchupCard({ batter, pitcherName }: { batter: Batter; pitcherName: string }) {
  return (
    <Card className="p-4">
      <div className="mb-2 text-[11px] text-muted-foreground">타석</div>
      <div className="mb-3 flex items-baseline gap-2">
        <span className="text-lg font-medium">{batter.name}</span>
        <span className="text-[11px] text-muted-foreground">
          {batter.order}번 · {HAND_LABEL[batter.hitType]}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-2 gap-y-2.5">
        <Stat label="AVG" value={fmt(batter.season.avg)} />
        <Stat label="OPS" value={fmt(batter.season.ops)} />
        <Stat label="최근 타율" value={fmt(batter.recentAvg)} accent />
        <Stat label="오늘" value={`${batter.today.ab}타수 ${batter.today.h}안타`} />
      </div>
      <Separator className="my-3.5" />
      <div className="mb-1.5 text-[10px] text-muted-foreground">{pitcherName} 상대 전적</div>
      {batter.vsCurrentPitcher ? (
        <div className="flex items-baseline gap-2">
          <span className="text-[26px] font-medium leading-none">{fmt(batter.vsCurrentPitcher.avg)}</span>
          <span className="text-[11px] text-muted-foreground">
            {batter.vsCurrentPitcher.ab}타수 {batter.vsCurrentPitcher.h}안타 · ISO {fmt(batter.vsCurrentPitcher.iso)}
          </span>
        </div>
      ) : (
        <div className="text-[13px] text-muted-foreground">상대 전적 없음</div>
      )}
    </Card>
  );
}

function fmt(v: number) {
  return v.toFixed(3).replace(/^0/, "");
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex flex-col gap-[3px]">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span className={accent ? "text-base text-chart-5" : "text-base"}>{value}</span>
    </div>
  );
}
