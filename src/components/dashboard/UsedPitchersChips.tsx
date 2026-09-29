import { Card } from "@/components/ui/card";
import type { Pitcher, UsageEntry } from "@/types/api";

interface UsedPitchersChipsProps {
  usageToday: UsageEntry[]; // starter + relievers used before this session began
  usedTonight: Pitcher[]; // relievers swapped out during this session
}

export function UsedPitchersChips({ usageToday, usedTonight }: UsedPitchersChipsProps) {
  const names = [...usageToday.map((u) => u.name), ...usedTonight.map((p) => p.name)];

  return (
    <Card className="p-4">
      <div className="mb-2.5 text-[11px] text-muted-foreground">등판 완료</div>
      {names.length === 0 ? (
        <div className="text-[11px] text-muted-foreground">아직 없음</div>
      ) : (
        <div className="flex flex-wrap gap-[7px]">
          {names.map((name, i) => (
            <span key={`${name}-${i}`} className="whitespace-nowrap rounded-md bg-muted px-2.5 py-[5px] text-xs text-disabled">
              {name}
            </span>
          ))}
        </div>
      )}
    </Card>
  );
}
