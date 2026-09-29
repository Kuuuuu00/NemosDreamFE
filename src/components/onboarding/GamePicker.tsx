import { useState } from "react";
import { TeamEmblem } from "@/components/common/TeamEmblem";
import { cn } from "@/lib/utils";
import type { GameListItem } from "@/types/api";

const MONTHS = [3, 4, 5, 6, 7, 8, 9];

interface GamePickerProps {
  games: GameListItem[];
  selectedGameId: string | null;
  onSelect: (gameId: string) => void;
}

export function GamePicker({ games, selectedGameId, onSelect }: GamePickerProps) {
  const [month, setMonth] = useState(0);
  const filtered = month ? games.filter((g) => +g.date.split(".")[1] === month) : games;

  return (
    <div>
      <div className="mb-3.5 flex items-center justify-between gap-4">
        <span className="text-xs text-muted-foreground">
          2025 정규시즌 맞대결 {games.length}경기
        </span>
        <div className="om-scroll flex max-w-full gap-[5px] pb-0.5">
          {[{ m: 0, label: "전체" }, ...MONTHS.map((m) => ({ m, label: `${m}월` }))].map((o) => (
            <button
              key={o.m}
              type="button"
              onClick={() => setMonth(o.m)}
              className={cn(
                "h-[26px] shrink-0 whitespace-nowrap rounded-full px-[11px] text-[11px] tracking-[-0.01em]",
                month === o.m ? "bg-foreground text-background" : "bg-muted text-muted-foreground",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex max-h-[264px] flex-col gap-1.5 overflow-y-auto pr-1">
        {filtered.map((g) => {
          const on = selectedGameId === g.gameId;
          return (
            <button
              key={g.gameId}
              type="button"
              onClick={() => onSelect(g.gameId)}
              className={cn(
                "grid shrink-0 grid-cols-[92px_1fr_72px] items-center gap-3.5 whitespace-nowrap rounded-lg border p-[13px_14px] text-left transition-colors sm:grid-cols-[118px_1fr_90px]",
                on ? "border-primary bg-popover" : "border-border bg-transparent hover:border-muted-foreground",
              )}
            >
              <span className="truncate text-[13px] text-muted-foreground">{g.date}</span>
              <span className="flex min-w-0 items-center gap-1.5 truncate text-sm">
                <TeamEmblem code={g.away} size={20} />
                {g.away} {g.finalScore.away} : {g.finalScore.home} {g.home}
                <TeamEmblem code={g.home} size={20} />
              </span>
              <span className="truncate text-right text-xs text-muted-foreground">{g.home}</span>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <div className="p-6 text-center text-xs text-muted-foreground">
            해당 월에 진행된 경기가 없습니다.
          </div>
        )}
      </div>
    </div>
  );
}
