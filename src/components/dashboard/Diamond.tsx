import { cn } from "@/lib/utils";
import type { BaseState } from "@/types/api";

interface DiamondProps {
  baseState: BaseState;
  outCount: number;
  caption: string;
}

const HOME = { x: 150, y: 182 };
const FIRST = { x: 214, y: 118 };
const SECOND = { x: 150, y: 54 };
const THIRD = { x: 86, y: 118 };

function BaseMark({ cx, cy, occupied }: { cx: number; cy: number; occupied: boolean }) {
  const size = 14;
  return (
    <rect
      x={cx - size / 2}
      y={cy - size / 2}
      width={size}
      height={size}
      transform={`rotate(45 ${cx} ${cy})`}
      className={occupied ? "fill-destructive" : "fill-muted"}
    />
  );
}

export function Diamond({ baseState, outCount, caption }: DiamondProps) {
  const on1 = baseState.includes("1");
  const on2 = baseState.includes("2");
  const on3 = baseState.includes("3");

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative w-full max-w-[300px]" style={{ minWidth: 200 }}>
        <div className="absolute right-0 top-0.5 flex items-center gap-1.5">
          <span className="mr-0.5 text-[10px] text-muted-foreground">OUT</span>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={cn("h-2 w-2 rounded-full", i < outCount ? "bg-foreground" : "bg-muted")}
            />
          ))}
        </div>
        <svg viewBox="0 0 300 218" preserveAspectRatio="xMidYMid meet" className="block h-auto w-full">
          <polygon
            points={`${HOME.x},${HOME.y} ${FIRST.x},${FIRST.y} ${SECOND.x},${SECOND.y} ${THIRD.x},${THIRD.y}`}
            fill="none"
            className="stroke-border"
            strokeWidth={1.5}
          />
          <BaseMark cx={SECOND.x} cy={SECOND.y} occupied={on2} />
          <BaseMark cx={FIRST.x} cy={FIRST.y} occupied={on1} />
          <BaseMark cx={THIRD.x} cy={THIRD.y} occupied={on3} />
          <BaseMark cx={HOME.x} cy={HOME.y} occupied={false} />
          <text x={68} y={122} fontSize={12} textAnchor="end" className="fill-muted-foreground">
            3루
          </text>
          <text x={150} y={207} fontSize={12} textAnchor="middle" className="fill-muted-foreground">
            홈
          </text>
        </svg>
      </div>
      <div className="text-xs text-muted-foreground">{caption}</div>
    </div>
  );
}
