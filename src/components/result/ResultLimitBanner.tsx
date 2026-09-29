import { Card } from "@/components/ui/card";

export function ResultLimitBanner() {
  return (
    <Card className="flex items-center gap-3 p-[12px_18px]">
      <span className="w-[3px] self-stretch rounded-sm" style={{ background: "var(--chart-5)" }} />
      <span className="text-xs leading-relaxed text-muted-foreground">
        타석 결과는 확률 분포에서 한 번 샘플링된 값입니다. 같은 결정을 해도 다른 결과가 나올 수 있어 단일 경기 결과는
        표본이 작습니다. 아래 반복 시뮬레이션으로 분포를 확인하세요.
      </span>
    </Card>
  );
}
