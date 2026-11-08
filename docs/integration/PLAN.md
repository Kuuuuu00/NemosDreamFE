# 실서버 연동 계획 (PLAN)

우선순위: **실측 샘플(`samples/`) > 연동 명세 > `api-docs.json`**. 조사 결과: `A-types-diff.md`, `B-dataflow.md`, `C-live-findings.md`, `D-screens.md`.
상태: **승인됨 (§8 반영)**

---

## 0. 결정 사항

| 주제 | 결정 |
| --- | --- |
| 키 변환 | **엔드포인트별 명시 어댑터** (`src/api/adapters/*`). 범용 변환기·재귀 camelCase 금지. `R/H/E/B`, `L/R`, `probs`, `histogram` 하위 키는 건드리지 않음 |
| CORS | **Vite proxy** (`/api`, `/health`, `/static`). 실측: `localhost:5173`만 200, `172.25.20.15:5173`은 preflight 403. 프록시는 브라우저의 `Origin` 헤더를 제거해 전달(아래 3-1). 배포 도메인은 백엔드 요청 |
| 목업 | **유지** (`VITE_USE_MOCK`). 훅 위에 단일 seam `src/api/index.ts` |
| `/game` 새로고침 | **sessionStorage 복원** (`TODO(backend)`: `GET /sessions/{id}`) |
| 결정 비교 테이블 | **교체 행(`is_change`)만 기본 + "전체 타석 보기" 토글** |
| 에러 UI | **인라인 배너 + 재시도 버튼** |
| 커밋 | **단계별 커밋** |
| UsedPitchersChips | `recommend` 후보 중 `availability === 'used'` (+ `unavailable_reason`) |
| UsageTimelineCard | **클라이언트 기록 없이** `GET /result`의 `pitcher_usage`로 대체. 경기 중 `simulate-pa`·`advance-half`·`undo` 후 `we-trace`와 함께 재조회. `actual_pitcher_usage`가 있으면 실제 감독 운용과 비교 표시. 범위 "세션 시작 이후" 표기 |
| 이닝 버튼 | 시작 점수·LI 색 제거. `available_innings ∩ 5~9`만 활성, `high_leverage_innings`는 강조만 |
| 반복 시뮬레이션 | `probSameAsActual` 대신 `better_than_actual_rate` |
| 결과 타입 | `myWin: boolean \| null` → `result: 'win' \| 'loss' \| 'tie' \| 'in_progress'` |
| 로그·LI 시리즈 | **같은 히스토리 훅**(`useGameHistory`)에서 undo 스택 공유 |

## 1. 가정 (이견 있으면 승인 때 알려주세요)

1. `useGameSession.ts`는 대시보드 전용 상태 기계이므로 **대시보드 에이전트 소유**, `useSessionResult.ts`는 **결과 에이전트 소유**로 본다. 요구하신 "공용 훅은 메인만"의 공용 훅은 `useTeams`, `useGames`, `useConfig`, `useInningOptions`(삭제)로 해석한다.
2. 결과 타입 변경(`myWin` → `result`)은 빌드 단계 통과를 위해 3-1에서 `result`를 추가하고 `myWin`을 `@deprecated` 파생값으로 잠시 남기며, 3-2 결과 에이전트가 소비처를 바꾼 뒤 메인이 **제거**한다.
3. mock 모드에서도 실서버와 같은 흐름(`simulate-pa` → `my_role: offense` → `advance-half`)이 되도록 `src/api/mockAdapter.ts` 얇은 shim을 둔다. `src/mocks/engine.ts`·`session.ts`는 수정하지 않는다. API 모드에서는 mocks를 호출하지 않는다.

## 2. 백엔드 요청 목록 (우회 구현 + `// TODO(backend):`)

서버에 필드가 생기면 **그 필드를 우선 쓰고** 없을 때만 우회를 탄다(`raw.x ?? fallback`).

| # | 요청 | 우회 구현 (반영 전) | 코드 위치 |
| --- | --- | --- | --- |
| B1 | `GameState.home_team` / `away_team` | `GET /games` 응답에서 `home`/`away`를 세션 생성 시 저장(`SessionContext` + sessionStorage). 어댑터가 state에 주입 | `src/api/adapters/state.ts`, `src/context/SessionContext.tsx` |
| B2 | `DecisionRow.out_count` / `base_state` | "상황" 열은 **이닝·초말만** 표시 | `components/result/DecisionComparison`, `DecisionLog` |
| B3 | `pa_log[].runs_scored` / `delta_we` | `delta_we` = `summary.we_trace[i+1] − we_trace[i]` (실측: 길이 = 타석 수+1, `my_team` 관점, `[0]` = 공격 시작 WE, 마지막 = 반환 state WE). `runs_scored`는 복원 불가 → **반이닝 합계 `summary.runs`만** 표시 | `src/api/adapters/advanceHalf.ts` |
| B4 | `GET /sessions/{id}` | sessionStorage에 마지막 state + params 저장 후 복원. 만료 시 `SESSION_EXPIRED` → 온보딩 | `src/api/sessionStore.ts`, `useGameSession` |
| B5 | 배포 도메인 CORS 허용 | dev는 Vite proxy. 배포 문제는 백엔드 | `vite.config.ts` |

추가로 발견되어 REPORT에 넣을 제안(우회 불필요, 삭제 가능): OpenAPI `Score` 스키마 이름 충돌 정정(`/result` `score`는 `{my,opp}`), `/result` `pitcher_usage`의 세션 이전 구간, `bullpen_used.total`(10) vs `bullpen_summary.total`(8) 모수, `INVALID_ROLE` message 분리, `quality_percentile` null 규칙, 모델 순위 null 해소 일정, `Side.result`의 `loss`/`tie` 값 확인, `@Schema(nullable)` 표기.

## 3. 구현 단계

공통 게이트: 단계마다 `npx tsc -b` → `npm run lint` → `npm run build` 통과 후 다음 단계. 디자인(레이아웃·색·폰트 크기)은 변경 금지(예외: LI 차트 B안의 선 끊김·툴팁). 폰트 크기는 모든 브레이크포인트에서 고정, 반응형 규칙 유지.

### 3-0. 정리 커밋 (연동과 무관한 기존 변경 분리)
- 대상: 엠블럼(`StepCard`, `OnboardingPage`), `vite.config.ts` host, 요구사항 명세 파일명 변경, `docs/` 신규 파일(연동 명세, api-docs, integration 조사 문서).
- 완료 기준: 커밋 1건. 검증: `git status` 깨끗.

### 3-1. 기반 (메인)
| 항목 | 파일 | 내용 |
| --- | --- | --- |
| 클라이언트 | `src/api/client.ts` | `fetch` 래퍼, `VITE_API_BASE`, JSON 파싱, **에러 정규화**(§0-2, `NETWORK_ERROR`/`recoverable:true`), 타임아웃 기본 10s / repeat 30s, `res.ok` 판정(201 포함), `/health`는 평문(`res.ok`만) |
| 프록시 | `vite.config.ts` | `server.proxy`: `/api`, `/health`, `/static` → `https://nemosdream.cloud`, `changeOrigin`, **`Origin` 헤더 제거**(브라우저 Origin을 그대로 전달하면 서버가 403). `.env.development`: `VITE_API_BASE=`(빈 값) , `VITE_USE_MOCK=false`. `.env.example`, `vite-env.d.ts` |
| 타입 | `src/types/api.ts` | nullable 정정(A 문서 표), `ApiError` 코드 전체(`GAME_NOT_FOUND`, `INVALID_REQUEST`, `INTERNAL_ERROR`, `NETWORK_ERROR` 추가), `SimulationResult.result` 추가 |
| 어댑터 | `src/api/adapters/*.ts` | 엔드포인트별 명시 매핑: teams, games, state(`pitcherId` string/number, `season.era` 등 평탄화, `homeTeam/awayTeam` 주입 B1), recommend(`candidates[].pitcher` 언랩, used 후보 null 점수), pa, advanceHalf(B3), weTrace, result(`{my,opp}` → `mine/opp`, `{home,away}`로 와도 방어, `result` enum, from/to 평탄화, agreement→modelComparison), repeat(histogram 맵 → 0~max 채운 배열), config |
| 엔드포인트 | `src/api/endpoints.ts`, `src/api/index.ts`, `src/api/mockAdapter.ts` | 12개 함수. 훅은 `@/api`만 import. `VITE_USE_MOCK`으로 mock/real 선택 |
| 설정 | `src/hooks/useConfig.ts`, `ConfigContext` | 기동 시 1회 + 모듈 캐시. 하드코딩 레버리지 밴드를 `config.leverage.bands`로 교체. `provisional` 배지 |
| 저장소 | `src/api/sessionStore.ts` | sessionId 키 sessionStorage 저장/복원/폐기(B4, 히스토리 훅 공용) |

- 완료 기준: mock 모드에서 기존 온보딩→대시보드→결과 흐름 유지(빌드 통과), real 모드에서 엔드포인트 12개가 어댑터를 거쳐 타입에 맞게 반환.
- 검증: 3 게이트 + 프록시 확인(`curl -H 'Origin: http://172.25.20.15:5173' http://localhost:5173/api/v1/teams` → 200) + `npx tsx scripts/smoke-api.ts`(일회성 실행, 의존성 추가 없음)로 샘플과 어댑터 출력 대조.

### 3-2. 화면 연동 (서브에이전트 3개 병렬, 파일 소유권 분리)
서브에이전트는 `src/types`, `src/api`, `src/context`, 공용 훅(`useTeams`, `useGames`, `useConfig`)을 직접 수정하지 않고 **필요한 변경을 보고**한다. 메인이 모아 반영.

| 에이전트 | 명세 절 | 수정 가능 범위 | 작업 |
| --- | --- | --- | --- |
| 온보딩 | §1-1, §3-3, §3-4, §3-5 | `pages/OnboardingPage`, `components/onboarding/*` | 팀 그리드(`logo_url` null → 로컬 엠블럼), 경기 목록(날짜 `YYYY-MM-DD` 월 필터 수정, 홈 여부 저장 B1), 이닝 버튼(`available_innings ∩ 5~9`, `high_leverage_innings` 강조만, 점수·LI·tone 제거), 세션 생성 후 params + home/away 저장 |
| 대시보드 | §3-6~§3-10-1, §0-2 | `pages/GameDashboardPage`, `components/dashboard/*`, `components/game/*`, `hooks/useGameSession.ts`, 신규 `hooks/useGameHistory.ts` | `my_role` 분기(defense: recommend / offense: advance-half, 오버레이 2초 `Promise.all`), 후보 목록(used 하단 회색 그룹, 점수 null 바 없음, `model_score` min-max, `%p` 표기 제거, `quality_percentile`·`vs_batter_hand` null 안전), `this_outing`, UsedPitchersChips/UsageTimelineCard(위 결정), 승률 곡선, **LI 차트 B안**(수비 state만 기록, 반이닝마다 선 끊김 `connectNulls={false}`, 밴드 기준선, 툴팁 "7회말 2번째 타석 · LI 2.41 (고)"), 로그+LI 시리즈 **공유 undo 스택**(undo 시 선택 초기화·로그 pop), 공격 직후 undo → offense 상태로 `advance-half` 대기, sessionStorage 복원 |
| 결과 | §3-11, §3-12 | `pages/ResultPage`, `components/result/*`, `hooks/useSessionResult.ts` | `ResultPage`의 직접 `api.getWeTrace` 호출을 훅으로 이동, `result` enum 소비(`in_progress` → "경기 진행 중 기준"), null 처리(`model_top`, `model_rank`, `*_in_top3` → `—`, 요약 문구는 `same_as_actual` 기반), 결정 테이블 교체 행 기본 + 전체 보기 토글(B2: 상황 열은 이닝·초말만), 반복 시뮬레이션(`better_than_actual_rate`, `actual.runs_allowed` 기준선, 스피너·에러 배너) |

- 합류: 메인이 `myWin` 제거 + 보고된 타입/어댑터 변경 반영 → 3 게이트.
- 완료 기준: mock·real 양 모드 빌드 통과, 에이전트 소유 범위 밖 파일 변경 없음(`git diff --stat`로 확인).

### 3-3. 에러 처리 (메인 + 대시보드 연결)
- `components/common/ErrorBanner.tsx`(인라인 배너 + 재시도) 신설.
- `SESSION_EXPIRED`: sessionStorage 폐기 → 안내 후 `/` 복귀. `recoverable: true`(`MODEL_UNAVAILABLE`, `INTERNAL_ERROR`, `NETWORK_ERROR`): 배너 + 재시도. `NO_AVAILABLE_PITCHER`: 후보 영역 비우고 "현재 투수 유지"만. `INVALID_ROLE`: 서버 message 노출 금지, code 기준 문구, 저장된 state 기준 재동기화. `INVALID_REQUEST`/`CANNOT_UNDO`: 콘솔 로깅 + 일반 안내/버튼 비활성.
- 검증: 3 게이트 + 잘못된 sessionId로 `SESSION_EXPIRED` 경로, 서버 중단(프록시 대상 변경)으로 `NETWORK_ERROR` 경로.

## 4. 검증 (구현 과정을 모르는 서브에이전트 3개 병렬)
- **V1 실서버 플레이스루** (Playwright, WSL IP 접속 환경 = Vite proxy 경유): 5회부터 끝까지, **홈 경기·원정 경기 각 1회**(결과 점수 변환), **9회 시작 1회**(LI 차트 B안 한계 판단). `§4-1` 체크리스트 항목별 판정. 스크린샷 `docs/integration/screens/`.
- **V2 규칙 감사** (읽기 전용): 컴포넌트의 `src/mocks`·`src/api` 직접 import, API 모드 `engine.ts` 호출, GameState 부분 갱신, `probs`/`histogram`/`R/H/E/B`/`L/R` 키 변환, §2 nullable 무검사 사용, `INVALID_ROLE` message 노출 — 위반은 파일·줄 번호.
- **V3 목업 회귀**: `VITE_USE_MOCK=true`에서 기존 흐름 확인.
- 실패 항목은 고치고 **고친 항목만 재검증**.

## 5. 마무리
- 연동 명세 §5 `[확인 필요]`를 실측값으로 교체, §7에 신규 차이 추가(1차분은 이미 반영: #1, #14~#22).
- `REPORT.md`: 완료/남은 이슈/백엔드 요청(전달 가능한 형태). LI 차트 B안 판단 기준 3가지에 대한 V1 기반 의견만 기재(C안 전환은 사용자 결정).
- CLAUDE.md의 옛 요구사항 명세 파일명 참조 정리 여부는 승인 시 확인.

## 6. 커밋 계획
`3-0 정리` → `3-1 기반` → `3-2 화면 연동` → `3-3 에러 처리` → `4단계 수정(있을 때)` → `5 문서`. 메시지 형식은 기존 이력(`feat : …`)을 따른다.

## 7. 미해결/주의
- HH 홈 경기(수비가 초)와 8~9회 시작은 미관찰 → V1에서 확인.
- 샘플 경기는 개막 시리즈라 시즌 누적이 null인 필드가 많음 → null 안전 처리를 기본으로.
- `/result` 응답 `Side.result`의 `loss`/`tie` 미관찰 → 어댑터는 알 수 없는 값을 `in_progress`가 아니라 원문 보존 + 경고 처리.
- 실서버 쓰기는 시뮬레이션 세션 생성·진행으로 한정.

---

## 8. 승인 시 반영 사항 (계획 승인됨)

**3-1 추가**
- 액션 잠금: `simulate-pa`·`advance-half`·`undo`·`repeat` 진행 중 해당 버튼 비활성. 훅이 `inFlight`를 노출하고, 응답 전 재호출은 무시(가드).
- 응답 순서 보장: `we-trace`·`result`(타임라인용) 재조회는 요청 순번(또는 `AbortController`)으로 이전 요청을 무효화. 늦게 온 응답이 최신 state를 덮지 않음.
- `pitcherId`는 프론트에서 string 유지. number 변환은 `endpoints.ts`의 `simulatePa` **한 곳**에서만. smoke 스크립트로 확인.
- `.env.production`: `VITE_API_BASE=https://nemosdream.cloud` (배포 CORS 요청과 짝).
- `useGameHistory` 인터페이스(타입·함수 시그니처)를 3-1에서 메인이 먼저 정의 → 대시보드 에이전트가 구현.

**3-2 대시보드 추가**
- `actual_decision`: 사용자 결정 직후 공개, null이면 숨김.
- `bullpen_source === 'estimated'` → "추정 명단" 배지. `source`는 개발 모드 배지.
- 현재 투수 유지 시 현재 투수 `pitcher_id` 전송.
- 승률 곡선: 분기 전 `simulated` 빈 배열 정상 처리, 분기 후 `simulated` 첫 점을 분기 직전 `actual` 값과 연결.
- `source === 'actual'` 타석은 확률 막대 숨김 (`TODO(backend)`: REPORT #15 확인 전까지).

**가정 3(mock shim) 제한**: 공격 시작 상태를 만들기 위해 진행 규칙을 새로 구현해야 할 만큼 복잡해지면 **멈추고 보고**. mock은 발표용 보험이므로 완벽한 흐름 일치보다 "끝까지 돌아가는 것"이 우선.

**REPORT**: #2 우선순위 중(근거: 명세 v0.3 결정 비교 표 "상황" 열과 다름), #4 중으로 하향. 백엔드가 볼 수 없는 내부 문서 참조는 근거 문장 또는 "첨부: samples/xxx.json"으로 표기(반영 완료).

**5 마무리 추가**: CLAUDE.md의 옛 요구사항 명세 파일명 참조 정리(승인됨).
