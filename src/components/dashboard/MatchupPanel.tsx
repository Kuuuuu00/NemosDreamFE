import { memo } from "react";
import { PlayerAvatar } from "@/components/common/PlayerAvatar";
import { Card } from "@/components/ui/card";
import { Diamond } from "@/components/dashboard/Diamond";
import { baseStateLabel } from "@/lib/baseState";
import type { Batter, GameState, Pitcher } from "@/types/api";

const HAND_LABEL: Record<string, string> = { L: "좌투", R: "우투", U: "언더" };
const BATTER_HAND_LABEL: Record<string, string> = { L: "좌타", R: "우타", S: "스위치" };

function MatchupPanelImpl({
  pitcher,
  batter,
  state,
  outCountOverride,
}: {
  pitcher: Pitcher;
  batter: Batter;
  state: GameState;
  /** Display only: lights the out dots (e.g. 3) while the final out's result effect plays. No base-running / score is computed. */
  outCountOverride?: number;
}) {
  const outs = outCountOverride ?? state.outCount;
  const halfLabel = state.half === "top" ? "초" : "말";
  return (
    <Card className="p-[28px_24px_22px]">
      <div className="mb-[22px] grid grid-cols-[1fr_auto_1fr] items-center gap-4">
        <div className="flex items-center gap-3.5">
          <PlayerAvatar key={pitcher.pitcherId} photoUrl={pitcher.photoUrl} name={pitcher.name} />
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
          <PlayerAvatar key={batter.batterId} photoUrl={batter.photoUrl} name={batter.name} />
        </div>
      </div>

      <Diamond
        baseState={state.baseState}
        outCount={outs}
        caption={`${state.inning}회${halfLabel} · ${outs}아웃 · ${baseStateLabel(state.baseState)}`}
      />
    </Card>
  );
}

/** Memoised: a dashboard re-render caused only by the overlay phase must not re-render this card. */
export const MatchupPanel = memo(MatchupPanelImpl);
