# K 백엔드 요구사항 명세

**작성**: 박규영 (트랙 C / 프론트엔드)
**대상**: 변희민 (트랙 A / Spring Boot, CatBoost, LI, quality_p), 윤서현 (트랙 B / Flask, Contextual Bandit)
**버전**: v0.1 초안
**전제**: `HANDOFF_FULL.md`의 데이터 컨벤션을 그대로 따른다. 이 문서에서 재정의하지 않는다.

---

## 0. 30초 요약

- 1차 구현은 **리플레이 모드**다. 2025 시즌 실제 경기를 불러와 특정 이닝부터 진행한다.
- 진행 단위는 **타석(PA)**이다. 볼카운트는 다루지 않는다.
- 사용자는 **우리 팀 수비 반이닝**에서만 개입한다. 우리 팀 공격 반이닝은 서버가 자동 진행한다.
- **주자 진루, 아웃 카운트, 점수, WE 계산은 전부 서버 책임**이다. 프론트는 재구현하지 않는다.
- **U(효용) 계산만 프론트가 한다.** 서버는 원시 성분(`quality_p`, `cost_p`, `LI`)을 주고, λ 슬라이더 반응은 클라이언트에서 즉시 처리한다. (§5 참조)
- 세션은 서버가 보유한다. 되돌리기(undo)와 분기 추적을 위해 필요하다.

---

## 1. 범위

### 1-1. 이번 범위에 포함

| 항목          | 내용                                                    |
| ------------- | ------------------------------------------------------- |
| 온보딩        | 내 팀 / 상대 팀 / 날짜 / 시작 이닝 선택                 |
| 메인 대시보드 | 상단 스코어보드 + 좌측 스탯 + 중앙 상황 + 우측 의사결정 |
| 추천          | 현재 상황의 LI와 후보 투수 목록                         |
| 시뮬레이션    | 타석 1회 샘플링, 결과 반영                              |
| 자동 진행     | 우리 팀 공격 반이닝                                     |
| 되돌리기      | 직전 상태로 복귀                                        |

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

```jsonc
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

```jsonc
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

  "quality_p": 0.71,
  "cost_p": 0.64
}
```

**요구사항**

- `vs_batter_hand`는 `naver_vshra_raw`를 사용하지 않는다. 자체 매치업 지표에서 산출한다.
- `availability`가 `"used"`인 투수도 **목록에서 제외하지 말고 포함**한다. 프론트가 회색으로 분리 표시한다.
- `est_pitch_count`는 서버가 누적한다. 세션 시작 시점의 실제 `total_pitch_count`를 초기값으로 이어받는다.
- `quality_p`, `cost_p`는 정규화된 스케일이어야 한다. 스케일 정의는 `/config`로 제공한다.
- **선수 사진은 자체 서버가 호스팅한다.** 외부 CDN을 직접 참조(핫링킹)하지 않는다.
  - 원본: `https://sports-phinf.pstatic.net/player/kbo/default/{player_id}.png?type=w150`
  - 데이터셋의 `pitcher_id`/`batter_id`가 이 ID와 동일 체계인지 **먼저 검증**한다. 동일하면 매핑 테이블 불필요.
  - 사전 수집 후 `public/players/{id}.webp`로 저장. 규모는 시즌당 700명 내외, 총 10MB 미만.
  - 플레이스홀더 이미지(no-Image)는 파일 크기로 걸러내고, 없는 선수는 `null` 반환 → 프론트가 이니셜 아바타로 폴백.
  - 사유: 발표 환경의 네트워크 의존 제거, 외부 경로 변경 대응, 요청량 절감.
- 타자 사진도 동일 정책이다. `Batter`에도 `photo_url`을 포함한다.

### 2-3. `Batter`

```jsonc
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

```jsonc
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

| 코드   | 라벨  | 코드    | 라벨        |
| ------ | ----- | ------- | ----------- |
| `1B` | 1루타 | `GO`  | 땅볼 아웃   |
| `2B` | 2루타 | `FO`  | 플라이 아웃 |
| `3B` | 3루타 | `GDP` | 병살타      |
| `HR` | 홈런  | `SO`  | 삼진        |
| `BB` | 볼넷  |         |             |

CatBoost 출력 클래스와 위 9종이 다르면 매핑 테이블을 서버가 제공한다. 프론트는 이 9종만 처리한다.

---

## 3. API 명세

베이스 경로는 `/api/v1`로 가정한다.

### 3-1. `GET /config`

앱 기동 시 1회 호출. **λ 범위, LI 기준값, 스케일을 하드코딩하지 않기 위한 엔드포인트다.**

```jsonc
{
  "lambda": { "min": 0.0, "max": 2.0, "step": 0.05, "default": 0.5 },
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
  "quality_p": { "min": 0.0, "max": 1.0, "description": "..." },
  "cost_p":    { "min": 0.0, "max": 1.0, "description": "..." },
  "utility_formula": "quality_p * LI_s - lambda * cost_p * (1 - LI_s / LI_max)"
}
```

**중요**: `config/lambda_range.json`, `config/li_baseline.json`이 확정되면 그 값을 그대로 서빙한다. `cost_p` 미확정 동안에는 임시값과 함께 `"provisional": true` 플래그를 넣어주면 프론트에서 경고 배지를 띄운다.

### 3-2. `GET /teams`

```jsonc
[ { "code": "HH", "name": "한화", "logo_url": "..." }, ... ]
```

팀 **코드**로만 식별한다. API의 팀 이름 필드는 과거 경기에도 현재 명칭을 소급 적용하므로(2016년 SK 경기가 "SSG"로 표시됨) 이름을 키로 쓰지 않는다.

### 3-3. `GET /games?season=2025&team=HH&opponent=KT`

선택 가능한 경기 목록.

```jsonc
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

```jsonc
// 요청
{ "game_id": "20250902HHKT02025", "my_team": "HH", "start_inning": 7, "mode": "play" }
// mode: "play" | "watch"

// 응답
{ "state": { /* GameState */ } }
```

세션은 서버가 상태를 보유한다. 되돌리기와 분기 추적 때문에 stateless로는 어렵다. TTL은 30분 정도면 충분하다.

### 3-5. `POST /sessions/{id}/recommend`

현재 상황의 LI와 후보 투수 목록.

```jsonc
// 요청 — body 없음. λ를 보내지 않는 것이 핵심 (§5)

// 응답
{
  "leverage_index": 2.41,
  "leverage_band": "고",
  "li_max": 5.0,
  "candidates": [
    {
      "pitcher": { /* Pitcher */ },
      "is_current": true
    },
    { "pitcher": { /* Pitcher */ }, "is_current": false },
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

- 후보군은 실제 불펜 명단에서 그 시점까지 이미 등판한 투수를 제외해 구성하되, **제외된 투수도 `availability: "used"`로 목록에 포함**한다.
- 현재 투수는 반드시 `is_current: true`로 후보에 포함한다. "유지"가 하나의 선택지여야 한다.
- `bullpen_source`가 `"estimated"`인 구간(전체의 13.7%)은 프론트에서 "추정 명단" 배지를 띄운다.
- `actual_decision`은 관전 모드와 분기 전 플레이 모드에서만 채운다.

### 3-6. `POST /sessions/{id}/simulate-pa`

```jsonc
// 요청
{ "pitcher_id": 61895, "lambda": 0.5 }
// lambda는 로깅/분석용. 시뮬레이션 결과에는 영향 없음

// 응답
{ "result": { /* PAResult (next_state 포함) */ } }
```

**요구사항**

- `pitcher_id`가 현재 투수와 다르면 서버가 교체를 기록한다. 교체 이력은 세션에 누적된다.
- 첫 교체가 실제 감독의 선택과 다르면 `next_state.is_diverged = true`로 전환한다.
- 3아웃이 되면 `next_state`의 `half`와 `inning`을 갱신하고 `my_role`을 `"offense"`로 바꾼다.

### 3-7. `POST /sessions/{id}/advance-half`

우리 팀 공격 반이닝을 서버가 자동 진행한다. 프론트는 "상대 수비 진행 중..." 표시만 한다.

```jsonc
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

```jsonc
{ "state": { /* GameState — 직전 상태 */ } }
```

**요구사항**

- 되돌리기 단위는 **타석 1회**다.
- 자동 진행된 반이닝은 통째로 되돌린다.
- 분기 시점보다 앞으로 되돌아가면 `is_diverged`를 `false`로 복원한다.
- 되돌릴 수 없으면 409와 함께 사유를 반환한다.

### 3-9. `GET /sessions/{id}/we-trace`

승률 곡선 렌더링용. **이닝 단위**로 집계해 반환한다. 타석 단위는 9회까지 40점이 넘어 곡선이 뭉개진다.

```jsonc
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

```jsonc
{ "inning": 7, "half": "bot", "we": 0.19, "leverage_index": 2.41 }
```

### `GET /sessions/{id}/result`

jsonc

```jsonc
{
  "simulated": { "score": {"my": 6, "opp": 7}, "runs_allowed_in_range": 1,
                 "final_we": 0.35, "result": "loss" },
  "actual":    { "score": {"my": 6, "opp": 9}, "runs_allowed_in_range": 3,
                 "final_we": 0.09, "result": "loss" },
  "lambda_used": 0.5,
  "pitcher_usage": [
    { "pitcher_id": 60841, "name": "김정운",
      "from": {"inning":7,"half":"bot","pa":0}, "to": {"inning":7,"half":"bot","pa":2},
      "delta_we_defender": 0.04, "pitches_est": 18,
      "li_at_entry": 2.41, "quality_p": 0.70 }
  ],
  "actual_pitcher_usage": [ /* 동일 구조 */ ],
  "decisions": [
    { "inning":7, "half":"bot", "leverage_index":2.41,
      "model_top": {"pitcher_id":61895,"name":"주현상","u":1.67},
      "user_choice": {"pitcher_id":61895,"rank":1},
      "actual_choice": {"pitcher_id":61895},   // 분기 후 null
      "outcome":"2B", "delta_we_defender": -0.15 }
  ],
  "bullpen_used": { "mine": 5, "actual": 4, "total": 9 }
}
```

`li_at_entry`와 `quality_p`가 함께 있어야 레버리지 매칭 산점도를 그릴 수 있습니다.

### `POST /sessions/{id}/repeat`

jsonc

```jsonc
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

성능은 3초 이내를 목표로 하되, 넘어가면 진행률 표시가 필요하니 미리 알려주세요.
100회가 부담이면 30회로 줄여도 분포의 모양은 충분히 보입니다.

### 부수적으로 필요한 것

* 세션이 경기 종료까지 갔을 때 `GameState.is_game_over`가 `true`가 되고,
  프론트가 이 화면으로 전환합니다.
* `/we-trace`가 경기 전체(1회~9회)를 반환해야 합니다.
  메인 대시보드에서는 진행 구간만 보면 됐지만, 결과 화면은 전체가 필요합니다.

---

## 4. 실제 감독 선택의 표시 범위

관전 모드는 구현하지 않는다. 다만 `/recommend`의 `actual_decision`은 유지한다.

- **분기 전**: 실제 감독의 선택을 표시한다. 사용자가 결정한 직후 공개하는 방식이다.
- **분기 후**: `null`. 화면에서 해당 영역을 감춘다.

`actual_decision`에 `rank_in_model`(실제 감독의 선택이 모델 순위 몇 위였나)을 함께 주면 첫 결정의 비교가 풍부해진다. 1위 일치 여부만 보는 것보다 정보량이 많다.

```jsonc
"actual_decision": {
  "pitcher_id": 61895, "name": "주현상",
  "was_change": true,
  "rank_in_model": 3          // 현재 λ 기준이 아니라 λ=default 기준. 프론트가 재계산 가능
}
```

경기 전체 agreement는 평가 하네스에서 오프라인으로 측정한다. UI 책임 아님.

---

## 5. 계산 책임 분담

**이 절이 가장 중요하다.** 같은 로직을 두 곳에 구현하면 반드시 어긋난다.

| 계산                    | 담당             | 근거                                              |
| ----------------------- | ---------------- | ------------------------------------------------- |
| Leverage Index          | 서버             | `compute_li()` 이미 존재. λ와 무관             |
| `quality_p`           | 서버             | 트랙 A 산출물                                     |
| `cost_p`              | 서버             | 트랙 A 산출물                                     |
| **U (효용 점수)** | **프론트** | 아래 참조                                         |
| 타석 결과 확률          | 서버             | CatBoost                                          |
| 결과 샘플링             | 서버             | 재현성을 위해 서버에서 seed 관리                  |
| **주자 진루**     | **서버**   | 프론트 재구현 금지                                |
| 아웃 카운트, 이닝 교대  | 서버             | 동일                                              |
| WE, ΔWE, 관점 변환     | 서버             | 반이닝 관점 전환 + my_team 관점 변환까지 (함정 3) |
| 투구수 누적             | 서버             | `pa_faced × avg_pitches_per_pa`                |
| λ 임계값 눈금          | 프론트           | 아래 참조                                         |

### 5-1. U를 프론트에서 계산하는 이유

U는 λ에 대해 **선형**이다.

```
U_p(λ) = quality_p · LI_s  −  λ · cost_p · (1 − LI_s / LI_max)
```

`quality_p`, `cost_p`, `LI_s`, `LI_max`만 있으면 프론트에서 즉시 계산된다. 슬라이더를 드래그할 때마다 API를 왕복하면 60fps 반응이 불가능하다. 따라서 `/recommend`는 **λ를 받지 않고** 원시 성분만 반환한다.

서버는 U를 계산해서 보낼 필요가 없다. 보내더라도 프론트는 자체 계산값을 쓴다. **단, 공식이 바뀌면 반드시 공유해야 한다.** `/config`의 `utility_formula` 필드가 그 목적이다.

### 5-2. λ 임계값 눈금

두 투수의 순위가 뒤집히는 λ는 해석적으로 풀린다.

```
U_i(λ) = U_j(λ)
→  λ* = (q_i − q_j) · LI_s  /  [ (c_i − c_j) · (1 − LI_s / LI_max) ]
```

프론트가 모든 후보 쌍에 대해 λ*를 구해 `[min, max]` 범위 안에 드는 값만 슬라이더 트랙에 눈금으로 표시한다. 서버 작업 없음.

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

| 엔드포인트        | 목표       | 비고                            |
| ----------------- | ---------- | ------------------------------- |
| `/recommend`    | 500ms 이내 | 후보 9~10명의 quality/cost 산출 |
| `/simulate-pa`  | 800ms 이내 | CatBoost 추론 1회 + 상태 전이   |
| `/advance-half` | 2s 이내    | 반이닝 자동 진행                |
| `/we-trace`     | 300ms 이내 | 캐싱 권장                       |

계획서의 "실시간 상황 입력 시 2초 이내" 목표와 정합한다. Redis 캐싱 대상은 `/config`, `/teams`, `/games`, 그리고 세션별 `we-trace`.

---

## 8. 에러 처리

```jsonc
{ "error": { "code": "NO_AVAILABLE_PITCHER",
             "message": "가용 불펜 투수가 없습니다",
             "recoverable": false } }
```

프론트가 분기 처리해야 하는 코드:

| 코드                     | 상황                             | 프론트 동작         |
| ------------------------ | -------------------------------- | ------------------- |
| `SESSION_EXPIRED`      | TTL 초과                         | 온보딩으로 복귀     |
| `NO_AVAILABLE_PITCHER` | 불펜 소진                        | 현재 투수 유지 강제 |
| `INVALID_ROLE`         | 공격 반이닝에`/recommend` 호출 | 버그. 로깅          |
| `CANNOT_UNDO`          | 되돌릴 상태 없음                 | 버튼 비활성         |
| `MODEL_UNAVAILABLE`    | Flask 서버 응답 없음             | 재시도 UI           |

---

## 9. 미확정 항목 — 회의 안건

| # | 항목                                  | 담당   | 프론트 영향                              |
| - | ------------------------------------- | ------ | ---------------------------------------- |
| 1 | **`cost_p` 정의**             | 트랙 A | λ 항이 작동하지 않음. 슬라이더가 무반응 |
| 2 | **λ 범위 확정**                | 트랙 A | 슬라이더 min/max.`/config`로 해결      |
| 3 | **`LI_max` 값**               | 트랙 A | U 계산의 분모                            |
| 4 | **주자 진루 규칙**              | 회의   | 아래 §9-1                               |
| 5 | CatBoost 출력 클래스 ↔ 9종 결과 매핑 | 트랙 A | 애니메이션 매핑                          |
| 6 | 분기 후 상대 팀 투수 운용 방식        | 회의   | `/advance-half`의 동작                 |
| 7 | `quality_p` 스케일 범위             | 트랙 A | 막대 그래프 정규화                       |

### 9-1. 주자 진루 규칙 (프론트 제안)

결정론적 규칙으로 시작하되, 서버가 단독으로 소유한다. 평균 주력 가정.

| 상황              | 결과       | 진루                                    |
| ----------------- | ---------- | --------------------------------------- |
| 1루 주자          | 1루타      | 1루 → 3루                              |
| 1루 주자          | 2루타      | 1루 → 홈                               |
| 2루 주자          | 1루타      | 2루 → 홈                               |
| 2루 주자          | 2루타      | 2루 → 홈                               |
| 3루 주자          | 1루타 이상 | 3루 → 홈                               |
| 만루              | 볼넷       | 밀어내기 1점                            |
| 1루 주자, 0~1아웃 | GDP        | 2아웃 추가, 주자 소멸                   |
| 3루 주자, 0~1아웃 | FO         | 희생플라이 판정 여부**확인 필요** |

확률적 진루로 갈지는 회의에서 결정한다. 어느 쪽이든 `next_state`에 최종 결과만 담기므로 프론트 코드는 바뀌지 않는다.

---

## 10. 화면 배치 (참고)

백엔드가 어떤 데이터가 어디에 쓰이는지 파악하기 위한 참고 자료다.

```
┌────────────────────────────────────────────────────────────┐
│ 상단  팀 로고·스코어·이닝 │ 스코어보드(1~9, R H E B)        │
│       레버리지 게이지 + 밴드 │ 기대 승률 바 (홈/원정)        │
├──────────────┬─────────────────────────┬───────────────────┤
│ 좌측         │ 중앙                    │ 우측 (의사결정)    │
│              │                         │                    │
│ 투수 시즌스탯 │ 이닝 / 아웃카운트        │ λ 슬라이더         │
│ 좌우 상대성적 │ 다이아몬드 (주자)        │  + 임계값 눈금     │
│ 타자 시즌스탯 │ 현재 투수 ↔ 타자        │  + 툴팁            │
│ recent_avg   │                         │                    │
│ 상대전적(AB) │ [결과 애니메이션 영역]   │ 현재 투수 U 카드   │
│              │ [확률 분포 표]           │ ─────────────      │
│              │                         │ 가용 불펜 (U 순)   │
│              │ 타석 로그 (이닝별 슬라이드)│ ─────────────      │
│              │                         │ 사용한 투수 (회색) │
└──────────────┴─────────────────────────┴───────────────────┘
```

---

## 11. 개발 순서 제안

1. **`/config`, `/teams`, `/games`** — 프론트 온보딩 착수 가능
2. **`/sessions` + `GameState`** — 대시보드 정적 렌더링 가능
3. **`/recommend`** — `cost_p` 미정이면 임시값 + `provisional: true`
4. **`/simulate-pa`** — 애니메이션 연동
5. **`/advance-half`, `/undo`, `/we-trace`** — 루프 완성

1~2번만 있으면 프론트가 목업 데이터 없이 실제 화면을 만들 수 있다. **가능하면 이 두 개를 우선 부탁한다.**

그 전까지는 위 스키마대로 MSW(Mock Service Worker) 목업으로 진행하며, 스키마가 바뀌면 즉시 공유해주면 된다.
