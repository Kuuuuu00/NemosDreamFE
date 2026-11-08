import { useEffect, useState } from "react";
import { api } from "@/api";
import type { GameListItem } from "@/types/api";

export function useGames(myTeam: string | null, oppTeam: string | null) {
  const [games, setGames] = useState<GameListItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // `team` is required by the API (400 otherwise): never fetch before both teams are chosen.
    if (!myTeam || !oppTeam) {
      setGames([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api
      .getGames(myTeam, oppTeam)
      .then((list) => {
        if (!cancelled) setGames(list);
      })
      .catch((e) => console.error("[useGames]", e)) // TODO(3-3): surface via ErrorBanner
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [myTeam, oppTeam]);

  return { games, loading };
}
