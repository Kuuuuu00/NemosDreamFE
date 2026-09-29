import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface ActionBarProps {
  canUndo: boolean;
  onUndo: () => void;
  onStay: () => void;
  onSwitch: () => void;
  /** A reliever must be picked before switching (the model's #1 is never auto-picked). */
  canSwitch: boolean;
  /** True while a half-inning transition is playing. */
  locked: boolean;
  simulating: boolean;
}

export function ActionBar({ canUndo, onUndo, onStay, onSwitch, canSwitch, locked, simulating }: ActionBarProps) {
  const busy = locked || simulating;
  return (
    <Card className="p-4">
      {/* flex-wrap + flex-1: buttons share a row when their labels fit and
       * wrap to their own row otherwise; Button's shrink-0 + nowrap keeps
       * labels from ever clipping. */}
      <div className="flex flex-wrap gap-2.5">
        <Button variant="muted" size="lg" disabled={!canUndo || busy} onClick={onUndo} className="flex-1 whitespace-nowrap">
          되돌리기
        </Button>
        <Button variant="muted" size="lg" disabled={busy} onClick={onStay} className="flex-1 whitespace-nowrap">
          {simulating ? "진행 중..." : "현재 투수 유지"}
        </Button>
        <Button variant="primary" size="lg" disabled={!canSwitch || busy} onClick={onSwitch} className="flex-1 whitespace-nowrap">
          선택한 투수 투입
        </Button>
      </div>
    </Card>
  );
}
