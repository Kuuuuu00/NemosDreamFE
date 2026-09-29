import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { ActionBar } from "@/components/dashboard/ActionBar";
import { AtBatLogCard, type AtBatLogEntry } from "@/components/dashboard/AtBatLogCard";
import { CurrentPitcherCard } from "@/components/dashboard/CurrentPitcherCard";
import { LeverageChart } from "@/components/dashboard/LeverageChart";
import { MatchupCard } from "@/components/dashboard/MatchupCard";
import { MatchupPanel } from "@/components/dashboard/MatchupPanel";
import { NextBattersCard } from "@/components/dashboard/NextBattersCard";
import { OutcomePanel } from "@/components/dashboard/OutcomePanel";
import { PitcherStatCard } from "@/components/dashboard/PitcherStatCard";
import { ProbabilityDistribution } from "@/components/dashboard/ProbabilityDistribution";
import { ReliefRankingList } from "@/components/dashboard/ReliefRankingList";
import { ScoreHeader } from "@/components/dashboard/ScoreHeader";
import { UsageTimelineCard } from "@/components/dashboard/UsageTimelineCard";
import { UsedPitchersChips } from "@/components/dashboard/UsedPitchersChips";
import { InningTransition } from "@/components/game/InningTransition";
import { OffenseHalfOverlay } from "@/components/game/OffenseHalfOverlay";
import { WinProbabilityChart } from "@/components/dashboard/WinProbabilityChart";
import { Button } from "@/components/ui/button";
import { useSessionParams } from "@/context/SessionContext";
import { useTheme } from "@/context/ThemeContext";
import { useGameSession } from "@/hooks/useGameSession";
import { useHalfTransition } from "@/hooks/useHalfTransition";
import { useTeams } from "@/hooks/useTeams";
import { OUTCOME_LABELS } from "@/lib/outcomeDisplay";

export default function GameDashboardPage() {
  const { params, clear } = useSessionParams();
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();
  const teams = useTeams();
  const session = useGameSession(params);
  const { sessionId, state, recommendData, recommendation, usageToday, usedTonight, weTrace, status, simulating, lastResult, simulate, undo } =
    session;

  // Never pre-filled: the user picks a reliever themselves (no auto-select of #1).
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { phase, startInning, playHalfEnd, finishOffense, finishInning, cancel } = useHalfTransition();
  const startedFor = useRef<string | null>(null);
  const [log, setLog] = useState<AtBatLogEntry[]>([]);

  useEffect(() => {
    setSelectedId(null);
  }, [state?.currentPitcher.pitcherId]);

  // "경기 종료" is a page transition, not a state to render in place (§ 결과
  // 대시보드는 /result 라우트) — the inline end-of-game block this used to
  // show here has been replaced by this redirect.
  useEffect(() => {
    if (state?.isGameOver && sessionId) navigate(`/result/${sessionId}`);
  }, [state?.isGameOver, sessionId, navigate]);

  // Opening overlay: once per session, after the dashboard can render (teams
  // loaded so the subtitle is final). Guarded by a ref, so re-renders
  // can never replay it.
  useEffect(() => {
    if (status !== "ready" || !state || !sessionId || teams.length === 0) return;
    if (startedFor.current === sessionId) return;
    startedFor.current = sessionId;
    if (!state.isGameOver) startInning(state.inning, state.half);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, sessionId, teams.length]);

  const teamName = useMemo(() => {
    const map = new Map(teams.map((t) => [t.code, t.name]));
    return (code: string) => map.get(code) ?? code;
  }, [teams]);

  if (!params) return <Navigate to="/" replace />;

  async function handleCommit(pitcherId: number) {
    if (!state) return;
    if (phase.kind === "paResult" || phase.kind === "offense") return;
    setSelectedId(null);
    const batter = state.currentBatter.name;
    const inning = state.inning;
    const half = state.half;
    const result = await simulate(pitcherId);
    if (result) {
      const oh = result.offenseHalfSummary;
      // Game over → straight to /result (effect above); no overlays.
      if (oh && !result.nextState.isGameOver) {
        playHalfEnd(
          {
            inning: oh.inning,
            half: oh.half,
            runs: oh.runs,
            hits: oh.hits,
            deltaWe: oh.deltaWe,
            paLog: oh.paLog.map((p) => ({
              batter: p.batter,
              outcome: p.outcome,
              outcomeLabel: OUTCOME_LABELS[p.outcome],
              runsScored: p.runsScored,
            })),
          },
          { inning: result.nextState.inning, half: result.nextState.half },
        );
      }
      setLog((prev) => {
        const next: AtBatLogEntry[] = [
          ...prev,
          {
            kind: "pa",
            inning,
            half,
            batter,
            outcomeLabel: result.outcomeLabel,
            deltaWeDefenderPct: result.deltaWeDefender * 100,
          },
        ];
        // The auto-played offense half (if this PA ended the inning) gets
        // its own row — its WE swing is never the pitcher's contribution,
        // so it must never be merged into the PA entry above (§3).
        if (result.offenseHalfSummary) {
          next.push({
            kind: "offenseHalf",
            inning: result.offenseHalfSummary.inning,
            half: result.offenseHalfSummary.half,
            runs: result.offenseHalfSummary.runs,
            deltaWePct: result.offenseHalfSummary.deltaWe * 100,
          });
        }
        return next;
      });
    }
  }

  function handleUndo() {
    cancel();
    void undo();
  }

  function handleNewGame() {
    clear();
    navigate("/");
  }

  if (status === "loading" || !state || !recommendData || !recommendation) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-background text-foreground">
        <span className="text-sm text-muted-foreground">세션을 준비하는 중...</span>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex min-h-screen w-full flex-col items-center justify-center gap-4 bg-background text-foreground">
        <span className="text-sm text-muted-foreground">세션을 불러오지 못했습니다.</span>
        <Button variant="primary" onClick={handleNewGame}>
          온보딩으로 돌아가기
        </Button>
      </div>
    );
  }

  const candidates = recommendation.candidates;
  const selected = candidates.find((c) => c.pitcherId === selectedId) ?? null;
  const currentInningsLabel = `${state.inning}회${state.half === "top" ? "초" : "말"}~`;

  const blurClass =
    phase.kind === "offense" ? "dash-blur-offense" : phase.kind === "inning" ? "dash-blur-inning" : "";

  return (
    <>
    <div
      className={`flex w-full justify-center bg-background px-4 py-3.5 text-foreground sm:px-4 ${blurClass}`}
    >
      <div className="flex w-full max-w-[1600px] flex-col gap-3">
        <div className="flex items-center justify-between gap-2 px-1">
          <button type="button" onClick={() => navigate("/")} className="flex items-center gap-2.5 text-left">
            <img src="/logo/nemo-mark-64.png" alt="" aria-hidden="true" className="h-9 w-9 shrink-0" />
            <div className="leading-tight">
              <div className="text-[17px] font-bold tracking-tight">네모의 꿈</div>
              <div className="hidden text-[10px] text-muted-foreground sm:block">공을 네모 안에 넣어</div>
            </div>
          </button>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleNewGame}>
              새 경기
            </Button>
            <Button variant="muted" size="sm" onClick={toggle}>
              {theme === "dark" ? "라이트로" : "다크로"}
            </Button>
          </div>
        </div>

        <ScoreHeader state={state} myTeamName={teamName(state.myTeam)} oppTeamName={teamName(state.opponentTeam)} />

        {weTrace && (
          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg bg-border md:grid-cols-[1.35fr_1fr]">
            <div className="bg-card p-[14px_20px_10px]">
              <WinProbabilityChart weTrace={weTrace} teamName={teamName(state.myTeam)} />
            </div>
            <div className="bg-card p-[14px_20px_10px]">
              <LeverageChart weTrace={weTrace} currentLI={state.leverageIndex} liPercentile={recommendation.liPercentile} />
            </div>
          </div>
        )}

        {state.isGameOver ? (
          <div className="flex flex-col items-center gap-3 rounded-lg bg-card p-10 text-center">
            <span className="text-sm text-muted-foreground">결과 화면으로 이동하는 중...</span>
          </div>
        ) : (
          <div className="flex flex-col gap-3 md:grid md:grid-cols-[22fr_42fr_36fr] md:items-start">
            <div className="contents md:flex md:flex-col md:gap-3">
              <div className="order-[50] md:order-none">
                <PitcherStatCard pitcher={state.currentPitcher} />
              </div>
              <div className="order-[51] md:order-none">
                <MatchupCard batter={state.currentBatter} pitcherName={state.currentPitcher.name} />
              </div>
              <div className="order-[52] md:order-none">
                <NextBattersCard batters={state.upcomingBatters} />
              </div>
              <div className="order-[53] md:order-none">
                <UsageTimelineCard usageToday={usageToday} current={state.currentPitcher} currentInningsLabel={currentInningsLabel} />
              </div>
            </div>

            <div className="contents md:flex md:flex-col md:gap-3">
              <div className="order-[10] md:order-none">
                <MatchupPanel pitcher={state.currentPitcher} batter={state.currentBatter} state={state} />
              </div>
              <div className="order-[12] md:order-none">
                <OutcomePanel
                  result={lastResult}
                  simulating={simulating}
                  paIndex={log.filter((entry) => entry.kind === "pa").length}
                />
              </div>
              {lastResult && (
                <div className="order-[14] md:order-none">
                  <ProbabilityDistribution result={lastResult} />
                </div>
              )}
              <div className="order-[60] md:order-none">
                <AtBatLogCard entries={log} />
              </div>
            </div>

            <div className="contents md:flex md:flex-col md:gap-3">
              <div className="order-[25] md:order-none">
                <CurrentPitcherCard
                  pitcher={state.currentPitcher}
                  batter={state.currentBatter}
                  badgeLabel={candidates.length === 0 ? "유지 강제" : "현재 · 유지"}
                />
              </div>
              <div className="order-[30] md:order-none">
                <ReliefRankingList
                  candidates={candidates}
                  selectedId={selected?.pitcherId ?? null}
                  onSelect={(id) => setSelectedId((prev) => (prev === id ? null : id))}
                  totalCount={recommendData.bullpenSummary.total}
                  estimated={recommendData.bullpenSource === "estimated"}
                />
              </div>
              <div className="order-[33] md:order-none">
                <UsedPitchersChips usageToday={usageToday} usedTonight={usedTonight} />
              </div>
              <div className="order-[36] md:order-none">
                <ActionBar
                  canUndo={state.canUndo}
                  onUndo={handleUndo}
                  onStay={() => handleCommit(state.currentPitcher.pitcherId)}
                  onSwitch={() => selected && handleCommit(Number(selected.pitcherId))}
                  canSwitch={selected !== null}
                  locked={phase.kind === "paResult" || phase.kind === "offense"}
                  simulating={simulating}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
    {import.meta.env.DEV && recommendation.source === "mock" && (
      <div className="pointer-events-none fixed bottom-2 right-2 z-40 rounded bg-chart-5 px-1.5 py-0.5 text-[10px] font-medium text-background">
        MOCK
      </div>
    )}
    {phase.kind === "offense" && (
      <OffenseHalfOverlay
        inning={phase.summary.inning}
        half={phase.summary.half}
        myTeamName={teamName(state.myTeam)}
        summary={phase.summary}
        onComplete={finishOffense}
      />
    )}
    {phase.kind === "inning" && (
      <InningTransition
        key={`${phase.inning}-${phase.half}`}
        transitionKey={`${phase.inning}-${phase.half}`}
        inning={phase.inning}
        half={phase.half}
        subtitle={`${teamName(state.myTeam)} 수비`}
        onComplete={finishInning}
      />
    )}
    </>
  );
}
