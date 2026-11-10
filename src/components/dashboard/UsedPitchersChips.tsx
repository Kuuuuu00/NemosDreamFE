import { memo } from "react";
import { Card } from "@/components/ui/card";
import type { Pitcher, UsageEntry } from "@/types/api";
import type { UsedPitcher } from "@/types/recommendation";

interface UsedPitchersChipsProps {
  /** Real backend: `recommend.ranking.usedPitchers` (already pitched / unavailable). */
  usedPitchers?: UsedPitcher[];
  /** Mock only: starter + relievers used before this session began. */
  usageToday?: UsageEntry[];
  /** Mock only: relievers swapped out during this session. */
  usedTonight?: Pitcher[];
}

function UsedPitchersChipsImpl({ usedPitchers = [], usageToday = [], usedTonight = [] }: UsedPitchersChipsProps) {
  const chips = [
    ...usageToday.map((u) => ({ name: u.name, reason: null as string | null })),
    ...usedTonight.map((p) => ({ name: p.name, reason: null as string | null })),
    ...usedPitchers.map((u) => ({ name: u.name, reason: u.unavailableReason })),
  ];

  return (
    <Card className="p-4">
      <div className="mb-2.5 text-[11px] text-muted-foreground">등판 완료</div>
      {chips.length === 0 ? (
        <div className="text-[11px] text-muted-foreground">아직 없음</div>
      ) : (
        <div className="flex flex-wrap gap-[7px]">
          {chips.map((c, i) => (
            <span
              key={`${c.name}-${i}`}
              title={c.reason ?? undefined}
              className="whitespace-nowrap rounded-md bg-muted px-2.5 py-[5px] text-xs text-disabled"
            >
              {c.name}
              {c.reason && <span className="ml-1 text-[10px]">{c.reason}</span>}
            </span>
          ))}
        </div>
      )}
    </Card>
  );
}

/** Memoised: a dashboard re-render caused only by the overlay phase must not re-render this card. */
export const UsedPitchersChips = memo(UsedPitchersChipsImpl);
