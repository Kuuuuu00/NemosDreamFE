import { useCallback, useEffect, useState } from "react";
import { api, isAbortError, isApiError, ApiRequestError } from "@/api";
import type { GameListItem } from "@/types/api";

export function useGames(myTeam: string | null, oppTeam: string | null) {
  const [games, setGames] = useState<GameListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiRequestError | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    // `team` is required by the API (400 otherwise): never fetch before both teams are chosen.
    if (!myTeam || !oppTeam) {
      setGames([]);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .getGames(myTeam, oppTeam)
      .then((list) => {
        if (!cancelled) setGames(list);
      })
      .catch((e) => {
        if (cancelled || isAbortError(e)) return;
        console.error("[useGames]", e);
        setGames([]);
        setError(isApiError(e) ? e : new ApiRequestError("INTERNAL_ERROR", String(e), true));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [myTeam, oppTeam, reloadKey]);

  const retry = useCallback(() => setReloadKey((k) => k + 1), []);
  return { games, loading, error, retry };
}
