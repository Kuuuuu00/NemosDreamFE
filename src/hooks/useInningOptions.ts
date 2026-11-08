import { useEffect, useState } from "react";
import { mockExtras } from "@/api";
import type { InningOption } from "@/types/api";

/**
 * Mock-only: per-inning score/LI previews have no real endpoint. In API mode
 * this stays empty — the onboarding screen builds its buttons from
 * `GameListItem.availableInnings` / `highLeverageInnings` instead (3-2).
 */
export function useInningOptions(myTeam: string | null, oppTeam: string | null, gameId: string | null) {
  const [options, setOptions] = useState<InningOption[]>([]);

  useEffect(() => {
    if (!mockExtras || !myTeam || !oppTeam || !gameId) {
      setOptions([]);
      return;
    }
    let cancelled = false;
    mockExtras.getInningOptions(myTeam, oppTeam, gameId).then((list) => {
      if (!cancelled) setOptions(list);
    });
    return () => {
      cancelled = true;
    };
  }, [myTeam, oppTeam, gameId]);

  return options;
}
