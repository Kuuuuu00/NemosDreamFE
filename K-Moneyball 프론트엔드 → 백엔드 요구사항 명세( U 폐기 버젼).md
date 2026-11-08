# K-Moneyball 프론트엔드 → 백엔드 요구사항 명세( U 폐기 버젼)

**작성**: 박규영 (트랙 C / 프론트엔드)
**대상**: 변희민 (트랙 A / Spring Boot, CatBoost, LI, quality_p), 윤서현 (트랙 B / Flask, Contextual Bandit)
**버전**: v0.3
**전제**: `HANDOFF_FULL.md`의 데이터 컨벤션을 그대로 따른다. 이 문서에서 재정의하지 않는다.

### v0.3 변경 요약 — 효용 함수 폐기

기존 효용 함수 `U = quality_p × LI − λ × cost_p × (1 − LI/LI_max)`를 **폐기**했다.
구성 근거와 λ 범위, `cost_p` 정의를 방어할 수 없다는 팀 판단이다.

| # | 변경 | 위치 |
| --- | --- | --- |
| 1 | 추천 순위는 **Contextual Bandit의 모델 적합도 점수**로만 결정 | §2-2, §3-5 |
| 2 | λ, U, `cost_p` 개념을 API·UI·코드에서 전면 제거 | 전체 |
| 3 | **프론트는 더 이상 점수를 계산하지 않는다.** 데이터 소스에서 받는다 | §5 |
| 4 | `LI`, `quality_p`는 순위 계산에서 분리. **참고 정보로만 표시** | §3-5, §10 |
| 5 | 밴딧 범위 제약 신설 — 현재 투수 유지(STAY)는 학습 대상 아님 | §2-2, §5-1 |
| 6 | 레버리지 매칭 산점도 → **결정 비교 테이블**로 교체 | §3-10 |
| 7 | 추천 데이터 어댑터 인터페이스 신설 | §5-2 |

프론트엔드는 v0.3 기준으로 구현 완료된 상태다. 백엔드는 이 문서를 기준으로 맞춰주면 된다.

---

## 0. 30초 요약

- 1차 구현은 **리플레이 모드**다. 2025 시즌 실제 경기를 불러와 특정 이닝부터 진행한다.
- 진행 단위는 **타석(PA)**이다. 볼카운트는 다루지 않는다.
- 사용자는 **우리 팀 수비 반이닝**에서만 개입한다. 우리 팀 공격 반이닝은 서버가 자동 진행한다.
- **주자 진루, 아웃 카운트, 점수, WE 계산은 전부 서버 책임**이다. 프론트는 재구현하지 않는다.
- **추천 순위는 서버가 정한다.** 밴딧이 산출한 `model_score`와 `model_rank`를 그대로 내려주고, 프론트는 계산하지 않고 표시만 한다. (§5 참조)
- **밴딧은 "교체할 경우 누구를 넣을지"만 추천한다.** 현재 투수 유지(STAY)는 학습 대상이 아니라 점수가 없다.
- 세션은 서버가 보유한다. 되돌리기(undo)와 분기 추적을 위해 필요하다.

---

## 1. 범위

### 1-1. 이번 범위에 포함

| 항목 | 내용 |
| --- | --- |
| 온보딩 | 내 팀 / 상대 팀 / 날짜 / 시작 이닝 선택 |
| 메인 대시보드 | 상단 스코어보드 + 좌측 스탯 + 중앙 상황 + 우측 의사결정 |
| 추천 | 현재 상황의 LI와 후보 투수 목록 |
| 시뮬레이션 | 타석 1회 샘플링, 결과 반영 |
| 자동 진행 | 우리 팀 공격 반이닝 |
| 되돌리기 | 직전 상태로 복귀 |

### 1-2. 이번 범위에서 제외 (후속)

- 관전 모드 (실제 데이터를 따라가며 agreement 집계) — 평가 하네스에서 별도 측정하므로 UI 불필요
- 시뮬레이션 세팅 상세 화면
- 경기 종료 요약 화면
- RAG 기반 AI 코치 챗봇
- 3D 투구 궤적 (R3F)
- 실시간 경기 데이터 연동

### 1-3. 확장 전제

실시간 데이터로 확장할 때 프론트 컴포넌트를 고치지 않도록, 리플레이와 실시간이 **동일한 `GameState` 스키마**를 반환해야 한다. 데이터 출처는 서버 내부 어댑터에서 흡수한다.

### 1-4. 제약

- 시작 이닝은 **5~9회로 제한**한다. 1~4회는 선발 투수 구간이라 불펜 추천이 무의미하다.
- **연장은 지원하지 않는다.** 데이터셋에서 10회 이후 PA가 전량 제외되어 있다.
- 콜드게임, 서스펜디드 경기는 세션 생성 대상에서 제외한다.

---

## 2. 공통 데이터 모델

### 2-1. `GameState`

경기 진행 상태의 단일 소스. 모든 응답에 최신값이 포함된다.

```json
{
  "session_id": "s_8f2a...",
  "game_id": "20250902HHKT02025",
  "date": "2025-09-02",
  "inning": 7,
  "half": "bot",                    // "top" | "bot"
  "out_count": 1,
  "base_state": "12",               // "0","1","2","3","12","13","23","123"
  "score": { "home": 9, "away": 6 },
  "score_diff": 3,                  // home - away (H1 컨벤션)
  "score_diff_attacker": -3,        // 공격팀 관점. 프론트에서 부호 재변환 금지

  "my_team": "HH",                  // 팀 코드
  "opponent_team": "KT",
  "my_role": "defense",             // "defense" | "offense" — 현재 반이닝에서 내 팀 역할

  "current_pitcher": { /* Pitcher */ },
  "current_batter":  { /* Batter  */ },
  "upcoming_batters": [ /* Batter x 3 */ ],

  "leverage_index": 2.41,
  "win_expectancy": 0.35,           // my_team 관점
  "we_perspective": "HH",           // 관점을 명시하는 필드. 생략 금지

  "linescore": {
    "away": [0,0,0,0,4,0,0,0,2],
    "home": [1,3,0,0,0,0,2,3,null],
    "totals": { "away": {"R":6,"H":10,"E":3,"B":1},
                "home": {"R":9,"H":17,"E":1,"B":3} }
  },

  "is_diverged": true,              // 실제 경기와 갈라졌는지
  "diverged_at": { "inning": 7, "half": "bot", "pa_index": 3 },
  "is_game_over": false,
  "can_undo": true
}
```

**요구사항**

- `score_diff_attacker`는 이미 공격팀 관점으로 변환된 값이어야 한다. 프론트는 추가 변환하지 않는다.
- `linescore.home`의 미진행 이닝은 `null`로 채운다 (`0`과 구분해야 화면에 "-"로 표시할 수 있다).
- `my_role`이 `"offense"`인 상태로 `/recommend`가 호출되면 400을 반환한다.

### 2-2. `Pitcher`

```json
{
  "pitcher_id": 60841,
  "name": "김서현",
  "throws": "R",                    // "L" | "R" | "U"
  "photo_url": "/static/players/69446.webp",   // 자체 호스팅. 없으면 null
  "kbo_player_id": 69446,           // 데이터셋 pitcher_id와 동일 체계로 확인되면 생략 가능

  "season": {
    "era": 3.24, "whip": 1.18, "ip": 52.1,
    "so": 61, "bb": 24, "g": 55
  },

  "vs_batter_hand": {               // 좌/우 타자 상대 성적
    "L": { "avg": 0.241, "woba": 0.283, "iso": 0.098, "pa": 118 },
    "R": { "avg": 0.267, "woba": 0.301, "iso": 0.131, "pa": 143 }
  },

  "workload": {
    "pa_faced_today": 0,
    "est_pitch_count": 0,           // pa_faced_today * avg_pitches_per_pa
    "avg_pitches_per_pa": 4.12,
    "days_rest": 2,
    "appearances_last_7d": 3
  },

  "availability": "available",      // "available" | "used" | "current" | "unavailable"
  "unavailable_reason": null,       // "이미 등판" 등. 회색 표시용 문구

  // ── 밴딧 추천 (교체 후보일 때만 존재) ──
  "model_score": 0.0142,           // 타석당 기대 WPA, 투수 관점. 높을수록 좋음
  "model_rank": 1,                 // 후보 집합 내 순위, 1부터
  "quality_percentile": 84,        // 0~100, 불펜 quality 백분위. 참고 정보
  "matchup_vs_batter": "favorable" // "favorable" | "neutral" | "unfavorable" | null
}
```

**요구사항**

- `vs_batter_hand`는 `naver_vshra_raw`를 사용하지 않는다. 자체 매치업 지표에서 산출한다.
- `availability`가 `"used"`인 투수도 **목록에서 제외하지 말고 포함**한다. 프론트가 회색으로 분리 표시한다.
- `est_pitch_count`는 서버가 누적한다. 세션 시작 시점의 실제 `total_pitch_count`를 초기값으로 이어받는다.
- **`model_score`와 `model_rank`는 교체 후보에만 존재한다.** 현재 투수(`is_current: true`)에는
두 필드를 넣지 않는다. 밴딧이 STAY를 학습하지 않아 비교 가능한 점수가 없기 때문이다.
넣으면 프론트가 "유지도 모델이 평가했다"고 잘못 표시하게 된다.
- `model_score`의 단위는 **타석당 기대 WPA(투수 관점)**다. 스케일이 바뀌면 즉시 공유한다.
- `quality_percentile`은 순위 계산에 쓰지 않는다. 보조 정보 줄에만 표시된다.
- `matchup_vs_batter`는 현재 타자 기준 좌우 매치업 판정이다. 근거가 부족하면 `null`.
- `workload` 하위 필드는 데이터 준비 전까지 `null`을 허용한다. 프론트가 `—`로 표시한다.
- **선수 사진은 자체 서버가 호스팅한다.** 외부 CDN을 직접 참조(핫링킹)하지 않는다.
    - 원본: `https://sports-phinf.pstatic.net/player/kbo/default/{player_id}.png?type=w150`
    - 데이터셋의 `pitcher_id`/`batter_id`가 이 ID와 동일 체계인지 **먼저 검증**한다. 동일하면 매핑 테이블 불필요.
    - 사전 수집 후 `public/players/{id}.webp`로 저장. 규모는 시즌당 700명 내외, 총 10MB 미만.
    - 플레이스홀더 이미지(no-Image)는 파일 크기로 걸러내고, 없는 선수는 `null` 반환 → 프론트가 이니셜 아바타로 폴백.
    - 사유: 발표 환경의 네트워크 의존 제거, 외부 경로 변경 대응, 요청량 절감.
- 타자 사진도 동일 정책이다. `Batter`에도 `photo_url`을 포함한다.

### 2-3. `Batter`

```json
{
  "batter_id": 51234,
  "name": "노시환",
  "hit_type": "R",                  // "L" | "R" | "S"
  "photo_url": "/static/players/69446.webp",
  "order": 4,                       // 타순
  "position": "3B",

  "season": { "avg": 0.286, "obp": 0.361, "slg": 0.492, "ops": 0.853, "hr": 22 },
  "recent_avg": 0.312,              // batter_recent_avg

  "vs_current_pitcher": {
    "ab": 7,                        // prior_matchup_ab
    "h": 2,
    "avg": 0.286,
    "woba": 0.311,                  // matchup_woba_shrunk
    "iso": 0.143                    // matchup_iso_shrunk
  },

  "today": { "ab": 3, "h": 1, "rbi": 1, "log": ["1B", "SO", "GO"] }
}
```

**요구사항**

- `vs_current_pitcher.ab`를 반드시 포함한다. 프론트가 표본 크기를 그대로 노출한다.
- 매치업 데이터가 전혀 없으면 `vs_current_pitcher`를 `null`로 반환한다. 0으로 채우지 않는다.

### 2-4. `PAResult`

```json
{
  "outcome": "2B",                  // 아래 표 참조
  "outcome_label": "2루타",
  "description": "우중간을 가르는 2루타",
  "probability": 0.084,             // 샘플링된 결과의 확률
  "probs": {                        // 전체 확률 분포 (합 1.0)
    "SO": 0.213, "GO": 0.187, "FO": 0.164, "1B": 0.142,
    "BB": 0.098, "2B": 0.084, "GDP": 0.061, "HR": 0.031, "3B": 0.020
  },
  "runs_scored": 2,
  "delta_we_attacker": 0.147,       // 공격팀 관점
  "delta_we_defender": -0.147,      // 편의 필드. 화면 표시는 이쪽 사용
  "next_state": { /* GameState */ }
}
```

**결과 코드 (9종)**

| 코드 | 라벨 | 코드 | 라벨 |
| --- | --- | --- | --- |
| `1B` | 1루타 | `GO` | 땅볼 아웃 |
| `2B` | 2루타 | `FO` | 플라이 아웃 |
| `3B` | 3루타 | `GDP` | 병살타 |
| `HR` | 홈런 | `SO` | 삼진 |
| `BB` | 볼넷 |  |  |

CatBoost 출력 클래스와 위 9종이 다르면 매핑 테이블을 서버가 제공한다. 프론트는 이 9종만 처리한다.

---

## 3. API 명세

베이스 경로는 `/api/v1`로 가정한다.

### 3-1. `GET /config`

앱 기동 시 1회 호출. **LI 기준값과 밴드를 하드코딩하지 않기 위한 엔드포인트다.**

```json
{
  "leverage": {
    "league_avg": 1.0,
    "max": 5.0,                     // LI_max
    "bands": [
      { "label": "저", "min": 0.0, "max": 0.85 },
      { "label": "중", "min": 0.85, "max": 1.5 },
      { "label": "고", "min": 1.5, "max": 3.0 },
      { "label": "매우 높음", "min": 3.0, "max": 5.0 }
    ]
  },
  "model": {
    "score_unit": "wpa_per_pa",
    "description": "Contextual Bandit 예상 성과. 투수 관점, 높을수록 좋음",
    "provisional": false
  },
  "li_source_note": "상황 중요도. 문형우 외(2016) 승리확률 테이블 기반"
}
```

**중요**: `config/li_baseline.json`이 확정되면 그 값을 그대로 서빙한다.
밴딧 학습이 끝나기 전 임시 점수를 내보낼 때는 `model.provisional: true`를 넣어주면
프론트가 "임시 점수" 배지를 띄운다.

`lambda` 블록과 `utility_formula` 필드는 v0.3에서 삭제됐다. 내보내지 말 것.

### 3-2. `GET /teams`

```json
[ { "code": "HH", "name": "한화", "logo_url": "..." }, ... ]
```

팀 **코드**로만 식별한다. API의 팀 이름 필드는 과거 경기에도 현재 명칭을 소급 적용하므로(2016년 SK 경기가 "SSG"로 표시됨) 이름을 키로 쓰지 않는다.

### 3-3. `GET /games?season=2025&team=HH&opponent=KT`

선택 가능한 경기 목록.

```json
[
  {
    "game_id": "20250902HHKT02025",
    "date": "2025-09-02",
    "away": "HH", "home": "KT",
    "final_score": { "away": 6, "home": 9 },
    "available_innings": [5, 6, 7, 8, 9],
    "high_leverage_innings": [7, 9]   // 데모용 "승부처 바로가기"
  }
]
```

`available_innings`는 해당 이닝에 실제로 그 팀의 수비 반이닝 데이터가 존재하는 경우만 포함한다 (9회말 홈팀이 이기고 있으면 9회말이 없다).

### 3-4. `POST /sessions`

```json
// 요청
{ "game_id": "20250902HHKT02025", "my_team": "HH", "start_inning": 7, "mode": "play" }
// mode: "play" | "watch"

// 응답
{ "state": { /* GameState */ } }
```

세션은 서버가 상태를 보유한다. 되돌리기와 분기 추적 때문에 stateless로는 어렵다. TTL은 30분 정도면 충분하다.

### 3-5. `POST /sessions/{id}/recommend`

현재 상황의 LI와 **교체 후보 순위**.

```json
// 요청 — body 없음

// 응답
{
  "leverage_index": 2.41,
  "leverage_band": "고",
  "li_percentile": 88,             // 리그 LI 분포 대비 백분위. "리그 상위 12%" 표시용
  "li_max": 5.0,
  "source": "precomputed",         // "precomputed" | "live" | "mock"

  "current_pitcher": {             // 점수 없음. 교체 판단용 정보만
    "pitcher": { /* Pitcher, model_score·model_rank 제외 */ },
    "this_outing": {
      "pitches": 18, "outs": 4,
      "hits_allowed": 1, "walks": 0,
      "matchup_vs_batter": "unfavorable"
    }
  },

  "candidates": [                  // model_rank 오름차순 고정
    { "pitcher": { /* Pitcher, model_score·model_rank 포함 */ } },
    ...
  ],
  "bullpen_summary": { "available": 6, "used": 3, "total": 9 },
  "bullpen_source": "actual",       // "actual" | "estimated"
  "actual_decision": {              // 분기 전에만. 분기 후 null
    "pitcher_id": 61895,
    "name": "주현상",
    "was_change": true
  }
}
```

**요구사항**

- **`candidates`는 교체 후보만 담는다.** 현재 투수는 `current_pitcher`로 분리해 내보낸다.
같은 배열에 섞으면 프론트가 유지와 교체를 같은 축에서 비교하게 되고, 이는 밴딧의
학습 범위를 벗어난 표현이다.
- `candidates`는 **`model_rank` 오름차순으로 정렬해 보낸다.** 프론트는 재정렬하지 않는다.
- 후보군은 실제 불펜 명단에서 그 시점까지 이미 등판한 투수를 제외해 구성하되, **제외된 투수도 `availability: "used"`로 목록에 포함**한다. 단 이들에게는 `model_score`를 넣지 않는다.
- `source`는 `precomputed`(실제 경기 상태) / `live`(사용자 분기 후 상태) / `mock`을 구분한다.
프론트가 개발 모드에서 배지로 표시한다.
- `bullpen_source`가 `"estimated"`인 구간(전체의 13.7%)은 프론트에서 "추정 명단" 배지를 띄운다.
- `actual_decision`은 관전 모드와 분기 전 플레이 모드에서만 채운다.

### 3-6. `POST /sessions/{id}/simulate-pa`

```json
// 요청
{ "pitcher_id": 61895 }
// 현재 투수를 유지하는 경우에도 현재 투수의 pitcher_id를 그대로 보낸다

// 응답
{ "result": { /* PAResult (next_state 포함) */ } }
```

**요구사항**

- `pitcher_id`가 현재 투수와 다르면 서버가 교체를 기록한다. 교체 이력은 세션에 누적된다.
- 첫 교체가 실제 감독의 선택과 다르면 `next_state.is_diverged = true`로 전환한다.
- 3아웃이 되면 `next_state`의 `half`와 `inning`을 갱신하고 `my_role`을 `"offense"`로 바꾼다.

### 3-7. `POST /sessions/{id}/advance-half`

우리 팀 공격 반이닝을 서버가 자동 진행한다. 프론트는 "상대 수비 진행 중..." 표시만 한다.

```json
// 응답
{
  "summary": {
    "runs": 1,
    "hits": 2,
    "pa_log": [
      { "batter": "문현빈", "outcome": "1B", "description": "좌전 안타" },
      { "batter": "채은성", "outcome": "GDP", "description": "병살타" },
      { "batter": "노시환", "outcome": "HR", "description": "좌월 2점 홈런" }
    ],
    "we_trace": [0.31, 0.36, 0.28, 0.52]
  },
  "state": { /* GameState — 우리 팀 수비 반이닝 시작 시점 */ }
}
```

**요구사항**

- **분기 전**이면 실제 경기 데이터를 그대로 재생한다.
- **분기 후**면 상대 팀 투수 운용을 규칙 기반(또는 실제 감독의 원래 순서)으로 시뮬레이션한다. 어느 쪽인지 `summary.source`로 명시한다.
- `we_trace`는 승률 그래프를 끊김 없이 잇기 위해 필요하다.

### 3-8. `POST /sessions/{id}/undo`

```json
{ "state": { /* GameState — 직전 상태 */ } }
```

**요구사항**

- 되돌리기 단위는 **타석 1회**다.
- 자동 진행된 반이닝은 통째로 되돌린다.
- 분기 시점보다 앞으로 되돌아가면 `is_diverged`를 `false`로 복원한다.
- 되돌릴 수 없으면 409와 함께 사유를 반환한다.

### 3-9. `GET /sessions/{id}/we-trace`

승률 곡선 렌더링용. **이닝 단위**로 집계해 반환한다. 타석 단위는 9회까지 40점이 넘어 곡선이 뭉개진다.

```json
{
  "perspective": "HH",              // my_team 관점. 생략 금지
  "actual":    [ { "inning": 1, "half": "top", "we": 0.52 }, ... ],
  "simulated": [ { "inning": 7, "half": "bot", "we": 0.19 }, ... ],
  "diverge_at": { "inning": 7, "half": "bot" },
  "current": 0.35
}
```

- 각 반이닝의 **종료 시점 WE**를 그 반이닝의 값으로 삼는다.
- `actual`은 경기 전체(1회~종료), `simulated`는 분기 시점부터만. 분기 전이면 `simulated`는 빈 배열.
- 프론트는 `actual`을 회색 점선, `simulated`를 액센트 실선으로 그리고 `diverge_at`에 마커를 찍는다.
- 진행 중인 반이닝의 값은 실시간으로 갱신되므로 캐싱하지 않는다.

### 3-10. 레버리지 추이

승률 곡선 옆에 LI 시계열을 함께 그린다. `we-trace`에 LI를 합쳐서 반환해도 되고 별도 엔드포인트로 빼도 된다. 프론트는 어느 쪽이든 상관없으니 백엔드가 편한 쪽으로 정한다.

```json
{ "inning": 7, "half": "bot", "we": 0.19, "leverage_index": 2.41 }
```

### `GET /sessions/{id}/result`

jsonc

```json
{
  "simulated": { "score": {"my": 6, "opp": 7}, "runs_allowed_in_range": 1,
                 "final_we": 0.35, "result": "loss" },
  "actual":    { "score": {"my": 6, "opp": 9}, "runs_allowed_in_range": 3,
                 "final_we": 0.09, "result": "loss" },
  "pitcher_usage": [
    { "pitcher_id": 60841, "name": "김정운",
      "from": {"inning":7,"half":"bot","pa":0}, "to": {"inning":7,"half":"bot","pa":2},
      "delta_we_defender": 0.04, "pitches_est": 18,
      "li_at_entry": 2.41 }
  ],
  "actual_pitcher_usage": [ /* 동일 구조 */ ],
  "decisions": [
    { "inning":7, "half":"bot", "leverage_index":2.41,
      "model_top":     {"pitcher_id":61895,"name":"주현상"},
      "user_choice":   {"pitcher_id":61895,"name":"주현상","model_rank":1},
      "actual_choice": {"pitcher_id":61895,"name":"주현상","model_rank":1},  // 분기 후 null
      "outcome":"2B", "delta_we_defender": -0.15 }
  ],
  "agreement": {                   // 결정 비교 요약용
    "total_decisions": 5,
    "mine_in_top3": 3,
    "actual_in_top3": 1
  },
  "bullpen_used": { "mine": 5, "actual": 4, "total": 9 }
}
```

**요구사항**

- `lambda_used` 필드는 v0.3에서 삭제됐다. 내보내지 말 것.
- `pitcher_usage`의 `quality_p`도 삭제됐다. 레버리지 매칭 산점도가 폐기됐기 때문이다.
- `decisions[].model_rank`는 **그 시점의 후보 집합 안에서의 순위**다.
후보 수가 결정마다 다르므로 순위만으로 절대 비교하지 않는다.
- `model_rank`를 정답/오답으로 해석하지 않는다. 화면에도 "모델 추천과의 비교"로만 표기한다.
- `agreement`는 결정 비교 테이블 하단 요약 문구에 쓰인다.
예: "내 선택 5회 중 3회가 모델 상위 3위 이내였습니다. 실제 감독은 5회 중 1회였습니다."

**결과 화면의 차트 변경**

`li_at_entry × quality_p` 산점도("레버리지 매칭")는 폐기된 효용 설계의 산물이므로 삭제했다.
대신 `decisions` 배열을 그대로 쓰는 **결정 비교 테이블**로 교체한다.

| 상황 | LI | 모델 1위 | 내 선택 (모델 순위) | 실제 감독 (모델 순위) | 결과 ΔWE |

### `POST /sessions/{id}/repeat`

jsonc

```json
// 요청
{ "n": 100 }

// 응답
{
  "n": 100,
  "runs_allowed": { "histogram": {"0":8,"1":19,"2":27,"3":22,"4":14,"5":10},
                    "median": 2, "mean": 2.4 },
  "final_we": { "median": 0.28, "p10": 0.09, "p90": 0.51 },
  "better_than_actual_rate": 0.68,
  "elapsed_ms": 3400
}
```

**동일한 결정 시퀀스를 고정하고 타석 결과만 재샘플링**하는 게 핵심입니다.
투수 선택까지 바뀌면 다른 실험이 돼요.

프론트 화면 라벨은 "같은 선택으로 100회 반복"이다.
이 기능은 λ나 U에 의존하지 않으므로 v0.3에서도 그대로 유지된다.

성능은 3초 이내를 목표로 하되, 넘어가면 진행률 표시가 필요하니 미리 알려주세요.
100회가 부담이면 30회로 줄여도 분포의 모양은 충분히 보입니다.

### 부수적으로 필요한 것

- 세션이 경기 종료까지 갔을 때 `GameState.is_game_over`가 `true`가 되고,
프론트가 이 화면으로 전환합니다.
- `/we-trace`가 경기 전체(1회~9회)를 반환해야 합니다.
메인 대시보드에서는 진행 구간만 보면 됐지만, 결과 화면은 전체가 필요합니다.

---

## 4. 실제 감독 선택의 표시 범위

관전 모드는 구현하지 않는다. 다만 `/recommend`의 `actual_decision`은 유지한다.

- **분기 전**: 실제 감독의 선택을 표시한다. 사용자가 결정한 직후 공개하는 방식이다.
- **분기 후**: `null`. 화면에서 해당 영역을 감춘다.

`actual_decision`에 `rank_in_model`(실제 감독의 선택이 모델 순위 몇 위였나)을 함께 주면 첫 결정의 비교가 풍부해진다. 1위 일치 여부만 보는 것보다 정보량이 많다.

```json
"actual_decision": {
  "pitcher_id": 61895, "name": "주현상",
  "was_change": true,
  "model_rank": 3             // 그 시점 후보 집합 내 밴딧 순위
}
```

경기 전체 agreement는 평가 하네스에서 오프라인으로 측정한다. UI 책임 아님.

---

## 5. 계산 책임 분담

**이 절이 가장 중요하다.** 같은 로직을 두 곳에 구현하면 반드시 어긋난다.

| 계산 | 담당 | 근거 |
| --- | --- | --- |
| Leverage Index | 서버 | `compute_li()` 이미 존재. 순위 계산과 무관 |
| `quality_p` | 서버 | 트랙 A 산출물. 참고 표시용 |
| **`model_score` / `model_rank`** | **서버** | 트랙 B 밴딧. 아래 §5-1 참조 |
| 타석 결과 확률 | 서버 | CatBoost |
| 결과 샘플링 | 서버 | 재현성을 위해 서버에서 seed 관리 |
| **주자 진루** | **서버** | 프론트 재구현 금지 |
| 아웃 카운트, 이닝 교대 | 서버 | 동일 |
| WE, ΔWE, 관점 변환 | 서버 | 반이닝 관점 전환 + my_team 관점 변환까지 (함정 3) |
| 투구수 누적 | 서버 | `pa_faced × avg_pitches_per_pa` |
| 적합도 바 정규화 | 프론트 | 후보 집합 내부 min-max. 표시 전용이라 프론트에서 처리 |

### 5-1. 밴딧의 범위 제약 — 반드시 읽을 것

밴딧은 **"교체가 결정된 시점에 가용 불펜 중 누구를 넣을지"**만 학습한다.
현재 투수를 계속 쓰는 선택(STAY)은 학습 대상이 아니다.

여기서 나오는 설계 결과는 다음과 같다.

- **현재 투수에는 `model_score`가 없다.** 서버는 넣지 않고, 프론트는 점수와 바를 표시하지 않는다.
- **"유지 vs 교체"는 사용자가 판단한다.** 모델 순위는 "교체할 경우"의 목록일 뿐이다.
- 프론트는 후보 목록 상단에 다음을 작게 표시한다.
"모델은 교체 시 투입할 투수를 추천합니다. 교체 시점 판단은 포함하지 않습니다."
- **모델 1위를 자동 선택하지 않는다.** 사용자가 직접 고른다.
- **모델 1위가 아닌 투수를 골라도 경고하지 않는다.** 선택 행에 "모델 N위"만 표시한다.

이 제약을 어기면 시스템이 "모델이 유지와 교체를 비교했다"고 주장하는 셈이 되고,
그건 학습 범위를 벗어난 주장이다. 심사에서 가장 먼저 지적당할 지점이다.

### 5-2. 추천 데이터 어댑터

프론트는 추천 데이터를 인터페이스로 받는다. 지금은 mock, 이후 API로 교체된다.
**백엔드는 이 형태에 맞춰주면 프론트 코드 변경이 없다.**

```tsx
interface ReliefCandidate {
  pitcherId: string
  name: string
  throws: 'L' | 'R' | 'U' | null
  modelScore: number          // 타석당 기대 WPA, 투수 관점
  modelRank: number           // 1부터
  era?: number
  qualityPercentile?: number  // 0~100
  matchupVsBatter?: 'favorable' | 'neutral' | 'unfavorable' | null
  consecutiveDays?: number    // 피로 정보. 없으면 UI에서 "—"
  pitchesLast3d?: number
  daysSinceLastApp?: number
}

interface RecommendationResult {
  situationId: string
  leverageIndex: number
  liPercentile: number
  candidates: ReliefCandidate[]   // modelRank 오름차순
  source: 'precomputed' | 'live' | 'mock'
}

interface RecommendationSource {
  getRecommendations(state: GameState): Promise<RecommendationResult>
}
```

- 실제 경기 상태는 사전 계산 점수(`precomputed`), 사용자가 분기한 상태는 실시간 점수(`live`)다.
두 경로를 서버에서 분리해도 되고 합쳐도 되지만, `source` 필드로 구분은 해줘야 한다.
- 프론트 쪽 인터페이스 문서는 `docs/api-recommendation.md`에 있다.
타입 정의는 `src/types/recommendation.ts`.

### 5-3. 점수 표시 방식 (프론트 규칙, 참고용)

백엔드가 점수 스케일을 정할 때 알아두면 좋은 내용이다.

- 원점수를 그대로 큰 숫자로 띄우지 않는다. **순위와 "1위 대비" 차이**로 표시한다.
- 원점수는 툴팁에만 넣는다: "예상 성과: 타석당 +0.xx%p (과거 데이터 기반 추정)"
- 적합도 바는 후보 집합 내부 min-max 정규화다. 1위가 100%.
- **후보 간 점수 차가 너무 작으면 화면에서 구분이 안 된다.**
mock 단계에서 차이가 0.01%p 수준이라 읽히지 않는 문제가 실제로 발생했다.
실제 밴딧 점수의 후보 간 분산이 어느 정도인지 미리 알려주면 표시 방식을 맞춘다.

---

## 6. 데이터 컨벤션 준수사항

### 6-1. 사용 금지

- `naver_vshra_raw` — 60%가 0.000으로 위장, 투수 교체에도 99.44% 불변
- `reward_wpa` (네이버 원본) — 결측 80%
- `all_pa_enriched.parquet`, `_v2`, `_corrected` — A/B 비교용이지 서빙용이 아님

### 6-2. WE 관점

`we_before`/`we_after`/`reward_wpa_computed`는 **공격팀 관점**이다. 반이닝마다 관점이 뒤집힌다.

이 전환은 **전적으로 서버 책임**이다. 프론트는 `to_home_perspective()`에 해당하는 로직을 재구현하지 않는다. 서버는 세션의 `my_team` 기준으로 변환을 마친 값만 내보내고, 응답에 `we_perspective` 또는 `perspective` 필드로 관점을 명시한다.

관점을 명시하지 않은 WE 값은 응답에 포함하지 않는다. 이 버그 유형의 원인은 산술이 아니라 "이 숫자가 누구 관점인지 모호한 것"이다.

타석 결과 표시용 ΔWE도 마찬가지로 `delta_we_defender`(사용자가 수비 측)를 쓴다. 안타가 나왔는데 `+0.15`로 표시되면 안 된다.

### 6-3. 시점 안전

`prior_*` 컬럼은 `expanding().shift(1)`로 계산된 leakage-free 값이다. **절대 재계산하지 않는다.** 세션의 시작 이닝 이전까지의 누적만 반영되어야 한다.

특히 `Pitcher.season`과 `Batter.season` 통계는 **해당 경기 전날 기준**이어야 한다. 시즌 최종 성적을 보여주면 미래 정보 누수다.

---

## 7. 성능 요구

| 엔드포인트 | 목표 | 비고 |
| --- | --- | --- |
| `/recommend` | 500ms 이내 | 후보 9~10명의 quality/cost 산출 |
| `/simulate-pa` | 800ms 이내 | CatBoost 추론 1회 + 상태 전이 |
| `/advance-half` | 2s 이내 | 반이닝 자동 진행 |
| `/we-trace` | 300ms 이내 | 캐싱 권장 |

계획서의 "실시간 상황 입력 시 2초 이내" 목표와 정합한다. Redis 캐싱 대상은 `/config`, `/teams`, `/games`, 그리고 세션별 `we-trace`.

---

## 8. 에러 처리

```json
{ "error": { "code": "NO_AVAILABLE_PITCHER",
             "message": "가용 불펜 투수가 없습니다",
             "recoverable": false } }
```

프론트가 분기 처리해야 하는 코드:

| 코드 | 상황 | 프론트 동작 |
| --- | --- | --- |
| `SESSION_EXPIRED` | TTL 초과 | 온보딩으로 복귀 |
| `NO_AVAILABLE_PITCHER` | 불펜 소진 | 현재 투수 유지 강제 |
| `INVALID_ROLE` | 공격 반이닝에`/recommend` 호출 | 버그. 로깅 |
| `CANNOT_UNDO` | 되돌릴 상태 없음 | 버튼 비활성 |
| `MODEL_UNAVAILABLE` | Flask 서버 응답 없음 | 재시도 UI |

---

## 9. 미확정 항목 — 회의 안건

| # | 항목 | 담당 | 프론트 영향 |
| --- | --- | --- | --- |
| 1 | **`model_score` 스케일과 후보 간 분산** | 트랙 B | 차이가 작으면 적합도 바가 안 읽힘 |
| 2 | **`li_percentile` 산출 기준** | 트랙 A | "리그 상위 X%" 표시 |
| 3 | **`LI_max` 값** | 트랙 A | 레버리지 밴드 상한 |
| 4 | **주자 진루 규칙** | 회의 | 아래 §9-1 |
| 5 | CatBoost 출력 클래스 ↔ 9종 결과 매핑 | 트랙 A | 애니메이션 매핑 |
| 6 | 분기 후 상대 팀 투수 운용 방식 | 회의 | `/advance-half`의 동작 |
| 7 | `matchup_vs_batter` 판정 기준 | 트랙 A | 보조 정보 줄 표시 |
| 8 | 피로 필드 3종 제공 시점 | 트랙 A | 없으면 `—`로 표시 중 |
| 9 | `precomputed` / `live` 분리 여부 | 트랙 B | 어댑터 구조는 이미 분리해 둠 |

**v0.3에서 해소된 항목**: `cost_p` 정의, λ 범위 확정 — 개념 자체가 폐기되어 더 이상 불필요하다.

### 9-1. 주자 진루 규칙 (프론트 제안)

결정론적 규칙으로 시작하되, 서버가 단독으로 소유한다. 평균 주력 가정.

| 상황 | 결과 | 진루 |
| --- | --- | --- |
| 1루 주자 | 1루타 | 1루 → 3루 |
| 1루 주자 | 2루타 | 1루 → 홈 |
| 2루 주자 | 1루타 | 2루 → 홈 |
| 2루 주자 | 2루타 | 2루 → 홈 |
| 3루 주자 | 1루타 이상 | 3루 → 홈 |
| 만루 | 볼넷 | 밀어내기 1점 |
| 1루 주자, 0~1아웃 | GDP | 2아웃 추가, 주자 소멸 |
| 3루 주자, 0~1아웃 | FO | 희생플라이 판정 여부**확인 필요** |

확률적 진루로 갈지는 회의에서 결정한다. 어느 쪽이든 `next_state`에 최종 결과만 담기므로 프론트 코드는 바뀌지 않는다.

---

## 10. 화면 배치 (참고)

백엔드가 어떤 데이터가 어디에 쓰이는지 파악하기 위한 참고 자료다.
**프론트는 이 배치로 구현 완료된 상태다.**

```
┌────────────────────────────────────────────────────────────┐
│ 상단  팀 엠블럼·스코어·이닝 │ 라인스코어(1~9, R H E B)      │
│       기대 승률 곡선          │ 레버리지 추이 곡선           │
│       (실제=회색점선/시뮬=실선) │ (+ "리그 상위 X%")         │
├──────────────┬─────────────────────────┬───────────────────┤
│ 좌측         │ 중앙                    │ 우측 (의사결정)    │
│              │                         │                    │
│ 투수 시즌스탯 │ 투수 ⟷ 타자 대결        │ 현재 투수 카드      │
│ 좌우 상대성적 │ 다이아몬드 + 아웃카운트   │  (이번 등판 투구수, │
│ 타자 시즌스탯 │                         │   피안타/볼넷,     │
│ recent_avg   │ [결과 이펙트 영역]       │   좌우 매치업)     │
│ 상대전적(AB) │ [확률 분포 막대 9종]     │  ※ 점수·바 없음    │
│ 다음 타자 3명 │                         │ ─────────────      │
│ 오늘 투수 운용│ 타석 로그 (이닝 버튼)    │ 교체 시 추천 순위   │
│              │  + 공격 반이닝 요약 행   │  (모델 적합도순)   │
│              │                         │ 등판 완료 (회색)   │
│              │                         │ ─────────────      │
│              │                         │ 되돌리기 / 투입     │
└──────────────┴─────────────────────────┴───────────────────┘
```

우측 의사결정 영역에서 **현재 투수 카드와 추천 순위 목록은 시각적으로 분리**된다.
현재 투수에는 적합도 바가 없고, 교체 판단에 쓰이는 정보만 들어간다.

승률 곡선은 이닝 단위, 레버리지 곡선은 타석 단위로 점을 찍는다.

---

## 11. 개발 순서 제안

1. **`/config`, `/teams`, `/games`** — 프론트 온보딩 착수 가능
2. **`/sessions` + `GameState`** — 대시보드 정적 렌더링 가능
3. **`/recommend`** — 밴딧 학습 전이면 임시 점수 + `model.provisional: true`
4. **`/simulate-pa`** — 애니메이션 연동
5. **`/advance-half`, `/undo`, `/we-trace`** — 루프 완성

1~2번만 있으면 프론트가 목업 데이터 없이 실제 화면을 만들 수 있다. **가능하면 이 두 개를 우선 부탁한다.**

그 전까지는 위 스키마대로 MSW(Mock Service Worker) 목업으로 진행하며, 스키마가 바뀌면 즉시 공유해주면 된다.

---

## 12. v0.3 인수 체크리스트

백엔드 구현 후 아래를 확인해주면 프론트와 바로 붙는다.

### 추천 계약

```
□ /recommend 응답에 lambda 관련 필드가 하나도 없는가
□ candidates가 model_rank 오름차순으로 정렬돼 오는가
□ candidates에 현재 투수가 섞여 있지 않은가 (current_pitcher로 분리)
□ current_pitcher에 model_score·model_rank가 없는가
□ availability가 "used"인 투수에게 model_score를 넣지 않았는가
□ source 필드가 precomputed / live / mock 중 하나로 오는가
□ li_percentile이 0~100 범위인가
```

### 점수 품질

```
□ 후보 간 model_score 차이가 화면에서 구분될 만큼 벌어지는가
   (min-max 정규화 후 1위와 최하위 바 길이가 눈에 띄게 달라야 함)
□ 동점 시 정렬 순서가 결정론적인가 (pitcher_id 오름차순 권장)
□ model.provisional 플래그가 학습 전후로 올바르게 오는가
```

### 결과 화면

```
□ result 응답에 lambda_used가 없는가
□ pitcher_usage에 quality_p가 없는가
□ decisions[].model_rank가 그 시점 후보 집합 기준인가
□ agreement 집계가 decisions 배열과 일치하는가
```

### 기존 계약 (v0.2에서 유지)

```
□ 매 반이닝 시작 시 out_count === 0 && base_state === "0"
□ 같은 타자가 연속 두 타석에 등장하지 않는가
□ 볼넷 시 1루가 비어 있으면 주자 진루 없음
□ probs에 9개 키가 전부 있고 합이 1.0 ± 0.005인가
□ SO/GO/FO/GDP → delta_we_defender >= 0, 안타 계열 <= 0
□ delta_we가 타석 1회 범위에서만 계산되는가 (반이닝 경계 넘지 않음)
□ est_pitch_count가 타석마다 증가하는가
```