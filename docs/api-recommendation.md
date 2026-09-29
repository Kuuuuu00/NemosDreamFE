# 추천 데이터 인터페이스 (Recommendation)

백엔드 담당 공유용. 프론트는 **추천 점수를 계산하지 않는다** — 아래 응답의 값을 그대로 표시만 한다.
타입 정의: `src/types/recommendation.ts` · mock 구현: `src/mocks/recommendation.ts`, `src/mocks/modelScore.ts`

## 배경

추천 순위는 Contextual Bandit이 산출한 "모델 적합도 점수"로만 정한다.
이전의 효용 함수(λ, U, cost_p)는 폐기되었다. LI와 quality는 **참고 정보**로만 표시되며 순위 계산에 쓰이지 않는다.

**모델 범위**: 밴딧은 "교체가 결정된 시점에 가용 불펜 중 누구를 넣을지"만 추천한다.
현재 투수 유지(STAY)는 학습 대상이 아니므로 **현재 투수에는 점수가 없고**, `candidates`에도 포함하지 않는다.
"유지 vs 교체"는 사용자가 판단한다.

## 인터페이스

```ts
interface ReliefCandidate {
  pitcherId: string
  name: string
  throws: 'L' | 'R' | 'U' | null
  modelScore: number          // 밴딧 예상 성과 (타석당 WPA, 투수 관점, 높을수록 좋음). 비율값: 0.0052 = +0.52%p
  modelRank: number           // 1부터
  era?: number
  qualityPercentile?: number  // 0~100, 불펜 quality 백분위 (높을수록 좋음)
  matchupVsBatter?: 'favorable' | 'neutral' | 'unfavorable' | null   // 투수 관점
  // 피로 정보 — 데이터 준비 중. 없으면 UI에서 "—" 표시
  consecutiveDays?: number
  pitchesLast3d?: number
  daysSinceLastApp?: number
}

interface RecommendationResult {
  situationId: string
  leverageIndex: number
  liPercentile: number        // 리그 LI 분포 대비 백분위 (0~100). UI는 "리그 상위 (100-값)%"로 표시
  candidates: ReliefCandidate[]   // modelRank 오름차순
  source: 'precomputed' | 'live' | 'mock'
}

interface RecommendationSource {
  getRecommendations(state: GameState): Promise<RecommendationResult>
}
```

## 소스 구분

| 상황 | 소스 | `source` |
|---|---|---|
| 실제 경기 상태 (`isDiverged = false`) | 사전 계산 점수 (`MockPrecomputedSource`) | `precomputed` |
| 사용자가 분기한 상태 (`isDiverged = true`) | 실시간 점수 (`MockLiveSource`) | `live` |

두 클래스는 분리되어 있으며 `src/mocks/api.ts`의 `getRecommendations(state)`가 `sourceFor(state)`로 고른다.
실제 API로 교체할 때는 이 두 클래스만 HTTP 구현으로 바꾸면 된다. 현재 mock은 둘 다 `source: "mock"`을 반환한다.

## 계약 요구사항

- `candidates`는 **가용 불펜만** 포함한다(현재 투수 제외). 정렬은 `modelRank` 오름차순이며 프론트는 정렬을 바꾸지 않는다.
- `modelRank`는 `modelScore` 내림차순과 일치해야 한다(동점 시 결정적 타이브레이크).
- `modelScore`는 후보 간 **상대 비교**에 쓰인다. 프론트는 후보 집합 내부 min-max로 막대 길이만 정규화하고, 원점수는 툴팁("예상 성과: 타석당 +0.xx%p")으로만 노출한다.
- 선택 옵션 필드(`era`, `qualityPercentile`, 피로 3종, `matchupVsBatter`)가 없으면 UI는 "—"로 표시한다.
- 결과 화면용으로, 세션 결과(`SimulationResult.decisions[]`)는 각 교체 결정 시점의 모델 순위(`modelRanking: {pitcherId, name, modelRank}[]`)를 포함해야 한다. 프론트는 이를 표시만 한다.
- 결정성: 같은 상태 → 같은 결과여야 한다(사전 계산 재현성).

## Mock 데이터 생성 규칙

`src/mocks/modelScore.ts` — 모두 시드 고정, 벽시계·세션 ID 미사용.

- `situationId` = `{gameId}:{inning}{half}:o{outs}:b{bases}:{batterId}`
- 점수 시드 = `{mode}|{situationId}|{pitcherId}` (mode = `precomputed` | `live`)
- `modelScore = 0.002 + 0.010 × qualityP + 0.0035 × noise × (0.6 + min(LI,3)/3)`, noise ∈ [−0.5, 0.5]. 값은 소수 5자리 반올림
- 정렬: 점수 내림차순, 동점이면 pitcherId 오름차순 → `modelRank = 1..N`
- `qualityPercentile = clamp((qualityP − 0.45) / 0.45 × 100, 0, 100)` 반올림
- `matchupVsBatter`: 스위치 타자·언더 투수는 `neutral`, 같은 손이면 `favorable`, 다르면 `unfavorable`
- 피로: 투수별 해시로 약 1/3은 3종 모두 미제공(UI "—" 경로 확인용). 제공 시 `consecutiveDays`/`pitchesLast3d`는 `workload.daysRest`·`appearancesLast7d`에서 파생
- `liPercentile = 100 / (1 + exp(−2.2 · ln LI))` (LI 1.0 ≈ 50)
- 개발 모드(`import.meta.env.DEV`)에서 `source === "mock"`이면 화면 좌하단에 "MOCK" 배지 표시
