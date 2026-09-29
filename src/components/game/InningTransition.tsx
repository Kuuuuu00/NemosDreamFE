import { memo, useEffect, useRef } from "react";

interface InningTransitionProps {
  inning: number;
  half: "top" | "bot";
  subtitle?: string;
  /** Replay trigger — `${inning}-${half}`. Nothing else may reach this
   * component, or ordinary dashboard re-renders would replay it. */
  transitionKey: string;
  onComplete?: () => void;
}

function InningTransitionImpl({ inning, half, subtitle, onComplete }: InningTransitionProps) {
  const completeRef = useRef(onComplete);
  useEffect(() => {
    completeRef.current = onComplete;
  });
  const doneRef = useRef(false);

  // Timer mirrors the CSS timeline (1.45s, or 0.6s under reduced motion) so
  // completion never depends on an animationend event being delivered.
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const id = window.setTimeout(() => {
      if (doneRef.current) return;
      doneRef.current = true;
      completeRef.current?.();
    }, reduced ? 600 : 1450);
    return () => window.clearTimeout(id);
  }, []);

  const label = `${inning}회${half === "top" ? "초" : "말"}`;
  return (
    <div className="inning-overlay" role="status" aria-live="polite">
      <div className="inning-line" style={{ marginBottom: 14 }} />
      <div className="inning-text">{label}</div>
      <div className="inning-line inning-line--b" style={{ marginTop: 14 }} />
      {subtitle && (
        <div className="inning-sub" style={{ marginTop: 12 }}>
          {subtitle}
        </div>
      )}
    </div>
  );
}

/** Keyed by `transitionKey` at the call site (remounts to replay) and
 * memoised on it alone. */
export const InningTransition = memo(
  InningTransitionImpl,
  (prev, next) => prev.transitionKey === next.transitionKey,
);
