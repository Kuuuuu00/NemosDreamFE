import { useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { ErrorBanner } from "@/components/common/ErrorBanner";
import { DecisionComparison } from "@/components/result/DecisionComparison";
import { DecisionLog } from "@/components/result/DecisionLog";
import { PitcherTimeline } from "@/components/result/PitcherTimeline";
import { RepeatSimulationPanel } from "@/components/result/RepeatSimulationPanel";
import { ResultActionBar } from "@/components/result/ResultActionBar";
import { ResultBanner } from "@/components/result/ResultBanner";
import { ResultHeader } from "@/components/result/ResultHeader";
import { ResultLimitBanner } from "@/components/result/ResultLimitBanner";
import { ResultMetricsCards } from "@/components/result/ResultMetricsCards";
import { ResultWinProbChart } from "@/components/result/ResultWinProbChart";
import { Button } from "@/components/ui/button";
import { useSessionParams } from "@/context/SessionContext";
import { useTheme } from "@/context/ThemeContext";
import { useExpiredRedirect } from "@/hooks/useExpiredRedirect";
import { useSessionResult } from "@/hooks/useSessionResult";
import { useTeams } from "@/hooks/useTeams";
import { teamName } from "@/lib/teamName";
import { visibleDecisions } from "@/lib/resultDisplay";

export default function ResultPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();
  const { clear } = useSessionParams();
  useTeams(); // loads /teams once; teamName() reads the result, and this re-renders the page when it lands
  const { result, weTrace, status, error, reload, repeat, repeatOpen, repeatLoading, repeatError, toggleRepeat } = useSessionResult(sessionId);
  useExpiredRedirect(error); // SESSION_EXPIRED → onboarding with a notice

  // One filter/toggle state shared by DecisionComparison and DecisionLog.
  const [showAllPas, setShowAllPas] = useState(false);
  const decisions = useMemo(() => visibleDecisions(result?.decisions ?? [], showAllPas), [result, showAllPas]);


  if (!sessionId) return <Navigate to="/" replace />;
  // Only an unrecoverable session (expired / metadata gone) leaves the page (useExpiredRedirect above).
  // Any other load error is shown in place with a retry (`reload`) when recoverable.
  if (status === "error" && error && error.code !== "SESSION_EXPIRED") {
    return (
      <div className="flex min-h-screen w-full flex-col items-center justify-center gap-4 bg-background px-4 text-foreground">
        <ErrorBanner error={error} onRetry={reload} className="w-full max-w-[560px]" />
        <Button variant="primary" onClick={handleNewGame}>
          경기 선택으로 돌아가기
        </Button>
      </div>
    );
  }

  if (status !== "ready" || !result || !weTrace) {
    return (
      <div className="flex w-full justify-center bg-background px-4 py-3.5 text-foreground">
        <div className="flex w-full max-w-[1408px] flex-col gap-3" role="status" aria-live="polite">
          <div className="h-24 animate-pulse rounded-lg bg-card" />
          <div className="rounded-lg bg-card p-[18px_22px_16px]">
            <div className="mb-1 text-sm">결정 비교 · 모델 추천과의 비교</div>
            <div className="mb-3 text-xs text-muted-foreground">모델 순위 계산 중… 처음 불러올 때는 몇 초 걸릴 수 있습니다.</div>
            <div className="flex flex-col gap-2.5">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-8 animate-pulse rounded bg-muted" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  function handleNewGame() {
    clear();
    navigate("/");
  }

  return (
    <div className="flex w-full justify-center bg-background px-4 py-3.5 text-foreground sm:px-4">
      <div className="flex w-full max-w-[1408px] flex-col gap-3">
        <div className="flex items-center justify-end gap-2 px-1">
          <Button variant="muted" size="sm" onClick={toggle}>
            {theme === "dark" ? "라이트로" : "다크로"}
          </Button>
        </div>

        <ResultHeader result={result} teamName={teamName} />
        <ResultBanner result={result} teamName={teamName} />

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-stretch">
          <div className="rounded-lg bg-card p-[18px_22px_14px]">
            <ResultWinProbChart weTrace={weTrace} teamName={teamName(result.myTeam)} pitcherUsage={result.pitcherUsage} />
          </div>
          <ResultMetricsCards result={result} />
        </div>

        <ResultLimitBanner />

        <PitcherTimeline
          pitcherUsage={result.pitcherUsage}
          actualPitcherUsage={result.actualPitcherUsage}
          decisions={result.decisions}
          startInning={result.startInning}
        />

        <DecisionComparison
          decisions={decisions}
          totalCount={result.decisions.length}
          showAll={showAllPas}
          onToggleAll={() => setShowAllPas((v) => !v)}
          comparison={result.modelComparison}
        />

        <div className="rounded-lg bg-card p-[18px_22px_18px]">
          <DecisionLog decisions={decisions} />
        </div>

        {repeatError && <ErrorBanner error={repeatError} onRetry={toggleRepeat} />}
        {repeatOpen && repeat && <RepeatSimulationPanel repeat={repeat} startInning={result.startInning} />}

        <ResultActionBar
          onNewGame={handleNewGame}
          onRepeat={toggleRepeat}
          repeatLabel={repeatOpen ? "반복 결과 접기" : "같은 선택으로 100회 반복"}
          repeatLoading={repeatLoading}
        />
      </div>
    </div>
  );
}
