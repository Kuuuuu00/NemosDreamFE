import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { GamePicker } from "@/components/onboarding/GamePicker";
import { InningPicker } from "@/components/onboarding/InningPicker";
import { StepCard } from "@/components/onboarding/StepCard";
import { TeamGrid } from "@/components/onboarding/TeamGrid";
import { useSessionParams } from "@/context/SessionContext";
import { useTheme } from "@/context/ThemeContext";
import { useGames } from "@/hooks/useGames";
import { useInningOptions } from "@/hooks/useInningOptions";
import { useTeams } from "@/hooks/useTeams";

type StepN = 1 | 2 | 3 | 4;

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { setParams } = useSessionParams();
  const { theme, toggle } = useTheme();
  const teams = useTeams();

  const [myTeam, setMyTeam] = useState<string | null>(null);
  const [oppTeam, setOppTeam] = useState<string | null>(null);
  const [gameId, setGameId] = useState<string | null>(null);
  const [startInning, setStartInning] = useState<number | null>(null);
  const [editing, setEditing] = useState<StepN | null>(null);

  // The logo mark's height must match the title+subtitle block's rendered
  // height exactly. CSS alone can't do this reliably here: an <img> whose
  // SVG has no intrinsic width/height (only a viewBox) has no definite size
  // for a flex row's align-items:stretch to resolve against, so it falls
  // back to the SVG's raw coordinate size instead of the sibling's height.
  // Measuring the text block directly sidesteps that circularity.
  const titleBlockRef = useRef<HTMLDivElement>(null);
  const [markSize, setMarkSize] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = titleBlockRef.current;
    if (!el) return;
    const update = () => setMarkSize(el.offsetHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { games } = useGames(myTeam, oppTeam);
  const inningOptions = useInningOptions(myTeam, oppTeam, gameId);

  const opponentTeams = useMemo(() => teams.filter((t) => t.code !== myTeam), [teams, myTeam]);
  const selectedGame = useMemo(() => games.find((g) => g.gameId === gameId) ?? null, [games, gameId]);
  const selectedInning = useMemo(
    () => inningOptions.find((i) => i.n === startInning) ?? null,
    [inningOptions, startInning],
  );

  const myTeamName = teams.find((t) => t.code === myTeam)?.name ?? "";
  const oppTeamName = teams.find((t) => t.code === oppTeam)?.name ?? "";

  const done1 = !!myTeam;
  const done2 = !!oppTeam;
  const done3 = !!gameId;
  const done4 = !!startInning;
  const step = (n: StepN, done: boolean) => ({
    open: editing === n || !done,
    onReopen: () => setEditing(n),
  });

  const ready = done1 && done2 && done3 && done4;

  function pickMyTeam(code: string) {
    setMyTeam(code);
    setOppTeam(null);
    setGameId(null);
    setStartInning(null);
    setEditing(2);
  }
  function pickOppTeam(code: string) {
    setOppTeam(code);
    setGameId(null);
    setStartInning(null);
    setEditing(3);
  }
  function pickGame(id: string) {
    setGameId(id);
    setStartInning(null);
    setEditing(4);
  }
  function pickInning(n: number) {
    setStartInning(n);
    setEditing(null);
  }

  function handleStart() {
    if (!myTeam || !oppTeam || !gameId || !startInning) return;
    setParams({ myTeam, oppTeam, gameId, startInning });
    navigate("/game");
  }

  const s1 = step(1, done1);
  const s2 = step(2, done2);
  const s3 = step(3, done3);
  const s4 = step(4, done4);

  return (
    <div className="flex w-full justify-center bg-background px-4 py-8 text-foreground sm:px-8 sm:py-[56px]">
      <div className="flex w-full max-w-[980px] flex-col gap-3.5">
        <div className="mb-2.5 flex flex-wrap items-end justify-between gap-2.5">
          <div className="flex flex-1 items-center gap-3" style={{ minWidth: 240 }}>
            <img
              src="/logo/nemo-mark-180.png"
              alt=""
              aria-hidden="true"
              className="shrink-0"
              style={markSize ? { height: markSize, width: markSize } : undefined}
            />
            <div ref={titleBlockRef} className="flex flex-col gap-2">
              <div className="text-[34px] font-semibold leading-[1.1]">네모의 꿈</div>
              <div className="text-sm text-muted-foreground">레버리지 기반 KBO 불펜 운용 시뮬레이터</div>
            </div>
          </div>
          <Button variant="muted" size="sm" onClick={toggle}>
            {theme === "dark" ? "라이트로" : "다크로"}
          </Button>
        </div>

        <StepCard label="내 팀" open={s1.open} onReopen={s1.onReopen} summary={myTeamName}>
          <TeamGrid teams={teams} selected={myTeam} onSelect={pickMyTeam} />
        </StepCard>

        {done1 && (
          <StepCard label="상대 팀" open={s2.open} onReopen={s2.onReopen} summary={oppTeamName}>
            <TeamGrid teams={opponentTeams} selected={oppTeam} onSelect={pickOppTeam} />
          </StepCard>
        )}

        {done2 && (
          <StepCard
            label="경기"
            open={s3.open}
            onReopen={s3.onReopen}
            summary={selectedGame ? `${selectedGame.date} · ${selectedGame.away} ${selectedGame.finalScore.away} : ${selectedGame.finalScore.home} ${selectedGame.home}` : ""}
          >
            <GamePicker games={games} selectedGameId={gameId} onSelect={pickGame} />
          </StepCard>
        )}

        {done3 && (
          <StepCard
            label="시작 이닝"
            open={s4.open}
            onReopen={s4.onReopen}
            summary={selectedInning ? `${selectedInning.label} · LI ${selectedInning.li}` : ""}
          >
            <InningPicker options={inningOptions} selected={startInning} onSelect={pickInning} />
          </StepCard>
        )}

        <div className="sticky bottom-0 z-10 -mx-4 flex items-center justify-end gap-4 border-t border-border bg-background px-4 py-3 sm:-mx-8 sm:px-8 md:static md:z-auto md:mx-0 md:mt-1.5 md:px-0 md:py-[12px_0_4px]">
          <span className="hidden text-[11px] text-muted-foreground sm:inline">
            {ready
              ? `${myTeamName} · ${selectedGame?.date ?? ""} · ${startInning}회`
              : "네 단계를 모두 선택하세요"}
          </span>
          <Button variant="primary" size="xl" disabled={!ready} onClick={handleStart}>
            시뮬레이션 시작
          </Button>
        </div>
      </div>
    </div>
  );
}
