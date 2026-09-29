import { TeamEmblem } from "@/components/common/TeamEmblem";
import { cn } from "@/lib/utils";
import type { Team } from "@/types/api";

interface TeamGridProps {
  teams: Team[];
  selected: string | null;
  onSelect: (code: string) => void;
}

export function TeamGrid({ teams, selected, onSelect }: TeamGridProps) {
  return (
    <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-5">
      {teams.map((t) => {
        const on = selected === t.code;
        return (
          <button
            key={t.code}
            type="button"
            onClick={() => onSelect(t.code)}
            className={cn(
              "flex shrink-0 flex-col items-center gap-[9px] whitespace-nowrap rounded-lg border p-[14px_4px] transition-colors",
              on ? "border-primary bg-popover" : "border-border bg-transparent hover:border-muted-foreground",
            )}
          >
            <TeamEmblem code={t.code} name={t.name} size={40} />
            <span className={cn("text-xs", on ? "text-foreground" : "text-muted-foreground")}>{t.name}</span>
          </button>
        );
      })}
    </div>
  );
}
