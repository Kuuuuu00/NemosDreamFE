# D. 화면별 데이터 출처 · API 전환 영향 (온보딩 / 대시보드 / 결과)

기준: `docs/API_연동명세_nemosdream.md`(이하 "명세", §번호 인용), `CLAUDE.md`, 현재 `src/` 코드.
현재 데이터는 전부 `src/mocks/api.ts`(camelCase)를 거친다. 훅은 `import * as api from "@/mocks/api"`로 직접 호출한다.
표기: **[null]** = null 처리 필요 지점, **[삭제]/[신설]** = 개념 변화, **[위험]** = 위험 요소.

## 0. 전 화면 공통 선행 사항

- 케이스: 현재 `types/api.ts`는 camelCase, 서버는 snake_case(명세 §0-3). 어댑터에서 필드별 명시 매핑 필요. `linescore.totals.{R,H,E,B}`, `vs_batter_hand.{L,R}`, `probs`의 `1B/2B/...`, `histogram`의 숫자 키는 변환 금지. (ScoreHeader가 `totals.R`, ProbabilityDistribution이 `probs[code]`를 이미 이 키로 읽으므로 이쪽은 그대로 유지.)
- 래퍼 구조: `{state}`(sessions/undo), `{result}`(simulate-pa), `{summary,state}`(advance-half), `candidates[].pitcher`(recommend) (명세 §0-1). 현재 mock도 `{state}`, `{result}`는 같음.
- 에러: 현재 `useGameSession`은 `catch { setStatus("error") }` 한 가지뿐, `ResultPage`는 error면 무조건 `/`로 `Navigate`. `SESSION_EXPIRED`/`recoverable`/`NO_AVAILABLE_PITCHER` 분기 없음.
- 호출 구조 차이: 현재 `refreshAll`이 `recommend + getRecommendations + getUsageToday + getUsedTonight + getWeTrace` 5개를 병렬 호출. API에는 `getRecommendations`, `getUsageToday`, `getUsedTonight`에 해당하는 엔드포인트가 없다(아래 대시보드 참조). `my_role==='offense'`일 때는 recommend 호출 금지(INVALID_ROLE).
- **[삭제] `PAResult.offenseHalfSummary`**: 현재 mock은 3아웃 시 simulatePa 안에서 공격 반이닝을 자동 진행해 `offenseHalfSummary`를 함께 준다(`GameDashboardPage.handleCommit`, `useHalfTransition.playHalfEnd`가 이를 사용). API는 simulate-pa가 `next_state.my_role='offense'`만 주고, 별도 `POST /advance-half`를 호출해야 `summary`를 받는다(명세 §3-7, §3-8). 흐름 재구성 필요(대시보드 절 참조).
- `SessionContext`는 `SessionParams`(myTeam, oppTeam, gameId, startInning)만 보관. 명세 §3-11이 요구하는 "home 여부 / sessionStorage 백업"은 현재 없음.

---

## 1. 온보딩 (`src/pages/OnboardingPage.tsx`)

흐름: 내 팀 -> 상대 팀 -> 경기 -> 시작 이닝 -> `setParams` + `/game`. 현재 4단계(상대 팀 단계 포함).

### 1-1. 팀 그리드
- 현재 출처: `hooks/useTeams.ts` -> `api.getTeams()` -> `Team {code, name, logoUrl}`. `components/onboarding/TeamGrid.tsx`가 `t.code`, `t.name`, `TeamEmblem`(로컬 `public/emblem/{code}.png`, 실패 시 이니셜 폴백)으로 렌더. 상대 팀 목록은 `OnboardingPage`의 `opponentTeams = teams.filter(code !== myTeam)`.
- API 대응: `GET /teams` -> `Team[]{code,name,logo_url}`. 필드 1:1 (`logo_url` -> `logoUrl`).
- null: `logo_url`은 null 가능하나 `TeamEmblem`이 이미 코드 기반 로컬 이미지를 쓰므로 영향 없음(명세 §3-3도 로컬 우선 권장).
- 삭제/신설: 없음.
- 위험: `TeamCode` 10개(HH,HT,KT,LG,LT,NC,OB,SK,SS,WO) 외 코드가 오면 `public/emblem` 누락 시 폴백 처리됨(안전). 에러 시 현재 훅에 catch가 없어 팀 목록이 빈 채로 멈춘다(로딩/에러 UI 없음).

### 1-2. 경기 목록
- 현재 출처: `hooks/useGames.ts` -> `api.getGames(myTeam, oppTeam)` -> `GameListItem {gameId, date, away, home, finalScore, availableInnings, highLeverageInnings}`. `components/onboarding/GamePicker.tsx`가 렌더.
- API 대응: `GET /games?team=&opponent=` -> `GameSummary[]`. 필드 이름은 snake_case만 다르고 동일(`game_id`, `final_score`, `available_innings`, `high_leverage_innings`). `opponent`는 선택 파라미터이므로 현재의 "상대 팀 선택" 단계는 그대로 쓰되 `opponent`를 넘기면 됨.
- **[위험] 날짜 포맷 불일치**: mock `date`는 `"2025.04.12"` 형태이고 `GamePicker`의 월 필터가 `+g.date.split(".")[1]`로 파싱한다. API는 `"YYYY-MM-DD"`라서 `split(".")`가 단일 요소 -> `NaN` -> 월 필터가 항상 빈 목록이 됨. 어댑터에서 포맷을 맞추거나 필터를 `split("-")`로 수정해야 한다. `OnboardingPage`의 summary 문자열(`selectedGame.date`)과 `ResultHeader`도 날짜를 그대로 표시하므로 표기가 `2025-09-02`로 바뀜.
- **[위험]** `GamePicker` 문구 "2025 정규시즌 맞대결 N경기"는 `opponent` 미지정 시 의미가 달라짐. 맞대결이면 항상 opponent를 보낼 것. API는 콜드게임 등을 제외하므로 목록 수가 mock과 다를 수 있음.
- **[위험]** `GamePicker`가 마지막 열에 `g.home`만 표시(홈 팀). 내 팀이 홈/원정인지 판정 정보는 `home === myTeam`로 여기서 얻을 수 있으므로 결과 화면 점수 변환(3-1)을 위해 `SessionParams`에 `myTeamIsHome`(또는 `GameSummary` 전체) 저장 필요. 현재 `SessionParams`에 없음.
- null: `GameSummary`에는 nullable 필드 없음. 빈 배열 가능(`available_innings`, `high_leverage_innings`) -> 5~9 교집합이 비면 시작 불가 처리 필요.
- 삭제/신설: `highLeverageInnings`는 현재 `GamePicker`/`InningPicker`에서 쓰이지 않음(`InningOption.liHigh`가 대신 쓰임). 신설 용도: "승부처 바로가기".

### 1-3. 이닝 버튼
- 현재 출처: `hooks/useInningOptions.ts` -> `api.getInningOptions(myTeam, oppTeam, gameId)` -> `InningOption {n, label, myScoreAtStart, oppScoreAtStart, tone("앞섬"|"동점"|"뒤짐"), li, liHigh, played}`. `components/onboarding/InningPicker.tsx`가 5개 카드(`grid-cols-5`)로 렌더, `played=false`면 비활성+"경기 종료", `OnboardingPage` summary는 `"${label} · LI ${li}"`.
- **[삭제] 이 엔드포인트는 API에 없다.** mock 코드 주석도 "spec endpoint on its own가 아님"이라고 인정. `GET /games`는 `available_innings`, `high_leverage_innings`만 준다. 따라서 이닝 카드의 시작 시점 점수(`myScoreAtStart:oppScoreAtStart`), `tone`, `li`, `liHigh`는 API로 얻을 수 없다.
- API로 만들 수 있는 것: 활성 여부 = `available_innings ∩ [5..9]`(`start_inning`은 5~9만 허용, 명세 §3-4). 강조 = `high_leverage_innings`에 포함되는지로 `liHigh` 대체(LI 수치는 없음).
- 결정 필요(3택): (a) 카드에서 점수/tone/LI 줄 제거하고 이닝+승부처 표시만, (b) 백엔드에 per-inning 미리보기 필드 추가 요청, (c) 선택 후 `POST /sessions` 응답 state로 사후 표시. 어느 쪽이든 `InningOption` 타입과 `useInningOptions` 훅은 제거/재정의, `OnboardingPage`의 `selectedInning.li` 사용부(summary) 수정 필요.
- null: `played` 개념을 `!available_innings.includes(n)`로 치환. 이닝 카드가 5개 고정(5~9)이라는 가정은 유지 가능.
- **[위험]** `available_innings`는 "team의 수비 반이닝 기준"이므로 내 팀이 원정이면 초, 홈이면 말 수비. 9회 홈팀 리드 시 9회말 수비가 없어 목록에서 빠질 수 있음 -> 9회 버튼이 비활성인 경기가 존재.

### 1-4. 세션 생성(온보딩 종료 시점)
- 현재 `handleStart`는 `setParams` 후 `/game`으로 이동하고, 대시보드의 `useGameSession`이 `createSession`을 호출한다(온보딩에서 세션을 만들지 않음). API는 `POST /sessions`가 201 + `{state}`이고 `GAME_NOT_FOUND`(404) 시 "경기 선택으로 복귀"(명세 §0-2)가 요구되나, 현재 구조상 에러가 대시보드에서 발생해 복귀 경로가 "온보딩으로 돌아가기" 버튼뿐.
- `mode`는 보내지 않는다. `res.ok`로 판정(201).
- **[위험]** `/game` 새로고침 시 `SessionContext`(메모리)가 날아가 `params`가 null -> `Navigate to "/"`. 서버에 세션 조회 API가 없으므로(명세 §7 #2) 새로고침 복원은 sessionStorage 백업이 필요(state + params + B안 시리즈).

---

## 2. 대시보드 (`src/pages/GameDashboardPage.tsx`, 조립 루트)

### 2-0. 데이터 흐름 변경 요약
| 현재 (mock) | API |
|---|---|
| `createSession(params)` | `POST /sessions {game_id, my_team, start_inning}` (`opponent`는 서버가 모름: `opponent_team`은 응답에 있음) |
| `recommend(id)` -> `RecommendResponse{leverageIndex, leverageBand, liMax, bullpenSummary, bullpenSource, actualDecision}` | `POST /recommend` -> 위 필드 + `li_percentile`, `source`, `current_pitcher{pitcher,this_outing}`, `candidates[]` 포함 |
| `getRecommendations(state)` -> `RecommendationResult{situationId, leverageIndex, liPercentile, candidates, source}` | **[삭제]** 별도 호출 불필요: 같은 `/recommend` 응답에서 파생. `RecommendationSource` 어댑터가 `/recommend` 응답을 camelCase `ReliefCandidate[]`로 매핑 (명세 §0-3 규칙 2) |
| `getUsageToday`, `getUsedTonight` | **[삭제/대체 필요]** 대응 엔드포인트 없음(2-9 참조) |
| `getWeTrace(id)` | `GET /we-trace` (구조 동일, snake_case) |
| `simulatePa` | `POST /simulate-pa {pitcher_id}` -> `{result}` |
| `undoLast` | `POST /undo` -> `{state}` |
| (simulatePa 내부 공격 자동 진행) | `POST /advance-half` 별도 호출 **[신설]** |

- `useGameSession.refreshAll`은 `my_role==='defense'`일 때만 recommend를 부르고, 공격 상태면 advance-half로 분기하도록 재구성 필요. `Status`가 "error" 한 종류뿐이므로 `MODEL_UNAVAILABLE`(503, recoverable)/`NO_AVAILABLE_PITCHER`(409)를 분리 처리해야 함. `NO_AVAILABLE_PITCHER`는 현재 "candidates.length===0"으로 우회 처리(`ReliefRankingList`의 "가용 불펜 0명", `CurrentPitcherCard badgeLabel "유지 강제"`)하는데, API에서는 409 에러로 오므로 이를 candidates=[]로 변환하는 어댑터가 필요.

### 2-1. 헤더 스코어 / 라인스코어 (`ScoreHeader.tsx`)
- 현재 출처: `state: GameState`. 내팀/상대 점수는 `state.myTeam === state.homeTeam ? score.home : score.away`로 계산. 라인스코어는 `state.linescore.away/home`(길이 9 가정, `COLS=[1..9]`)와 `totals.{away,home}.{R,H,E,B}`. 팀 라벨은 `state.homeTeam/awayTeam`.
- API 대응: `score{home,away}`, `linescore{away,home,totals}`, `my_team`, `opponent_team`, `inning`, `half`.
- **[위험] `homeTeam`/`awayTeam`이 API `GameState`에 없다.** `types/api.ts` 주석도 "스펙에 없는 최소 확장"이라고 명시. API 응답에는 `my_team`, `opponent_team`만 있음. 홈/원정은 `GameSummary.home/away`(온보딩 경기 목록)에서 가져와 세션 컨텍스트에 저장해 주입해야 한다(1-2의 `myTeamIsHome`과 동일 정보). 이게 없으면 ScoreHeader의 점수 선택 로직과 라인스코어 행 라벨/엠블럼이 모두 깨진다. 가장 영향이 큰 호환 갭.
- null: `linescore.away[]/home[]` 항목은 진행 안 된 이닝이 null -> 이미 `line[i] === null` 처리 있음(OK). 단 API 배열 길이가 9 미만/초과(연장)일 수 있는지 [확인 필요]; 9 초과 시 `COLS` 고정 9열이 잘림.
- 값 일관성: 점수는 `score`와 `totals.R` 두 군데에 있음. 헤더는 `score`, 표는 `totals`를 쓴다 -> 서버 값이 그대로면 일치(명세 §4-1 체크리스트).
- 삭제/신설: `scoreDiff*`는 화면에서 안 쓰임(변화 없음).

### 2-2. 다이아몬드 (`Diamond.tsx`, `MatchupPanel.tsx`가 `state.baseState`, `outCount`로 호출)
- 현재 출처: `state.baseState`(`"0"|"1"|...|"123"`), `state.outCount`, `state.inning/half`; 캡션은 `lib/baseState.ts` 라벨.
- API 대응: `base_state`, `out_count`. 값 집합은 명세에서 [명세 기준]이라 실제 확인 필요(`"0"` 이외의 빈 베이스 표기).
- **[위험]** `Diamond`는 `baseState.includes("1")`로 판정. 서버가 빈 주자를 `""` 또는 `null`로 주면 `"0"` 가정이 깨져 `baseStateLabel(...)`이 undefined를 반환. 어댑터에서 정규화. `out_count`는 0~2(3아웃은 이미 다음 반이닝) -> OUT 점 3개 표시는 안전.
- 삭제/신설: 없음.

### 2-3. 후보 목록 + 적합도 바 (`ReliefRankingList.tsx`, `CurrentPitcherCard.tsx`)
- 현재 출처: `recommendation.candidates: ReliefCandidate[]`(카멜, `pitcherId: string`!), `recommendData.bullpenSummary.total`, `recommendData.bullpenSource==='estimated'`.
- API 대응 (필드): `candidates[].pitcher.{pitcher_id(number), name, throws, model_score, model_rank, quality_percentile, matchup_vs_batter, season.era, workload.{consecutive_days, pitches_last_3d, days_rest}, availability, unavailable_reason, role}`.
- 변환 포인트:
  - `pitcherId`: 현재 `string`(`ReliefCandidate`), API는 number. `GameDashboardPage`는 `selectedId: string`, 투입 시 `Number(selected.pitcherId)`로 변환 중. 어댑터에서 일관된 타입 결정 필요(비교 `c.pitcherId === selectedId`에 영향).
  - `era` <- `pitcher.season.era`, `qualityPercentile` <- `quality_percentile`, `consecutiveDays` <- `workload.consecutive_days`, `pitchesLast3d` <- `workload.pitches_last_3d`, `daysSinceLastApp` <- `workload.days_rest`.
- **[null]** (현재 타입은 대부분 optional/`undefined` 처리, API는 `null`)
  - `model_score: number|null`, `model_rank: number|null` -> 현재 타입 `modelScore: number`, `modelRank: number`(non-null). `scores.map(c => c.modelScore)`, `Math.max`, `min`, `isTop = modelRank === 1`, 순위 원형 배지 `{c.modelRank}`가 null이면 NaN/“null” 표시. used 투수가 목록에 남는 점이 가장 큰 변화.
  - `quality_percentile`, `matchup_vs_batter`: null 허용. 현재 코드는 `!== undefined` 비교라 **null이 오면 `100 - null` = 100, `Math.max(1,100)`으로 "quality 상위 100%"가 표시됨**. `=== undefined` 검사를 null까지 확장해야 함(`supportLine`).
  - `workload.*` 전 필드 null 허용: `hasFatigue = consecutiveDays !== undefined || ...` 동일 문제. null -> "—".
  - `throws: 'U'`: 현재 HAND 맵에 `U: "언더"`가 있으나 명세는 `U`를 [명세 기준] 불명 값으로 표기(실제 의미 확인 필요).
  - `photo_url`: 후보 목록에서는 쓰지 않음(MatchupPanel의 사진도 현재 회색 원 placeholder).
- **[신설] used 투수 그룹**: 서버는 이미 등판한 투수를 `availability:"used"`로 목록에 남기고 `model_score=null`. 명세는 "하단 회색 그룹으로 분리, 바 없음, 재정렬 금지". 현재 mock은 used 투수를 candidates에서 제외하고 `UsedPitchersChips`가 따로 표시. API에서는 `availability==='used'`를 `ReliefRankingList`에서 분리 렌더링하거나, 어댑터에서 candidates(선택 가능)와 used(칩)로 나눠야 함. 후자면 `UsedPitchersChips`의 `usedTonight`를 이 응답에서 채울 수 있다(2-9).
- **[신설]** 후보 헤더 "임시 점수" 배지: `config.model.provisional === true`일 때(`useConfig` 신설 필요). 현재 `getConfig`는 있으나 `useConfig` 훅이 없고 `AppConfig` 타입(`qualityP` 필드)은 명세와 불일치(`model`, `li_source_note`). **[삭제]** `qualityP` config.
- **[null/위험] 적합도 바**: min-max 정규화는 `model_score !== null`인 후보만 대상으로 해야 함. 현재 `top === min`이면 100% 처리(1명뿐일 때)는 유지. 문구 "1위 대비 −X%p"와 툴팁 `scoreTooltip`은 점수 x100을 `%p`로 표기함 -> **명세 §3-6이 "원값을 %p로 바꿔 '승률 +0.4%p'처럼 표시하지 않는다(실제 승률 변화가 아님)"고 금지**. 현재 UI의 `예상 성과: 타석당 +x.xx%p`, `1위 대비 −x.xx%p`는 명세 위반 소지 -> 표기 재검토 필요(단위 `wpa_per_pa`, 후보 간 차이가 매우 작을 수 있어 `.toFixed(2)`가 모두 0.00으로 보일 위험).
- **[위험]** `recommendation.source`(`precomputed|live|mock`)는 DEV 배지(MOCK)에만 사용됨. API는 `/recommend`의 `source`가 동일 값 집합.
- `CurrentPitcherCard`: 현재 투수 이번 등판 정보(`workload.estPitchCount/outsRecorded/hitsAllowed/walksAllowed`)를 `state.currentPitcher.workload`에서 읽음. **[삭제/대체]** API `Workload`에는 `outsRecorded/hitsAllowed/walksAllowed`가 없고 `recommend.current_pitcher.this_outing{pitches, outs, hits_allowed, walks, matchup_vs_batter}`로 이동. `est_pitch_count`는 null 가능. 이 카드는 `recommendData.current_pitcher`를 prop으로 받도록 변경 필요. 매치업 라벨은 현재 `lib/handMatchup.ts`로 클라 계산(throws vs hitType) -> API는 `this_outing.matchup_vs_batter` 제공(null 가능). 클라 계산 유지할지 서버 값 사용할지 결정 필요 (CLAUDE.md 원칙상 서버 값 우선).
- `bullpenSource === "estimated"` -> "추정 명단" 배지: 필드/값 동일.
- `ActionBar` `locked`/`canSwitch` 로직은 변경 없음. `badgeLabel`: `candidates.length === 0 ? "유지 강제"` -> 409 처리로 대체(위).
- `PitcherStatCard`: `pitcher.vsBatterHand.L/R`를 `split.avg.toFixed` 호출 -> **[null]** API `vs_batter_hand: {L: HandSplit|null, R: HandSplit|null}`이므로 null이면 TypeError(크래시). `season.era/whip/ip`는 non-null 가정이나 확인 필요. `NextBattersCard`, `MatchupCard`: `batter.recentAvg`(null 가능), `vsCurrentPitcher`(이미 null 처리), `avg/woba/iso`(null 가능) 점검 필요.

### 2-4. 결과 이펙트 + 확률 막대 (`OutcomePanel.tsx`, `game/OutcomeEffect.tsx`, `ProbabilityDistribution.tsx`)
- 현재 출처: `useGameSession.lastResult: PAResult` (`outcome`, `outcomeLabel`, `description`, `probability`, `probs`, `runsScored`, `deltaWeDefender`). 이펙트는 `outcome`(9종 enum)->`OUTCOME_META`. 확률 막대는 `OUTCOME_DISPLAY_ORDER`로 `result.probs[code]`.
- API 대응: `result.{outcome, outcome_label, description, probability, probs, runs_scored, delta_we_attacker, delta_we_defender, source, next_state}`. 이름만 snake_case, 구조 동일.
- **[신설]** `source: 'actual'|'simulated'`: 현재 타입에 없음. 분기 전 실제 기록 재생 여부.
- **[null/위험] `probs`**: `Math.max(...OUTCOME_DISPLAY_ORDER.map(code => result.probs[code]))` -> 키가 없거나 `source==='actual'`일 때 `probs`가 비어 있으면 `undefined` -> `NaN` 높이/`.toFixed` TypeError. 명세 §3-7: "없는 키는 0으로 채운다", "actual일 때 의미 있는지 [확인 필요]". 어댑터에서 9개 키를 0 채움 + `maxProb===0`이면 `p/maxProb`=NaN 방어 필요. `probability`(OutcomePanel의 "이 결과가 나올 확률은 N%였습니다")도 actual일 때 0/null일 수 있음 -> 문구 숨김 처리.
- **[위험] `description`**: 서버 문구가 mock과 다를 수 있음(길이/언어). `OutcomeEffect`의 `outcome_label`은 이펙트에서 안 쓰이고 OUTCOME_META 고정 라벨 사용. `OUTCOME_LABELS`(삼진 등)와 서버 `outcome_label`("2루타")이 달라질 수 있음 -> 로그(`AtBatLogCard`)는 서버 라벨, 오버레이(`OffenseHalfOverlay`)는 `OUTCOME_LABELS` 사용으로 혼용.
- **[삭제]** `lastResult.offenseHalfSummary` 및 `useHalfTransition.playHalfEnd`에 넘기는 요약은 simulate-pa에서 오지 않음 -> advance-half 응답 `summary`로 대체(아래).
- 공격 반이닝 오버레이(`OffenseHalfOverlay`, `HalfSummary`): 현재 `{inning, half, runs, hits, deltaWe, paLog[{batter,outcome,outcomeLabel,runsScored}]}`. API `summary`는 `{runs, hits, pa_log[{batter_id,batter,outcome,description}], we_trace[], source}`. **[삭제]** `deltaWe`(공격 반이닝 ΔWE)와 `pa_log[].runsScored`는 API에 없음 -> 오버레이가 득점 타석 우선 정렬(truncate)에 쓰던 `runsScored` 사라짐. `deltaWe`는 `we_trace`(관점/길이 [확인 필요], 명세 §5 #11)나 이전/이후 `win_expectancy` 차로 대체 계산해야 하는데 이는 클라 계산이 되므로(서버 값만 표시 원칙) 표시 항목을 줄이는 쪽이 안전. `inning/half`는 호출 직전 state에서 가져옴. 2초 연출 + `Promise.all` 필요. **[null]** `state.is_game_over`가 advance-half 응답에서 true일 수 있음(말 공격 끝내기) -> recommend 호출/오버레이 생략(현재 `!result.nextState.isGameOver`만 체크하므로 이 경로 추가 필요).

### 2-5. 승률 곡선 (`WinProbabilityChart.tsx`)
- 현재 출처: `weTrace: WeTraceResponse`. x축은 `weTrace.actual`(전체 경기)을 기준으로 하고 `weTrace.simulated`를 `${inning}-${half}` 키로 매칭해 겹쳐 그림. `divergeAt`으로 기준선, `simulated.length > 0`일 때 범례 표시.
- API 대응: 구조 동일(`perspective`, `actual`, `simulated`, `diverge_at`, `current`). `HalfPoint.leverage_index`는 선택 필드가 아니라 항상 존재.
- **[null]** `diverge_at: null`(분기 전) -> 이미 `weTrace.divergeAt ? ... : null`로 처리됨(OK). `simulated: []`(분기 전) -> 곡선 없이 실제만 그림(OK; 명세 §3-7 "분기 전 simulated는 빈 배열").
- **[위험]** 명세 §3-10: 시뮬레이션 곡선은 `simulated[0]`의 직전 반이닝 actual 값과 이어 그려야 분기점에서 출발. 현재는 `simulated`를 같은 key의 actual 옆에 점으로 찍을 뿐 직전 점과 이어주지 않음 -> 분기 직후 `simulated` 1점이 고립된 점으로 보일 수 있음(Line `dot r:3`은 있어 보이긴 함). 연결선이 필요하면 `simulated` 앞에 직전 actual 점을 시작점으로 삽입.
- **[위험]** `perspective !== state.my_team` 단언 로그 추가 권장. 진행 중 반이닝의 `we`는 "지금 값"이라 같은 key의 마지막 항목이 갱신됨(현재 `simByKey` 덮어쓰기 로직이 end-of-half 우선이라고 주석되어 있으나 서버가 반이닝당 1점이면 문제 없음).
- 삭제: mock의 `path_diverged` 개념(명세 §3-7)은 쓰지 않음. 현재 코드에서 직접 참조는 안 보이나 `session.ts`에 남아 있으면 API 모드와 불일치.
- 호출 시점: 현재 refreshAll마다 호출. API도 simulate-pa/advance-half/undo 후마다 재조회 필요.

### 2-6. 레버리지 차트 (`LeverageChart.tsx`) - 명세 §3-10-1 B안, **영향 가장 큼**
- 현재 출처: `weTrace.simulated.map(p => p.leverageIndex ?? 0)`로 시리즈 구성(PA마다 한 점, 같은 반이닝 PA는 `n번째 타석` 라벨 생성), 마지막 점 = `state.leverageIndex`라고 주석. 헤더 "현재 LI" = `currentLI` prop(`state.leverageIndex`), "리그 상위 N%" = `recommendation.liPercentile`. 밴드 기준선은 하드코딩(`ReferenceArea y1={1.5}`, `ReferenceLine y={1.0}`, `maxLi = Math.max(3, ...)`).
- API 차이: `we-trace.simulated[].leverage_index`는 **반이닝 단위 최고 LI**이고, `simulated`는 분기 전엔 빈 배열. 즉 현재 코드(PA 단위, simulated 의존)는 API에서 (1) 분기 전 차트가 완전히 비고, (2) 점이 반이닝당 1개로 줄고, (3) 값이 헤더 현재 LI와 불일치. 명세가 이 소스를 쓰지 말라고 명시.
- 변경 내용(B안):
  - **[삭제]** `LeverageChart`의 `weTrace` prop 의존. `weTrace.simulated[].leverageIndex` 사용 제거.
  - **[신설]** 클라 누적 시리즈 훅 1개(`useLeverageSeries` 등): `POST /sessions` 응답 state -> 초기화+첫 점, `simulate-pa`의 `next_state`(**`my_role==='defense'`일 때만**), `advance-half`의 `state`(직전 점과 선 끊기), `undo`는 기록 대신 잘라내기. 점 구조: `{li, inning, half, isDiverged, key}`; 반이닝 전환 시 `{li:null}` 구분점 + `connectNulls={false}`.
  - **[신설]** undo 스택(`prevLength` push/pop). 3아웃으로 끝난 simulate-pa도 push. sessionStorage에 sessionId 키로 저장(새로고침 대응). 개발 모드 단언: undo 후 마지막 점 `li === undo 응답 state.leverage_index`.
  - 라벨: 현재의 "반이닝 첫 점에만 tickLabel" 로직은 시리즈에 반이닝/순번을 직접 기록하면 단순화 가능. 명세는 "GameState에 타석 번호가 없어 순번을 키로 사용".
  - 기준선: `config.leverage.bands` 사용(하드코딩 1.5/1.0/3 제거) -> `useConfig` 신설 필요.
  - `liPercentile`: `/recommend`의 `li_percentile` 사용(현재와 같은 출처, 단 공격 상태에서는 recommend를 안 부르므로 값 없음).
- **[위험]**
  - 훅 격리: `useGameSession`의 simulate/undo/createSession/advanceHalf 4곳에서 기록 호출을 걸어야 한다. C안(반이닝 막대) 전환 대비해 기록 코드를 훅 하나에 격리(명세 §3-10-2).
  - 공격 반이닝 직후 undo의 도착 상태가 [확인 필요](명세 §5 #12). 도착 상태가 `my_role==='offense'`이면 recommend 호출 금지, advance-half 대기 상태 UI가 현재 존재하지 않음(현재 mock은 항상 수비 상태로 복귀).
  - 선분이 반이닝마다 끊겨 짧은 시리즈(9회 시작 = 1~2 선분)에서 `dot={data.length < 2}` 로직으로는 점이 안 보일 수 있음. null 구분점이 `data.length`에 포함되면 이 조건이 오작동.
  - `liPercentile`을 받는 prop 시그니처가 `recommendation.liPercentile`에 묶여 있음. 어댑터에서 `RecommendationResult.liPercentile` <- `li_percentile`.
  - B안은 실제 경기 LI와 비교 불가(명세 한계 표) -> 현재 차트도 actual 곡선이 없어 기능 손실은 없음.

### 2-7. 실행 로그 (`AtBatLogCard.tsx`)
- 현재 출처: **서버가 아닌 `GameDashboardPage`의 로컬 `useState<AtBatLogEntry[]>`**. `handleCommit`에서 `simulate` 결과의 `outcomeLabel`, `deltaWeDefender*100`을 push하고, 공격 반이닝이 있으면 `offenseHalf` 행 추가. 타석 번호는 `log.filter(kind==='pa').length`를 `OutcomePanel`의 `paIndex`로 사용.
- API 대응: `result.outcome_label`, `result.delta_we_defender`, advance-half `summary.{runs, pa_log}`. 로그 자체를 돌려주는 엔드포인트는 없음 -> 클라 누적 유지(출처 변화 없음).
- 변경 포인트:
  - `offenseHalf` 행의 `deltaWePct`는 `summary`에 `deltaWe`가 없어(2-4) 표시 불가/대체 필요.
  - **[위험] undo 시 로그가 되돌려지지 않는다**: 현재도 `handleUndo`는 `cancel(); undo()`만 하고 `setLog`를 건드리지 않음(기존 버그). API에서는 undo 단위가 "타석 1회, 공격 반이닝은 통째로"이므로 로그 pop 규칙을 B안 undo 스택처럼 단계 수 기준으로 정의해야 함. 새로고침 시 로그도 소실(sessionStorage 백업 대상에 포함 고려).
  - `AtBatLogCard`의 이닝 필터는 `entries` 기반이라 영향 없음.
  - 타자 이름: `state.currentBatter.name`을 호출 전 캡처(OK, 변경 없음). `result.next_state`는 이미 다음 타자.
  - **[null]** `delta_we_defender`는 non-null이나 `source==='actual'`일 때도 오는지 확인 필요.

### 2-8. Undo 버튼 (`ActionBar.tsx`)
- 현재 출처: `state.canUndo` -> `disabled={!canUndo || busy}`. 핸들러 `handleUndo`: `cancel()`(진행 중 전환 애니메이션 취소) -> `undo()`(`setState(prev)`, `lastResult=null`, `refreshAll`). `selectedId`는 `state.currentPitcher.pitcherId` 변경 effect로 초기화.
- API 대응: `can_undo`, `POST /undo -> {state}`, 409 `CANNOT_UNDO`(정상 흐름에선 `can_undo`로 방어).
- 변경점:
  - undo 후 호출: `we-trace` 재조회 + (`my_role==='defense'`일 때만) `recommend`. 현재 `refreshAll`은 무조건 recommend를 부름 -> 도착 상태가 offense면 400 `INVALID_ROLE`.
  - B안 시리즈 잘라내기 + 로그 pop 동기화(2-6, 2-7).
  - **[위험]** `selectedId` 초기화가 "현재 투수 id 변경" effect에 의존: undo로 같은 투수 상태로 돌아가면 초기화가 안 돼 이전 선택이 남음(명세는 "사용자 선택은 초기화"). 명시적으로 `setSelectedId(null)` 호출 필요.
  - **[위험]** 공격 반이닝이 되돌아갈 때 `useHalfTransition`이 이미 끝난 상태. 현재 `cancel()`로 처리. 도착 상태가 3아웃 직후(offense)면 advance-half 재호출 흐름 필요.
  - 되돌린 뒤 같은 선택 = 같은 결과(시드 고정): 로그/이펙트 재생성 시 동일해야 함(검증 항목).

### 2-9. 대시보드의 API 대응이 없는 데이터 (사용자 요청 목록 외 보충)
- `UsageTimelineCard`(오늘 투수 운용): `usageToday: UsageEntry{name, role, pitches, inningsLabel}` + 현재 투수. **[삭제]** `getUsageToday` 대응 API 없음. 서버가 주는 것: `bullpen_summary{available,used,total}`, 후보 목록의 `availability==='used'` 투수(투구수/이닝 없음), `workload.est_pitch_count`. 선발/이전 구원 투수의 투구수·이닝 라벨은 얻을 수 없음 -> 카드 축소(이름+현재 투수) 또는 백엔드 요청.
- `UsedPitchersChips`(등판 완료): `usageToday` 이름 + `usedTonight: Pitcher[]`. **[대체]** `/recommend`의 `availability==='used'` 후보 이름으로 구성 가능(선발투수 제외됨).
- `MatchupPanel`: 투수/타자 사진은 현재 회색 원 placeholder, `photo_url`(상대 경로면 API_BASE 부착, null이면 이니셜) 신규 적용 시 구현 필요.

---

## 3. 결과 화면 (`src/pages/ResultPage.tsx`)

### 3-0. 데이터 모델 전체 교체
- 현재: `useSessionResult` -> `api.getResult(sessionId)` -> **`SimulationResult`**(프론트 정의, 카멜). 화면은 `ResultHeader`, `ResultBanner`, `ResultWinProbChart`(+ 별도 `api.getWeTrace`), `ResultMetricsCards`, `PitcherTimeline`, `DecisionComparison`, `DecisionLog`, `RepeatSimulationPanel`.
- API: `ResultResponse {simulated: Side, actual: Side, pitcher_usage[], actual_pitcher_usage[], decisions[], agreement{...}, bullpen_used{mine,actual,total}}`. 구조가 `SimulationResult`와 상당히 다름 -> 어댑터(`ResultResponse + 세션 컨텍스트 -> SimulationResult`) 또는 컴포넌트 props 재정의.
- 현재 `SimulationResult`에 있으나 API `/result`에 **없는** 필드:
  - `date`, `venue`, `myTeam`, `oppTeam`, `startInning`, `startHalf` (ResultHeader/Banner/Timeline이 사용) -> 세션 컨텍스트/`GameState`/경기 목록에서 가져와야 함. **`venue`는 API 어디에도 없음** -> 헤더 문구에서 제거.
  - `finalWeDiff`, `weDiffReferenceLabel` -> `simulated.final_we - actual.final_we`로 계산(클라 산술이지만 두 서버 값의 차). 라벨은 클라 문구.
  - `pitcherChanges`, `actualPitcherChanges` -> `pitcher_usage.length - 1` 등 파생(또는 `decisions.filter(is_change)`). 실제 감독 교체 수는 `actual_pitcher_usage` 파생.
  - `bullpenUsed`/`actualBullpenUsed`/`bullpenTotal` <- `bullpen_used.{mine,actual,total}`(1:1).
  - `PitcherUsageSegment.fromOut/toOut/paCount/enteredLI/deltaWeSum` vs API `PitcherUsage {from{inning,half,pa}, to{...}, delta_we_defender, pitches_est, li_at_entry}`.
- 호출 시점: `status` 로딩 조건 `!weTrace`에 묶여 있음(we-trace 실패 시 무한 로딩). `/result`는 경기 중에도 호출 가능 + `result==='in_progress'` 시 "경기 진행 중 기준" 표시 필요(현재 없음, **[신설]**).

### 3-1. 점수 카드 (`ResultBanner.tsx`, 상단 `ResultHeader.tsx`)
- 현재 출처: `result.myFinalScore{mine,opp}`, `actualFinalScore{mine,opp}`, `myWin`/`actualWin`(boolean|null), `runsAllowedInRange{mine,actual}`, `finalWeDiff`, `weDiffReferenceLabel`, `startInning`. 승/패 라벨 `winLossLabel(win: boolean|null)`: null = 무승부.
- API 대응: `simulated.score{home,away}`, `actual.score{home,away}`, `simulated.runs_allowed_in_range` / `actual.runs_allowed_in_range`, `simulated.result`/`actual.result`(`'win'|'loss'|'tie'|'in_progress'`, 값 목록 [확인 필요]), `final_we`.
- **변환 (§3-11, §7 #1)**: `my = isMyTeamHome ? score.home : score.away`, `opp`는 반대. `isMyTeamHome`은 `GameSummary.home === myTeam` 또는 `state`의 홈 정보로 결정하여 세션 컨텍스트에 저장해야 하는데 **현재 `SessionParams`에 없고 `/result` 직접 진입(새로고침) 시 복원 경로도 없음** -> sessionStorage 백업 필수. 홈/원정 양쪽 테스트(체크리스트).
- 변환 대상 위치: `ResultBanner`의 두 카드(`myFinalScore.mine/opp`, `actualFinalScore.mine/opp`). 또한 `ResultHeader`의 `teamName(result.myTeam/oppTeam)`.
- **[삭제]** `myWin: boolean|null` -> `result` 문자열로 대체: `winLossLabel`을 `win/loss/tie/in_progress`용으로 재작성(`in_progress` = "진행 중"). 엠블럼/색상 로직의 `myWin === true`는 `result === 'win'`으로.
- **[null]** `result` 값 집합 [확인 필요] -> 알 수 없는 값은 "—" 폴백. `runs_allowed_in_range`는 non-null. `ResultBanner`의 `runDiff` 문구는 두 값이 모두 있으면 안전.
- **[위험]** `weDiffReferenceLabel`(서버 값 아님) 문구를 클라가 정의해야 함. "내 결과 승률 - 실제 경기 승률" 같은 정의가 필요한데 `actual.final_we`가 무엇의 WE인지(시작 시점? 종료 시점?) 명세에 설명 없음 -> 확인 필요. `final_we`는 my_team 관점(OK, 부호 변환 불필요).
- `ResultHeader`: `venue` 삭제, `date`는 경기 목록의 `date`, `startHalf`는 내 팀이 원정이면 "초", 홈이면 "말" 수비로 유도 가능(역시 홈 정보 필요) 또는 세션 시작 state의 `half`를 저장.

### 3-2. 투수 운용 (`PitcherTimeline.tsx`, `ResultMetricsCards.tsx`, `ResultWinProbChart`의 교체 마커)
- 현재 출처: `result.pitcherUsage`, `result.actualPitcherUsage`: `PitcherUsageSegment{pitcherId, name, fromInning/fromHalf/toInning/toHalf, paCount, fromOut, toOut, deltaWeSum, enteredLI}`. `PitcherTimeline`의 막대 폭 = `toOut - fromOut`(누적 아웃 수가 공통 축, 이닝 구분선은 3의 배수). `ResultMetricsCards`는 `deltaWeSum` 합계(수비팀 관점).
- API 대응: `PitcherUsage{pitcher_id, name, from{inning,half,pa}, to{inning,half,pa}, delta_we_defender, pitches_est, li_at_entry}`.
- **[삭제] `fromOut`/`toOut`가 API에 없다.** 타임라인 폭은 현재 누적 아웃 수로 계산. API는 `PaPoint{inning, half, pa}`만 제공 -> 폭을 `inning/half` 기준으로 근사(반이닝 3아웃 = 3 단위로 가정)하거나 `pa` 개수 기준으로 해야 함. 명세/코드 주석은 "PA 수는 내 플레이와 실제 감독 경로 사이에 비교 불가"라고 이미 인정(`paCount` 주석). 반이닝 경계(`from.half`, `to.half`)로부터 `(inning, half)`를 선형 인덱스로 바꿔 한 반이닝 = 3 단위 폭으로 쓰는 방법이 가장 단순하나, 구간이 반이닝 중간에서 끝나면 오차 발생. 내 운용은 `from.pa`/`to.pa`가 있으나 `actual_pitcher_usage`의 `pa` 의미 [확인 필요].
- **[삭제]** `enteredLI: number|null` -> `li_at_entry`(non-null로 오지만 actual 쪽 신뢰 여부 불명). 현재 화면에서는 직접 표시되지 않음.
- `deltaWeSum` -> `delta_we_defender` 합계는 세그먼트별로 이미 합산된 값(1:1 대응 가정, [확인 필요]).
- 교체 횟수 `pitcherChanges`: `pitcher_usage.length - 1`로 대체 가능하나 같은 투수 연속 세그먼트가 분리되는지 확인 필요.
- 경기 종료 이후만 가정 시 `to`가 `(9, bot)`. 진행 중(in_progress)이면 마지막 세그먼트의 `to`가 현재 시점 -> 총 폭 계산(`totalOut`)이 내 운용과 실제 감독이 서로 다를 수 있음(현재 max로 처리).
- **[위험]** `ResultWinProbChart`는 `pitcherUsage.slice(1)`의 `fromInning/fromHalf`로 교체 마커를 찍음 -> `from.inning/from.half`로 매핑. 첫 세그먼트가 세션 시작이라는 가정 유지 필요.
- 총 ΔWE 카드: `delta_we_defender` 합. 실제 감독 합계도 `actual_pitcher_usage`에서 계산(서버 값 합산, 문제 없음).
- `ResultWinProbChart`: 별도 `getWeTrace`를 쓰는 구조는 API에서도 동일하게 `GET /we-trace` 사용 가능(구조 호환). 단, `actual`이 `1회초~9회말` 전체인지 확인 필요(현재 코드는 그렇다고 가정).

### 3-3. 결정 비교 테이블 + 요약 문구 (`DecisionComparison.tsx`, `DecisionLog.tsx`, `lib/resultDisplay.ts`)
- 현재 출처: `result.decisions: DecisionLogEntry[]`(`inning, half, outCountBefore, baseStateBefore, li, modelRanking[{pitcherId,name,modelRank}], chosenPitcherId, actualPitcherId|null, outcome, outcomeLabel, runsScored, deltaWeDefender`)와 `result.modelComparison{topK, decisionCount, myWithinTopK, actualComparableCount, actualWithinTopK}`.
  - `modelTop(d)`는 `d.modelRanking[0]`, `choiceWithRank`는 `modelRanking`에서 pitcherId로 찾아 "이름 (N위)" 생성.
  - 요약 문구: `decisionCount === 0`이면 "교체가 없어 비교할 결정이 없습니다", 아니면 "내 선택 N회 중 M회가 모델 상위 K위 이내였습니다 (+ 실제 감독 ...)".
- API 대응: `DecisionRow{inning, half, leverage_index, model_top{pitcher_id,name}|null, user_choice{pitcher_id,name,model_rank|null}, actual_choice{...}|null, outcome(string), delta_we_defender, is_change}`, `agreement{total_decisions, mine_in_top3|null, actual_in_top3|null, same_as_actual}`.
- **필드 차이 / [삭제]**
  - `modelRanking[]`(전체 순위표) **삭제** -> `model_top`(1위 하나) + `user_choice.model_rank` / `actual_choice.model_rank`로 대체. `modelRankOf`, `choiceWithRank`(순위표 검색) 재작성: `이름 (model_rank위)`는 `choice.model_rank`가 null이면 이름만/`—`.
  - `outCountBefore`, `baseStateBefore` **API에 없음** -> `situationLabel(inning, half, outCount, base)`가 "7회말 1사 1·2루" 형태로 출력하던 정보를 "7회말"까지만 표시 가능(아웃/주자 열 삭제 또는 백엔드 요청).
  - `chosenPitcherId`, `actualPitcherId`, `outcomeLabel`, `runsScored` **API에 없음**: `outcome`은 string(Outcome 9종 가정, 스펙상 enum 아님) -> 라벨은 클라 `OUTCOME_LABELS[outcome]`으로 변환(알 수 없는 값은 원문). `runsScored`(DecisionLog의 "→ N실점/무실점") **삭제**: 대체 데이터 없음 -> 해당 문구 제거 또는 ΔWE만 표시.
  - `li`(레버리지) -> `leverage_index`.
  - **[신설]** `is_change`(교체 결정 여부), `agreement.same_as_actual`.
- **[null] (이 화면의 핵심 null 지점)** 명세: "모델 순위 필드는 아직 null".
  - `model_top: null` -> "모델 1위" 열 `—` (현재 `modelTop(d)?.name ?? "—"`는 이미 안전하지만 데이터 모양이 바뀜).
  - `user_choice.model_rank`, `actual_choice.model_rank: null` -> "(모델 N위)" 생략/`—`.
  - `actual_choice: null`(분기 후) -> 현재 `real ?? "— (분기 이후라 비교 불가)"` 처리와 동일.
  - `agreement.mine_in_top3`, `actual_in_top3: null` -> 요약 문구의 `myWithinTopK`/`actualWithinTopK`가 NaN/"null회"로 출력될 위험. 명세 권장 대체문: `same_as_actual` 기반 "N번의 결정 중 M번이 실제 감독과 같았습니다". `topK`는 API에서 고정 3이 아니라 필드명 `top3` 내장(topK 가변 가정 삭제).
  - `agreement.total_decisions`는 "수비 타석 전체 수"인지 "교체 수"인지 정의 확인 필요(현재 `decisionCount`는 교체 결정 수 의미).
- **[위험] 줄 수 영향**: 현재 `decisions`는 **교체 결정(투수 변경)만** 담는 것으로 보이며 DecisionComparison은 전체 행을 렌더(필터/접기 없음). API `decisions`는 **수비 타석마다 한 줄**(유지 타석 포함, 명세 §3-11) -> 세션당 수십 행(예: 5회부터 시작 시 5이닝 x ~4~6타석 = 20~30행)으로 증가.
  - `DecisionComparison`(테이블)과 `DecisionLog`(카드 리스트)가 **같은 `decisions`를 이중 렌더** -> 줄 수가 두 배로 페이지 길이 폭증. `DecisionLog`는 `flex-1 justify-between`으로 레이아웃 높이를 `ResultPage` 그리드/하단 영역에 맞추도록 설계되어 있어 긴 목록에서 레이아웃이 깨질 수 있음.
  - 명세 권장: `is_change === true`만 기본 표시 + "전체 타석 보기" 토글. 이 경우 `decisionCount === 0`(교체 없음) 분기의 빈 상태 문구 유지, 요약의 분모는 `agreement.total_decisions`(전체 타석)와 필터된 행 수가 달라 문구에서 어느 쪽을 쓰는지 일관성 정의 필요.
  - 테이블 key가 `i`(인덱스)라 토글/필터 시 리렌더 영향은 없으나 `max-height + overflow` 스크롤 설정 검토.
  - `ResultMetricsCards`의 "투수 교체 N회"와 `is_change` 개수가 일치하는지 교차 검증 가능.
- **[위험]** `outcome: string`(스펙상 enum 아님). `OUTCOME_LABELS[outcome]`에 없는 값이면 undefined -> 렌더 시 빈 칸. 폴백 필요.

### 3-4. 반복 시뮬레이션 히스토그램 (`RepeatSimulationPanel.tsx`, `useSessionResult.toggleRepeat`)
- 현재 출처: `api.getRepeatSimulation(sessionId, 100)` -> `RepeatResult {histogram: [{label, count, runs}], median, p10WE, p50WE, p90WE, probBetterThanActual, probSameAsActual, n, myActualRuns, actualGameRuns}`. 히스토그램은 서버가 버킷 배열(마지막 버킷 "7+" 같은 라벨 포함, `h.runs === 7 && myActualRuns >= 7` 처리)로 줌.
- API 대응: `RepeatResponse {n, runs_allowed{histogram: Record<string,number>, median, mean}, final_we{median,p10,p90}, win_rate, better_than_actual_rate, actual{runs_allowed,result}, elapsed_ms}`.
- **[삭제/신설] 변환 필요**
  - `histogram`: 배열 -> 맵(`{"0": 12, "1": 30, ...}`). `Object.entries`를 숫자 변환·정렬하고 **빈 구간(키 없음)을 0 ~ max로 채워** `{label: String(runs), count, runs}` 배열 생성. "7+" 묶기 로직(`runs === 7` 특수 처리)은 서버가 큰 실점도 그대로 키로 주므로(예: "12") 클라가 묶을지 결정(안 묶으면 막대 폭이 수십 개 가능). `grid-template-columns`가 `data.length`에 의존해 레이아웃은 따라감.
  - `myActualRuns` <- **세션 내 내 플레이의 실점** = `/result`의 `simulated.runs_allowed_in_range`(repeat 응답에는 없음 -> 결과 화면 데이터와 조합 필요). `actualGameRuns` <- `actual.runs_allowed` (신설 필드; 비교 기준선).
  - `probBetterThanActual` <- `better_than_actual_rate`. `probSameAsActual` **API에 없음** (현재 문구 "같을 확률 N%") -> 삭제하거나 `histogram[actual.runs_allowed]/n`으로 파생(클라 산술).
  - `p10WE/p50WE/p90WE` <- `final_we.{p10, median, p90}` (현재 UI는 이 값을 표시하지 않음; 확인 필요).
  - **[신설]** `win_rate`, `mean`, `elapsed_ms`: 활용 가능(표시 여부 결정).
  - `n`: 요청한 값과 동일.
- **[null]** 이 응답에 nullable로 표기된 필드는 명세에 없음. `histogram`이 비거나(전부 0) 키가 일부만 있을 수 있음 -> `Math.max()` 등 빈 배열 방어.
- **[위험]**
  - 요청 타임아웃 10초 이상 필요(명세). 현재 `toggleRepeat`는 에러 `catch`가 없어(try/finally만) 실패 시 unhandled rejection이며 로딩 스피너만 사라짐. 3초 초과 시 console.warn만 하고 진행 UI는 `repeatLoading` 버튼 상태뿐 -> 진행 스피너 필수(명세).
  - 여러 번 눌러도 세션은 안 바뀜. 결과 캐싱(현재 `repeat` 상태 유지)은 동일. 같은 n에 같은 결과인지 [확인 필요].
  - `startInning` 문구("N~9회 실점 분포")는 세션 컨텍스트에서 가져옴.
  - 설명문 "우리 팀 공격은 실제 기록으로 고정됩니다" 문구가 서버 동작(명세: "내 팀 투수는 사용자가 고른 순서 그대로, 타석 결과만 재샘플링")과 일치하는지 확인.

---

## 4. 영향도 요약 (큰 것부터)

1. `GameState.homeTeam/awayTeam` 부재 + 결과 화면 home/away->내팀/상대 변환용 `isHome` 필요: 홈/원정 정보를 온보딩 경기 선택에서 확보해 컨텍스트+sessionStorage에 저장 (ScoreHeader, ResultBanner, ResultHeader 전부 영향).
2. `getInningOptions` 소멸: 이닝 카드의 점수/tone/LI 줄 제거 또는 백엔드 확장 요청.
3. `offenseHalfSummary` 소멸 -> `advance-half` 별도 호출 흐름 + 오버레이의 `deltaWe`/`runsScored` 손실.
4. 레버리지 차트 B안: 새 누적 훅 + undo 스택 + sessionStorage. we-trace 의존 제거.
5. `/recommend`의 used 투수 포함 + `model_score/model_rank` null: 후보 목록 분리 렌더, 적합도 바 정규화 대상 제한, `%p` 표기 재검토. `workload`/`quality_percentile` null이 `undefined` 검사에 걸리지 않는 점.
6. 결과 화면: `ResultResponse` -> 화면 모델 어댑터. `decisions`가 수비 타석 전체(줄 수 증가) + 모델 순위 null + `outCountBefore/baseStateBefore/runsScored/chosen·actualPitcherId` 소실 + 이중 렌더(테이블+로그) 정리.
7. `getUsageToday`/`getUsedTonight` 소멸: `UsageTimelineCard`/`UsedPitchersChips` 축소 또는 백엔드 요청.
8. `GamePicker` 날짜 포맷(`.` vs `-`) 월 필터 오작동: 사소하지만 즉시 깨짐.
9. 에러 처리 부재(`SESSION_EXPIRED`, `recoverable`, 훅의 catch 누락): 전 화면.
