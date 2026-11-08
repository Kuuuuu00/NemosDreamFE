# V3 mock 모드(VITE_USE_MOCK=true) 회귀 검증

방법: 전용 dev 서버(5191) + Playwright headless chromium 1440x900. 경기 여러 판(한화-KIA 3/29 ×4회, kt-KIA 3/29, kt-KIA 4/27)을 끝까지 플레이. 스크린샷: `docs/integration/screens/mock-*.png`.

| # | 항목 | 결과 | 증거 |
|---|---|---|---|
| 1 | 온보딩(팀 그리드 10팀, 상대 9팀, 경기 16건, 월 칩 3월→1건/전체→16건, 이닝 5~8 활성·9 선택 불가, 시작) | PASS | mock-onb-*.png |
| 2 | 대시보드(후보, 선택→투입, 이펙트, 스코어/라인스코어, 승률곡선, LI 차트, 로그, undo) | PASS (LI 차트 반이닝 끊김은 수비 구간이 짧아 육안 확인 한정) | mock-game-mid-g0.png |
| 3 | 공격 이닝 진행 → 다음 수비 이닝, 교체 섞어 종료까지 | PASS (공격 오버레이 문구는 감지됐으나 "공격 이닝 진행" 버튼은 한 번도 노출 안 됨: 자동 진행) | 루프 69~83 스텝 후 /result |
| 4 | /result 점수 카드, 승패 라벨, 타임라인, 반복 100회→히스토그램 | PASS | mock-result-g*.png, mock-repeat-crash.png |
| 4b | 결정표 "전체 타석 보기" 토글 | 관찰불가 | mock 결정이 전부 교체 행이라 토글 자체가 렌더되지 않음(totalCount==visible). 코드상 조건부 |
| 5 | 콘솔/텍스트 | 대부분 PASS, 1건 미확정 | 아래 |
| 6 | /game F5 | PASS | 온보딩으로 복귀(크래시·흰 화면 없음), mock-refresh.png |

실서버 요청: 0건 (nemosdream, /api|/health|/static 경로 기준, 3개 스크립트 합산).

## 관찰 사항
- 콘솔: 첫 실행 한화 경기 결과 화면 진입 시 1회 `React has detected a change in the order of Hooks` + `Should have a queue` + `An error occurred in the <ResultPage> component`. 이후 같은 흐름 3회 재실행(콘솔 0건)과 다른 경기에서 재현 안 됨. ResultPage/훅 코드에 조건부 훅은 없어, 서버 기동 직후 첫 로드의 Vite 의존성 재최적화/HMR 부작용으로 추정(미확정). 재현 시 재보고 필요.
- "undefined/NaN/null" 텍스트: 점검 지점(step2/6, 결과, 반복)에서 0건.
- 경기 목록 행에 팀 코드가 "HH"/"K" 등 약어로 표기됨(한화 → HH). 기능 영향 없음, mock 데이터 특성으로 보임.
- 반복 시뮬레이션 후 버튼 문구가 "반복 결과 접기"로 바뀜(정상 동작).
