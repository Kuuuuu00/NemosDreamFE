import { Card } from "@/components/ui/card";
import { Diamond } from "@/components/dashboard/Diamond";
import { baseStateLabel } from "@/lib/baseState";
import type { Batter, GameState, Pitcher } from "@/types/api";

const HAND_LABEL: Record<string, string> = { L: "좌투", R: "우투", U: "언더" };
const BATTER_HAND_LABEL: Record<string, string> = { L: "좌타", R: "우타", S: "스위치" };

export function MatchupPanel({ pitcher, batter, state }: { pitcher: Pitcher; batter: Batter; state: GameState }) {
  const halfLabel = state.half === "top" ? "초" : "말";
  return (
    <Card className="p-[28px_24px_22px]">
      <div className="mb-[22px] grid grid-cols-[1fr_auto_1fr] items-center gap-4">
        <div className="flex items-center gap-3.5">
          <div className="h-[72px] w-[72px] shrink-0 rounded-full bg-muted" />
          <div className="flex flex-col gap-1">
            <span className="text-[19px] font-medium">{pitcher.name}</span>
            <span className="text-xs text-muted-foreground">투수 · {HAND_LABEL[pitcher.throws]}</span>
          </div>
        </div>
        <span className="text-[11px] text-muted-foreground">VS</span>
        <div className="flex items-center justify-end gap-3.5">
          <div className="flex flex-col items-end gap-1">
            <span className="text-[19px] font-medium">{batter.name}</span>
            <span className="text-xs text-muted-foreground">
              {batter.order}번 타자 · {BATTER_HAND_LABEL[batter.hitType]}
            </span>
          </div>
          <div className="h-[72px] w-[72px] shrink-0 rounded-full bg-muted" />
        </div>
      </div>

      <Diamond
        baseState={state.baseState}
        outCount={state.outCount}
        caption={`${state.inning}회${halfLabel} · ${state.outCount}아웃 · ${baseStateLabel(state.baseState)}`}
      />
    </Card>
  );
}
