import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "@/mocks/api";
import type { RecommendationResult } from "@/types/recommendation";
import type { GameState, PAResult, Pitcher, RecommendResponse, UsageEntry, WeTraceResponse } from "@/types/api";

export interface SessionParams {
  myTeam: string;
  oppTeam: string;
  gameId: string;
  startInning: number;
}

type Status = "idle" | "loading" | "ready" | "error";

export function useGameSession(params: SessionParams | null) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [recommendData, setRecommendData] = useState<RecommendResponse | null>(null);
  const [recommendation, setRecommendation] = useState<RecommendationResult | null>(null);
  const [usageToday, setUsageToday] = useState<UsageEntry[]>([]);
  const [usedTonight, setUsedTonight] = useState<Pitcher[]>([]);
  const [weTrace, setWeTrace] = useState<WeTraceResponse | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [simulating, setSimulating] = useState(false);
  const [lastResult, setLastResult] = useState<PAResult | null>(null);

  const sessionIdRef = useRef<string | null>(null);

  const refreshAll = useCallback(async (id: string, forState: GameState) => {
    const [rec, ranking, usage, used, we] = await Promise.all([
      api.recommend(id),
      api.getRecommendations(forState),
      api.getUsageToday(id),
      api.getUsedTonight(id),
      api.getWeTrace(id),
    ]);
    setRecommendData(rec);
    setRecommendation(ranking);
    setUsageToday(usage);
    setUsedTonight(used);
    setWeTrace(we);
  }, []);

  useEffect(() => {
    if (!params) {
      setStatus("idle");
      return;
    }
    let cancelled = false;
    setStatus("loading");
    setLastResult(null);
    (async () => {
      try {
        const { state: initial } = await api.createSession(params);
        if (cancelled) return;
        sessionIdRef.current = initial.sessionId;
        setSessionId(initial.sessionId);
        setState(initial);
        await refreshAll(initial.sessionId, initial);
        if (cancelled) return;
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.myTeam, params?.oppTeam, params?.gameId, params?.startInning]);

  const simulate = useCallback(
    async (pitcherId: number) => {
      const id = sessionIdRef.current;
      if (!id) return null;
      setSimulating(true);
      try {
        const { result } = await api.simulatePa(id, pitcherId);
        setState(result.nextState);
        setLastResult(result);
        await refreshAll(id, result.nextState);
        return result;
      } finally {
        setSimulating(false);
      }
    },
    [refreshAll],
  );

  const undo = useCallback(async () => {
    const id = sessionIdRef.current;
    if (!id) return;
    const { state: prev } = await api.undoLast(id);
    setState(prev);
    setLastResult(null);
    await refreshAll(id, prev);
  }, [refreshAll]);

  return {
    sessionId,
    state,
    recommendData,
    recommendation,
    usageToday,
    usedTonight,
    weTrace,
    status,
    simulating,
    lastResult,
    simulate,
    undo,
  };
}
