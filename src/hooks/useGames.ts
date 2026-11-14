import { useCallback, useEffect, useState } from "react";
import { api, isAbortError, isApiError, ApiRequestError } from "@/api";
import { DEFAULT_SEASON } from "@/lib/demoGames";
import type { GameListItem } from "@/types/api";

/** Per-(season, teams) list cache: the 2025 and 2026 lists never share an entry. */
const cache = new Map<string, GameListItem[]>();
const cacheKey = (season: number, my: string, opp: string) => `${season}:${my}:${opp}`;

export function useGames(myTeam: string | null, oppTeam: string | null, season: number = DEFAULT_SEASON) {
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
    const key = cacheKey(season, myTeam, oppTeam);
    const hit = reloadKey === 0 ? cache.get(key) : undefined; // retry bypasses the cache
    if (hit) {
      setGames(hit);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setGames([]); // never show another season's list while this one loads
    setLoading(true);
    setError(null);
    api
      .getGames(myTeam, oppTeam, season)
      .then((list) => {
        cache.set(key, list);
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
  }, [myTeam, oppTeam, season, reloadKey]);

  const retry = useCallback(() => setReloadKey((k) => k + 1), []);
  return { games, loading, error, retry };
}
