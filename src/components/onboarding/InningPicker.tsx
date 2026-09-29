import { cn } from "@/lib/utils";
import type { InningOption } from "@/types/api";

interface InningPickerProps {
  options: InningOption[];
  selected: number | null;
  onSelect: (n: number) => void;
}

export function InningPicker({ options, selected, onSelect }: InningPickerProps) {
  return (
    <div className="om-scroll pb-1">
      <div className="grid min-w-[600px] grid-cols-5 gap-2.5">
        {options.map((i) => {
          const on = selected === i.n;
          const disabled = !i.played;
          return (
            <button
              key={i.n}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(i.n)}
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
                {i.label}
              </span>
              <span className={cn("text-xs", disabled ? "text-disabled" : "text-muted-foreground")}>
                {disabled ? "경기 종료" : `${i.myScoreAtStart}:${i.oppScoreAtStart} ${i.tone}`}
              </span>
              <span className={cn("text-xs", disabled ? "text-disabled" : i.liHigh ? "text-chart-5" : "text-muted-foreground")}>
                {disabled ? "-" : `LI ${i.li}`}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
