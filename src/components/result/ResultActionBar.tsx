import { Button } from "@/components/ui/button";

interface ResultActionBarProps {
  onNewGame: () => void;
  onRepeat: () => void;
  repeatLabel: string;
  repeatLoading: boolean;
}

/** Deliberately a plain block, not wrapped in a sticky/floating container —
 * matches the same de-floating done for /game's ActionBar; sits at the
 * bottom of normal document flow. */
export function ResultActionBar({ onNewGame, onRepeat, repeatLabel, repeatLoading }: ResultActionBarProps) {
  return (
    <div className="mt-0.5 flex flex-wrap items-center justify-between gap-5 border-t border-border pt-3">
      <span className="text-[11px] text-muted-foreground">단일 경기는 운의 영향이 큽니다. 결정의 품질은 반복 분포로 판단하세요.</span>
      <div className="flex flex-wrap items-center gap-2.5">
        <Button variant="muted" size="lg" onClick={onNewGame}>
          새 경기
        </Button>
        <Button variant="primary" size="lg" className="min-w-[196px]" onClick={onRepeat} disabled={repeatLoading}>
          {repeatLoading ? "계산 중..." : repeatLabel}
        </Button>
      </div>
    </div>
  );
}
