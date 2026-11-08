# V1 실서버 플레이스루 검증 결과

검증자: 구현 과정을 모르는 독립 검증자(Playwright, headless chromium 1440x900). 앱은 전용 dev 서버(포트 5190, `VITE_USE_MOCK=false`, Vite proxy)로 실서버 `https://nemosdream.cloud`에 연결했다. 코드는 수정하지 않았다.
판정 근거는 화면(DOM·SVG·스크린샷)에서 관찰한 값과, 같은 시점에 `page.on('response')`로 로깅한 서버 응답 값의 비교다. 스크린샷은 `docs/integration/screens/`(파일명 접두어 S1~S5).
스크립트·원시 로그(요청/응답 전체)는 스크래치 `.../scratchpad/pw/*.mjs`, `.../scratchpad/S*.json`에 있다(저장소 밖).

## 1. 시나리오(모두 별도 세션)

| ID | 경기 | 내 팀 | 시작 | 결과 |
| --- | --- | --- | --- | --- |
| S1 | 20250322HHKT02025 (원정: away=HH, home=KT) | HH | 5회(말 수비) | 5~9회말 수비 후 9회말 3아웃에서 `/result`(한화 7:8 패배). 같은 경기를 한 번 더 실행했던 1차(한화 5:3 승리)는 결과 화면 도구 오류로 결과 조작을 못 해 스크립트 수정 후 재실행했고, 문서의 수치·스크린샷은 재실행 기준 |
| S2 | 20250425 (KT 원정, HH 홈, 수비=초) | HH | 5회(초 수비) | 9회말 공격(advance-half)로 `is_game_over` → `/result`. 한화 0 : 1 KT |
| S3 | 20250322HHKT02025 | HH | 9회 | 9회말 4타석 후 `/result` |
| S4/S4b/S4c | 같은 경기 | HH | 9회 | SESSION_EXPIRED 3종 |
| S5 | 같은 경기 | HH | 7회 | `was_change=true`인데 "유지" 선택 |

요청 수(S1/S2): simulate-pa 26/20, advance-half 5/6, undo 2/2. 4xx/5xx는 의도한 S4b(404 SESSION_EXPIRED)뿐. 콘솔 에러는 의도한 오프라인·만료 시험뿐(그 외 0건).

## 2. §4-1 체크리스트 판정

| # | 항목 | 판정 | 시나리오 | 증거 |
| --- | --- | --- | --- | --- |
| 1 | 매 타석 후 헤더 스코어 == 라인스코어 R 합계 | PASS | S1,S2,S3 | 액션마다 서버 `state.score`(홈/어웨이를 my/opp로 변환) == 헤더 숫자 == 라인스코어 R 열(원정 경기는 내 팀이 위, 홈 경기는 상대가 위 행) 비교. S1 30회, S2 24회, S3 4회 점검에서 불일치 0. 예: S1 `3:2`→`5:3` 구간, S2 `0:1`. (S2 1차 실행의 불일치 경고는 내 검증 스크립트가 홈 경기 행 순서를 틀린 것이라 수정 후 재실행해 0건 확인) |
| 2 | `we_perspective`, `we-trace.perspective` == my_team | PASS | S1(원정), S2(홈) | 모든 state의 `we_perspective`=="HH", 모든 `we-trace.perspective`=="HH". 이슈 0 |
| 3 | actual과 같은 선택 → `is_diverged` false, `source:"actual"`, `simulated` [] (+ `was_change` 주의) | PASS | S1,S2,S3,S5 | `actual_decision` 기준으로 선택(was_change면 그 투수 투입, 아니면 유지). 분기 전 simulate-pa 19건(S1 9, S2 6, S3 4) 전부 `source:"actual"`, `is_diverged:false`, `we-trace.simulated` 길이 0, `diverge_at` null. 확인용 S5: 7회말 첫 타석 `actual_decision={김서현,was_change:true}`에서 현재 투수(박상원) "유지" → 즉시 `source:"simulated"`, `is_diverged:true`, `diverged_at={7,bot,pa_index:56}`, `simulated` 1점(`S5-01-stay-diverges.png`). 명세 주의사항 그대로 |
| 4 | 다른 투수 선택 직후 `is_diverged` true, `diverged_at` 채워짐, `simulated` 곡선 | PASS | S1,S2 | S1 7회말: 와이스 선택 → `source:simulated`, `diverged_at={7,bot,56}`, `we-trace.simulated`=1 → 이후 곡선(`S1-07-after-diverge.png`, `S1-10-mid-8.png` 초록 선 + "여기서 갈라졌습니다"). S2 7회초: 폰세 선택, `diverged_at={7,top,45}`. 분기 후 `actual_decision`은 null, 결과 화면 해당 열 "— (분기 이후라 비교 불가)" |
| 5 | 3아웃 → offense → advance-half → 다음 수비 `out 0`, base `"0"` | PASS | S1,S2 | advance-half 응답 11건(S1 5, S2 6) 중 경기 종료 아닌 10건 전부 `my_role:defense`, `out_count:0`, `base_state:"0"`. 앱이 자동 호출(수동 버튼은 undo 후에만 보임). 공격 이닝 오버레이 약 4.8~5.4초 → "N회말 한화 수비" 인터스티셜 → 첫 타석. S2는 마지막 advance가 `is_game_over:true`(9회말 공격 후, `state.out_count:3`)여서 `/result`로 이동 |
| 6 | undo 후 같은 선택 → 같은 결과 | PASS | S1,S2 | 분기 타석 결과를 저장 → undo → 같은 투수 재선택 → `PaResult` JSON 전체 및 `next_state` 전체 동일(`eqRes:true`, S1 1B ΔWE -0.0827, S2 1B -0.0457). undo 후 `is_diverged:false`, `diverged_at:null`, `simulated` [] 복귀 |
| 7 | used 투수 후보 하단 회색, `model_score` null, 바 없음 | PASS (S1), 해당없음(S2) | S1,S3 | S1: 등판한 박상원이 "등판 불가" 그룹 하단, 행에 `text-disabled`(회색), 문구 "이미 등판", 점수·순위·바 없음. 서버 `availability:"used"`, `model_score:null`, `model_rank:null`, `unavailable_reason:"이미 등판"`. 후보 목록(7명)에는 포함되지 않음(`S1-08-used-group-full.png`, `S1-08b-used-group-view.png`). S3 9회: 정우주·이태양 used(`S3-04-offline-banner.png`). S2는 미등판이라 used 0 |
| 8 | 결과 화면 점수 내 팀:상대, 홈·원정 둘 다 | PASS | S1(원정), S2(홈), S3 | 서버 `/result` `score:{my,opp}`가 그대로 "한화 N : M KT"로 표시. S1 실제 `4:3`(HH 원정 승, 서버 final_score away4:home3) → 화면 "한화 4 : 3 KT 승리". S2 실제 경기 KT 2:1 HH(HH 홈 패) → 화면 "한화 1 : 2 KT 패배", 내 시뮬레이션 "한화 0 : 1 KT". 새로고침 후에도 동일(`S1-16`, `S2-16`) |
| 9 | 모델 순위 null일 때 결과 화면이 깨지지 않음 | PASS | S1,S2,S3 | `model_top`/`model_rank` 전부 null → "모델 1위" 열 "—", "(모델 N위)" 없음. 요약은 "22번의 결정 중 9번이 실제 감독과 같았습니다."(`same_as_actual` 기반). "undefined"/"NaN" 없음(`S1-12-result-full.png`) |
| 10 | LI 차트 마지막 점 == 헤더 현재 LI (매 타석) | PASS (주의 A1,A2) | S1~S5 | SVG 폴리라인 마지막 좌표를 기준선(`y` 속성) 좌표로 선형 환산해 헤더 값과 비교: 수비 상태 58회 전부 일치(차트 값 소수 둘째자리 == 헤더, 예 0.64/0.50/0.77/1.09, 2.58, 5.02). 차트 판독은 호버 툴팁이 아니라 경로 좌표로 했다(툴팁 이슈는 A1). 새 반이닝 첫 점은 경로에 존재하나 그려지지 않음(A2) |
| 11 | undo 후 마지막 점 제거, 공격 반이닝 직후 undo 시 반이닝 선분 통째 제거 | PASS | S1,S2 | 일반 undo: 시리즈 `[4,5,2]`→`[4,5,1]`(마지막 점 제거), 재실행 후 `[4,5,2]`(S1). 공격 직후 undo: S1 `[[4],[1]]`→`[[4]]`(6회말 선분 통째 제거), S2 `[3,1]`→`[3]`. 개발 단언 경고(콘솔) 없음 |
| 12 | 새로고침 후 시리즈 유지 | PASS | S1,S2 | /game F5 후 시리즈 `[4,2]`→`[4,2]`, 헤더 LI 0.5067 == 직전 값, 후보 목록·스코어 그대로(`S1-05-after-reload.png`). 재조회: we-trace, result, recommend. (recommend POST가 2회 나가는 점은 §3 B2) |
| 13 | 30분 방치 → SESSION_EXPIRED → 온보딩 복귀 | FAIL (일부) | S4,S4b,S4c | 방치 대신 시험. (a) `sessionStorage`의 현재 세션 id와 스냅샷 키를 존재하지 않는 id(`s_0000…dead`)로 복제 후 /game F5: 서버 `404 SESSION_EXPIRED`(recommend·we-trace·result), 온보딩(`/`)으로 복귀, 세션 키 폐기까지 OK. **그러나 "세션이 만료되었습니다" 안내 배너가 5.6초간 한 번도 나타나지 않음**(`S4-02-expired-with-snapshot.png`). (b) 진행 중 simulate-pa에 404 SESSION_EXPIRED를 브라우저 라우팅으로 주입(S4c): 온보딩 복귀는 되나 안내 없음. (c) 스냅샷 없는 id(S4)는 요청 없이 조용히 온보딩. 반면 `/result/<id>`를 새 브라우저에서 직접 열면(저장소 메타 없음) 안내 배너가 뜸(`S1r-R1-result-direct.png`). 재현: 위 (a). 추정 원인(코드 읽기 아님, 가설): `/game`에서 `clear()`로 params가 null이 되며 `<Navigate to="/" replace/>`가 `state.notice`를 가진 navigate를 덮어쓰는 경쟁. 서버가 아닌 프론트 이슈 |
| 14 | `/game` 새로고침 시 동작 (§7 #2) | PASS | S1,S2,S4 | sessionStorage 스냅샷(`nemo:session:<id>:snapshot`≈5.6KB, `meta`, `current-session`)으로 복원. 이닝·아웃·점수·LI·후보 목록 복원 후 정상 진행(복원 후 "유지" 1회 simulate-pa). 서버 `GET /sessions/{id}`는 없어 우회(TODO(backend)) |

집계: PASS 13, FAIL 1(#13, 안내 문구 부분). #7은 S2에서 used 투수가 없어 S1·S3로만 판정. #10은 PASS이되 이상 A1/A2 동반.

## 3. 요청한 개별 확인 항목(① ~ ⑩)

| 항목 | 판정 | 증거 |
| --- | --- | --- |
| ① 같은 선택 반복·다른 투수(분기) | PASS | 위 #3, #4. 같은 actual 선택 반복 시 분기 없음, 다른 투수 선택 시 분기 |
| ② 3아웃 → 공격 연출 → 다음 수비 | PASS | #5. 오버레이 지속 4.8~5.4초(`S1-offense-overlay-3.png`, `S2-offense-overlay-2/3.png`), 이후 "N회말 한화 수비"(`S1-04-after-readvance.png`) |
| ③ 공격 이닝 직후 undo | PASS | 서버는 **공격 반이닝만** 되돌려 offense 상태로 간다: S1 `6bot(defense)` → undo → `6top o0 my_role:offense`, `can_undo:true`; S2 `6top` → `5bot offense`. 화면은 "공격 이닝이 진행 대기 중입니다" + [되돌리기][공격 이닝 진행] (`S1-03b-offense-wait.png`). "공격 이닝 진행" 재실행 시 같은 상태(6bot LI 0.6596)로 복귀. 명세 §3-9 [확인 필요]의 "후자" 확정 |
| ④ 일반 undo | PASS | #6, #11 |
| ⑤ 새로고침 복원 | PASS | #12, #14 |
| ⑥ 실제와 다른 투수 후보 목록 | PASS | #7. 후보는 available만 순위 표시, used는 하단 회색 |
| ⑦ 경기 종료 → /result | PASS | 아래 세부 |
| ⑧ SESSION_EXPIRED | FAIL(안내 없음) | #13 |
| ⑨ 오프라인 | PASS | S3: 컨텍스트 offline 후 "현재 투수 유지" 클릭 → 상단 인라인 배너 "서버에 연결할 수 없습니다. 네트워크를 확인한 뒤 다시 시도해 주세요." + [다시 시도][닫기](`S3-04-offline-banner.png`). online 복귀 후 "다시 시도" → simulate-pa 1회 성공(오프라인 요청은 응답 없음, 서버 도달 0), 배너 사라짐, 게임 정상 진행 |
| ⑩ 버튼 연타 | PASS | "현재 투수 유지"를 5회 연속 강제 클릭(S1,S2): simulate-pa 요청 1회씩(`rapidClick.simulatePaRequests=1`). 참고: 연타는 "유지" 버튼만 시험, "되돌리기"·"투입" 연타는 미시험 |

⑦ 세부:
- 결과 화면 점수 순서: #8.
- 결정 비교 테이블: 기본은 교체 행만(S1 2행, S2 1행) → "전체 타석 보기" 클릭 시 S1 25행, S2 19행, 버튼 문구 "교체 타석만 보기"로 전환(`S1-13`, `S2-13`).
- 투수 운용 타임라인: 내 운용 vs 실제 감독 구간이 5~9회 열에 정렬(예 S1: 폰세→박상원→와이스(7~9회 병합) vs 폰세·박상원·김서현·한승혁·주현상, 구간 아래 ΔWE 값). 값은 서버 `pitcher_usage`/`actual_pitcher_usage`와 일치.
- "같은 선택으로 100회 반복": S1 4.37초, S2 4.13초(30초 이내). 클릭 직후 "계산 중..." 스피너(버튼 비활성) 표시, 응답 200 `{"n":100,...,"elapsed_ms":2741}`. 히스토그램은 서버가 빈 키(S2 "9" 없음)를 생략했으나 화면은 0~max로 채우고(`S2-15`), 마지막 칸은 "7+"로 묶음. 요약 "중앙값 2실점 · 실제 경기(1실점)보다 좋은 확률 17% · 승률 27% · 평균 2.6실점"이 서버 값(`better_than_actual_rate 0.17`, `win_rate 0.27`, `mean 2.57`)과 일치. 버튼은 "반복 결과 접기"로 전환. 요청은 1회
- `/result` F5 후에도 동일 화면(sessionStorage 메타 필요).

## 4. 체크리스트 밖 이상

| # | 심각도 | 내용 | 재현/증거 |
| --- | --- | --- | --- |
| A1 | 중 | **LI 차트 툴팁이 틀린 점을 가리킴.** x축 `dataKey`가 `tickLabel`인데 반이닝 첫 점 외에는 빈 문자열이라, 빈 라벨 점들이 같은 카테고리로 취급되어 2번째 점 이후를 호버하면 항상 "2번째 타석" 값이 나온다 | S1 5회말에서 3타석 진행 후(점 4개) 점 4개 위치(x=22/198/374/551)를 호버: "1번째 LI 0.64", "2번째 0.50", "2번째 0.50", "2번째 0.50"(실제 0.77, 1.09). `anomaly-li-tooltip.png`. 차트 선·헤더 값은 정상이라 #10은 PASS |
| A2 | 중 | **새 반이닝의 첫 점이 화면에 안 그려짐**(점 1개 선분은 선도 점도 없음, `dot`은 전체 점 수<2일 때만). 헤더 LI와 "마지막 점"이 보이지 않는 구간이 반이닝 첫 타석마다 생김 | S1 `[[…],[0.66]]` 경로 세그먼트 1점, `.recharts-line-dot` 0개(`chartDots:0`). 스크린샷 `S1-04-after-readvance.png`(6회말 직후), `S1-10-mid-8.png` |
| A3 | 하 | LI 차트 Y축 눈금 글씨가 잘림/잘못 보임(폭 22px): ".25", ".75", 최대 5.02일 때 맨 위 눈금이 "163"처럼 보임 | `S3-06-1.png`, `S1-10-mid-8.png` |
| A4 | 하 | 결과 화면 부제 `2025-03-22 한화 vs KT · · 5회말부터 진행`에 구분점이 두 번 나옴(빈 필드 추정). 9회 시작은 "9~9회 실점 1"(→ "9회" 기대) | 전 시나리오 `*-12-result-full.png` |
| A5 | 하 | 새로고침 시 recommend POST가 2회 연속 호출됨(dev StrictMode 영향 가능) | S1/S2/S4b 로그 `POST recommend`×2 |
| A6 | 하 | 새 브라우저에서 `/result/<유효한 id>`를 직접 열면 서버 세션이 살아 있어도 "세션이 만료되었습니다" 후 온보딩(sessionStorage 메타 의존. PLAN B4 우회의 한계) | `S1r-R1-result-direct.png` |
| A7 | 하 | 후보 목록에서 2위가 "상대 적합도 100"으로 1위의 "모델 1위" 막대와 같음(min-max가 동률인 경우로 보임, 값 자체는 서버 점수) | `S3-06-1.png` 권민규 |
| A8 | 정보 | 결과 화면 결정 로그에서 득점 열이 `→ — · ΔWE`처럼 "—"(B3/B2 우회 범위). 모델 순위 "—" 전부(서버 null 계속) | 결과 화면 |

"undefined"/"NaN"/"상위 100%"/서버 message 원문 노출/콘솔 에러(의도 시험 외)/레이아웃 깨짐은 1440x900에서 관찰되지 않았다. 반응형(모바일 폭)은 이번 범위 밖이라 미검증. 만료 안내문과 오프라인 문구는 서버 message가 아니라 앱 고정 문구/코드 기준 문구였다.

## 5. §3-10-1 "C안 전환 판단 기준" 의견(결정은 사용자)

1. **실제 경기 LI와 비교 필요성**: 이번 플레이에서 LI 차트와 결과 화면 어디서도 실제 경기의 타석별 LI가 필요한 순간은 없었다(승률 곡선이 이미 actual vs simulated를 비교). 다만 분기 후 "내 선택 이후 상황이 실제보다 중요도가 어땠나"는 B안으로 볼 수 없다. 이 비교를 발표 서사에 넣을 계획이면 C안, 아니면 불필요하다는 의견. 근거: `S1-10-mid-8.png`(승률 곡선은 비교, LI 차트는 내 상태만).
2. **반이닝마다 끊긴 선분이라 추이가 안 읽히는가**: 5회부터 끝까지(`S1-10-mid-8.png`, 선분 5개 4/5/7/4/…점) 선분 안의 상승·하락과 고LI 구간(2.58, 3.57 등)은 읽히고, 8회말 7점 선분의 급락·급등도 보인다. 다만 ①선분 사이가 비어 이닝 간 흐름은 읽히지 않고, ②반이닝 첫 점이 그려지지 않아(A2) 선분이 한 점씩 빠져 보이며, ③툴팁이 오작동해(A1) 점별 확인이 어렵다. 즉 개념은 읽히지만 **현재 구현 결함(A1,A2) 때문에 읽기 어려움이 과장돼 있다**. A1/A2를 고치고 다시 보면 B안만으로 충분할 수도 있다는 의견.
3. **9회 시작 시 점이 너무 적은가**: S3(9회말 4타석)는 선분 1개, 점 3~4개(`S3-06-1.png`: LI 0.98→1.61→3.00→5.02 상승)다. 한 반이닝 추이로는 시작·끝 모두 읽히며 "LI가 오르는 장면"이 잘 드러난다. 점이 적은 것은 사실이나 그 자체로 오해를 부르지는 않았고, 9회 시작 세션에서는 A2 때문에 첫 점이 화면에서 단독일 때(시작 직후 1점)만 점으로 보이고 2점 이후엔 문제 없었다. 판단 기준 ③은 "문제 있음"까지는 아님.

요약: 기준 ①은 서사 의존, ②는 구현 결함 수정 후 재평가 권장, ③은 경미. 세 가지 중 어느 하나도 B안으로는 불가능하다고 단정할 근거는 이번 플레이에서 없었다.

## 6. 한계

- 30분 만료는 직접 기다리지 않고 id 교체·응답 주입으로 시험했다(실제 서버 만료 메시지 포맷은 S4b에서 404 응답으로 확인).
- 홈·원정 각 1경기, 9회 시작 1경기이며 연장·콜드·0회 경기 종료 이후 등 다른 종료 경로는 미관찰. `result: "loss"`, `"tie"`는 관찰(S2 패배, S3 무승부 "무승부"), `in_progress`는 UI에서 미관찰.
- `was_change=false` 유지의 반대 케이스(actual 유지인데 교체)는 S1 7회말·S2에서 분기 형태로만 확인.
- "되돌리기" 연타, 후보 선택 후 연타는 미시험.
