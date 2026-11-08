# 연동 결과 보고 (REPORT)

> 이 문서의 **"3. 백엔드 요청"** 절은 백엔드 팀에 그대로 전달할 수 있게 작성했다(근거는 표 안에 직접 적었고, 필요한 샘플은 "첨부"로 표시).
> 나머지 절은 프론트 내부 보고용이다.

## 1. 완료 항목

- **연동 기반**: `src/api`(fetch 래퍼·에러 정규화·타임아웃·abort, 엔드포인트 12개, 엔드포인트별 명시 어댑터), `VITE_USE_MOCK` 스위치(mock 유지), 단일 seam(`@/api`), Vite proxy(Origin 제거), `.env.development/.production`, `useConfig`(1회 캐싱).
- **화면 연동**: 온보딩(이닝 버튼은 `available_innings`·승부처 강조), 대시보드(`my_role` 분기, advance-half 2초 연출, 공격 직후 undo의 offense 대기, 새로고침 복원), 결과(`result` enum, 교체 행만 보기 토글, 모델 순위 null 처리, 반복 시뮬레이션).
- **레버리지 차트 B안**: `GameState.leverage_index` 기록(수비 상태만), 반이닝마다 끊긴 선분, 로그와 공유하는 undo 스택.
- **견고성**: 요청 중 액션 잠금, 늦은 응답 무효화, state+history 원자적 저장, 에러 배너(code 기준 문구, recoverable일 때만 재시도), SESSION_EXPIRED 온보딩 복귀 + 안내.
- **문서**: 연동 명세 §2·§3-11·§4-1·§5·§7을 실측 기준으로 정정(우선순위: 실측 샘플 > 명세 > OpenAPI).
- **검증**: V1 실서버 플레이스루(§4-1 체크리스트 13/14 PASS → 남은 1건 수정·재검증), V2 규칙 감사(13개 중 PASS 8, FAIL 5 → 수정), V3 목업 회귀(PASS, 서버 요청 0건). 어댑터·에러 정규화는 `scripts/smoke-api.ts`(샘플 대조 + 실서버)로 회귀 확인 가능.

## 2. 남은 이슈

- **백엔드 의존(우회 구현 중, `TODO(backend)`)**: 아래 3절 #1~#5. 서버가 값을 주면 프론트는 서버 값을 우선 쓴다.
- **미관찰**: `Side.result`의 `loss`/`tie`, 연장·콜드 등 다른 종료 경로와 `in_progress` 화면, `CANNOT_UNDO`·`NO_AVAILABLE_PITCHER`·`MODEL_UNAVAILABLE`·`INTERNAL_ERROR` 실응답, 모바일 폭, "되돌리기"·"투입" 버튼 연타. (`"현재 투수 유지"` 연타는 요청 1회만 나가는 것을 확인.)
- **재시도 중복 위험**: 변경 요청(simulate-pa 등)이 응답 없이 타임아웃 난 뒤 "다시 시도"하면 서버가 이미 적용했을 경우 한 타석이 중복 진행될 수 있다. 상태 조회 API(#4) 또는 멱등 키가 있어야 해결된다.
- **개발 모드 한정**: 새로고침 시 recommend POST가 2번 나간다(React StrictMode의 effect 이중 실행). 운영 빌드에는 해당 없음.
- **동점 점수 표시**: 점수가 같은 후보 2명은 min-max에서 둘 다 100으로 표시된다(서버 점수가 동점인 정상 결과).
- **번들**: mock 코드가 운영 번들에 포함된다(서버 장애 대비 스위치를 유지하기로 한 결정의 대가, 호출 경로 없음).
- **복원 경계**: 새 브라우저에서 `/result/{id}`를 직접 열면 서버 세션이 살아 있어도 열리지 않는다(백엔드 #17).

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
| 17 | `/result` 응답에 세션 메타 포함 (`my_team`, `home`/`away`, `start_inning`) | 응답에 이 값들이 없어 점수 변환과 헤더 표시가 같은 브라우저 sessionStorage 메타에 의존한다. 새 브라우저에서 유효한 세션 id로 `/result/{id}`를 열면 "세션 만료"로 처리되어 결과 링크를 공유할 수 없다 (첨부: `samples/result.json`) |

## 4. LI 차트 B안 판단 의견 (§3-10-1 기준 3가지)

근거: V1 플레이스루(원정·홈·9회 시작 세션, 스크린샷 `docs/integration/screens/S1-*`, `S3-*`, 수정 후 확인 `S7-*`, `S8-*`). **C안 전환 여부는 사용자가 결정**한다.

1. **실제 경기 LI와 비교 불가**: 플레이 중 이 비교가 필요해지는 순간은 없었다. 실제와 시뮬레이션의 비교는 승률 곡선(actual vs simulated)이 이미 맡는다. 발표 서사에서 "실제 경기 LI와의 비교"를 쓸 계획이면 C안이 필요하고, 아니라면 불필요하다.
2. **끊긴 선분이라 추이가 안 읽히는가**: 선분 안의 추이와 고레버리지 구간은 읽힌다(`S1-10-mid-8.png`). V1에서 "읽기 어렵다"고 느껴진 원인은 B안 자체가 아니라 구현 결함 두 가지였다(툴팁이 2번째 타석 값만 반복, 새 반이닝 첫 점이 그려지지 않음). 둘 다 수정했고 재확인했다(점마다 다른 툴팁 값, 새 반이닝 첫 점은 점으로 표시, Y축 눈금 `0.0/0.8/1.5/2.3/3.0`, `S8-li-final.png`).
3. **시작 이닝이 늦으면 점이 적음**: 9회 시작 세션은 한 반이닝에 점 3~4개로 LI가 0.98에서 5.02까지 오르는 모습이 충분히 읽혔다(`S3-06-1.png`). 문제 수준이 아니다.

**의견**: B안을 유지해도 되며, C안으로 바꿔야 할 근거는 이번 플레이에서 찾지 못했다. 위 1번(실제 LI 비교가 서사에 필요한지)만 사용자 판단이 필요하다.
