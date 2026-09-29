import { useCallback, useEffect, useRef, useState } from "react";
import type { HalfSummary } from "@/components/game/OffenseHalfOverlay";
import type { Half } from "@/types/api";

export type TransitionPhase =
  | { kind: "idle" }
  | { kind: "paResult" }
  | { kind: "offense"; summary: HalfSummary & { inning: number; half: Half } }
  | { kind: "inning"; inning: number; half: Half };

/** paResult effect entrance is 0.7s; the inning overlay follows the offense
 * overlay after a 0.1s gap. */
const PA_RESULT_MS = 700;
const GAP_MS = 100;

/** Phase changes come only from these callbacks + their timers — never from
 * render-time values, so ordinary dashboard re-renders can't restart the sequence. */
export function useHalfTransition() {
  const [phase, setPhase] = useState<TransitionPhase>({ kind: "idle" });
  const phaseRef = useRef<TransitionPhase>(phase);
  const nextRef = useRef<{ inning: number; half: Half } | null>(null);
  const timers = useRef<number[]>([]);

  const set = useCallback((p: TransitionPhase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);
  const clear = useCallback(() => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  }, []);
  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);

  useEffect(() => clear, [clear]);

  const startInning = useCallback(
    (inning: number, half: Half) => {
      clear();
      set({ kind: "inning", inning, half });
    },
    [clear, set],
  );

  /** A defense half just ended: paResult → offense → gap → next inning. */
  const playHalfEnd = useCallback(
    (summary: HalfSummary & { inning: number; half: Half }, next: { inning: number; half: Half }) => {
      clear();
      nextRef.current = next;
      set({ kind: "paResult" });
      later(() => set({ kind: "offense", summary }), PA_RESULT_MS);
    },
    [clear, later, set],
  );

  /** Offense overlay finished or was skipped (idempotent). */
  const finishOffense = useCallback(() => {
    if (phaseRef.current.kind !== "offense") return;
    const next = nextRef.current;
    set({ kind: "idle" });
    if (next) later(() => set({ kind: "inning", ...next }), GAP_MS);
  }, [later, set]);

  const finishInning = useCallback(() => {
    if (phaseRef.current.kind === "inning") set({ kind: "idle" });
  }, [set]);

  const cancel = useCallback(() => {
    clear();
    set({ kind: "idle" });
  }, [clear, set]);

  return { phase, startInning, playHalfEnd, finishOffense, finishInning, cancel };
}
