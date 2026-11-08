# C. 실서버 실측 결과 (https://nemosdream.cloud)

- 측정일: 2026-11-08 (서버 Date 헤더 기준), 클라이언트: curl (WSL2), 소스 코드 수정 없음
- 쓰기는 시뮬레이션 세션 1개(`s_9d1c874af08343649530b5c9`)로 한정. 시나리오 경기: `20250322HHKT02025` (HH 원정 4:3 승), `my_team=HH`, `start_inning=7`
- 응답 원문: `docs/integration/samples/*.json` (CORS 헤더는 `cors-*.txt`)
- 판정 표기: **확정**(명세 기준과 일치) / **다름**(명세와 다름) / **불명**(이번 실측으로 판단 불가)

## 1. §5 [확인 필요] 15개 항목

| # | 대상 | 실측 | 판정 |
| --- | --- | --- | --- |
| 1 | `/health` | HTTP 200, 바디는 따옴표 없는 평문 `OK` (JSON 문자열 `"OK"` 아님). `res.json()` 은 파싱 실패하므로 `res.ok` 만 볼 것 | 확정 ("OK") / 파싱 주의 |
| 2 | `/config` | bands: 저 0.0-0.85, 중 0.85-1.5, 고 1.5-3.0, 매우 높음 3.0-5.0. `league_avg=1.0`, `max=5.0`, `model.score_unit="wpa_per_pa"`, `provisional=true`, description "Contextual Bandit 예상 성과. 투수 관점, 높을수록 좋음" | 확정 (명세 예시와 동일) |
| 3 | `model_score` 스케일 | 7회말 첫 호출(LI 1.61): 최대 -0.00975, 최소 -0.01789 (전부 음수), 범위폭 약 0.0081, 인접 후보 차이 0.0003~0.0027. 분기 후 8회말(LI 0.74): 최대 +0.00254, 최소 +0.00019, 폭 0.0023, 인접 차이 0.00004~0.0010. 즉 스케일은 약 1e-2~1e-3. **정우주(55743)와 권민규(55764)는 점수가 완전히 동일**(-0.010847635660523918, 8회에도 0.000325 동일) 하지만 rank는 2, 3으로 구분됨. 절대값 표시 불가, min-max 정규화 필수. 정규화하면 구분은 되나 동점 후보 존재 | 확정 (매우 작음/음수 가능). 동점 후보 존재는 추가 사실 |
| 4 | `role` 값 | 후보 8명 전원 `"bullpen"`. 두 번 호출(7회/8회) 모두 동일. 마무리/셋업 구분 없음 -> 표시 가치 낮음 | 확정(값 목록은 `bullpen` 하나만 관찰) |
| 5 | recommend 값 | `source="live"` (명세 후보 `precomputed/live/mock` 중 live), `leverage_band` = "고"(LI 1.6054) / "저"(0.7411) = config 라벨과 일치, `bullpen_source="actual"`, `availability` = `available` / `used` 관찰. `current`/`unavailable`은 관찰 못함(current_pitcher는 candidates에서 분리됨) | 확정 (일부 값 미관찰) |
| 6 | used 투수 | `model_score=null`, `model_rank=null`, **`quality_percentile`은 null 아님**(김서현 39, 박상원 70 값 존재), `unavailable_reason="이미 등판"`, `matchup_vs_batter`도 값 있음(favorable). 또 **미사용 후보에서도 `quality_percentile`이 null** 인 경우 있음(정우주, 권민규 = 표본 없는 투수로 추정) | **다름** (used의 quality_percentile은 non-null. 반대로 available의 일부는 null) |
| 7 | `source:"actual"`의 probs/probability | `probs` 9개 키 모두 존재, 합 1.0 (GDP=0.0 포함). `probability`도 실제 결과의 확률(예: FO 0.2366, GO 0.2169). **actual이어도 분포가 비어있지 않음.** 주의: PA 3개(타자 로하스, 허경민, 플로리얼 등 서로 다른 타자)에서 `probs` 분포가 **완전히 동일**했고 simulated(투수 다름)에서도 동일 -> probs가 타자/투수별로 계산되지 않는 placeholder일 가능성. 백엔드 확인 필요 | 확정(비어있지 않음) / 의심(분포 고정) |
| 8 | used 투수 id를 simulate-pa에 전송 | HTTP 400 `INVALID_REQUEST`, message "이미 등판한 투수는 다시 나올 수 없습니다: 53754", recoverable=false. 명단에 없는 id(1)도 400 `INVALID_REQUEST` "이 경기 내 팀 명단에 없는 투수입니다: 1" | 확정 |
| 9 | offense일 때 `current_pitcher` | 상대(KT) 투수 (예: 8회초 공격, `원상현`). 즉 지금 마운드의 투수 = 상대 팀 투수 | 확정 (상대 투수) |
| 10 | 분기 전 `diverged_at` | 분기 전 null, 분기 후 `{"inning":7,"half":"bot","pa_index":58}`. `we-trace.diverge_at`도 분기 전 null, 분기 후 `{inning,half}` | 확정 |
| 11 | advance-half `summary.we_trace` | 타석 7개(pa_log 7) -> we_trace 8개 = **타석 수 + 1** (첫 값 0.701 = 공격 시작 시점 WE로 보임, 직전 `win_expectancy`와 일치). 마지막 값 0.9117, 값이 올라가는 흐름 (HH 공격이 득점) -> **HH(my_team) 관점**으로 보임. 값 `[0.701,0.682,...,0.9117]` | 확정 (n+1, my_team 관점 추정. 관점 필드는 없음) |
| 12 | 공격 반이닝 직후 undo | 8회초(offense) 상태에서 advance-half(8회말 defense로 진행) 후 undo -> **8회초 공격 시작 상태**(`inning=8, half=top, out=0, my_role=offense`, `current_pitcher=원상현`, `is_diverged=true`, `diverged_at` 유지, `can_undo=true`)로 복귀. 즉 공격 반이닝만 되돌아가고 직전 수비 타석까지는 가지 않음 (후자 시나리오). 프론트는 offense 상태에서 advance-half 대기 화면 필요 | 확정 (후자) |
| 13 | `/result` | `Side.result` = `win`/`in_progress` 관찰(simulated=in_progress, actual=win). loss/tie는 미관찰. `decisions[].outcome` = Outcome 9종 코드 (`FO`,`GO` 관찰). `Side.score`는 **`{my, opp}`** (아래 §2-1 참조) | `result` 값은 일부만 관찰 / outcome 형식 확정 |
| 14 | `/repeat` n=10 | 1회차 HTTP 0.857s(서버 `elapsed_ms` 602), 2회차 0.727s(서버 512). 응답 바디(`elapsed_ms` 제외)는 **완전히 동일**: histogram `{0:5,1:1,2:1,3:1,4:1,6:1}`, mean 1.6, win_rate 0.6 -> 같은 n 재호출은 결정적(시드 고정). n=100 실측은 이번 범위 밖(n=10 한정). 선형이라면 n=100 약 5~6초 예상(추정이므로 실측 필요). 또 `median` 0.5처럼 정수 아닌 값 가능, 샘플 10개에서 `final_we`의 p10/p90이 0.0/1.0 | 확정 (재호출 동일) / n=100 불명 |
| 15 | `photo_url` | 투수·타자 모두 `/static/players/{id}.webp` **상대 경로**(후보 8명 전원 non-null, 타자도 non-null). 실제 요청 `https://nemosdream.cloud/static/players/54755.webp` -> 200 `image/webp`. `Team.logo_url`은 10팀 **전원 null**. 절대 URL 관찰 안 됨 | 확정 (상대경로, 팀 로고 전부 null) |

## 2. 명세와 다른 점

### 2-1. `/result` 의 `score` 키 (§7 #1 과 반대)
- 명세 문서(§3-11, §7 #1)는 서버가 `{home, away}` 라고 했으나 **실측은 `{"my":3,"opp":2}`** (simulated), `{"my":4,"opp":3}` (actual). 즉 v0.3 원 명세대로 이미 내 팀 관점. 프론트에서 home/away 변환하면 **깨진다**. 타입(`Side.score`)을 `{my, opp}`로 수정할 것.

### 2-2. `quality_percentile` null 규칙 (§5 #6)
- used 투수도 값이 있고, available 중 일부가 null. 타입은 `number | null` 유지하되 "used면 null" 가정 금지.

### 2-3. `/health` 바디는 평문 `OK`
- 바디가 JSON이 아닌 평문. `res.json()` 금지, `res.ok`만.

### 2-4. `decisions[].actual_choice` 분기 후에도 non-null
- 명세는 "분기 후 null"이라 했으나, 분기 후 타석(와이스 선택)의 `actual_choice`가 실제 감독 투수(김서현)로 채워져 있다. null 처리 + 값 처리 둘 다 필요.
- 반면 `recommend.actual_decision`은 분기 전 객체(`{pitcher_id:53754,name:"김서현",was_change:true}`), 분기 후 null로 명세와 일치.

### 2-5. `INVALID_ROLE` message
- simulate-pa(공격 중): "공격 반이닝에서는 투수를 고를 수 없습니다. /advance-half 로 진행하세요." (명세 표의 recommend용 문구와 다름. 엔드포인트별 문구 존재). code 로 분기하면 문제 없음.
- 위 문구를 그대로 화면에 노출하지 말 것(기존 지침 유지).

### 2-6. 에러 message 는 상세 문구 포함
- `INVALID_REQUEST`는 고정 문구가 아니라 원인 포함: "team: 필수 값입니다.", "이미 등판한 투수는 다시 나올 수 없습니다: 53754", "이 경기 내 팀 명단에 없는 투수입니다: 1".

### 2-7. 현재 투수는 후보에서 제외되고 분기 후에도 후보 목록에 누적
- 첫 호출(7회말 시작 직전): 현재 투수 박상원은 `current_pitcher`로 분리되고 candidates 8명은 모두 `available`. 실제 감독 교체 대상 김서현은 available 후보 4위(점수 -0.01116)였다. 8회 호출에서는 박상원, 김서현이 `used`(하단).
- 후보 수 8 = 불펜 total 8 (현재 투수 박상원 포함). 첫 호출 시 `bullpen_summary.used=0`인데 현재 투수 박상원은 이미 20구 던진 상태 -> 현재 투수는 used/available 집계에서 빠져있다가 교체되면 used로 집계.

### 2-8. 기타 관찰
- 투수 `season`: era/whip가 `null`, ip 0.0, g 0 인 투수 존재(와이스: 표본 없음). `vs_batter_hand.L/R` 는 객체이되 내부 avg/woba/iso가 null, pa 0 (즉 L/R 키 자체가 null이 아니라 값이 null). 타입상 `avg/woba/iso: number | null`, `era/whip: number | null`.
- `workload.avg_pitches_per_pa`, `days_rest` null 관찰.
- `we-trace.simulated`: 분기 직후 점수 `[{7,bot,0.701,1.6054},{8,top,0.701,0.0}]` -> 아직 진행 안 한 공격 반이닝은 `leverage_index: 0.0`, 진행중 반이닝의 `we`는 현재값. 차트에서 LI 0.0 점 필터링 필요.
- 분기 전 `we-trace`: `simulated=[]`, `diverge_at=null`, `actual` 18점(1회초~9회말), `current=0.7481`.
- `linescore.away/home` 배열은 9칸 고정이며 진행 안 된 이닝은 `null`.
- `state.score`는 `{home, away}` 유지, `we_perspective="HH"`.
- 3아웃 시 `simulate-pa`의 `next_state`: 이닝/하프 전환(7회말 -> 8회초), `my_role=offense`, `out_count=0`, `base_state="0"`. (명세 일치)
- 분기 시점(simulate-pa 3번째, 다른 투수 와이스) 응답에서 바로 `source="simulated"`, `is_diverged=true`, `diverged_at.pa_index=58`.
- `result.decisions`는 수비 타석마다 1줄 (3줄: 7회말 3타석), `is_change`는 첫 타석(교체)과 분기 타석에서 true, 유지 타석 false. `pitcher_usage`는 투수별 구간(from/to), `agreement.mine_in_top3`/`actual_in_top3`는 null, `model_top` null (명세 일치), `same_as_actual=2`.
- 분기 후 `advance-half`가 진행한 8회초 공격: `summary.source="simulated"`, 득점 2, 안타 4, 이후 상태 8회말 defense `out_count=0`, 현재 투수 와이스(분기 때 고른 투수 유지).

## 3. CORS

| 요청 | 결과 |
| --- | --- |
| `GET /api/v1/config` + `Origin: http://localhost:5173` | 200, `Access-Control-Allow-Origin: http://localhost:5173`, `Vary: Origin` |
| `OPTIONS /api/v1/sessions` + Origin localhost:5173, `Access-Control-Request-Method: POST`, `Access-Control-Request-Headers: content-type` | 200, `Access-Control-Allow-Origin: http://localhost:5173`, `Access-Control-Allow-Methods: GET,POST,DELETE,OPTIONS`, `Access-Control-Allow-Headers: content-type`, `Access-Control-Max-Age: 3600` |
| `OPTIONS` 같은 요청, `Origin: https://example.com` | **403** (허용 목록 방식, localhost:5173 만 허용된 것으로 보임) |

결론: 개발 서버(`localhost:5173`)에서는 **프록시 없이 직접 호출 가능**. 다른 포트(예: 4173 preview)나 배포 도메인은 허용 여부 미확인 -> 배포 시 백엔드에 도메인 추가 요청 필요. `Access-Control-Allow-Credentials` 헤더는 없음(쿠키 사용 안 함, 문제 없음). `Allow-Headers`는 요청한 `content-type`만 반환(요청 헤더를 에코하는 방식으로 보임).

## 4. 응답 시간 (단일 측정, 순서대로)

| 호출 | HTTP | 시간 |
| --- | --- | --- |
| GET /health | 200 | 0.30s |
| GET /config | 200 | 0.77s |
| GET /teams | 200 | 2.77s (첫 호출 콜드, 느림) |
| GET /games?team=HH | 200 | 0.53s (142경기) |
| POST /sessions | 201 | 0.65s |
| POST /recommend (1회) | 200 | 1.55s |
| POST /simulate-pa (1,2,3) | 200 | 0.18 / 0.15 / 0.11s |
| GET /we-trace | 200 | 0.24s (이후 0.09s) |
| POST /advance-half | 200 | 0.24s / 0.18s |
| POST /undo | 200 | 0.13s |
| POST /recommend (2회) | 200 | 0.14s |
| GET /result | 200 | 0.12s |
| POST /repeat n=10 | 200 | 0.86s (서버 602ms) / 0.73s (서버 512ms) |
| 오류 응답들 | 400/404 | 0.1~0.12s |

첫 recommend(1.55s)와 teams(2.77s)는 콜드 캐시 가능성. 이후 호출은 0.1~0.25s. `advance-half` 2초 연출과 충분히 양립.

## 5. 에러 응답 실측 (`samples/error-*.json`)

| 상황 | HTTP | code | recoverable |
| --- | --- | --- | --- |
| 잘못된 session_id (we-trace, recommend) | 404 | `SESSION_EXPIRED` | false |
| 공격 중 simulate-pa | 400 | `INVALID_ROLE` | false |
| used 투수 / 명단 외 투수 | 400 | `INVALID_REQUEST` | false |
| `/games` team 누락 | 400 | `INVALID_REQUEST` | false |
| 존재하지 않는 game_id | 404 | `GAME_NOT_FOUND` | false |

전부 `{ "error": { code, message, recoverable } }` 형식으로 명세 §0-2와 일치. 관찰 못한 코드: `CANNOT_UNDO`, `NO_AVAILABLE_PITCHER`, `MODEL_UNAVAILABLE`, `INTERNAL_ERROR` (상태를 더럽히거나 서버 장애 유도가 필요하여 시도하지 않음).

## 6. 추가 메모 / 백엔드 확인 요청 후보

1. `probs`가 타자/투수와 무관하게 동일한 것으로 보임(PA 3회 모두 동일 분포, SO=0.1889). 의도된 것인지 확인.
2. 모델 점수 동점(정우주/권민규)과 `quality_percentile` null의 의미 확인.
3. `/result` `score`가 `{my, opp}` 임을 명세 문서(§7 #1)에 반영.
4. 진행 전 공격 반이닝의 `we-trace.simulated[].leverage_index = 0.0` 은 "미계산" 표식으로 보임. 확인 요청.
5. 샘플의 경기는 HH 원정(수비=말)이다. 홈 경기(수비=초) 세션은 이번에 시험하지 않음.

## 7. 세션 이전 등판 불펜의 `used` 표시 / `pitcher_usage` 범위 (PLAN 결정 반영 확인)

샘플: `samples/recommend.json`(7회말 세션 시작 직후), `samples/recommend-after-diverge.json`(분기 후), `samples/result.json`. 경기 20250322HHKT02025, HH 원정, 7회 시작.

| 관찰 | 값 |
| --- | --- |
| 세션 시작 직후 `bullpen_summary` | `available 8 / used 0 / total 8`. 후보 8명 전원 `availability: "available"`, `workload.pa_faced_today: 0` |
| 세션 시작 시점 현재 투수 | 박상원 (`availability: "current"`). 세션 이전(1~6회)에 이미 등판한 투수. 후보 목록에는 **없음** |
| 박상원이 교체된 뒤(분기 후) | 후보에 `used` (`unavailable_reason: "이미 등판"`, `pa_faced_today: 5`)로 등장 |
| 분기 후 `used` | 김서현(세션 중 등판 2타석), 박상원(세션 이전 등판분 포함 5타석) — 둘 다 `model_score: null`, `quality_percentile` 값 있음 |
| `/result` `pitcher_usage` 첫 항목 | 김서현 7회말 pa 0부터. **박상원의 세션 이전 등판은 없음** → 타임라인은 "세션 시작 이후"만 커버 |
| `/result` `bullpen_used` | `{mine: 4, actual: 5, total: 10}` — `/recommend`의 `bullpen_summary.total`(8)과 모수가 다름. 의미 확인 필요 |

**결론**
- 세션 시작 시점에는 세션 이전 등판 투수가 `used`로 오지 않는다(`used: 0`). 현재 투수만 `current`로 별도 표시되고, 교체되면 그때 `used`가 된다.
- 이 샘플은 1경기·7회 시작이라, **1~6회에 이미 교체되어 내려간 다른 불펜**이 `used`로 오는지는 이 데이터로 판단할 수 없다(해당 투수가 있었는지 불명). 다른 경기·시작 이닝(8~9회)으로 추가 확인이 필요하다 → V1 플레이스루에서 확인.
- 세션 이전 구간(선발 포함)의 등판 이력은 API에 없다 → REPORT 백엔드 요청 항목.
- `bullpen_used.total` 모수 불일치는 REPORT 백엔드 확인 항목.

## 8. "현재 투수 유지"는 항상 실제 선택이 아니다 (3-1 smoke 실측)

세션 시작 타석(7회말)의 `recommend.actual_decision`이 `{pitcher_id: 53754(김서현), was_change: true}`였다. 이때 현재 투수(박상원)의 id로 `simulate-pa`를 보내면 첫 타석부터 `source: "simulated"`, `is_diverged: true`가 된다. 실제 감독의 선택(김서현)을 고른 경우에만 `source: "actual"` (`samples/simulate-pa-1-actual.json`). 서버 동작은 §3-7 설명문과 일치하며, 연동 명세 §4-1 체크리스트 문구만 정정했다. UI 영향: 첫 결정에서 "유지"를 눌러도 분기 표시(`is_diverged`)가 즉시 켜질 수 있다.
