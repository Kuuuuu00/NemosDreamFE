import { useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
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
import { useSessionResult } from "@/hooks/useSessionResult";
import { useTeams } from "@/hooks/useTeams";
import { visibleDecisions } from "@/lib/resultDisplay";

export default function ResultPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();
  const { clear } = useSessionParams();
  const teams = useTeams();
  const { result, weTrace, status, error, repeat, repeatOpen, repeatLoading, toggleRepeat } = useSessionResult(sessionId);

  // One filter/toggle state shared by DecisionComparison and DecisionLog.
  const [showAllPas, setShowAllPas] = useState(false);
  const decisions = useMemo(() => visibleDecisions(result?.decisions ?? [], showAllPas), [result, showAllPas]);

  const teamName = useMemo(() => {
    const map = new Map(teams.map((t) => [t.code, t.name]));
    return (code: string) => map.get(code) ?? code;
  }, [teams]);

  if (!sessionId) return <Navigate to="/" replace />;
  // Only an unrecoverable session (expired / metadata gone) leaves the page.
  // TODO(3-3): other errors (recoverable) get an ErrorBanner + retry (`reload`) instead of the spinner below.
  if (status === "error" && error?.code === "SESSION_EXPIRED") return <Navigate to="/" replace />;

  if (status !== "ready" || !result || !weTrace) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-background text-foreground">
        <span className="text-sm text-muted-foreground">결과를 불러오는 중...</span>
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

        <PitcherTimeline pitcherUsage={result.pitcherUsage} actualPitcherUsage={result.actualPitcherUsage} startInning={result.startInning} />

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
