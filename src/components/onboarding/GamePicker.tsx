import { teamName } from "@/lib/teamName";
import { useState } from "react";
import { TeamEmblem } from "@/components/common/TeamEmblem";
import { cn } from "@/lib/utils";
import { DEFAULT_SEASON, DEMO_TEXT, demoOptionFor, getDemoGame } from "@/lib/demoGames";
import type { GameListItem } from "@/types/api";

const MONTHS = [3, 4, 5, 6, 7, 8, 9];

/** Accepts "YYYY.MM.DD", "YYYY-MM-DD" (or "/"); returns null when unparseable. */
function monthOf(date: string): number | null {
  const m = /^\d{4}\D(\d{1,2})\D/.exec(date.trim());
  return m ? Number(m[1]) : null;
}

interface GamePickerProps {
  games: GameListItem[];
  loading?: boolean;
  selectedGameId: string | null;
  onSelect: (gameId: string) => void;
  /** Season of `games` (the "2026 KS" button switches it; month buttons switch back to the default). */
  season: number;
  onSeasonChange: (season: number) => void;
  myTeam: string | null;
  oppTeam: string | null;
}

export function GamePicker({ games, loading = false, selectedGameId, onSelect, season, onSeasonChange, myTeam, oppTeam }: GamePickerProps) {
  const [month, setMonth] = useState(0);
  const demo = demoOptionFor(myTeam, oppTeam);
  const demoOn = !!demo && season === demo.season;
  const filtered = demoOn
    ? games.filter((g) => getDemoGame(g.gameId))
    : month
      ? games.filter((g) => monthOf(g.date) === month)
      : games;

  function pickMonth(m: number) {
    setMonth(m);
    if (season !== DEFAULT_SEASON) onSeasonChange(DEFAULT_SEASON);
  }
  return (
    <div>
      <div className="mb-3.5 flex items-center justify-between gap-4">
        <span className="text-xs text-muted-foreground">
          {demoOn ? DEMO_TEXT.listTitle : `2025 정규시즌 맞대결 ${games.length}경기`}
        </span>
        <div className="om-scroll flex max-w-full gap-[5px] pb-0.5">
          {demo && (
            <button
              type="button"
              onClick={() => onSeasonChange(demo.season)}
              className={cn(
                "h-[26px] shrink-0 whitespace-nowrap rounded-full border border-chart-5 px-[11px] text-[11px] tracking-[-0.01em]",
                demoOn ? "bg-chart-5 text-background" : "bg-muted text-chart-5",
              )}
            >
              {demo.label}
            </button>
          )}
          {[{ m: 0, label: "전체" }, ...MONTHS.map((m) => ({ m, label: `${m}월` }))].map((o) => (
            <button
              key={o.m}
              type="button"
              onClick={() => pickMonth(o.m)}
              className={cn(
                "h-[26px] shrink-0 whitespace-nowrap rounded-full px-[11px] text-[11px] tracking-[-0.01em]",
                !demoOn && month === o.m ? "bg-foreground text-background" : "bg-muted text-muted-foreground",
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
          const demoGame = getDemoGame(g.gameId);
          return (
            <button
              key={g.gameId}
              type="button"
              onClick={() => onSelect(g.gameId)}
              className={cn(
                "grid shrink-0 items-center gap-3.5 whitespace-nowrap rounded-lg border p-[13px_14px] text-left transition-colors",
                demoGame ? "grid-cols-[92px_1fr_auto] sm:grid-cols-[118px_1fr_auto]" : "grid-cols-[92px_1fr_72px] sm:grid-cols-[118px_1fr_90px]",
                on ? "border-primary bg-popover" : "border-border bg-transparent hover:border-muted-foreground",
              )}
            >
              <span className="truncate text-[13px] text-muted-foreground">{g.date}</span>
              <span className="flex min-w-0 items-center gap-1.5 truncate text-sm">
                <TeamEmblem code={g.away} size={20} />
                {teamName(g.away)} {g.finalScore.away} : {g.finalScore.home} {teamName(g.home)}
                <TeamEmblem code={g.home} size={20} />
              </span>
              <span className={cn("truncate text-right text-xs", demoGame ? "text-[11px] text-chart-5" : "text-muted-foreground")}>
                {demoGame ? demoGame.rowNote : teamName(g.home)}
              </span>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <div className="p-6 text-center text-xs text-muted-foreground">
            {loading ? "경기 목록을 불러오는 중…" : games.length === 0 ? "맞대결 경기가 없습니다." : "해당 월에 진행된 경기가 없습니다."}
          </div>
        )}
      </div>
    </div>
  );
}
