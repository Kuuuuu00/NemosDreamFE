# A. 타입 대조표: `src/types/api.ts` · `recommendation.ts` vs 연동 명세 §2·§3 / `api-docs.json`

기준: `docs/api-docs.json`(필드명 정답) > 명세 §2·§3(nullable·값). 프론트 = `src/types/api.ts`, `src/types/recommendation.ts`.
표기: 서버 = snake_case 응답 필드, 프론트 = camelCase. "N" = nullable, "S" = 서버에만, "F" = 프론트에만.

---

## 0. 케이스(키 변환 전략)

| 항목 | 프론트 | 서버 | 판단 |
| --- | --- | --- | --- |
| 일반 키 | **camelCase** (`sessionId`, `outCount`, `logoUrl` ...). CLAUDE.md도 "camelCase, mock 층이 변환 담당" 명시 | snake_case (`session_id`, `out_count` ...) | 명세 §0-3 규칙1의 "snake 미러링이면 변환 금지"에 **해당 안 됨**. 변환 계층 필요 |
| 요청 바디 | (타입 없음) | `game_id`, `my_team`, `start_inning`, `pitcher_id`, `n` | 요청은 snake_case로 직접 구성 |

**변환 금지/주의 키 (프론트가 이미 원본 케이스로 보유)**

| 위치 | 키 | 프론트 타입 | 서버 | 비고 |
| --- | --- | --- | --- | --- |
| `GameState.linescore.totals.{away,home}` | `R,H,E,B` | `LineScore.totals` 대문자 그대로 | 동일 | 일치. 변환기가 `r,h,e,b`로 깨면 안 됨 |
| `Pitcher.vsBatterHand` | `L,R` | `Record<"L"\|"R", HandSplit>` (키 대문자) | 동일 (`vs_batter_hand`) | 키 이름만 camel화(`vsBatterHand`), 하위 `L/R`는 유지 |
| `PAResult.probs` | `1B,2B,3B,HR,BB,SO,GO,FO,GDP` | `Record<PAOutcomeCode, number>` | 동일 (`probs`) | **값 객체 하위 키 변환 금지** |
| `runs_allowed.histogram` | `"0","1",...` | **구조가 다름**: `RepeatResult.histogram`은 배열 `{label,count,runs}[]` | `Record<string, number>` 맵 | 변환 대상 아님. 맵→배열 가공은 어댑터에서 |
| `Pitcher.throws` / `Batter.hitType` 값 | `L/R/U`, `L/R/S` | 동일 | 동일 | 값은 변환 대상 아님 |

**안전한 일반 변환기 요건**
- `_[a-z0-9]` → 대문자화. 주의: `/_([a-z])/`만 쓰면 `appearances_last_7d`가 `appearancesLast_7d`, `pitches_last_3d`가 `pitchesLast_3d`로 깨짐(프론트는 `appearancesLast7d`/`pitchesLast3d`). 숫자도 포함해야 함.
- `probs`, `histogram` 값 객체 내부 키는 건드리지 않기. `R/H/E/B`, `L/R`는 `_`가 없어 자연히 유지.
- 파이프라인 전 단계에 걸친 구조 변환(래퍼 해제, 이름 변경)은 변환기가 아니라 필드별 어댑터 필요(아래 각 절).
- 예외: 서버 `from`/`to`(PitcherUsage)는 프론트에서 `fromInning` 등으로 평탄화 (§8).

---

## 1. 응답 래퍼 (구조)

| 엔드포인트 | 서버 최상위 | 프론트 타입 | 차이 |
| --- | --- | --- | --- |
| POST /sessions, /undo | `{ state: GameState }` (`SessionStateResponse`) | `GameState` 직접 | 어댑터에서 `.state` 해제 |
| POST /simulate-pa | `{ result: PaResult }` (`SimulatePaResponse`) | `PAResult` 직접 | `.result` 해제 |
| POST /advance-half | `{ summary, state }` | `AdvanceHalfResponse {summary, state}` | 일치 |
| POST /recommend | `{ candidates:[{pitcher}], ...}` | `RecommendResponse`(후보 없음) + `RecommendationResult.candidates`(평탄) | §6 참조 |
| 에러 | `{error:{code,message,recoverable}}` | `ApiError` | code 유니온 부족(§10) |

---

## 2. Team / GameSummary / AppConfig

### Team (`TeamResponse`)
| 서버 | 프론트 | 비고 |
| --- | --- | --- |
| `code: string` (명세 `TeamCode`) | `code: string` | 프론트는 `TeamCode` 유니온 미정의(string). 명세 `TeamCode` 도입 권장 |
| `name` | `name` | 일치 |
| `logo_url: string\|null` | `logoUrl: string\|null` | 케이스만 다름, nullable 일치 |

### GameSummary (`GameSummaryResponse`) ↔ `GameListItem`
| 서버 | 프론트 | 비고 |
| --- | --- | --- |
| `game_id` / `date` / `away` / `home` | `gameId` / `date` / `away` / `home` | 케이스만 다름. away/home은 프론트 string (서버 TeamCode) |
| `final_score {away,home}` | `finalScore {away,home}` | 일치 |
| `available_innings` / `high_leverage_innings` | `availableInnings` / `highLeverageInnings` | 일치 |
| - | `InningOption`(F) | 서버 엔드포인트 없음 (mock 전용: myScoreAtStart, oppScoreAtStart, tone, li, liHigh, played). 실서버에서는 `available_innings`/`high_leverage_innings`로 대체 필요 |

### AppConfig (`AppConfigProperties`)
| 서버 | 프론트 | 비고 |
| --- | --- | --- |
| `leverage.league_avg` | `leverage.leagueAvg` | 케이스 |
| `leverage.max` | `leverage.max` | 일치 |
| `leverage.bands[{label,min,max}]` | `bands: LeverageBandDef[]` | 일치 |
| `model {score_unit, description, provisional}` (S) | - | **프론트에 없음**. `provisional` -> "임시 점수" 배지에 필요 |
| `li_source_note` (S) | - | 프론트에 없음 |
| - | `qualityP {min,max,description}` (F) | **서버에 없음** (λ/quality_p 시절 잔재). 제거 대상 |

---

## 3. Pitcher (`PitcherResponse`)

| 서버 필드 | 프론트 필드 | nullable (명세 §2) | 프론트 | 비고 |
| --- | --- | --- | --- | --- |
| `pitcher_id` | `pitcherId: number` | - | - | 일치 (단 `ReliefCandidate.pitcherId`는 **string**, §7) |
| `name` | `name` | - | - | |
| `throws 'L'\|'R'\|'U'` | `throws: Hand` | - | - | 일치 |
| `photo_url` | `photoUrl: string\|null` | N | N | 일치. 상대경로 -> API_BASE 필요(§0-5) |
| `season {era,whip,ip,so,bb,g}` | `season: SeasonPitchingStats` | - | - | 일치 |
| `vs_batter_hand {L,R}` | `vsBatterHand: Record<"L"\|"R", HandSplit>` | `L: HandSplit\|null`, `R: HandSplit\|null` | **non-null** | 프론트가 null 미허용 -> 표본 없을 때 크래시 가능. `{L: HandSplit\|null; R: HandSplit\|null}`로 수정 |
| `workload.pa_faced_today` | `paFacedToday: number` | N | non-null | 서버 하위 필드 **전부 nullable**, 프론트 전부 non-null |
| `workload.est_pitch_count` | `estPitchCount` | N | non-null | |
| `workload.avg_pitches_per_pa` | `avgPitchesPerPa` | N | non-null | |
| `workload.days_rest` | `daysRest` | N | non-null | |
| `workload.appearances_last_7d` | `appearancesLast7d` | N | non-null | 숫자 포함 키 변환 주의(§0) |
| `workload.consecutive_days` (S) | - | N | 없음 | 서버에만. `ReliefCandidate.consecutiveDays`로 따로 존재 |
| `workload.pitches_last_3d` (S) | - | N | 없음 | 위와 동일 (`pitchesLast3d`) |
| - | `workload.hitsAllowed` (F) | | | 서버 Pitcher엔 없음. 서버 `recommend.current_pitcher.this_outing.hits_allowed`에 해당 |
| - | `workload.walksAllowed` (F) | | | `this_outing.walks` |
| - | `workload.outsRecorded` (F) | | | `this_outing.outs` |
| `availability` | `availability: Availability` | - | - | 일치 4종 |
| `unavailable_reason` | `unavailableReason: string\|null` | N | N | 일치 |
| - | `qualityP: number` (F, 0~1) | | | **서버 Pitcher엔 없음**. 서버는 후보에만 `quality_percentile` (0~100, N). 제거 또는 후보 쪽으로 이전 |

### CandidatePitcher (서버 전용 확장, 프론트에 대응 타입 없음 -> `ReliefCandidate`가 일부 대체)
| 서버 | nullable | 프론트 대응 |
| --- | --- | --- |
| `model_score` | N (used = null) | `ReliefCandidate.modelScore: number` (non-null) |
| `model_rank` | N | `modelRank: number` (non-null) |
| `quality_percentile` (int 0~100) | N | `qualityPercentile?: number` (optional, null 불허) |
| `matchup_vs_batter` Matchup | N | `matchupVsBatter?: ...\|null` (optional+null) |
| `role` (S) | N | **없음** (명세 §7 #6 의미 확인 필요) |

---

## 4. Batter (`BatterResponse`)

| 서버 | 프론트 | nullable 차이 |
| --- | --- | --- |
| `batter_id`, `name`, `hit_type`, `photo_url`, `order`, `position` | `batterId`, `name`, `hitType`, `photoUrl`, `order`, `position` | `photo_url` N 일치 |
| `season {avg,obp,slg,ops,hr}` | `season: SeasonBattingStats` | 일치 |
| `recent_avg` | `recentAvg: number` | 명세 §2: **N**, 프론트 non-null -> `number\|null` |
| `vs_current_pitcher` | `vsCurrentPitcher: MatchupStats\|null` | 객체 null 일치 |
| `vs_current_pitcher.avg/woba/iso` | `avg/woba/iso: number` | 명세: **각각 N**, 프론트 non-null |
| `vs_current_pitcher.ab/h` | `ab/h` | 일치 |
| `today {ab,h,rbi,log}` | 동일 | `log`는 결과 코드 배열 (`string[]`), 일치 |

---

## 5. GameState (`GameStateResponse`)

| 서버 | 프론트 | 비고 |
| --- | --- | --- |
| `session_id, game_id, date, inning, half, out_count, base_state` | camel 동일 | 일치 |
| `score {home, away}` | `score {home, away}` | 일치 (결과 화면의 `{my,opp}`와 혼동 금지, §8) |
| `score_diff`, `score_diff_attacker` | `scoreDiff`, `scoreDiffAttacker` | 일치 |
| `my_team`, `opponent_team` | `myTeam`, `opponentTeam` (string) | TeamCode 아님 |
| `my_role` | `myRole: Role` | 일치 |
| - | `homeTeam`, `awayTeam` (F) | **서버 GameState에 없음**. mock 확장. 실서버에서는 `GameSummary.home/away`로 채워야 함(세션 컨텍스트/조회). 라인스코어 라벨용 |
| `current_pitcher` | `currentPitcher: Pitcher` | 일치. offense일 때 누구인지 [확인 필요] |
| `current_batter`, `upcoming_batters` | 일치 | |
| `leverage_index`, `win_expectancy`, `we_perspective` | camel 동일 | 일치 |
| `linescore {away,home,totals}` | 동일, `R/H/E/B` 대문자 | 일치. `(number\|null)[]` 일치 |
| `is_diverged` | `isDiverged` | |
| `diverged_at {inning,half,pa_index}\|null` | `divergedAt {inning,half,paIndex}\|null` | `pa_index`->`paIndex`, null 일치 |
| `is_game_over`, `can_undo` | `isGameOver`, `canUndo` | 일치 |

서버에만 있는 필드: 없음 (GameState 기준). 프론트에만: `homeTeam`, `awayTeam`.

---

## 6. Recommend: `RecommendResponse` / `RecommendationResult` / `ReliefCandidate`

### RecommendResponse (api.ts)
| 서버 | 프론트 `RecommendResponse` | 비고 |
| --- | --- | --- |
| `leverage_index` | `leverageIndex` | |
| `leverage_band` | `leverageBand` | |
| `li_percentile` (int) | - (RecommendationResult에만) | api.ts엔 없음 |
| `li_max` | `liMax` | |
| `source 'precomputed'\|'live'\|'mock'` | - (RecommendationResult에만) | |
| `current_pitcher {pitcher, this_outing{pitches,outs,hits_allowed,walks,matchup_vs_batter\|null}}` (S) | **없음** | 프론트는 `GameState.currentPitcher`만 사용. `this_outing`을 쓰려면 타입 추가(`Workload.hitsAllowed/walksAllowed/outsRecorded` 출처) |
| `candidates: {pitcher: CandidatePitcher}[]` (S) | **없음** (별도 `RecommendationResult.candidates`) | **한 겹 래핑 `.pitcher`** |
| `bullpen_summary {available,used,total}` | `bullpenSummary` | |
| `bullpen_source 'actual'\|'estimated'` | `bullpenSource` | |
| `actual_decision {pitcher_id,name,was_change}\|null` | `actualDecision: ActualDecision\|null` | 프론트 `ActualDecision`에 **`rankInModel`(F)** 추가 존재, 서버엔 없음(§7 #3). `wasChange` 일치 |

### RecommendationResult / ReliefCandidate (recommendation.ts) ↔ 서버 `candidates[].pitcher`
| 서버 | 프론트 | 차이 |
| --- | --- | --- |
| (없음) | `situationId: string` (F) | 서버 미제공. 어댑터가 생성하거나 제거 |
| `leverage_index`, `li_percentile`, `source` | `leverageIndex`, `liPercentile`, `source` | 일치 |
| `candidates[].pitcher` (래핑) | `candidates: ReliefCandidate[]` (평탄) | **래핑 해제 + 평탄화 어댑터 필요** |
| `pitcher.pitcher_id: number` | `pitcherId: **string**` | **타입 불일치** (number vs string) |
| `pitcher.throws: 'L'\|'R'\|'U'` (non-null) | `throws: ... \| null` | 프론트가 더 느슨 (무해) |
| `model_score: number\|null` | `modelScore: number` | **non-null 가정 위반**: used 투수는 null |
| `model_rank: number\|null` | `modelRank: number` | 동일 문제. "1-based, candidates 순서와 오름차순" 가정도 used 때문에 깨짐 |
| `season.era` (중첩) | `era?: number` (평탄) | 구조 다름. 어댑터에서 `pitcher.season.era` |
| `quality_percentile: int\|null` | `qualityPercentile?: number` | optional 표기 vs null 표기 |
| `matchup_vs_batter: Matchup\|null` | `matchupVsBatter?: ...\|null` | 일치(+optional) |
| `workload.consecutive_days` (N) | `consecutiveDays?: number` | 중첩 -> 평탄, null 미표기 |
| `workload.pitches_last_3d` (N) | `pitchesLast3d?: number` | 위와 동일 |
| `workload.days_rest` (N) | `daysSinceLastApp?: number` | **이름 상이** (daysRest <-> daysSinceLastApp) |
| `availability`, `unavailable_reason` | **없음** | 프론트 `ReliefCandidate`에 없음 -> used 하단 분리(명세 §3-6) 불가. 추가 필요 |
| `role: string\|null` (S) | 없음 | 서버에만 |
| `photo_url`, `season`, `vs_batter_hand`, `workload` 나머지 | 없음 | 서버에만(후보 카드에서 쓸 경우 필요) |
| 후보 목록: used 포함 전체 | "현재 투수는 안 나옴/점수 있는 후보만"이라는 가정 | 서버는 used도 목록에 남김(`model_score=null`) |

---

## 7. PaResult (`PaResultResponse`)

| 서버 | 프론트 `PAResult` | 비고 |
| --- | --- | --- |
| `outcome` (9종) | `outcome: PAOutcomeCode` | 일치 (집합 동일; 프론트 `Outcome` 별칭만 상이) |
| `outcome_label`, `description`, `probability` | camel 동일 | |
| `probs` (맵, 9키) | `probs: Record<PAOutcomeCode, number>` | 일치. `source==='actual'`일 때 비어있을 수 있음[확인 필요] -> 프론트 타입은 전 키 필수 |
| `runs_scored`, `delta_we_attacker`, `delta_we_defender` | camel 동일 | 일치 |
| `source 'actual'\|'simulated'` (S) | **없음** | 프론트 PAResult에 누락 |
| `next_state` | `nextState` | |
| (래퍼 `{result}`) | - | §1 |
| - | `offenseHalfSummary?: OffenseHalfSummary` (F) | **서버 응답에 없음**. mock이 공격 반이닝을 자동진행하며 붙인 확장. 실서버는 3아웃 후 `advance-half` 별도 호출로 대체 |

### OffenseHalfSummary / AdvanceHalfSummary
| 서버 `Summary` | 프론트 `AdvanceHalfSummary` | 비고 |
| --- | --- | --- |
| `runs`, `hits` | 동일 | |
| `pa_log[{batter_id, batter, outcome, description}]` | `paLog[{batter, outcome, description}]` | `batter_id` **(S)** 프론트에 없음 |
| `we_trace: number[]` | `weTrace: number[]` | 관점·길이 [확인 필요] |
| `source` | `source` | 일치 |
| `OffenseHalfSummary` (F: inning, half, deltaWe, paLog.runsScored?) | - | 서버에 없음(`deltaWe`, `inning`, `half`, `runsScored`) |

---

## 8. WeTrace / Result / Repeat

### WeTraceResponse
| 서버 | 프론트 | 비고 |
| --- | --- | --- |
| `perspective` | `perspective: string` | |
| `actual/simulated: HalfPoint[]` | `WeTracePoint[]` | |
| `HalfPoint.leverage_index` (필수, 반이닝 **최고** LI) | `leverageIndex?: number` (optional) | optional 여부 상이. 의미(최고 LI)도 차트에 쓰지 말 것(§3-10) |
| `diverge_at {inning,half}\|null` | `divergeAt` | 일치 |
| `current` | `current` | |

### ResultResponse -> `SimulationResult` (구조가 전혀 다름)
| 서버 | 프론트 | 비고 |
| --- | --- | --- |
| `simulated.score {home,away}` / `actual.score {home,away}` | `myFinalScore {mine,opp}` / `actualFinalScore {mine,opp}` | **home/away -> mine/opp 변환 필요** (명세 §7 #1). my 판정: `myTeam===home` |
| `simulated.result` / `actual.result` ('win'\|'loss'\|'tie'\|'in_progress') | `myWin: boolean\|null` / `actualWin` | 타입 상이. `in_progress`가 프론트에 표현 안 됨 |
| `*.runs_allowed_in_range` | `runsAllowedInRange {mine, actual}` | 구조 상이 (Side별 -> 쌍) |
| `*.final_we` | `finalWeDiff: number`, `weDiffReferenceLabel: string` (F) | 서버는 side별 final_we. 차이 계산(클라이언트 파생)은 어댑터 책임인지 정책 확인 |
| - | `date`, `venue`, `myTeam`, `oppTeam`, `startInning`, `startHalf` (F) | **서버 result에 없음** (venue는 서버에 아예 없음). 세션 컨텍스트에서 보충 |
| `pitcher_usage: PitcherUsage[]` | `pitcherUsage: PitcherUsageSegment[]` | 아래 |
| `actual_pitcher_usage` | `actualPitcherUsage` | |
| `decisions: DecisionRow[]` | `decisions: DecisionLogEntry[]` | 아래 |
| `agreement {total_decisions, mine_in_top3\|null, actual_in_top3\|null, same_as_actual}` | `modelComparison {topK, decisionCount, myWithinTopK, actualComparableCount, actualWithinTopK}` | 이름·의미 상이. 프론트 non-null, 서버 N. `same_as_actual`(S), `topK`/`actualComparableCount`(F) |
| `bullpen_used {mine,actual,total}` | `bullpenUsed`, `actualBullpenUsed`, `bullpenTotal` | 평탄화 |
| - | `pitcherChanges`, `actualPitcherChanges` (F) | 서버 없음 (`decisions[].is_change` 집계로 파생 가능) |

**PitcherUsage ↔ PitcherUsageSegment**
| 서버 | 프론트 | 비고 |
| --- | --- | --- |
| `pitcher_id`, `name` | `pitcherId`, `name` | |
| `from {inning,half,pa}` / `to {...}` (중첩) | `fromInning, fromHalf, toInning, toHalf` (평탄) | 구조 상이, `pa`는 프론트에 없음 |
| `delta_we_defender` | `deltaWeSum` | 이름 상이 |
| `li_at_entry` (non-null) | `enteredLI: number\|null` | 케이스·이름 상이 (`liAtEntry`가 아님), null 허용은 프론트만 |
| `pitches_est` (S) | - | 프론트에 없음 |
| - | `paCount`, `fromOut`, `toOut` (F) | 서버 없음 (타임라인 너비용 누적 아웃 -> 이닝/하프로 계산하거나 UI 변경) |

**DecisionRow ↔ DecisionLogEntry**
| 서버 | 프론트 | 비고 |
| --- | --- | --- |
| `inning`, `half` | 동일 | |
| `leverage_index` | `li` | 이름 상이 |
| `model_top {pitcher_id,name}\|null` | `modelRanking: DecisionModelRank[]` | **다름**. 서버는 1위만(현재 null), 프론트는 전체 랭킹 |
| `user_choice {pitcher_id,name,model_rank\|null}` | `chosenPitcherId` | 구조 상이, `model_rank` 손실 |
| `actual_choice {...}\|null` | `actualPitcherId: number\|null` | 구조 상이 |
| `outcome: string` | `outcome: PAOutcomeCode`, `outcomeLabel` (F) | enum 아님(명세 가정 9종) |
| `delta_we_defender` | `deltaWeDefender` | |
| `is_change` (S) | - | 프론트에 없음 |
| - | `outCountBefore`, `baseStateBefore`, `runsScored` (F) | 서버 없음 |

### RepeatResponse -> `RepeatResult`
| 서버 | 프론트 | 비고 |
| --- | --- | --- |
| `n` | `n` | |
| `runs_allowed.histogram: Record<string, number>` | `histogram: {label,count,runs}[]` | **맵 vs 배열**. 어댑터가 정렬·0 채움 |
| `runs_allowed.median` | `median` | |
| `runs_allowed.mean` (S) | - | |
| `final_we.p10 / median / p90` | `p10WE / p50WE / p90WE` | 이름 상이 (median=p50) |
| `better_than_actual_rate` | `probBetterThanActual` | 이름 상이 |
| - | `probSameAsActual` (F) | 서버 없음 |
| `win_rate` (S) | - | |
| `actual {runs_allowed, result}` | `myActualRuns`, `actualGameRuns` (F) | 의미 불명확. 서버는 actual 하나만 제공 |
| `elapsed_ms` (S) | - | |

---

## 9. 서버에만 있는 필드 / 프론트에만 있는 필드 요약

**서버에만 (프론트 타입에 추가 또는 의도적 무시 결정 필요)**
- `AppConfig.model.{score_unit,description,provisional}`, `li_source_note`
- `Workload.consecutive_days`, `pitches_last_3d` (Pitcher 레벨)
- `CandidatePitcher.role`, `availability`/`unavailable_reason`(후보 카드 쪽)
- `RecommendResponse.source`, `li_percentile`(api.ts 쪽), `current_pitcher.this_outing`, `candidates[].pitcher`
- `PaResult.source`
- `AdvanceHalf.summary.pa_log[].batter_id`
- `PitcherUsage.pitches_est`, `DecisionRow.is_change`, `model_top`, `agreement.same_as_actual`
- `RepeatResponse.{runs_allowed.mean, win_rate, actual.result, elapsed_ms}`
- 에러 코드: `GAME_NOT_FOUND`, `INVALID_REQUEST`, `INTERNAL_ERROR`

**프론트에만 (서버 응답에 없음 -> 제거 또는 별도 출처 필요)**
- `GameState.homeTeam/awayTeam`, `Pitcher.qualityP`, `Workload.hitsAllowed/walksAllowed/outsRecorded`
- `AppConfig.qualityP`
- `ActualDecision.rankInModel`
- `PAResult.offenseHalfSummary`, `OffenseHalfSummary`
- `RecommendationResult.situationId`
- `InningOption`, `UsageEntry`(`usageToday`, `usedTonight` 출처), `SimulationResult` 다수(venue, startInning/Half, paCount/fromOut/toOut, modelRanking 등), `RepeatResult.probSameAsActual`

---

## 10. nullable 표기 차이 요약 (명세 §2 기준)

| 필드 | 명세 | 프론트 현재 | 조치 |
| --- | --- | --- | --- |
| `Pitcher.vs_batter_hand.L/R` | `HandSplit\|null` | non-null | `\|null` 추가 |
| `Workload.*` (7개) | 모두 `number\|null` | non-null | `\|null` 추가 |
| `Batter.recent_avg` | `number\|null` | `number` | `\|null` |
| `vs_current_pitcher.avg/woba/iso` | `number\|null` | `number` | `\|null` |
| `CandidatePitcher.model_score/model_rank` | `number\|null` | `number` (ReliefCandidate) | `\|null` (used) |
| `quality_percentile` | `number\|null` | `?: number` | `\|null` |
| `Team.logo_url`, `photo_url`, `unavailable_reason`, `diverged_at`, `diverge_at`, `actual_decision`, `vs_current_pitcher` | N | N | 일치 |
| `DecisionRow.model_top`, `actual_choice`, `user_choice.model_rank`, `agreement.mine/actual_in_top3` | N | 대응 타입이 non-null 구조 | 어댑터에서 null 처리 |
| `ApiError.error.code` | 8종+`NETWORK_ERROR` | 5종 유니온 | `GAME_NOT_FOUND`, `INVALID_REQUEST`, `INTERNAL_ERROR`, `NETWORK_ERROR` 추가 |

기타 타입 정밀도: 프론트 `myTeam/opponentTeam/away/home/Team.code`는 `string` (서버 명세 `TeamCode`), `Outcome` 별칭은 `PAOutcomeCode`로 동일 집합.

---

## 추가. 실측 샘플 vs OpenAPI 전수 대조 (우선순위: 샘플 > 연동 명세 > api-docs.json)

방법: `api-docs.json`의 모든 응답 스키마(`SessionStateResponse`, `SimulatePaResponse`, `RecommendResponse`, `AdvanceHalfResponse`, `WeTraceResponse`, `ResultResponse`, `RepeatResponse`, `TeamResponse[]`, `GameSummaryResponse[]`, `AppConfigProperties`)를 `integration/samples/*.json`과 키 단위로 재귀 대조(스크립트, 배열은 앞 3개, 맵은 앞 2개). 에러 응답은 `ErrorResponse`와 별도 확인.

### 키 구조가 다른 곳 — 1건

| 위치 | OpenAPI | 실제 응답 | 원인 추정 |
| --- | --- | --- | --- |
| `ResultResponse.simulated.score`, `.actual.score` (`Side.score`) | `Score {home, away}` | **`{my, opp}`** | springdoc이 같은 이름 클래스 `Score`를 `GameStateResponse.score`(`{home, away}`, 실제도 home/away)와 `Side.score`가 함께 참조해 한 스키마로 합쳐짐. 실제 `Side.score`는 별개 클래스 |

그 외 이름이 겹칠 만한 스키마(`Actual`, `Summary`, `Model`, `Choice`, `Today`, `Totals`, `Leverage`, `FinalScore`, `DivergeAt`/`DivergedAtResponse`, `PitcherRef`)는 샘플 범위에서 **키·타입 모두 일치**. `GameSummary.final_score`(`FinalScore`)는 `{away, home}`로 일치.

### 샘플에서 확인하지 못한 경로 (값이 항상 null이거나 샘플에 없음 — 충돌 여부 미검증)

`recommend.actual_decision`(분기 후 null), `result.decisions[].model_top`, `result.decisions[].*.model_rank`, `result.agreement.*_in_top3`, `GameState.diverged_at`(분기 전 null), `we-trace.diverge_at`(분기 전 null), `batter.vs_current_pitcher`(null). 4단계 V1에서 분기 후 값 확인.
미관찰 값: `Side.result`의 `loss`/`tie`, 에러 코드 `CANNOT_UNDO`/`NO_AVAILABLE_PITCHER`/`MODEL_UNAVAILABLE`/`INTERNAL_ERROR`. `ErrorResponse`는 관찰한 5종과 형태 일치.

### 샘플에서 `null`이었으나 연동 명세 §2가 non-null로 적은 필드 — §2 정정 대상

샘플 경기(20250322, 2025 개막 시리즈)에서 시즌 누적이 없어 null이 온 것으로 보이지만, 값이 없을 때 null이 오는 것은 실측 사실이므로 **전부 nullable로 취급**한다.

| 필드 | §2 표기 | 실측 |
| --- | --- | --- |
| `Pitcher.season.era`, `.whip` | `number` | `null` |
| `HandSplit.avg / woba / iso` (`vs_batter_hand.L/R` 객체는 있음) | `number` | `null` |
| `Workload.avg_pitches_per_pa`, `.days_rest` | `number \| null` | `null` (명세와 일치) |
| `Batter.season.avg / obp / slg / ops` | `number` | `null` |
| `Batter.recent_avg` | `number \| null` | `null` (일치) |
| `Batter.vs_current_pitcher` | `object \| null` | `null` (일치) |
| `linescore.totals.{away,home}.E` | `number` | `null` |
| `TeamResponse.logo_url` | `string \| null` | 10팀 전부 `null` (일치) |

프론트 영향: `PitcherStatCard`·`NextBattersCard`·`ScoreHeader`(E 칸)가 null에서 크래시하지 않도록 `—` 폴백 필요(D 지적과 같은 계열).

### advance-half `summary.we_trace` 실측 (우회 구현 근거)

- 길이 = `pa_log` 길이 + 1 (샘플: 7타석 → 8개). `we_trace[0]`은 공격 반이닝 시작 시점 WE이며 직전 `simulate-pa`의 `next_state.win_expectancy`(0.701)와 일치. 마지막 값은 반환 `state.win_expectancy`(0.9117)와 일치.
- 관점은 `my_team`(HH). 관점 필드는 없음.
- 따라서 `pa_log[i]`의 ΔWE = `we_trace[i+1] − we_trace[i]`. 타석별 `runs_scored`는 복원 불가(반이닝 합계 `summary.runs`만 있음).
