import { useEffect, useRef } from "react";
import { outcomeTone } from "@/lib/outcomeDisplay";
import type { PAOutcomeCode } from "@/types/api";

export interface HalfSummary {
  runs: number;
  hits: number;
  paLog: { batter: string; outcomeLabel: string; outcome: PAOutcomeCode; runsScored?: number }[];
  /** My-team perspective as reported — positive is good, never flipped. */
  deltaWe: number;
}

interface OffenseHalfOverlayProps {
  inning: number;
  half: "top" | "bot";
  myTeamName: string;
  summary: HalfSummary;
  onComplete: () => void;
}

const MAX_ROWS = 5;
const TOTAL_MS = 5000;

/** Up to 5 rows, scoring PAs first (kept in original order). */
function pickRows(paLog: HalfSummary["paLog"]) {
  if (paLog.length <= MAX_ROWS) return paLog;
  const idx = paLog.map((_, i) => i);
  const scoring = idx.filter((i) => (paLog[i].runsScored ?? 0) > 0);
  const rest = idx.filter((i) => !scoring.includes(i));
  const chosen = [...scoring, ...rest].slice(0, MAX_ROWS).sort((a, b) => a - b);
  return chosen.map((i) => paLog[i]);
}

export function OffenseHalfOverlay({ inning, half, myTeamName, summary, onComplete }: OffenseHalfOverlayProps) {
  const completeRef = useRef(onComplete);
  useEffect(() => {
    completeRef.current = onComplete;
  });

  useEffect(() => {
    const id = window.setTimeout(() => completeRef.current(), TOTAL_MS);
    return () => window.clearTimeout(id);
  }, []);

  const rows = pickRows(summary.paLog);
  const n = summary.paLog.length;
  const interval = n < 3 ? 0.8 : n >= 6 ? 0.45 : 0.6;
  const hidden = n - rows.length;
  const deltaPct = summary.deltaWe * 100;
  const label = `${inning}회${half === "top" ? "초" : "말"} · ${myTeamName} 공격`;

  return (
    <div
      className="offense-overlay"
      role="status"
      aria-live="polite"
      aria-label={label}
      onClick={() => completeRef.current()}
    >
      <div className="offense-head text-center">
        <div style={{ fontSize: 16, color: "#b9b9bf" }}>{label}</div>
        <div style={{ fontSize: 12, color: "#77777c", marginTop: 4 }}>진행 중...</div>
      </div>

      <div className="flex w-full max-w-[320px] flex-col gap-2">
        {rows.map((row, i) => (
          <div
            key={i}
            className="offense-item flex items-baseline justify-between"
            style={{ animationDelay: `${0.5 + i * interval}s` }}
          >
            <span style={{ fontSize: 14, color: "#fff" }}>{row.batter}</span>
            <span
              style={{ fontSize: 14, color: outcomeTone(row.outcome) === "bad" ? "#ff5a5a" : "#4ade80" }}
            >
              {row.outcomeLabel}
            </span>
          </div>
        ))}
        {hidden > 0 && <div style={{ fontSize: 11, color: "#77777c", textAlign: "right" }}>외 {hidden}타석</div>}
      </div>

      <div className="offense-summary text-center">
        {summary.runs > 0 ? (
          <div
            style={{
              fontFamily: '"Black Han Sans", "Pretendard Variable", Pretendard, sans-serif',
              fontWeight: 400,
              fontSize: 40,
              color: "#fff",
              lineHeight: 1.1,
            }}
          >
            {summary.runs}득점
          </div>
        ) : (
          <div style={{ fontSize: 24, color: "#9b9ba0" }}>득점 없음</div>
        )}
        <div style={{ fontSize: 12, color: "#b9b9bf", marginTop: 6 }}>
          승률 {deltaPct >= 0 ? "+" : "-"}
          {Math.abs(deltaPct).toFixed(1)}%p
        </div>
      </div>

      <div style={{ position: "absolute", right: 16, bottom: 12, fontSize: 11, color: "#5d5d62" }}>
        클릭하여 건너뛰기
      </div>
    </div>
  );
}
