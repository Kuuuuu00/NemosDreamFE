import { Card } from "@/components/ui/card";
import { OUTCOME_DISPLAY_ORDER, OUTCOME_LABELS, outcomeTone } from "@/lib/outcomeDisplay";
import type { PAResult } from "@/types/api";

export function ProbabilityDistribution({ result }: { result: PAResult }) {
  const maxProb = Math.max(...OUTCOME_DISPLAY_ORDER.map((code) => result.probs[code]));

  return (
    <Card className="p-[16px_20px_14px]">
      {/* All 9 outcome codes must fit on one row — a fixed column count
       * (e.g. grid-cols-8) silently wraps the 9th item onto a second row,
       * which this fixed-height container then clips. flex-nowrap + flex-1
       * shares the row evenly regardless of count, and min-w-0 lets each
       * column shrink below its label's natural width instead of forcing
       * an overflow. */}
      <div className="flex h-[150px] flex-nowrap items-end gap-1.5 sm:gap-2">
        {OUTCOME_DISPLAY_ORDER.map((code) => {
          const p = result.probs[code];
          const hit = code === result.outcome;
          const accent = outcomeTone(result.outcome) === "good" ? "var(--primary)" : "var(--destructive)";
          // Minimum visible bar height so a small-probability outcome's
          // label never gets crowded out toward the bottom edge.
          const h = Math.max(3, Math.round((p / maxProb) * 104)) + 6;
          return (
            <div key={code} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
              <span className="text-[11px]" style={{ color: hit ? accent : "var(--muted-foreground)" }}>
                {(p * 100).toFixed(1)}
              </span>
              <span
                className="w-full rounded"
                style={{ height: h, background: hit ? accent : "var(--bar)" }}
              />
              <span className="truncate text-[11px]" style={{ color: hit ? accent : "var(--muted-foreground)" }}>
                {OUTCOME_LABELS[code]}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
