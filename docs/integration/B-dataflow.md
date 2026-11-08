# B. 데이터 흐름 조사 (mock → 훅 → 컴포넌트)

조사 기준: CLAUDE.md, docs/API_연동명세_nemosdream.md (§0, §1, §3). 코드 수정 없음.

## 1. src/mocks/api.ts 함수 목록 (14개)

모두 `delay()`로 감싼 async 함수. 내부는 `./session`(engine로 import됨), `./schedule`, `./recommendation`, `./config`, `./teams`를 호출한다.

| 함수 | 시그니처 | 대응 엔드포인트 | 비고 |
| --- | --- | --- | --- |
| getConfig | `() => Promise<AppConfig>` | GET /config | 호출하는 훅 없음 (useConfig 부재) |
| getTeams | `() => Promise<Team[]>` | GET /teams | |
| getGames | `(myTeam, oppTeam) => Promise<GameListItem[]>` | GET /games | 실서버는 `team` 필수, `opponent` 선택 |
| getInningOptions | `(myTeam, oppTeam, gameId) => Promise<InningOption[]>` | 없음 (목업 전용) | 이닝별 점수/LI 미리보기. 실서버에는 대응 없음 |
| createSession | `({myTeam, oppTeam, gameId, startInning}) => Promise<{state}>` | POST /sessions | 요청 바디는 snake_case, 응답 `{state}` |
| recommend | `(sessionId) => Promise<RecommendResponse>` | POST /recommend | 목업의 `RecommendResponse`(bullpenSummary, bullpenSource 등) |
| getRecommendations | `(state: GameState) => Promise<RecommendationResult>` | POST /recommend (후보 부분) | 목업은 `sourceFor(state)`(precomputed/live)로 분기. `computeRanking`은 프론트 쪽 mock 코드 |
| simulatePa | `(sessionId, pitcherId: number) => Promise<{result: PAResult}>` | POST /simulate-pa | 공격 반이닝을 내부에서 자동 진행하여 `result.offenseHalfSummary`로 반환 |
| undoLast | `(sessionId) => Promise<{state}>` | POST /undo | |
| getWeTrace | `(sessionId) => Promise<WeTraceResponse>` | GET /we-trace | |
| getUsageToday | `(sessionId) => Promise<UsageEntry[]>` | 없음 (목업 전용) | 오늘 이미 등판한 투수 |
| getUsedTonight | `(sessionId) => Promise<Pitcher[]>` | 없음 (목업 전용) | 세션 중 교체되어 나간 투수 |
| getResult | `(sessionId) => Promise<SimulationResult>` | GET /result | |
| getRepeatSimulation | `(sessionId, n) => Promise<RepeatResult>` | POST /repeat | |

API 명세에 있으나 api.ts에 없는 것: `getHealth`, `advanceHalf` (POST /advance-half), 세션 복원용 조회(§7 #2).

## 2. 훅 → mock 함수

| 훅 | 호출하는 api 함수 |
| --- | --- |
| useTeams | getTeams |
| useGames | getGames |
| useInningOptions | getInningOptions |
| useGameSession | createSession, 그리고 `refreshAll`에서 recommend + getRecommendations + getUsageToday + getUsedTonight + getWeTrace (Promise.all). simulate는 simulatePa, undo는 undoLast 후 각각 refreshAll |
| useSessionResult | getResult (마운트 시), getRepeatSimulation(sessionId, 100) (토글 시, 캐싱) |
| useHalfTransition | 없음 (UI 전환 상태 머신. 타이머만 사용) |

## 3. 훅 반환값 → 소비처

### useTeams (`Team[]`)
- OnboardingPage: `teams`로 상대팀 필터(`t.code !== myTeam`), 팀명 조회.
- GameDashboardPage, ResultPage: `code -> name` 맵으로 `teamName()` 생성.

### useGames (`{games, loading}`)
- OnboardingPage: `games`만 사용 (`selectedGame`을 `gameId`로 찾음). `loading`은 미사용.

### useInningOptions (`InningOption[]`)
- OnboardingPage: `inningOptions.find(i => i.n === startInning)` 등 시작 이닝 카드 렌더.

### useGameSession (GameDashboardPage 단독 사용)
| 반환 | 사용처 |
| --- | --- |
| sessionId | 결과 이동(`/result/${sessionId}`), 시작 오버레이 1회 트리거 |
| state | 거의 전부. `isGameOver`(결과 이동), `inning/half`(오버레이·라벨), `currentBatter.name`, `currentPitcher`(PitcherStatCard, MatchupCard, MatchupPanel, UsageTimelineCard, ActionBar의 유지), `upcomingBatters`(NextBattersCard), `leverageIndex`(LeverageChart `currentLI`), `canUndo`(ActionBar), `myTeam/opponentTeam`(ScoreHeader, 팀명), `ScoreHeader state`, `MatchupPanel state` |
| recommendData | `bullpenSummary.total`, `bullpenSource === "estimated"` (ReliefRankingList). 그 외 필드는 사용 안 함 |
| recommendation | `candidates`(ReliefRankingList: `modelScore`, `pitcherId`, 선택 처리), `liPercentile`(LeverageChart), `source === "mock"`(DEV 배지) |
| usageToday | UsageTimelineCard, UsedPitchersChips |
| usedTonight | UsedPitchersChips |
| weTrace | WinProbabilityChart (`actual`, `simulated`, `divergeAt`), LeverageChart (`simulated[].leverageIndex`) |
| status | 로딩/에러 분기 |
| simulating | ActionBar 잠금 |
| lastResult (`PAResult`) | OutcomePanel(`outcome`), ProbabilityDistribution(`probs`, `outcome`) |
| simulate(pitcherId) | handleCommit. 반환값 `result.offenseHalfSummary`, `nextState`, `outcomeLabel`, `deltaWeDefender`로 오버레이와 로그 구성 |
| undo | handleUndo |

### useSessionResult (ResultPage 단독)
- `result` -> ResultWinProbChart(`pitcherUsage`), PitcherTimeline(`pitcherUsage`, `actualPitcherUsage`, `startInning`), DecisionComparison(`decisions`, `modelComparison`), DecisionLog(`decisions`), 팀명(`myTeam`).
- `repeat`, `repeatOpen`, `repeatLoading`, `toggleRepeat` -> RepeatSimulationPanel.

### useHalfTransition
- GameDashboardPage: `phase`, `startInning`, `playHalfEnd`, `finishOffense`, `finishInning`, `cancel`로 오버레이 제어.

## 4. src/mocks 직접 import 위치

| 파일 | import | 판정 |
| --- | --- | --- |
| src/hooks/useTeams.ts, useGames.ts, useInningOptions.ts, useGameSession.ts, useSessionResult.ts | `@/mocks/api` | 정상 (훅 경유) |
| **src/pages/ResultPage.tsx:18** | `import * as api from "@/mocks/api"` -> `api.getWeTrace(sessionId)` (useEffect 직접 호출, 로컬 state `weTrace`) | **위반. 훅 경유 아님** |
| src/components/** | api.ts, session.ts, engine.ts 직접 import 없음 (grep 확인) | 정상. 주석 언급만 있음 (TeamEmblem, ResultWinProbChart) |
| src/pages/GameDashboardPage.tsx, OnboardingPage.tsx | mocks import 없음 | 정상 |
| src/context/SessionContext.tsx | `SessionParams`를 `@/hooks/useGameSession`에서 타입 import | mocks 아님. 참고만 |

조치 제안: `useSessionResult` 안에서 `getWeTrace`를 함께 가져와 `weTrace`를 반환하도록 옮기면 ResultPage에서 api import 제거 가능.

## 5. 목업 전용 개념 중 API 모드에서도 필요한 것

1. **공격 반이닝 처리 방식이 다르다 (가장 큼).** 목업은 `simulatePa`가 3아웃 시 상대 공격을 자동 진행하고 `PAResult.offenseHalfSummary`를 돌려준다. 실서버는 `state.my_role: "offense"`가 되고 별도 `POST /advance-half`(`{summary, state}`)를 호출해야 한다. 현재 `myRole`을 쓰는 UI 코드는 없고(`grep myRole`: types/api.ts, mocks/session.ts만), api.ts에 `advanceHalf`가 없다. GameDashboardPage.handleCommit이 `result.offenseHalfSummary`에 의존하므로, API 모드에서는 adapter(api 구현체)가 simulate-pa 후 role이 offense면 advance-half를 이어 호출해 `offenseHalfSummary`로 합성해야 한다. 안 그러면 훅/페이지에 role 분기를 추가해야 한다.
2. **`path_diverged` / 분기 판정.** 목업은 `session.pathDivergedAt`(세션 시작점으로 고정)과 `GameState.divergedAt`을 따로 쓴다. 명세 §7 #11에 따라 서버는 "투수 선택이 달라진 순간"만 분기로 본다. 프론트는 `state.isDiverged`/`divergedAt`, `weTrace.divergeAt`만 읽으므로 필드 매핑만 맞으면 되지만, 목업의 `pathDivergedAt` 의미(세션 시작)와 서버의 `diverge_at`(null 가능성)이 달라 WinProbabilityChart/ResultWinProbChart의 `weTrace.divergeAt` null 처리 확인이 필요하다. 또 `sourceFor(state)`가 `state.isDiverged`로 precomputed/live를 분기하는데, 실서버는 분기를 서버가 처리하므로 이 분기는 어댑터에 불필요.
3. **프론트 LI 계산 / 누적.** 명세 §7 #10: 서버 `/we-trace`의 `leverage_index`는 반이닝 최고값이라 "차트 마지막 점 == 헤더 현재 LI" 규칙과 충돌하며, B안으로 `GameState.leverage_index`를 클라이언트가 누적한다. 목업에서는 `weTrace.simulated[].leverageIndex`가 이미 state LI와 일치하게 만들어져 LeverageChart가 그대로 쓴다. API 모드에서는 누적 로직(undo 시 마지막 점 제거, 공격 반이닝 직후 undo 시 선분 제거, 새로고침 시 sessionStorage 유지)이 어댑터 또는 `useGameSession`에 필요하다. 이는 CLAUDE.md의 "클라이언트는 LI를 계산하지 않는다" 원칙과 별개로 "서버 값의 누적"이다.
4. **liPercentile.** `RecommendationResult.liPercentile`은 mock `modelScore.ts`의 `liPercentileOf`(로지스틱 대용)에서 나온다. 실서버 recommend 응답에 해당 필드가 있는지 확인 필요(없으면 `/config`의 `leverage.bands` 기반 계산이 프론트에 생김). LeverageChart가 이 값을 직접 사용.
5. **히스토리 스택.** `session.history`(undo용)는 서버가 가지므로 프론트에 필요 없다. 대신 프론트는 `state.canUndo`만 쓴다. 단 위 3번처럼 LI 누적을 프론트가 하게 되면 프론트도 undo용 스택/스냅샷이 필요하다. 그리고 `lastResult`(`undo` 시 null 처리)와 `GameDashboardPage`의 `log`는 undo 때 되돌려지지 않는다 (handleUndo는 `cancel()` + `undo()`만 호출, `log` 미수정). API 모드에서도 동일하게 남는 기존 이슈.
6. **engine.ts 직접 사용.** 컴포넌트/페이지/훅에서 `engine.ts` 직접 import는 없음 (src/mocks 내부에서만 사용: session.ts가 computeLI/computeWE/sampleOutcome 등을 import). 따라서 API 모드 전환 시 재사용 우려(명세 §1-1)는 해당 없음. 단 `api.ts`가 `./session`을 `engine` 별칭으로 import하는 점은 혼동 주의.
7. **목업 전용 api 함수 3개.** `getInningOptions`, `getUsageToday`, `getUsedTonight`은 실서버에 대응 엔드포인트가 없다. 온보딩 이닝 카드(`available_innings`만 제공됨), UsageTimelineCard, UsedPitchersChips가 이 데이터에 의존한다. API 모드에서는 `GameState`/`recommend`/`result`의 다른 필드로 합성하거나 UI를 축소해야 한다.
8. **ID 타입 불일치.** `ReliefCandidate.pitcherId`는 `string`, `simulatePa(pitcherId: number)`, `handleCommit(pitcherId: number)`. 서버는 `pitcher_id`(number)와 camelCase 키가 필요(`RecommendationSource` 어댑터에서 명시 매핑, 명세 §0-3).
9. **`getConfig` 미사용.** 어떤 훅도 호출하지 않는다 (명세 §4 6번 `useConfig` 복구 대상). `APP_CONFIG`는 mock 내부에서만 쓰인다.
10. **새로고침 복원.** SessionContext는 onboarding 선택만 보관. `/game` 새로고침 시 세션 복원 불가 (명세 §7 #2). 목업은 모듈 메모리라 동일하게 소실됨.

## 6. vite.config.ts 변경 (git diff, M 상태)

HEAD 대비 추가된 것은 `server` 블록 하나뿐이다 (+4줄).

```diff
+  server: {
+    // WSL2 환경에서 Windows 브라우저가 접속할 수 있도록 모든 인터페이스에 바인딩
+    host: true,
+  },
```

- 직전 대화에서 추가한 WSL 접속용 `server.host: true`와 일치. 그 외 변경 없음 (`resolve.alias "@"` 등 기존 설정 유지).
- 명세 §0-6이 요구하는 `server.proxy`(`/api`, `/health` -> `https://nemosdream.cloud`, `changeOrigin: true`)는 아직 없다. API 모드 연동 시 추가 필요.
- 참고: 작업 트리의 다른 변경은 `src/components/onboarding/StepCard.tsx`, `src/pages/OnboardingPage.tsx`(M), 루트의 `K-Moneyball_프론트엔드_백엔드_요구사항_명세.md`(D, 삭제됨; 공백/화살표 이름의 다른 파일이 untracked로 존재), `docs/API_연동명세_nemosdream.md`, `docs/api-docs.json`(untracked).
