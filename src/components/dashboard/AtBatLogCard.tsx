import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Half } from "@/types/api";

export interface PaLogEntry {
  kind: "pa";
  inning: number;
  half: Half;
  batter: string;
  outcomeLabel: string;
  deltaWeDefenderPct: number; // e.g. -6.2 meaning -6.2%p
}

/** The auto-played offense half's own WE swing — a distinct row, never
 * merged into a batter's PA line (§3: that half isn't the pitcher's doing,
 * and its WE change must never be attributed to whichever PA happened to
 * end the preceding defensive half). */
export interface OffenseHalfLogEntry {
  kind: "offenseHalf";
  inning: number;
  half: Half;
  runs: number;
  deltaWePct: number; // my-team perspective
}

export type AtBatLogEntry = PaLogEntry | OffenseHalfLogEntry;

export function AtBatLogCard({ entries }: { entries: AtBatLogEntry[] }) {
  const innings = useMemo(() => [...new Set(entries.map((e) => e.inning))].sort((a, b) => a - b), [entries]);
  const [filter, setFilter] = useState<number | null>(null);
  const shown = filter ? entries.filter((e) => e.inning === filter) : entries;

  return (
    <Card className="p-[16px_20px_18px]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">타석 로그</div>
        {innings.length > 0 && (
          <div className="om-scroll flex min-w-0 flex-1 justify-end gap-1.5 pb-0.5">
            <button
              type="button"
              onClick={() => setFilter(null)}
              className={cn(
                "h-[26px] min-w-[30px] shrink-0 whitespace-nowrap rounded-md px-2 text-xs",
                filter === null ? "bg-foreground text-background" : "bg-muted text-muted-foreground",
              )}
            >
              전체
            </button>
            {innings.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setFilter(n)}
                className={cn(
                  "h-[26px] min-w-[30px] shrink-0 whitespace-nowrap rounded-md px-2 text-xs",
                  filter === n ? "bg-foreground text-background" : "bg-muted text-muted-foreground",
                )}
              >
                {n}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex max-h-[150px] flex-col gap-px overflow-y-auto">
        {shown.length === 0 && <div className="p-3 text-center text-xs text-muted-foreground">아직 기록이 없습니다.</div>}
        {[...shown].reverse().map((e, i) => {
          if (e.kind === "offenseHalf") {
            const positive = e.deltaWePct >= 0;
            return (
              <div
                key={i}
                className={cn(
                  "my-1 flex items-center justify-between gap-2 rounded-md bg-muted p-[8px_10px] text-xs",
                  i > 0 && "border-t border-border",
                )}
              >
                <span className="text-muted-foreground">
                  {e.inning}회{e.half === "top" ? "초" : "말"} 공격 · {e.runs > 0 ? `${e.runs}득점` : "무득점"}
                </span>
                <span style={{ color: positive ? "var(--primary)" : "var(--destructive)" }}>
                  {positive ? "+" : ""}
                  {e.deltaWePct.toFixed(1)}%p
                </span>
              </div>
            );
          }
          return (
            <div
              key={i}
              className={cn(
                "grid grid-cols-[76px_1fr_60px] items-center gap-2 p-[8px_2px] text-xs",
                i > 0 && "border-t border-border",
              )}
            >
              <span className="truncate text-muted-foreground">{e.batter}</span>
              <span style={{ color: e.deltaWeDefenderPct >= 0 ? "var(--primary)" : "var(--destructive)" }}>
                {e.outcomeLabel}
              </span>
              <span
                className="text-right"
                style={{ color: e.deltaWeDefenderPct >= 0 ? "var(--primary)" : "var(--destructive)" }}
              >
                {e.deltaWeDefenderPct >= 0 ? "+" : ""}
                {e.deltaWeDefenderPct.toFixed(1)}%
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
