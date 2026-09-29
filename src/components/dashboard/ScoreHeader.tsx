import { TeamEmblem } from "@/components/common/TeamEmblem";
import { Card } from "@/components/ui/card";
import type { GameState } from "@/types/api";

interface ScoreHeaderProps {
  state: GameState;
  myTeamName: string;
  oppTeamName: string;
}

const COLS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

function LineRow({
  label,
  teamCode,
  line,
  totals,
}: {
  label: string;
  teamCode: string;
  line: (number | null)[];
  totals: { R: number; H: number; E: number; B: number };
}) {
  return (
    <tr>
      <td className="whitespace-nowrap py-[3px] pr-2.5 text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <TeamEmblem code={teamCode} size={16} />
          {label}
        </span>
      </td>
      {COLS.map((c, i) => (
        <td key={c} className="px-2 py-[3px] text-center">
          {line[i] === null || line[i] === undefined ? <span className="text-muted-foreground">-</span> : line[i]}
        </td>
      ))}
      <td className="py-[3px] pl-3.5 pr-2 text-center font-medium">{totals.R}</td>
      <td className="px-2 py-[3px] text-center">{totals.H}</td>
      <td className="px-2 py-[3px] text-center">{totals.E}</td>
      <td className="py-[3px] pl-2 text-center">{totals.B}</td>
    </tr>
  );
}

export function ScoreHeader({ state, myTeamName, oppTeamName }: ScoreHeaderProps) {
  const halfLabel = state.half === "top" ? "초" : "말";
  const awayName = state.awayTeam === state.myTeam ? myTeamName : oppTeamName;
  const homeName = state.homeTeam === state.myTeam ? myTeamName : oppTeamName;

  return (
    <div className="flex flex-col gap-px overflow-hidden rounded-lg bg-border">
      <div className="grid grid-cols-1 gap-px bg-border md:grid-cols-2">
        <Card className="flex items-center gap-5 rounded-none p-[16px_20px]">
          <div className="flex items-center gap-3">
            <TeamEmblem code={state.myTeam} name={myTeamName} size={38} />
            <div className="flex flex-col gap-0.5">
              <div className="whitespace-nowrap text-xs text-muted-foreground">{myTeamName}</div>
              <div className="text-[30px] font-medium leading-none">{state.myTeam === state.homeTeam ? state.score.home : state.score.away}</div>
            </div>
          </div>
          <div className="flex flex-col items-center gap-1 px-1">
            <div className="whitespace-nowrap text-[11px] text-muted-foreground">
              {state.inning}회{halfLabel}
            </div>
            <div className="text-[13px] text-muted-foreground">·</div>
            <div className="whitespace-nowrap text-[11px] text-muted-foreground">수비</div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex flex-col items-end gap-0.5">
              <div className="whitespace-nowrap text-xs text-muted-foreground">{oppTeamName}</div>
              <div className="text-[30px] font-medium leading-none">{state.opponentTeam === state.homeTeam ? state.score.home : state.score.away}</div>
            </div>
            <TeamEmblem code={state.opponentTeam} name={oppTeamName} size={38} />
          </div>
        </Card>

        <Card className="om-scroll flex items-center justify-end rounded-none p-[12px_20px]">
          <table className="min-w-[560px] whitespace-nowrap border-collapse text-xs">
            <thead>
              <tr className="text-muted-foreground">
                <th className="py-[3px] pr-2.5 text-left font-normal" />
                {COLS.map((c) => (
                  <th key={c} className="px-2 py-[3px] font-normal">
                    {c}
                  </th>
                ))}
                <th className="py-[3px] pl-3.5 pr-2 font-normal">R</th>
                <th className="px-2 py-[3px] font-normal">H</th>
                <th className="px-2 py-[3px] font-normal">E</th>
                <th className="py-[3px] pl-2 font-normal">B</th>
              </tr>
            </thead>
            <tbody>
              <LineRow label={awayName} teamCode={state.awayTeam} line={state.linescore.away} totals={state.linescore.totals.away} />
              <LineRow label={homeName} teamCode={state.homeTeam} line={state.linescore.home} totals={state.linescore.totals.home} />
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
