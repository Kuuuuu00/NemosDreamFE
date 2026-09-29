import { AnimatePresence, motion } from "framer-motion";
import { OutcomeEffect } from "@/components/game/OutcomeEffect";
import { Card } from "@/components/ui/card";
import { outcomeTone } from "@/lib/outcomeDisplay";
import type { PAResult } from "@/types/api";

export function OutcomePanel({
  result,
  simulating,
  paIndex,
}: {
  result: PAResult | null;
  simulating: boolean;
  paIndex: number;
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
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {result && !simulating && (
        <div className="p-[10px_16px] text-xs text-muted-foreground">
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
    </Card>
  );
}
