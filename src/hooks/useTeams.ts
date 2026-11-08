import { useCallback, useEffect, useState } from "react";
import { api, isAbortError, isApiError, ApiRequestError } from "@/api";
import type { Team } from "@/types/api";

/** Teams + load error + retry (onboarding shows a banner). `useTeams` is the plain list for other screens. */
export function useTeamsStatus() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [error, setError] = useState<ApiRequestError | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api
      .getTeams()
      .then((t) => {
        if (cancelled) return;
        setTeams(t);
        setError(null);
      })
      .catch((e) => {
        if (cancelled || isAbortError(e)) return;
        console.error("[useTeams]", e);
        setError(isApiError(e) ? e : new ApiRequestError("INTERNAL_ERROR", String(e), true));
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const retry = useCallback(() => setReloadKey((k) => k + 1), []);
  return { teams, error, retry };
}

export function useTeams() {
  return useTeamsStatus().teams;
}
