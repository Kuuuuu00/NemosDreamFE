import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { MATCHUP_LABEL } from "@/lib/handMatchup";
import { cn } from "@/lib/utils";
import type { ReliefCandidate } from "@/types/recommendation";

interface ReliefRankingListProps {
  /** Ascending by modelRank — rendered in exactly this order. */
  candidates: ReliefCandidate[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  totalCount: number;
  estimated: boolean;
}

const HAND: Record<string, string> = { L: "좌투", R: "우투", U: "언더" };
const DASH = "—";

function supportLine(c: ReliefCandidate): string {
  const era = c.era !== undefined ? `ERA ${c.era.toFixed(2)}` : `ERA ${DASH}`;
  const quality =
    c.qualityPercentile !== undefined ? `quality 상위 ${Math.max(1, 100 - c.qualityPercentile)}%` : `quality ${DASH}`;
  const matchup = c.matchupVsBatter ? `매치업 ${MATCHUP_LABEL[c.matchupVsBatter]}` : `매치업 ${DASH}`;
  const hasFatigue = c.consecutiveDays !== undefined || c.pitchesLast3d !== undefined;
  const fatigue = hasFatigue
    ? `연투 ${c.consecutiveDays ?? DASH}일, 최근 3일 ${c.pitchesLast3d ?? DASH}구`
    : `피로 ${DASH}`;
  return [era, quality, matchup, fatigue].join(" · ");
}

function scoreTooltip(score: number): string {
  const pct = score * 100;
  return `예상 성과: 타석당 ${pct >= 0 ? "+" : "-"}${Math.abs(pct).toFixed(2)}%p (과거 데이터 기반 추정)`;
}

export function ReliefRankingList({ candidates, selectedId, onSelect, totalCount, estimated }: ReliefRankingListProps) {
  const scores = candidates.map((c) => c.modelScore);
  const top = Math.max(...scores);
  const min = Math.min(...scores);

  return (
    <Card className="p-[16px_18px_18px]">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="flex flex-wrap items-center gap-2 text-[13px]">
          교체 시 추천 순위
          <span className="text-[11px] text-muted-foreground">모델 적합도순</span>
          {estimated && (
            <span className="whitespace-nowrap rounded border border-chart-5 px-1.5 py-0.5 text-[10px] text-chart-5">
              추정 명단
            </span>
          )}
        </span>
        <span className="whitespace-nowrap text-[11px] text-muted-foreground">
          {candidates.length} / {totalCount}
        </span>
      </div>
      <p className="mb-3 text-[11px] leading-[1.5] text-muted-foreground">
        모델은 교체 시 투입할 투수를 추천합니다. 교체 시점 판단은 포함하지 않습니다.
      </p>

      {estimated && (
        <div className="mb-3 rounded-md bg-muted p-[9px_11px] text-[11px] leading-[1.5] text-chart-5">
          등록 정보 미확정 구간입니다. 아래 명단과 quality는 최근 등판 기록으로 추정한 값이며 실제와 다를 수 있습니다.
        </div>
      )}

      {candidates.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-md bg-muted p-[30px_16px] text-center">
          <span className="text-sm">가용 불펜 0명</span>
          <span className="text-[11px] leading-[1.6] text-muted-foreground">
            등판 가능한 투수가 없습니다. 이 타석은 교체 없이 진행됩니다.
          </span>
        </div>
      ) : (
        <div className="om-scroll pb-0.5">
          <div role="listbox" aria-label="교체 시 추천 순위" className="flex min-w-[330px] flex-col gap-1.5">
            {candidates.map((c) => {
              const isTop = c.modelRank === 1;
              const selected = selectedId === c.pitcherId;
              const pct = top === min ? 100 : ((c.modelScore - min) / (top - min)) * 100;
              const gap = (top - c.modelScore) * 100;
              return (
                <motion.div
                  key={c.pitcherId}
                  layout
                  transition={{ duration: 0.38, ease: [0.4, 0, 0.2, 1] }}
                  role="option"
                  aria-selected={selected}
                  tabIndex={0}
                  title={scoreTooltip(c.modelScore)}
                  onClick={() => onSelect(c.pitcherId)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelect(c.pitcherId);
                    }
                  }}
                  className={cn(
                    "relative grid min-h-[56px] cursor-pointer grid-cols-[30px_1fr_auto] items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    selected && "bg-muted ring-1 ring-inset ring-foreground",
                  )}
                >
                  <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-muted text-[12px] text-foreground">
                    {c.modelRank}
                  </span>
                  <span className="flex min-w-0 flex-col gap-[3px]">
                    <span className="flex min-w-0 items-center gap-1.5 whitespace-nowrap text-sm">
                      <span className="truncate">{c.name}</span>
                      <span className="text-[11px] text-muted-foreground">{c.throws ? HAND[c.throws] : DASH}</span>
                      {isTop && (
                        <span className="rounded border border-primary px-1.5 py-px text-[10px] text-primary">모델 추천</span>
                      )}
                      {selected && <span className="text-[11px] text-foreground">· 모델 {c.modelRank}위</span>}
                    </span>
                    <span className="text-[11px] leading-[1.4] text-muted-foreground">
                      {supportLine(c)}
                    </span>
                  </span>
                  <span className="flex w-[116px] shrink-0 flex-col items-end gap-[5px]">
                    <span className="whitespace-nowrap text-[11px] text-muted-foreground">
                      {isTop ? "모델 1위" : `1위 대비 −${gap.toFixed(2)}%p`}
                    </span>
                    <span className="h-1.5 w-full rounded-full bg-muted">
                      <span
                        className={cn("block h-1.5 rounded-full transition-[width] duration-[380ms]", isTop ? "bg-primary" : "bg-bar")}
                        style={{ width: `${Math.max(4, pct)}%` }}
                      />
                    </span>
                  </span>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}
