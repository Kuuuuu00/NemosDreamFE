import { useEffect, useState } from "react";
import { api } from "@/api";
import type { Team } from "@/types/api";

export function useTeams() {
  const [teams, setTeams] = useState<Team[]>([]);

  useEffect(() => {
    let cancelled = false;
    api
      .getTeams()
      .then((t) => {
        if (!cancelled) setTeams(t);
      })
      .catch((e) => console.error("[useTeams]", e)); // TODO(3-3): surface via ErrorBanner
    return () => {
      cancelled = true;
    };
  }, []);

  return teams;
}
