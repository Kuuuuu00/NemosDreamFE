import { memo, type CSSProperties } from "react";
import type { PAOutcomeCode } from "@/types/api";

interface OutcomeEffectProps {
  outcome: PAOutcomeCode | null;
  description: string;
  runsScored: number;
  paIndex: number;
}

type OutcomeTone = "red" | "green";

/** Result → label/tone/size mapping (§요구사항 2). Sizes are intentionally
 * distinct per code — they're sized to each label's glyph count, not a
 * fixed scale — so don't collapse them to a shared constant. */
/** `textClass`/`glowClass` are written out per-tone (not built with
 * `outcome-text--${tone}`) because Tailwind's content scanner only keeps
 * `@layer` selectors it can find as a literal substring in the source —
 * a template-literal class name is invisible to it and gets purged from
 * the production build even though it works in dev. */
const TONE_CLASSES: Record<OutcomeTone, { text: string; glow: string; stack: string }> = {
  red: { text: "outcome-text--red", glow: "outcome-glow outcome-glow--red", stack: "outcome-stack" },
  green: { text: "outcome-text--green", glow: "outcome-glow outcome-glow--green", stack: "outcome-stack outcome-stack--green" },
};

const OUTCOME_META: Record<PAOutcomeCode, { label: string; tone: OutcomeTone; sizeRem: number }> = {
  HR: { label: "HOMERUN", tone: "red", sizeRem: 4.2 },
  "3B": { label: "3루타", tone: "red", sizeRem: 3.6 },
  "2B": { label: "2루타", tone: "red", sizeRem: 3.6 },
  "1B": { label: "안타", tone: "red", sizeRem: 3.6 },
  BB: { label: "볼넷", tone: "red", sizeRem: 3.0 },
  SO: { label: "STRIKE OUT", tone: "green", sizeRem: 3.6 },
  GDP: { label: "병살타", tone: "green", sizeRem: 3.4 },
  GO: { label: "땅볼 아웃", tone: "green", sizeRem: 3.2 },
  FO: { label: "플라이 아웃", tone: "green", sizeRem: 3.2 },
};

function outcomeFontSize(sizeRem: number): string {
  const minRem = Math.max(1.6, +(sizeRem * 0.55).toFixed(2));
  const preferredVw = +(sizeRem * 2.2).toFixed(2);
  return `clamp(${minRem}rem, ${preferredVw}vw, ${sizeRem}rem)`;
}

function OutcomeEffectImpl({ outcome, description, runsScored, paIndex }: OutcomeEffectProps) {
  if (!outcome) {
    return (
      <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 text-center">
        <span className="text-sm text-muted-foreground">투수를 선택하고 진행하면 결과가 여기 표시됩니다</span>
      </div>
    );
  }

  const meta = OUTCOME_META[outcome];
  const classes = TONE_CLASSES[meta.tone];

  return (
    <div key={paIndex} className="flex min-h-[220px] flex-col items-center justify-center gap-2.5 py-6">
      <div className={classes.stack} style={{ "--outcome-font-size": outcomeFontSize(meta.sizeRem) } as CSSProperties}>
        <span className={classes.text}>{meta.label}</span>
        <span aria-hidden="true" className={classes.glow}>
          {meta.label}
        </span>
      </div>
      <div className="outcome-detail text-center text-[15px]">{description}</div>
      {runsScored > 0 && <div className="outcome-detail text-xs text-muted-foreground">{runsScored}점 실점</div>}
    </div>
  );
}

/** Re-renders only when the outcome itself changes — everything else the
 * dashboard re-renders on (bullpen list, current pitcher, selection) must not
 * touch this component, or the neon entrance would replay on every slider
 * drag (§요구사항 "재생 트리거 조건"). */
function areEqual(prev: OutcomeEffectProps, next: OutcomeEffectProps): boolean {
  return prev.outcome === next.outcome && prev.paIndex === next.paIndex;
}

export const OutcomeEffect = memo(OutcomeEffectImpl, areEqual);
