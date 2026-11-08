import { cn } from "@/lib/utils";
import type { GameListItem } from "@/types/api";

const INNINGS = [5, 6, 7, 8, 9];

interface InningPickerProps {
  game: GameListItem | null;
  selected: number | null;
  onSelect: (n: number) => void;
}

export function InningPicker({ game, selected, onSelect }: InningPickerProps) {
  const available = game?.availableInnings ?? [];
  const high = game?.highLeverageInnings ?? [];
  return (
    <div className="om-scroll pb-1">
      <div className="grid min-w-[600px] grid-cols-5 gap-2.5">
        {INNINGS.map((n) => {
          const on = selected === n;
          const disabled = !available.includes(n);
          const isHigh = !disabled && high.includes(n);
          return (
            <button
              key={n}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(n)}
              className={cn(
                "flex shrink-0 flex-col gap-2 whitespace-nowrap rounded-lg border p-[16px_14px_14px] text-left transition-colors",
                disabled
                  ? "cursor-default border-border"
                  : on
                    ? "cursor-pointer border-primary bg-popover"
                    : "cursor-pointer border-border hover:border-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "text-[17px] font-medium",
                  disabled ? "text-disabled" : on ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {n}회
              </span>
              <span className={cn("text-xs", disabled ? "text-disabled" : isHigh ? "text-chart-5" : "text-muted-foreground")}>
                {disabled ? "선택 불가" : isHigh ? "승부처" : "-"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
