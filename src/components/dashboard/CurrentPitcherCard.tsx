import { Card } from "@/components/ui/card";
import { handMatchup, MATCHUP_LABEL } from "@/lib/handMatchup";
import type { Batter, Pitcher } from "@/types/api";

const THROWS_LABEL: Record<Pitcher["throws"], string> = { L: "좌투", R: "우투", U: "언더" };
const BATTER_LABEL: Record<Batter["hitType"], string> = { L: "좌타", R: "우타", S: "스위치" };

/** 1⅔-style innings from outs recorded. */
function inningsLabel(outs: number): string {
  const whole = Math.floor(outs / 3);
  const frac = ["", "⅓", "⅔"][outs % 3];
  return whole === 0 && frac ? frac : `${whole}${frac}`;
}

interface CurrentPitcherCardProps {
  pitcher: Pitcher;
  batter: Batter;
  badgeLabel: string;
}

/** Replacement-decision facts only — the model has no score for the pitcher
 * on the mound (it ranks relievers for a decided change), so none is shown. */
export function CurrentPitcherCard({ pitcher, batter, badgeLabel }: CurrentPitcherCardProps) {
  const w = pitcher.workload;
  const matchup = handMatchup(pitcher.throws, batter.hitType);
  return (
    <Card className="flex p-[14px_18px_16px_0]">
      <div className="mr-[15px] w-[3px] rounded-sm bg-primary" />
      <div className="min-w-0 flex-1">
        <div className="mb-3 flex items-center gap-2">
          <span className="whitespace-nowrap text-[15px] font-medium">{pitcher.name}</span>
          <span className="whitespace-nowrap rounded border border-primary px-1.5 py-0.5 text-[10px] text-primary">
            {badgeLabel}
          </span>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5">
          <Fact label="이번 등판 투구수" value={`${w.estPitchCount}구`} />
          <Fact label="이닝" value={inningsLabel(w.outsRecorded)} />
          <Fact label="피안타 / 볼넷" value={`${w.hitsAllowed} / ${w.walksAllowed}`} />
          <Fact
            label="현재 타자 매치업"
            value={`${THROWS_LABEL[pitcher.throws]} vs ${BATTER_LABEL[batter.hitType]} · ${MATCHUP_LABEL[matchup]}`}
          />
        </dl>
      </div>
    </Card>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-[3px]">
      <dt className="whitespace-nowrap text-[10px] text-muted-foreground">{label}</dt>
      <dd className="m-0 truncate whitespace-nowrap text-[13px]">{value}</dd>
    </div>
  );
}
