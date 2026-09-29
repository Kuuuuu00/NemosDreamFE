import { useEffect, useState } from "react";
import * as api from "@/mocks/api";
import type { GameListItem } from "@/types/api";

export function useGames(myTeam: string | null, oppTeam: string | null) {
  const [games, setGames] = useState<GameListItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!myTeam || !oppTeam) {
      setGames([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api.getGames(myTeam, oppTeam).then((list) => {
      if (cancelled) return;
      setGames(list);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [myTeam, oppTeam]);

  return { games, loading };
}
