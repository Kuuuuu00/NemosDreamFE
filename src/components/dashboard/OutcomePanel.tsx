import { AnimatePresence, motion } from "framer-motion";
import { OutcomeEffect } from "@/components/game/OutcomeEffect";
import { Card } from "@/components/ui/card";
import { outcomeTone } from "@/lib/outcomeDisplay";
import type { ActualDecision, PAResult } from "@/types/api";

export function OutcomePanel({
  result,
  simulating,
  paIndex,
  actualDecision = null,
  onEffectComplete,
}: {
  result: PAResult | null;
  simulating: boolean;
  paIndex: number;
  /** The real manager's choice for this PA — revealed only after the user decided; null hides it. */
  actualDecision?: ActualDecision | null;
  /** Fired when the result effect for `paIndex` has finished playing. */
  onEffectComplete?: (paIndex: number) => void;
}) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="relative flex min-h-[220px] flex-col items-center justify-center overflow-hidden p-[34px_24px_26px]">
        <AnimatePresence mode="wait">
          {simulating ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-3"
            >
              <span className="h-2.5 w-2.5 animate-om-pulse rounded-full bg-muted-foreground" />
              <span className="text-sm text-muted-foreground">타석 진행 중...</span>
            </motion.div>
          ) : (
            <motion.div key="result" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full">
              <OutcomeEffect
                key={paIndex}
                outcome={result?.outcome ?? null}
                description={result?.description ?? ""}
                runsScored={result?.runsScored ?? 0}
                paIndex={paIndex}
                onComplete={onEffectComplete}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {result && !simulating && (
        <div className="flex flex-col gap-1 p-[10px_16px] text-xs text-muted-foreground">
          {/* TODO(backend): REPORT #15 확인 전까지 actual 타석 probs 숨김 (probability도 같은 placeholder 의심) */}
          {result.source !== "actual" && (
            <div>
              이 결과가 나올 확률은{" "}
              <span
                className="font-medium"
                style={{ color: outcomeTone(result.outcome) === "good" ? "var(--primary)" : "var(--destructive)" }}
              >
                {(result.probability * 100).toFixed(1)}%
              </span>
              였습니다
            </div>
          )}
          {actualDecision && (
            <div>
              실제 감독 선택: {actualDecision.name} ({actualDecision.wasChange ? "교체" : "유지"})
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
