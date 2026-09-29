import { useEffect, useState } from "react";
import * as api from "@/mocks/api";
import type { InningOption } from "@/types/api";

export function useInningOptions(myTeam: string | null, oppTeam: string | null, gameId: string | null) {
  const [options, setOptions] = useState<InningOption[]>([]);

  useEffect(() => {
    if (!myTeam || !oppTeam || !gameId) {
      setOptions([]);
      return;
    }
    let cancelled = false;
    api.getInningOptions(myTeam, oppTeam, gameId).then((list) => {
      if (!cancelled) setOptions(list);
    });
    return () => {
      cancelled = true;
    };
  }, [myTeam, oppTeam, gameId]);

  return options;
}
