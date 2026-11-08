import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { clearSession, currentSessionId, loadCurrentSnapshot } from "@/api/sessionStore";
import type { SessionParams } from "@/types/api";

interface SessionContextValue {
  params: SessionParams | null;
  /**
   * Non-null only when `params` were restored after a page refresh (from the
   * sessionStorage snapshot). `useGameSession` must then RESUME this server
   * session instead of creating a new one. Picking a game in onboarding
   * (`setParams`) resets it to null → a brand-new session.
   * TODO(backend): replaces itself with `GET /sessions/{id}` once it exists (REPORT #4).
   */
  resumeSessionId: string | null;
  setParams: (p: SessionParams) => void;
  /** Leave the game: forget the params and drop the stored session snapshot. */
  clear: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

function initialFromStorage(): { params: SessionParams | null; resumeSessionId: string | null } {
  const snap = loadCurrentSnapshot();
  if (!snap || snap.state.isGameOver) return { params: null, resumeSessionId: null };
  const { myTeam, oppTeam, gameId, startInning, sessionId } = snap.meta;
  return { params: { myTeam, oppTeam, gameId, startInning }, resumeSessionId: sessionId };
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [init] = useState(initialFromStorage);
  const [params, setParamsState] = useState<SessionParams | null>(init.params);
  const [resumeSessionId, setResumeSessionId] = useState<string | null>(init.resumeSessionId);

  const setParams = useCallback((p: SessionParams) => {
    setResumeSessionId(null);
    setParamsState(p);
  }, []);

  const clear = useCallback(() => {
    setParamsState(null);
    setResumeSessionId(null);
    const id = currentSessionId();
    if (id) clearSession(id);
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({ params, resumeSessionId, setParams, clear }),
    [params, resumeSessionId, setParams, clear],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSessionParams() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSessionParams must be used within SessionProvider");
  return ctx;
}
