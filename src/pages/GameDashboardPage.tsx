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
import { Card } from "@/components/ui/card";
import { useSessionParams } from "@/context/SessionContext";
import { useTheme } from "@/context/ThemeContext";
import { useGameSession } from "@/hooks/useGameSession";
import { useHalfTransition } from "@/hooks/useHalfTransition";
import { ErrorBanner } from "@/components/common/ErrorBanner";
import { useConfig } from "@/hooks/useConfig";
import { useExpiredRedirect } from "@/hooks/useExpiredRedirect";
import { useTeams } from "@/hooks/useTeams";
import { OUTCOME_LABELS } from "@/lib/outcomeDisplay";
import type { AdvanceHalfSummary } from "@/types/api";

/** My-team WE swing of an offense half. TODO(backend): server `delta_we` per half (REPORT #3); until then derived from `weTrace`. */
function halfDeltaWe(summary: AdvanceHalfSummary): number {
  const t = summary.weTrace;
  return t.length >= 2 ? t[t.length - 1] - t[0] : 0;
}

export default function GameDashboardPage() {
  const { params, resumeSessionId, clear } = useSessionParams();
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();
  const teams = useTeams();
  const config = useConfig();
  const session = useGameSession(params, resumeSessionId);
  const {
    sessionId,
    state,
    recommendData,
    recommendation,
    noAvailablePitcher,
    usageToday,
    usedTonight,
    usageTimeline,
    weTrace,
    status,
    simulating,
    lastResult,
    decidedActual,
    history,
    simulate,
    advance,
    undo,
    error,
    retry,
    clearError,
  } = session;

  // SESSION_EXPIRED → forget the session and go back to onboarding with a notice.
  useExpiredRedirect(error);

  // Never pre-filled: the user picks a reliever themselves (no auto-select of #1).
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { phase, startInning, holdPaResult, showOffense, finishOffense, finishInning, cancel } = useHalfTransition();
  const startedFor = useRef<string | null>(null);

  useEffect(() => {
    setSelectedId(null);
  }, [state?.currentPitcher.pitcherId]);

  // "경기 종료" is a page transition (/result route), not an in-place state.
  useEffect(() => {
    if (state?.isGameOver && sessionId) navigate(`/result/${sessionId}`);
  }, [state?.isGameOver, sessionId, navigate]);

  // Opening overlay: once per session, only when we start on a defense half.
  useEffect(() => {
    if (status !== "ready" || !state || !sessionId || teams.length === 0) return;
    if (startedFor.current === sessionId) return;
    startedFor.current = sessionId;
    if (!state.isGameOver && state.myRole === "defense") startInning(state.inning, state.half);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, sessionId, teams.length]);

  const atBatLog = useMemo<AtBatLogEntry[]>(
    () =>
      history.log.map((e): AtBatLogEntry =>
        e.kind === "pa"
          ? {
              kind: "pa",
              inning: e.inning,
              half: e.half,
              batter: e.batter,
              outcomeLabel: e.result.outcomeLabel,
              deltaWeDefenderPct: e.result.deltaWeDefender * 100,
            }
          : {
              kind: "offenseHalf",
              inning: e.inning,
              half: e.half,
              runs: e.summary.runs,
              deltaWePct: halfDeltaWe(e.summary) * 100,
            },
      ),
    [history.log],
  );

  const teamName = useMemo(() => {
    const map = new Map(teams.map((t) => [t.code, t.name]));
    return (code: string) => map.get(code) ?? code;
  }, [teams]);

  if (!params) return <Navigate to="/" replace />;

  /** advance-half (held ≥ 2s by the hook) → offense summary overlay → next inning overlay. */
  async function runAdvance() {
    holdPaResult();
    const out = await advance();
    if (!out || out.state.isGameOver) {
      cancel(); // failure: state stays on the offense start → "공격 진행" button retries
      return;
    }
    showOffense(
      {
        inning: out.offenseInning,
        half: out.offenseHalf,
        runs: out.summary.runs,
        hits: out.summary.hits,
        deltaWe: halfDeltaWe(out.summary),
        paLog: out.summary.paLog.map((p) => ({
          batter: p.batter,
          outcome: p.outcome,
          outcomeLabel: OUTCOME_LABELS[p.outcome],
          runsScored: p.runsScored ?? undefined,
        })),
      },
      out.state.myRole === "defense" ? { inning: out.state.inning, half: out.state.half } : null,
    );
  }

  async function handleCommit(args: { pitcherId: string; pitcherName: string; changed: boolean }) {
    if (!state || state.myRole !== "defense") return;
    if (phase.kind === "paResult" || phase.kind === "offense") return;
    setSelectedId(null);
    const out = await simulate(args);
    if (!out) return;
    const next = out.result.nextState;
    if (next.isGameOver) return; // effect above navigates to /result
    if (next.myRole === "offense") await runAdvance();
  }

  function handleUndo() {
    cancel();
    setSelectedId(null);
    void undo();
  }

  function handleNewGame() {
    clear();
    navigate("/");
  }

  // The session never came up, or a required call (recommend) failed before the
  // first screen could be drawn: nothing to show but the error. SESSION_EXPIRED
  // is handled by the redirect above; GAME_NOT_FOUND can't be retried.
  const blockedByError = !!error && error.code !== "SESSION_EXPIRED" && (!state || (state.myRole === "defense" && !noAvailablePitcher && !recommendation));
  if (blockedByError && error) {
    return (
      <div className="flex min-h-screen w-full flex-col items-center justify-center gap-4 bg-background px-4 text-foreground">
        <ErrorBanner error={error} onRetry={retry} className="w-full max-w-[560px]" />
        <Button variant="primary" onClick={handleNewGame}>
          경기 선택으로 돌아가기
        </Button>
      </div>
    );
  }

  const waitingRecommend = state?.myRole === "defense" && !noAvailablePitcher && !recommendation;
  if (status === "loading" || !state || waitingRecommend) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-background text-foreground">
        <span className="text-sm text-muted-foreground">세션을 준비하는 중...</span>
      </div>
    );
  }

  const candidates = recommendation?.candidates ?? [];
  const isOffense = state.myRole === "offense";
  const phaseBusy = phase.kind === "paResult" || phase.kind === "offense";
  const selected = candidates.find((c) => c.pitcherId === selectedId) ?? null;
  const paCount = history.log.filter((entry) => entry.kind === "pa").length;
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

        {error && error.code !== "SESSION_EXPIRED" && <ErrorBanner error={error} onRetry={retry} onDismiss={clearError} />}

        <ScoreHeader state={state} myTeamName={teamName(state.myTeam)} oppTeamName={teamName(state.opponentTeam)} />

        {weTrace && config && (
          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg bg-border md:grid-cols-[1.35fr_1fr]">
            <div className="bg-card p-[14px_20px_10px]">
              <WinProbabilityChart weTrace={weTrace} teamName={teamName(state.myTeam)} />
            </div>
            <div className="bg-card p-[14px_20px_10px]">
              <LeverageChart
                liSeries={history.liSeries}
                bands={config.leverage.bands}
                leagueAvg={config.leverage.leagueAvg}
                currentLI={state.leverageIndex}
                liPercentile={recommendation?.liPercentile ?? null}
              />
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
                <UsageTimelineCard usage={usageTimeline} usageToday={usageToday} current={state.currentPitcher} currentInningsLabel={currentInningsLabel} />
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
                  paIndex={paCount}
                  actualDecision={decidedActual}
                />
              </div>
              {lastResult && lastResult.source !== "actual" && (
                <div className="order-[14] md:order-none">
                  <ProbabilityDistribution result={lastResult} />
                </div>
              )}
              <div className="order-[60] md:order-none">
                <AtBatLogCard entries={atBatLog} />
              </div>
            </div>

            <div className="contents md:flex md:flex-col md:gap-3">
              {isOffense ? (
                <div className="order-[25] md:order-none">
                  <Card className="flex flex-col gap-3 p-4">
                    <span className="text-sm text-muted-foreground">공격 이닝이 진행 대기 중입니다.</span>
                    <div className="flex flex-wrap gap-2.5">
                      <Button variant="muted" size="lg" disabled={!state.canUndo || simulating || phaseBusy} onClick={handleUndo} className="flex-1 whitespace-nowrap">
                        되돌리기
                      </Button>
                      <Button variant="primary" size="lg" disabled={simulating || phaseBusy} onClick={() => void runAdvance()} className="flex-1 whitespace-nowrap">
                        {simulating ? "진행 중..." : "공격 이닝 진행"}
                      </Button>
                    </div>
                  </Card>
                </div>
              ) : (
                <>
                  <div className="order-[25] md:order-none">
                    <CurrentPitcherCard
                      pitcher={state.currentPitcher}
                      batter={state.currentBatter}
                      badgeLabel={candidates.length === 0 ? "유지 강제" : "현재 · 유지"}
                      thisOuting={recommendData?.thisOuting}
                    />
                  </div>
                  <div className="order-[30] md:order-none">
                    <ReliefRankingList
                      candidates={candidates}
                      selectedId={selected?.pitcherId ?? null}
                      onSelect={(id) => setSelectedId((prev) => (prev === id ? null : id))}
                      usedPitchers={recommendation?.usedPitchers}
                      totalCount={recommendData?.bullpenSummary.total ?? 0}
                      estimated={recommendData?.bullpenSource === "estimated"}
                      provisional={config?.model?.provisional ?? false}
                      noAvailable={noAvailablePitcher}
                    />
                  </div>
                  <div className="order-[33] md:order-none">
                    <UsedPitchersChips usedPitchers={recommendation?.usedPitchers} usageToday={usageToday} usedTonight={usedTonight} />
                  </div>
                  <div className="order-[36] md:order-none">
                    <ActionBar
                      canUndo={state.canUndo}
                      onUndo={handleUndo}
                      onStay={() =>
                        handleCommit({
                          pitcherId: String(state.currentPitcher.pitcherId),
                          pitcherName: state.currentPitcher.name,
                          changed: false,
                        })
                      }
                      onSwitch={() => selected && handleCommit({ pitcherId: selected.pitcherId, pitcherName: selected.name, changed: true })}
                      canSwitch={selected !== null && !noAvailablePitcher}
                      locked={phaseBusy}
                      simulating={simulating}
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
    {import.meta.env.DEV && recommendData?.source && (
      <div className="pointer-events-none fixed bottom-2 right-2 z-40 rounded bg-chart-5 px-1.5 py-0.5 text-[10px] font-medium text-background">
        {recommendData.source}
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
