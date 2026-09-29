import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { SessionParams } from "@/hooks/useGameSession";

interface SessionContextValue {
  params: SessionParams | null;
  setParams: (p: SessionParams) => void;
  clear: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [params, setParamsState] = useState<SessionParams | null>(null);

  const value = useMemo<SessionContextValue>(
    () => ({
      params,
      setParams: setParamsState,
      clear: () => setParamsState(null),
    }),
    [params],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSessionParams() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSessionParams must be used within SessionProvider");
  return ctx;
}
