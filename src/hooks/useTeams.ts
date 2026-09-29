import { useEffect, useState } from "react";
import * as api from "@/mocks/api";
import type { Team } from "@/types/api";

export function useTeams() {
  const [teams, setTeams] = useState<Team[]>([]);

  useEffect(() => {
    let cancelled = false;
    api.getTeams().then((t) => {
      if (!cancelled) setTeams(t);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return teams;
}
