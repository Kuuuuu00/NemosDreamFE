# 연동 결과 보고 (REPORT)

> 초안 — 구현·검증 단계(3~5)가 끝나면 완료 항목, 남은 이슈, LI 차트 B안 판단 의견을 채운다.
> 이 문서의 "백엔드 요청" 절은 백엔드 팀에 그대로 전달할 수 있게 작성한다.

## 1. 완료 항목
(구현 후 작성)

## 2. 남은 이슈
(검증 후 작성)

## 3. 백엔드 요청

프론트는 아래 1~5를 **우회 구현**해 두었고(`// TODO(backend):` 주석), 서버에 필드·엔드포인트가 생기면 **서버 값을 우선 사용**하도록 분기한다. 반영되면 우회 코드를 제거한다.

| # | 요청 | 현재 프론트 우회 | 우선순위 |
| --- | --- | --- | --- |
| 1 | `GameState`에 `home_team` / `away_team` 추가 | `GET /games` 응답의 `home`/`away`를 세션 시작 시 저장 + sessionStorage | 중 |
| 2 | `DecisionRow`에 `out_count` / `base_state` 추가 | 결정 비교 "상황" 열을 이닝·초말만 표시. 근거: 명세 v0.3의 결정 비교 표 "상황" 열(아웃·주자 포함)과 다름 | 중 |
| 3 | `advance-half` `summary.pa_log[]`에 `runs_scored` / `delta_we` 추가 | `delta_we`는 `we_trace[i+1] − we_trace[i]`(실측: 길이 = 타석 수+1, `my_team` 관점)로 계산. `runs_scored`는 타석별 복원 불가라 반이닝 합계만 표시 | 중 |
| 4 | `GET /api/v1/sessions/{id}` (현재 state 조회) 추가 | 마지막 state를 history와 함께 sessionStorage 한 키에 저장해 복원. 추가 근거: 변경 요청(simulate-pa/advance-half/undo)이 응답 없이 타임아웃 났을 때 서버가 이미 적용했는지 알 수 없어, 재시도하면 한 타석이 중복 진행될 수 있다(멱등 키 또는 상태 조회가 있으면 해결) | 중 |
| 5 | 배포 도메인을 CORS 허용 Origin에 추가 | 개발은 Vite proxy로 회피. 실측: `Origin: http://localhost:5173`만 200, 그 외 Origin은 preflight 403 | 높음(배포 전) |

### 추가 제안 (우회 불필요, 확인·정정 요청)

| # | 내용 | 근거 |
| --- | --- | --- |
| 6 | OpenAPI `Score` 스키마 이름 충돌 정정 | `GameStateResponse.score`와 `Side.score`가 같은 `Score {home, away}`로 문서화되어 있으나 `/result`의 `score`는 실제로 `{my, opp}`(첨부: `samples/result.json`). springdoc 동일 이름 클래스 충돌로 추정 |
| 7 | `/result` `pitcher_usage` / `actual_pitcher_usage`의 세션 이전 구간 | 세션 시작 이전(선발·이전 불펜) 등판이 없어 타임라인이 "세션 시작 이후"만 표시됨. 근거: 7회말 시작 세션에서 첫 등판 기록이 세션 시작 직후 투수이고, 세션 시작 시점 현재 투수(박상원)의 이전 등판은 없음(첨부: `samples/result.json`, `samples/recommend.json`) |
| 8 | `bullpen_used.total`(10)과 `bullpen_summary.total`(8) 모수 | 같은 세션에서 값이 다름. 의미 확인 |
| 9 | `INVALID_ROLE` message 분리 | `advance-half`/`simulate-pa`에서도 recommend 문구 재사용 → 프론트는 code 기준 문구 사용 |
| 10 | `quality_percentile` null 규칙 | used 투수도 값이 있고 available 일부는 null (명세와 반대) |
| 11 | 모델 순위 필드 null 해소 일정 | `model_top`, `*.model_rank`, `agreement.*_in_top3`가 아직 null |
| 12 | `Side.result`의 값 목록(`loss`, `tie`) 확인 | 샘플에서 `win`, `in_progress`만 관찰 |
| 13 | 응답 스키마에 `nullable` 표기 | 샘플 실측 null 다수: `season.era/whip`, `HandSplit.*`, 타자 `season.*`, `linescore.totals.*.E` 등 (첨부: `samples/sessions.json`, `samples/recommend.json`) |
| 14 | `/health` 응답 바디가 평문 `OK` | OpenAPI는 JSON 문자열로 표기 |
| 15 | `simulate-pa` `source: "actual"` 타석의 `probs` | 타자·투수와 무관하게 동일한 값이 오는 타석이 있어 placeholder로 의심 (첨부: `samples/simulate-pa-1-actual.json`, `samples/simulate-pa-2-actual.json`). 프론트는 `actual` 타석의 확률 막대를 숨김(`TODO(backend)`) |
| 16 | **`/result` `actual_pitcher_usage`가 실제 경기 기록인지 확인 (우선순위 높음 — 결과 화면의 "실제 감독 비교"가 이 배열에 의존)** | 샘플 경기(7회말 시작 세션)의 `actual_pitcher_usage` 3건이 모두 `from.pa=0, to.pa=3`이다: 김서현 7회말 0→3, 한승혁 8회말 0→3, 주현상 9회말 0→3. 반이닝마다 정확히 4타석(포함 규칙)인 것은 우연으로 보기 어렵다. 같은 배열의 `delta_we_defender`(-0.0099 / 0.0083 / 0.1832)와 `pitches_est`(11 / 13 / 18)가 실제 경기 기록에서 계산된 값인지, 근사·가공값인지 알려 달라. 참고: 내 운용 `pitcher_usage`는 `decisions` 행 수와 일치한다(7회말 3행 = 3타석, 첨부: `samples/result.json`) |

## 4. LI 차트 B안 판단 의견 (§3-10-1 기준 3가지)
(V1 결과로 작성. C안 전환 여부는 사용자가 결정)
