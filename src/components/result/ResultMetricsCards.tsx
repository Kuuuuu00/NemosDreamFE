import { Card } from "@/components/ui/card";
import { signed } from "@/lib/resultDisplay";
import type { SimulationResult } from "@/types/api";

interface MetricCardProps {
  label: string;
  value: string;
  note?: string;
  vs: string;
  color?: string;
}

function MetricCard({ label, value, note, vs, color }: MetricCardProps) {
  return (
    <Card className="flex min-h-0 flex-1 flex-col justify-center gap-1.5 p-[15px_18px]">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <div className="flex items-baseline gap-2.5">
        <span className="text-[26px] font-medium leading-none" style={{ color: color ?? "var(--foreground)" }}>
          {value}
        </span>
        {note && <span className="text-xs text-muted-foreground">{note}</span>}
      </div>
      <span className="text-[11px] text-muted-foreground">{vs}</span>
    </Card>
  );
}

export function ResultMetricsCards({ result }: { result: SimulationResult }) {
  const totalDeltaWe = +result.pitcherUsage.reduce((a, p) => a + p.deltaWeSum, 0).toFixed(2);
  const actualDeltaWe = +result.actualPitcherUsage.reduce((a, p) => a + p.deltaWeSum, 0).toFixed(2);

  return (
    <div className="grid grid-cols-2 gap-3 md:flex md:h-full md:flex-col">
      <MetricCard label="투수 교체" value={`${result.pitcherChanges}회`} vs={`실제 감독 ${result.actualPitcherChanges}회`} />
      <MetricCard
        label="총 ΔWE 기여"
        value={signed(totalDeltaWe)}
        note="수비팀 관점"
        vs={`실제 감독 ${signed(actualDeltaWe)}`}
        color={totalDeltaWe < 0 ? "var(--destructive)" : "var(--primary)"}
      />
      <MetricCard
        label="소진한 불펜"
        value={`${result.bullpenUsed} / ${result.bullpenTotal}`}
        vs={`실제 ${result.actualBullpenUsed} / ${result.bullpenTotal}`}
      />
    </div>
  );
}
