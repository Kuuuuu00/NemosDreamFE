# 네모의 꿈 — 백엔드 API 연동 명세

**대상**: 프론트엔드 연동 작업 (Claude Code 입력용)
**서버**: `https://nemosdream.cloud`
**원본**: OpenAPI 3.1 스펙 `api-docs.json` (`/v3/api-docs`, 이 문서와 함께 저장소에 둘 것)
**기준 문서**: `K-Moneyball 프론트엔드 → 백엔드 요구사항 명세 v0.3` (U 폐기 버전)

> **우선순위**: 실측 샘플(`docs/integration/samples/`) > 이 문서 > `api-docs.json`. 실제 응답이 스펙과 다르면 샘플이 맞다(예: `/result`의 `score`, §7 #1).

> **이 문서를 읽는 법**
> OpenAPI 스펙은 구조(경로·필드·타입·에러 코드)는 전부 알려주지만, 세 가지는 알려주지 않는다.
> ① 어떤 필드가 `null`일 수 있는가 ② 문자열 필드에 어떤 값이 오는가 ③ 수치의 단위와 의미.
> 이 문서는 이 세 가지를 요구사항 명세 v0.3과 엔드포인트 설명문으로 보강했다.
> 보강한 부분은 **[명세 기준]**, 실제 응답으로 확인이 필요한 부분은 **[확인 필요]**로 표시한다.

---

## 0. 공통 규약

### 0-1. 응답 형식

| 구분 | 형식 |
| --- | --- |
| 성공 | DTO를 **감싸지 않고 그대로** 반환 (`{ data: ... }` 래퍼 없음) |
| 실패 | `{ "error": { "code", "message", "recoverable" } }` |
| JSON 키 | **snake_case** (예외는 §0-3) |
| 베이스 경로 | `/api/v1` (단, `/health`는 접두사 없음) |
| 세션 수명 | **마지막 요청 후 30분**. 지나면 `SESSION_EXPIRED` |

**주의 — "감싸지 않는다"의 예외**: 세션 계열 일부 응답은 DTO 자체가 한 겹 감싸진 구조다.
래퍼가 아니라 DTO 정의이므로 그대로 받는다.

| 엔드포인트 | 응답 최상위 |
| --- | --- |
| `POST /sessions`, `POST /undo` | `{ "state": GameState }` |
| `POST /simulate-pa` | `{ "result": PaResult }` |
| `POST /advance-half` | `{ "summary": ..., "state": GameState }` |
| `POST /recommend` | `{ "candidates": [ { "pitcher": ... } ] }` — 후보 각각이 `pitcher`로 한 번 더 감싸짐 |

### 0-2. 에러 코드 (전체)

```json
{ "error": { "code": "SESSION_EXPIRED", "message": "세션이 만료되었습니다. 처음부터 다시 시작해 주세요.", "recoverable": false } }
```

| HTTP | code | message | recoverable | 발생 엔드포인트 | 프론트 동작 |
| --- | --- | --- | --- | --- | --- |
| 400 | `INVALID_REQUEST` | 요청 값이 올바르지 않습니다. | false | 전체 | 버그. 콘솔 로깅 + 일반 에러 토스트 |
| 400 | `INVALID_ROLE` | 공격 반이닝에서는 투수를 추천할 수 없습니다. | false | recommend, simulate-pa, advance-half | 버그. 로깅. 상태 재동기화 |
| 404 | `GAME_NOT_FOUND` | 경기를 찾을 수 없습니다. | false | POST /sessions | 경기 선택으로 복귀 |
| 404 | `SESSION_EXPIRED` | 세션이 만료되었습니다. 처음부터 다시 시작해 주세요. | false | 세션 계열 전체 | 안내 후 온보딩(`/`)으로 복귀 |
| 409 | `CANNOT_UNDO` | 되돌릴 상태가 없습니다. | false | undo | 버튼 비활성 (정상 흐름에선 `can_undo`로 막음) |
| 409 | `NO_AVAILABLE_PITCHER` | 가용 불펜 투수가 없습니다. | false | recommend | 후보 영역 비우고 "현재 투수 유지"만 허용 |
| 503 | `MODEL_UNAVAILABLE` | 추천 모델 서버가 응답하지 않습니다. | **true** | recommend | 재시도 UI |
| 500 | `INTERNAL_ERROR` | 서버 내부 오류가 발생했습니다. | **true** | 전체 | 재시도 UI |

**클라이언트 처리 규칙**

- **`code`로 분기**한다. `message`는 표시용이며 문자열 비교로 분기하지 않는다.
- `recoverable: true` → 재시도 버튼. `false` → 재시도하지 않는다.
- `INVALID_ROLE`의 message는 recommend 기준 문구라 advance-half(수비 중 호출)에서는 내용이 맞지 않는다.
  화면에 그대로 띄우지 말고 code 기준 문구를 쓴다. (§7 #8)
- 네트워크 오류·타임아웃(응답 바디 없음)은 `{ code: "NETWORK_ERROR", recoverable: true }`로 정규화해 같은 경로로 처리한다.

### 0-3. 키 변환 — 가장 먼저 걸리는 함정

백엔드 JSON은 snake_case지만 **snake_case가 아닌 키가 섞여 있다.**

| 위치 | 키 | 성격 |
| --- | --- | --- |
| `linescore.totals.{away,home}` | `R`, `H`, `E`, `B` | 대문자 고정 필드 |
| `vs_batter_hand` | `L`, `R` | 대문자 고정 필드 |
| `PaResult.probs` | `1B`, `2B`, `3B`, `HR`, `BB`, `SO`, `GO`, `FO`, `GDP` | **맵** (결과 코드 → 확률) |
| `runs_allowed.histogram` | `"0"`, `"1"`, ... | **맵** (실점 → 횟수) |

`lodash.camelCase` 같은 범용 변환기를 재귀로 돌리면 `R → r`, `GDP → gdp`, `1B → 1B`/`1b`로 깨진다.

**규칙**

1. 먼저 `src/types/api.ts`가 어떤 케이스로 되어 있는지 확인한다. 명세를 미러링해 **snake_case라면 전역 변환을 하지 않는다.** 응답을 그대로 쓴다.
2. camelCase가 필요한 곳(`src/types/recommendation.ts`의 `pitcherId`, `modelScore` 등)은 **`RecommendationSource` 어댑터 안에서 필드별로 명시 매핑**한다.
3. 전역 변환이 불가피하면 `_[a-z]` 패턴만 바꾸는 변환기를 쓰고, `probs`·`histogram`은 하위 키를 건드리지 않도록 예외 처리한다.
4. 요청 바디는 snake_case로 보낸다 (`pitcher_id`, `game_id`, `my_team`, `start_inning`).

### 0-4. nullable 처리

OpenAPI 스펙의 응답 스키마에는 `required`와 `nullable` 표시가 **하나도 없다.**
스펙만 보고 타입을 생성하면 모든 필드가 `?:`(optional)이 되거나, 반대로 전부 non-null이 된다. 둘 다 틀리다.
아래 §2의 TypeScript 타입에 **명세와 설명문 기준으로 `| null`을 직접 표기**했다. 이 타입을 기준으로 쓴다.

`openapi-typescript`로 자동 생성하는 경우에도 nullable은 §2를 보고 손으로 덮어써야 한다.

### 0-5. 선수 사진 URL

명세상 `photo_url`은 `/static/players/{id}.webp` 형태의 **상대 경로**다 **[명세 기준]**.
`API_BASE`를 붙여 절대 경로로 만든다. `null`이면 이니셜 아바타로 폴백한다.
절대 URL로 오는 경우도 대비해 `startsWith('http')`면 그대로 쓴다.

### 0-6. 환경 설정

```bash
# .env.development
VITE_API_BASE=https://nemosdream.cloud
VITE_USE_MOCK=false
```

- **CORS 확인이 첫 작업이다.** OpenAPI 스펙에는 CORS 정보가 없다.
  브라우저에서 `localhost:5173` → `nemosdream.cloud` 호출이 막히면 두 가지 중 하나를 쓴다.
  - 개발: `vite.config.ts`에 `server.proxy: { '/api': 'https://nemosdream.cloud', '/health': ... }` + `changeOrigin: true`
  - 배포: 백엔드에 프론트 도메인 CORS 허용 요청
- 목업과 실제 API를 `VITE_USE_MOCK`으로 전환할 수 있게 유지한다. 발표 중 서버 장애 대비.

---

## 1. 엔드포인트 목록

| # | Method | 경로 | 설명 | 성공 | 에러 |
| --- | --- | --- | --- | --- | --- |
| 1 | GET | `/health` | 헬스체크 | 200 | 400 500 |
| 2 | GET | `/api/v1/config` | 앱 설정 | 200 | 400 500 |
| 3 | GET | `/api/v1/teams` | 팀 목록 | 200 | 400 500 |
| 4 | GET | `/api/v1/games` | 경기 목록 | 200 | 400 500 |
| 5 | POST | `/api/v1/sessions` | 세션 시작 | **201** | 400 404 500 |
| 6 | POST | `/api/v1/sessions/{sessionId}/recommend` | 교체 후보 추천 | 200 | 400 404 409 500 503 |
| 7 | POST | `/api/v1/sessions/{sessionId}/simulate-pa` | 타석 진행 | 200 | 400 404 500 |
| 8 | POST | `/api/v1/sessions/{sessionId}/advance-half` | 공격 반이닝 자동 진행 | 200 | 400 404 500 |
| 9 | POST | `/api/v1/sessions/{sessionId}/undo` | 되돌리기 | 200 | 400 404 409 500 |
| 10 | GET | `/api/v1/sessions/{sessionId}/we-trace` | 승률·레버리지 추이 | 200 | 400 404 500 |
| 11 | GET | `/api/v1/sessions/{sessionId}/result` | 결과 화면 | 200 | 400 404 500 |
| 12 | POST | `/api/v1/sessions/{sessionId}/repeat` | 같은 선택으로 n회 반복 | 200 | 400 404 500 |

`POST /sessions`만 **201**이다. `res.ok`로 판정하고 `status === 200`으로 비교하지 않는다.

### 1-1. 화면별 호출 흐름

```
[앱 기동]
  GET /health            (선택. 실패 시 "서버 연결 불가" + 목업 전환 안내)
  GET /config            1회 호출 후 캐싱

[온보딩 /]
  GET /teams             팀 그리드
  GET /games?team=HH[&opponent=KT]   팀 선택 후. team 필수
  POST /sessions         { game_id, my_team, start_inning } → state, sessionId 저장

[대시보드 /game]  — state.my_role로 분기
  ┌ my_role = "defense"
  │   POST /recommend            후보 목록 (상태가 바뀔 때마다 다시 호출)
  │   사용자 선택
  │   POST /simulate-pa { pitcher_id }   유지여도 현재 투수 id 전송
  │   → result.next_state 로 state 교체
  │   → GET /we-trace            차트 갱신
  │
  ├ my_role = "offense"
  │   POST /advance-half         recommend 호출 금지 (INVALID_ROLE)
  │   → state 교체, summary로 공격 요약 표시
  │   → GET /we-trace
  │
  ├ 되돌리기: POST /undo → state 교체 → GET /we-trace (+ defense면 /recommend)
  │
  └ state.is_game_over = true → /result/:sessionId 로 이동

[결과 /result/:sessionId]
  GET /result
  POST /repeat { n: 100 }       "같은 선택으로 100회 반복" 버튼
```

**상태 소유 원칙**: 화면의 `GameState`는 **항상 서버 응답으로 통째로 교체**한다.
프론트에서 아웃·주자·점수를 부분 갱신하지 않는다. 목업 엔진(`src/mocks/engine.ts`)의 로직을 API 모드에서 재사용하지 않는다.

---

## 2. 공통 타입 (TypeScript)

스펙의 `components.schemas`를 옮기고 nullable·문자열 값을 보강했다. `src/types/api.ts`와 대조해 차이를 맞춘다.

```ts
// ── 기본 ─────────────────────────────────────────
export type Half = 'top' | 'bot';
export type Outcome = '1B' | '2B' | '3B' | 'HR' | 'BB' | 'SO' | 'GO' | 'FO' | 'GDP';
export type TeamCode = 'HH' | 'HT' | 'KT' | 'LG' | 'LT' | 'NC' | 'OB' | 'SK' | 'SS' | 'WO';
export type BaseState = '0' | '1' | '2' | '3' | '12' | '13' | '23' | '123'; // [명세 기준]
export type Matchup = 'favorable' | 'neutral' | 'unfavorable';

export interface ApiError {
  error: { code: string; message: string; recoverable: boolean };
}

// ── Config ───────────────────────────────────────
export interface AppConfig {
  leverage: {
    league_avg: number;                 // [명세 기준] 1.0
    max: number;                        // LI_max [명세 기준] 5.0
    bands: { label: string; min: number; max: number }[];
  };
  model: {
    score_unit: string;                 // [명세 기준] "wpa_per_pa"
    description: string;
    provisional: boolean;               // true면 "임시 점수" 배지
  };
  li_source_note: string;
}

// ── Team / Game ──────────────────────────────────
export interface Team {
  code: TeamCode;
  name: string;
  logo_url: string | null;              // 로고 없으면 null (설명문 명시)
}

export interface GameSummary {
  game_id: string;                      // 예: "20250902HHKT02025"
  date: string;                         // "YYYY-MM-DD" (format: date)
  away: TeamCode;
  home: TeamCode;
  final_score: { away: number; home: number };
  available_innings: number[];          // team의 수비 반이닝 기준
  high_leverage_innings: number[];      // "승부처 바로가기"
}

// ── Pitcher ──────────────────────────────────────
export interface HandSplit { avg: number | null; woba: number | null; iso: number | null; pa: number }  // 실측: avg·woba·iso null 가능

export interface Workload {             // 하위 필드 전부 null 허용 [명세 기준] → "—" 표시
  pa_faced_today: number | null;
  est_pitch_count: number | null;
  avg_pitches_per_pa: number | null;
  days_rest: number | null;
  appearances_last_7d: number | null;
  consecutive_days: number | null;      // 명세에 없던 필드 (추가됨)
  pitches_last_3d: number | null;       // 명세에 없던 필드 (추가됨)
}

export interface Pitcher {
  pitcher_id: number;
  name: string;
  throws: 'L' | 'R' | 'U';              // [명세 기준]
  photo_url: string | null;
  season: { era: number | null; whip: number | null; ip: number; so: number; bb: number; g: number };  // 실측: era·whip null 가능
  vs_batter_hand: { L: HandSplit | null; R: HandSplit | null };  // [확인 필요] 표본 없을 때
  workload: Workload;
  availability: 'available' | 'used' | 'current' | 'unavailable';  // [명세 기준]
  unavailable_reason: string | null;
}

// recommend의 후보에만 쓰이는 확장형 (스펙: CandidatePitcher)
export interface CandidatePitcher extends Pitcher {
  model_score: number | null;           // 사용한 투수(used)는 null (설명문 명시)
  model_rank: number | null;            // 사용한 투수는 null [확인 필요]
  quality_percentile: number | null;    // 0~100, 참고용
  matchup_vs_batter: Matchup | null;
  role: string | null;                  // ⚠ 명세에 없는 필드. 의미 [확인 필요] (§7 #6)
}

// ── Batter ───────────────────────────────────────
export interface Batter {
  batter_id: number;
  name: string;
  hit_type: 'L' | 'R' | 'S';            // [명세 기준]
  photo_url: string | null;
  order: number;                        // 타순
  position: string;
  season: { avg: number | null; obp: number | null; slg: number | null; ops: number | null; hr: number };  // 실측: 시즌 누적 없으면 null
  recent_avg: number | null;
  vs_current_pitcher: {                 // 상대 전적 없으면 null 가능 [확인 필요]
    ab: number; h: number; avg: number | null; woba: number | null; iso: number | null;
  } | null;
  today: { ab: number; h: number; rbi: number; log: string[] };  // log: 결과 코드 배열
}

// ── GameState ────────────────────────────────────
export interface TeamTotals { R: number; H: number; E: number | null; B: number }  // 실측: E null 가능

export interface GameState {
  session_id: string;
  game_id: string;
  date: string;
  inning: number;
  half: Half;
  out_count: number;                    // 0~2 (3아웃이면 이미 다음 반이닝으로 넘어간 상태)
  base_state: BaseState;
  score: { home: number; away: number };
  score_diff: number;                   // home − away
  score_diff_attacker: number;          // 공격팀 관점. 부호 재변환 금지
  my_team: TeamCode;
  opponent_team: TeamCode;
  my_role: 'defense' | 'offense';       // [명세 기준]
  current_pitcher: Pitcher;             // offense일 때 누구인지 [확인 필요]
  current_batter: Batter;
  upcoming_batters: Batter[];           // 3명
  leverage_index: number;
  win_expectancy: number;               // 0~1, my_team 관점
  we_perspective: TeamCode;             // = my_team
  linescore: {
    away: (number | null)[];            // 진행 안 된 이닝 null [명세 기준]
    home: (number | null)[];
    totals: { away: TeamTotals; home: TeamTotals };
  };
  is_diverged: boolean;
  diverged_at: { inning: number; half: Half; pa_index: number } | null;  // 분기 전 null
  is_game_over: boolean;
  can_undo: boolean;
}

// ── PA 결과 ──────────────────────────────────────
export interface PaResult {
  outcome: Outcome;
  outcome_label: string;                // "2루타"
  description: string;
  probability: number;                  // 뽑힌 결과의 확률
  probs: Record<Outcome, number>;       // 9개 키, 합 1.0. 실제 기록 재생(actual)일 때도 오는지 [확인 필요]
  runs_scored: number;
  delta_we_attacker: number;
  delta_we_defender: number;            // 화면 표시는 이쪽
  source: 'actual' | 'simulated';       // 설명문 명시
  next_state: GameState;
}
```

---

## 3. 엔드포인트 상세

### 3-1. `GET /health`

| 항목 | 내용 |
| --- | --- |
| 파라미터 | 없음 |
| 응답 200 | `string` (Content-Type은 application/json) — 값 [확인 필요], 아마 `"OK"` |

응답 바디 내용으로 판정하지 말고 **HTTP 200 여부만** 본다.
`/api/v1` 접두사가 없으므로 베이스 URL 조합에 주의.

---

### 3-2. `GET /api/v1/config`

앱 기동 시 1회 호출해 캐싱한다. 세션마다 다시 부르지 않는다.

| 항목 | 내용 |
| --- | --- |
| 파라미터 | 없음 |
| 응답 200 | `AppConfig` (§2) |

```json
{
  "leverage": { "league_avg": 1.0, "max": 5.0,
    "bands": [ { "label": "저", "min": 0.0, "max": 0.85 }, { "label": "중", "min": 0.85, "max": 1.5 },
               { "label": "고", "min": 1.5, "max": 3.0 }, { "label": "매우 높음", "min": 3.0, "max": 5.0 } ] },
  "model": { "score_unit": "wpa_per_pa", "description": "...", "provisional": true },
  "li_source_note": "..."
}
```
(값은 명세 예시. 실제 값은 응답으로 확인)

**연동 메모**

- `useConfig` 훅은 λ 제거 때 삭제됐다. 다시 만든다. `lambda`, `utility_formula`는 서버에도 없다 ✅
- 레버리지 밴드 판정은 이 `bands`로 한다. 하드코딩된 구간이 남아 있으면 제거.
- `model.provisional === true`면 후보 목록 헤더에 "임시 점수" 배지.

---

### 3-3. `GET /api/v1/teams`

| 항목 | 내용 |
| --- | --- |
| 파라미터 | 없음 |
| 응답 200 | `Team[]` — 10개 구단, **팀 코드 순 정렬** |

`logo_url`이 `null`이면 로컬 엠블럼 `public/emblem/{code}.png`로 폴백한다.
로컬 엠블럼을 우선 쓰고 `logo_url`은 무시해도 된다 (발표 환경 네트워크 의존 제거).

---

### 3-4. `GET /api/v1/games`

`team`이 뛴 경기를 **날짜 순**으로 반환. 콜드게임 등 제외 경기는 빠진다.

| 파라미터 | 위치 | 필수 | 타입 | 제약 | 기본값 |
| --- | --- | --- | --- | --- | --- |
| `team` | query | **필수** | string | `^[A-Z]{2}$` | — |
| `season` | query | 선택 | integer | 2000~2100 | `2025` (현재 2025만 데이터 있음) |
| `opponent` | query | 선택 | string | `^[A-Z]{2}$` | 없으면 전체 |

| 응답 200 | `GameSummary[]` (§2) |
| --- | --- |

```json
[ { "game_id": "20250902HHKT02025", "date": "2025-09-02", "away": "HH", "home": "KT",
    "final_score": { "away": 6, "home": 9 },
    "available_innings": [5, 6, 7, 8, 9], "high_leverage_innings": [7, 9] } ]
```

**연동 메모**

- `team` 없이 호출하면 400. 온보딩에서 **팀 선택 전에는 호출하지 않는다.**
- 시즌 선택 UI가 있다면 2025로 고정하거나 숨긴다.
- `available_innings`에 없는 이닝 버튼은 비활성. `POST /sessions`의 `start_inning`은 5~9만 허용되므로
  둘의 교집합만 활성화한다.
- 내 팀이 홈인지 원정인지는 `home === myTeam`으로 판정 (결과 화면 점수 변환에도 필요, §3-11).

---

### 3-5. `POST /api/v1/sessions` — 세션 시작

시작 이닝에서 **내 팀 수비 반이닝의 첫 실제 타석 직전** 상태로 세션을 만든다.

**Request body** (필수)

| 필드 | 필수 | 타입 | 제약 |
| --- | --- | --- | --- |
| `game_id` | ✅ | string | `^\d{8}[A-Z]{4}\d{5}$` |
| `my_team` | ✅ | string | `^[A-Z]{2}$` |
| `start_inning` | ✅ | integer | **5~9** |
| `mode` | — | string | `"play"` \| `"watch"`. 생략 시 play |

```json
{ "game_id": "20250902HHKT02025", "my_team": "HH", "start_inning": 7 }
```

| 응답 | 내용 |
| --- | --- |
| **201** | `{ "state": GameState }` |
| 404 | `GAME_NOT_FOUND` |
| 400 | `INVALID_REQUEST` (패턴·범위 위반) |

**연동 메모**

- `mode`는 보내지 않는다. 관전 모드는 구현하지 않기로 했다 (명세 §4).
- `state.session_id`를 `SessionContext`에 저장한다. 이후 모든 세션 경로의 `{sessionId}`.
- 응답 직후 `my_role`은 항상 `"defense"`여야 한다. 곧바로 `/recommend` 호출.

---

### 3-6. `POST /api/v1/sessions/{sessionId}/recommend` — 교체 후보 추천

| 항목 | 내용 |
| --- | --- |
| 파라미터 | path `sessionId` |
| Request body | **없음** (POST지만 바디 없이 호출) |
| 응답 200 | `RecommendResponse` |
| 에러 | 400 `INVALID_ROLE`(공격 중 호출) · 409 `NO_AVAILABLE_PITCHER` · 503 `MODEL_UNAVAILABLE` |

```ts
export interface RecommendResponse {
  leverage_index: number;
  leverage_band: string;                // config.bands[].label 중 하나 [명세 기준]
  li_percentile: number;                // 0~100. "리그 상위 (100−x)%"
  li_max: number;
  source: 'precomputed' | 'live' | 'mock';      // [명세 기준] 개발 모드 배지
  current_pitcher: {
    pitcher: Pitcher;                   // 점수 필드 없음 — 정상
    this_outing: {
      pitches: number; outs: number; hits_allowed: number; walks: number;
      matchup_vs_batter: Matchup | null;
    };
  };
  candidates: { pitcher: CandidatePitcher }[];   // ⚠ 한 겹 감싸짐
  bullpen_summary: { available: number; used: number; total: number };
  bullpen_source: 'actual' | 'estimated';        // [명세 기준] estimated → "추정 명단" 배지
  actual_decision: {                    // 분기 후 null [명세 기준]
    pitcher_id: number; name: string; was_change: boolean;
  } | null;
}
```

**서버 동작 (설명문)**

- 현재 투수는 `current_pitcher`로 분리, **점수 없음**.
- 후보 = 내 팀 경기 전 불펜 명단. 이미 등판한 투수도 `availability: "used"`로 **목록에 남는다.**
- 미사용 후보는 **"B1 점수" 내림차순**, 사용한 투수는 점수 `null`.

**연동 메모**

- **재정렬하지 않는다.** 서버 순서 그대로 쓰되, 표시는 `availability === 'used'`를 하단 회색 그룹으로 분리.
- 적합도 바: `model_score !== null`인 후보끼리만 min-max 정규화 (명세 §5-3). used는 바 없음.
- 설명문의 "B1 점수"는 **모델 추천 점수를 부르는 이름**일 뿐이다. 프론트는 어떤 모델인지 신경 쓰지 않고
  응답의 `model_score`·`model_rank`를 그대로 표시한다. 모델 선택은 트랙 B 책임.
- `model_score`는 투수 관점 정규화 WPA/PA다. 음수도 나올 수 있고, 후보 간 차이가 매우 작을 수 있다.
  - 적합도 바는 min-max 정규화 필수.
  - 원값을 %로 바꿔 "승률 +0.4%p"처럼 표시하지 않는다. 실제 승률 변화가 아니다.
- `config.model.provisional`이 true면 "임시 점수" 배지 표시.
- 모델 1위 자동 선택 금지, 1위 외 선택 시 경고 금지 — 기존 규칙 유지.
- `actual_decision`은 사용자가 결정한 **직후** 공개한다. `null`이면 영역 숨김.
- `NO_AVAILABLE_PITCHER` → 후보 목록 대신 안내 문구, 액션은 "현재 투수 유지"만.
- 호출 시점: 세션 시작 직후, simulate-pa 후 `next_state.my_role === 'defense'`일 때, advance-half 후, undo 후 defense일 때.

---

### 3-7. `POST /api/v1/sessions/{sessionId}/simulate-pa` — 타석 진행

내 팀 수비 타석 하나를 진행한다.

**Request body** (필수)

```json
{ "pitcher_id": 61895 }
```

**현재 투수를 유지할 때도 현재 투수의 `pitcher_id`를 보낸다.** "유지"용 별도 값은 없다.

| 응답 | 내용 |
| --- | --- |
| 200 | `{ "result": PaResult }` (§2) |
| 400 | `INVALID_ROLE` (공격 중 호출) · `INVALID_REQUEST` (used 투수 등 [확인 필요]) |

**서버 동작 (설명문)**

| 조건 | 동작 | `source` | `is_diverged` |
| --- | --- | --- | --- |
| 분기 전 + 실제 감독과 같은 투수 | 실제 기록 재생 | `actual` | false |
| 다른 투수를 고르는 순간부터 | 확률 샘플링 | `simulated` | **true** (이후 계속) |
| 3아웃 | `next_state`의 이닝·초말이 바뀌고 `my_role = "offense"` | | |

**연동 메모**

- `result.next_state`로 state를 **통째로 교체**한다.
- 결과 이펙트는 `result.outcome`(9종)으로 매핑. `outcome_label`은 표시 문구.
- 확률 막대는 `result.probs`를 그린다. 9개 키 모두 존재한다고 가정하되, 없는 키는 0으로 채운다.
  `source === 'actual'`일 때 probs가 의미 있는 값인지 [확인 필요] — 실제 기록 재생이면 분포가 비어 있을 수 있다.
- ΔWE 표시는 `delta_we_defender` (내 팀 = 수비 관점).
- **분기 판정이 1차 QA 때 논의한 것과 다르다.** 서버는 "투수 선택이 달라진 순간"을 분기로 본다.
  분기 전에는 실제 기록을 재생하므로 결과도 실제와 같다. 따라서 **분기 전 `we-trace.simulated`는 빈 배열**이며,
  프론트는 시뮬레이션 곡선 없이 실제 곡선만 그리면 된다. 목업의 `path_diverged` 개념은 API 모드에서 쓰지 않는다.
- `next_state.my_role === 'offense'`면 이닝 전환 오버레이 → `advance-half` 호출.
- `next_state.is_game_over`면 결과 화면으로.

---

### 3-8. `POST /api/v1/sessions/{sessionId}/advance-half` — 공격 반이닝 자동 진행

내 팀 공격 반이닝을 서버가 **3아웃(또는 경기 종료)까지** 진행한다.

| 항목 | 내용 |
| --- | --- |
| 파라미터 | path `sessionId` |
| Request body | **없음** |
| 응답 200 | `AdvanceHalfResponse` |
| 에러 | 400 `INVALID_ROLE` (수비 중 호출) |

```ts
export interface AdvanceHalfResponse {
  summary: {
    runs: number;
    hits: number;
    pa_log: { batter_id: number; batter: string; outcome: Outcome; description: string }[];
    we_trace: number[];                 // 타석별 WE. 관점·포함 범위 [확인 필요] (§7 #9)
    source: 'actual' | 'simulated';
  };
  state: GameState;                     // 다음 내 팀 수비 반이닝 시작 시점 (또는 경기 종료)
}
```

**서버 동작 (설명문)**

- 분기 전: 실제 기록 재생 (`summary.source: "actual"`). 분기 후: 샘플링 (`simulated`).
- 분기 후 상대 투수는 실제 경기 같은 반이닝의 투수 순서를 따른다.
- **반이닝 전체가 되돌리기 한 단계**다.

**연동 메모**

- 2초 로딩 연출 중 호출하고, 응답이 2초보다 빨라도 연출 시간은 지킨다 (`Promise.all([api, delay(2000)])`).
- `summary.pa_log`로 공격 요약 로그를 그린다. `outcome`이 9종 enum이라 아이콘 매핑 재사용 가능.
- 응답 후 `state.is_game_over`가 true일 수 있다 (말 공격 끝내기 등). 이 경우 recommend 호출하지 않는다.

---

### 3-9. `POST /api/v1/sessions/{sessionId}/undo` — 되돌리기

| 항목 | 내용 |
| --- | --- |
| 파라미터 | path `sessionId` |
| Request body | 없음 |
| 응답 200 | `{ "state": GameState }` — 직전 상태 |
| 에러 | 409 `CANNOT_UNDO` |

**서버 동작 (설명문)**

- 단위는 **타석 1회**. 자동 진행한 공격 반이닝은 **통째로** 되돌린다.
- 분기 전으로 돌아가면 `is_diverged`도 false.
- **되돌린 뒤 같은 선택을 하면 같은 결과가 나온다** (시드 고정).

**연동 메모**

- 버튼 활성 여부는 `state.can_undo`로만 판단한다. 프론트에서 히스토리 스택을 따로 관리하지 않는다.
- 공격 반이닝 직후 undo하면 이전 수비 반이닝의 마지막 타석 **전**으로 갈 수 있다 [확인 필요].
  즉 한 번 누르면 "공격 반이닝 + 그 직전 수비 타석"이 함께 되돌아가는지, 공격 반이닝만 되돌아가 3아웃 직후 상태가 되는지 확인.
  후자라면 `my_role`이 offense인 상태가 나오므로 화면은 `advance-half` 대기 상태로 그려야 한다.
- undo 후: `we-trace` 재조회, `my_role === 'defense'`면 `recommend` 재조회. 사용자 선택은 초기화.

---

### 3-10. `GET /api/v1/sessions/{sessionId}/we-trace` — 승률·레버리지 추이

| 항목 | 내용 |
| --- | --- |
| 파라미터 | path `sessionId` |
| 응답 200 | `WeTraceResponse` |

```ts
export interface HalfPoint {
  inning: number;
  half: Half;
  we: number;                           // my_team 관점, 반이닝 종료 시점
  leverage_index: number;               // 그 반이닝의 최고 LI
}

export interface WeTraceResponse {
  perspective: TeamCode;                // = my_team
  actual: HalfPoint[];                  // 실제 경기 전체
  simulated: HalfPoint[];               // 분기한 반이닝부터 지금까지. 분기 전이면 []
  diverge_at: { inning: number; half: Half } | null;   // 분기 전 null [확인 필요]
  current: number;                      // 현재 WE
}
```

**서버 동작 (설명문)**

- **반이닝 단위**, 값은 반이닝 **종료 시점** WE. 진행 중인 반이닝은 **지금 값**.
- `leverage_index`는 그 반이닝의 **최고 LI** (현재 LI 아님).

**연동 메모**

- **승률 곡선**: `actual`은 경기 전체를 그리고(회색 점선), `simulated`는 있으면 이어서 그린다.
  `simulated`가 1점뿐일 때를 위해 `dot` 표시 유지. x축 키는 `${inning}-${half}`로 통일.
- 시뮬레이션 곡선 시작점: `simulated[0]`의 직전 반이닝 `actual` 값과 이어 그려야 곡선이 분기점에서 출발한다.
- **레버리지 추이 차트에는 이 응답의 `leverage_index`를 쓰지 않는다.** 서버 값은 반이닝 **최고 LI**라서
  헤더의 현재 LI와 다르다. 레버리지 차트는 §3-10-1 방식(B안)으로 그린다.
- `perspective !== state.my_team`이면 콘솔 경고 (관점 사고 방지용 단언).

#### 3-10-1. 레버리지 추이 차트 — B안: 타석 단위 클라이언트 누적 (1차 적용)

**원칙**: 새 API 없이, 서버가 이미 주는 `GameState.leverage_index`를 응답마다 기록해 곡선을 만든다.
계산은 하지 않는다. 서버 값을 **기록만** 하므로 "서버 책임" 원칙에 어긋나지 않는다.

**기록 규칙**

| 응답 | 기록할 state | 비고 |
| --- | --- | --- |
| `POST /sessions` | `state` | 시리즈 초기화 후 첫 점 |
| `POST /simulate-pa` | `result.next_state` | `my_role === 'defense'`일 때만 기록 |
| `POST /advance-half` | `state` | 다음 수비 반이닝 첫 점. 직전 점과 **선을 끊는다** |
| `POST /undo` | — | 기록하지 않고 **잘라낸다** (아래) |

- **수비 상태만 기록한다.** 3아웃 직후 `next_state`(공격 반이닝 시작)는 넣지 않는다.
  공격 반이닝은 `advance-half`가 끝 상태만 주므로 중간 LI가 없고, 투수 결정과도 무관하다.
- 반이닝이 바뀌면 선을 끊는다. 데이터에 `{ li: null }` 구분점을 넣고 `connectNulls={false}`.
  결과적으로 **내 팀 수비 반이닝마다 끊긴 선분**이 그려진다.
- x축은 기록 순번. 라벨은 반이닝 첫 점에만 "7회말"처럼 표시한다.
  (`GameState`에 타석 번호 필드가 없으므로 순번을 키로 쓴다.)

**undo 처리**

서버의 undo 단위(타석 1회, 공격 반이닝은 통째로)는 프론트의 전진 액션 1회와 1:1로 대응한다.

```ts
// 전진 액션마다 그 직전 시리즈 길이를 스택에 push
onForward(prevLength) → undoStack.push(prevLength)
// undo 성공 시 그 길이로 잘라냄
onUndo() → series.length = undoStack.pop()
```

- 3아웃으로 끝난 `simulate-pa`(기록 없음)도 스택에는 push한다. 길이가 같아도 단계 수를 맞추기 위해서다.
- 개발 모드 단언: undo 후 시리즈 마지막 점의 `li` === undo 응답 `state.leverage_index`.
  어긋나면 콘솔 경고 — §5 #12(공격 반이닝 직후 undo 도착 상태)를 확인하는 장치를 겸한다.

**새로고침 대응**

시리즈와 undo 스택을 `sessionStorage`에 `sessionId` 키로 저장한다. 다른 sessionId면 버린다.

**표시**

- 헤더 "현재 LI" == 곡선 마지막 점이 **구조적으로 보장**된다 (같은 응답의 같은 필드).
- 레버리지 밴드 경계선은 `config.leverage.bands`로 가로 기준선.
- 툴팁: "7회말 2번째 타석 · LI 2.41 (고)".
- 분기 전·후를 색으로 구분해도 된다 (`state.is_diverged`를 점마다 같이 기록).

**B안의 한계 — C안 전환 판단 기준**

| 한계 | 확인 방법 |
| --- | --- |
| 실제 경기 LI와 비교 불가 (실제 경기의 타석 단위 LI가 없음) | 결과 화면·발표 서사에서 비교가 필요한지 |
| 선분이 반이닝마다 끊겨 추이가 안 읽힘 | 5회부터 끝까지 플레이 후 차트 캡처로 판단 |
| 시작 이닝이 늦으면 점이 적음 (9회 시작 시 1~2개 선분) | 9회 시작 세션으로 확인 |

위 중 하나라도 문제가 되면 C안(§3-10-2)으로 전환한다.

#### 3-10-2. C안: 반이닝 막대 + 현재 점 (보류, B안 결과 보고 결정)

- 끝난 반이닝: `we-trace`의 `actual`(회색)·`simulated`(초록) 최고 LI를 **막대**로 나란히.
- 진행 중인 반이닝: 막대 대신 `state.leverage_index`를 점으로 (헤더와 일치).
- 내 팀 공격 반이닝 막대는 흐리게.
- B안의 누적 로직은 C안에서 불필요하므로, 전환 시 기록 코드를 훅 하나에 격리해 두면 교체가 쉽다.

---

### 3-11. `GET /api/v1/sessions/{sessionId}/result` — 결과 화면

세션 시작 지점부터의 시뮬레이션 vs 실제 비교. **경기 도중에도 호출 가능**하며 그때 `result`는 `"in_progress"`.

| 항목 | 내용 |
| --- | --- |
| 파라미터 | path `sessionId` |
| 응답 200 | `ResultResponse` |

```ts
export interface Side {
  score: { my: number; opp: number };      // ✅ 실측: 내 팀/상대 (OpenAPI Score 스키마는 home/away로 적혀 있으나 실제 응답은 my/opp, §7 #1). GameState.score는 home/away 그대로
  runs_allowed_in_range: number;           // 세션 시작 이후 내준 점수
  final_we: number;                        // my_team 관점
  result: 'win' | 'loss' | 'tie' | 'in_progress';   // [확인 필요] 값 목록
}

export interface PaPoint { inning: number; half: Half; pa: number }

export interface PitcherUsage {
  pitcher_id: number;
  name: string;
  from: PaPoint;
  to: PaPoint;
  delta_we_defender: number;
  pitches_est: number;
  li_at_entry: number;
}

export interface Choice { pitcher_id: number; name: string; model_rank: number | null }

export interface DecisionRow {
  inning: number;
  half: Half;
  leverage_index: number;
  model_top: { pitcher_id: number; name: string } | null;   // 모델 순위 필드 "아직 null"
  user_choice: Choice;
  actual_choice: Choice | null;          // 분기 후 null [명세 기준]
  outcome: string;                       // 스펙상 enum 아님. Outcome 9종으로 가정
  delta_we_defender: number;
  is_change: boolean;                    // 명세에 없던 필드 (추가됨). 교체 결정 여부
}

export interface ResultResponse {
  simulated: Side;
  actual: Side;
  pitcher_usage: PitcherUsage[];
  actual_pitcher_usage: PitcherUsage[];
  decisions: DecisionRow[];              // 내 팀 수비 타석마다 한 줄
  agreement: {
    total_decisions: number;
    mine_in_top3: number | null;         // 모델 순위 미구현 → null 가능
    actual_in_top3: number | null;
    same_as_actual: number;              // 명세에 없던 필드 (추가됨)
  };
  bullpen_used: { mine: number; actual: number; total: number };
}
```

**연동 메모**

- **[실측 정정 — §7 #1] `/result`의 `score`는 `{my, opp}`로 온다 (OpenAPI 스키마와 다름). 변환 불필요.** 단 스키마대로 `{home, away}`가 오는 경우도 어댑터에서 방어한다(둘 다 지원). 아래 문단은 `{home, away}`로 올 때의 변환 규칙이다.
- (참고) 결과 화면은 "내 팀 : 상대" 구조이므로
  `my = myTeam === home ? score.home : score.away`로 변환한다. `home` 여부는 `GameState`의 `my_team`과
  경기 정보(`GameSummary.home`)로 판정해 세션 컨텍스트에 저장해 둔다.
  `/result/:sessionId`로 직접 진입(새로고침)하면 이 정보가 없으므로 컨텍스트를 sessionStorage에 백업한다.
- **"모델 순위 필드는 아직 null"** (설명문 명시). `model_top`, `user_choice.model_rank`, `actual_choice.model_rank`,
  `agreement.mine_in_top3`·`actual_in_top3`가 null일 수 있다.
  - 결정 비교 테이블: null이면 "모델 1위" 열과 "(모델 N위)" 표기를 `—`로.
  - 요약 문구: top3 값이 null이면 `same_as_actual` 기반 문구로 대체.
    예: "5번의 결정 중 2번이 실제 감독과 같았습니다."
- `decisions`는 **수비 타석마다 한 줄**이다. 유지 타석도 포함되므로 줄 수가 많다.
  `is_change === true`만 기본 표시하고 "전체 타석 보기" 토글을 두는 것을 권장.
- `result === 'in_progress'`면 결과 화면 상단에 "경기 진행 중 기준" 표시.

---

### 3-12. `POST /api/v1/sessions/{sessionId}/repeat` — 같은 선택으로 n회 반복

세션 시작 지점부터 경기 끝까지 n번 다시 진행. 내 팀 투수는 반이닝마다 사용자가 고른 순서 그대로, 타석 결과만 재샘플링.
**세션 상태는 바꾸지 않는다.**

**Request body** (선택 — 생략 가능)

| 필드 | 타입 | 제약 | 기본값 |
| --- | --- | --- | --- |
| `n` | integer | 1~500 | 100 |

```json
{ "n": 100 }
```

```ts
export interface RepeatResponse {
  n: number;
  runs_allowed: {
    histogram: Record<string, number>;  // 키 = 실점("0","1",...), 값 = 횟수
    median: number;
    mean: number;
  };
  final_we: { median: number; p10: number; p90: number };
  win_rate: number;                     // 명세에 없던 필드 (추가됨)
  better_than_actual_rate: number;
  actual: { runs_allowed: number; result: string };   // 명세에 없던 필드 (추가됨). 비교 기준선
  elapsed_ms: number;
}
```

**연동 메모**

- 히스토그램: `Object.entries(histogram)`를 **숫자로 변환해 정렬**한다. 객체 키 순서에 의존하지 않는다.
  빈 구간(0회)은 키가 없을 수 있으므로 0~max 범위로 채운다.
- `actual.runs_allowed`를 히스토그램 위에 기준선으로 표시할 수 있다 (새 필드 활용).
- 요청 타임아웃을 **10초 이상**으로 둔다. 명세 목표 3초지만 n=100 실측 전이다. 진행 중 스피너 필수.
- 여러 번 눌러도 세션은 안 바뀌므로 결과 캐싱 가능 (같은 n이면 같은 결과인지 [확인 필요]).

---

## 4. 연동 작업 순서 (Claude Code용)

1. **CORS 확인** — 브라우저에서 `GET /api/v1/config` 한 번 호출. 막히면 Vite proxy 설정.
2. **API 클라이언트** `src/api/client.ts` — `fetch` 래퍼. 베이스 URL, JSON 파싱, 에러 정규화(§0-2), 타임아웃.
3. **타입 정리** — §2·§3 타입을 `src/types/api.ts`와 대조. 차이(§7)를 반영하고 nullable 표기.
4. **엔드포인트 함수** `src/api/endpoints.ts` — 12개 함수. `src/mocks/api.ts`와 **같은 시그니처**로 맞춘다.
5. **전환 스위치** — 훅이 `VITE_USE_MOCK`에 따라 mock/real 중 하나를 쓰도록. 컴포넌트는 수정하지 않는다.
6. **`useConfig` 복구** — 기동 시 1회 + 캐싱.
7. **온보딩** → teams, games, sessions.
8. **대시보드** → recommend, simulate-pa, advance-half, undo, we-trace. `my_role` 분기.
9. **결과 화면** → result (점수 변환, null 처리), repeat.
10. **에러 UI** — `SESSION_EXPIRED` 온보딩 복귀, recoverable 재시도.
11. **검증** — 실제 서버로 한 경기 5회~끝까지 플레이. 아래 체크리스트.

### 4-1. 연동 검증 체크리스트

- [ ] 매 타석 후 헤더 스코어 == 라인스코어 R 합계 (서버 값 그대로 쓰면 자동 성립. 깨지면 서버 버그로 보고)
- [ ] `state.we_perspective`, `we-trace.perspective` == `my_team`
- [ ] 실제 감독의 선택과 같은 투수를 계속 고르면 `is_diverged` false 유지, `source: "actual"`, `we-trace.simulated` 빈 배열. **"현재 투수 유지"가 곧 실제 선택은 아니다**: `recommend.actual_decision.was_change === true`인 타석에서 유지하면 그 순간 분기한다(실측, 7회말 시작 샘플). 기대값은 `actual_decision` 기준으로 판정
- [ ] 다른 투수 선택 직후 `is_diverged` true, `diverged_at` 채워짐, 이후 `simulated` 곡선이 그려짐
- [ ] 3아웃 → `my_role: "offense"` → advance-half → 다음 수비 반이닝 `out_count 0`, `base_state "0"`
- [ ] undo 후 같은 선택 → 같은 결과
- [ ] used 투수가 후보 목록 하단 회색, `model_score` null, 바 없음
- [ ] 결과 화면 점수가 내 팀/상대 순서로 올바르게 표시 (홈·원정 둘 다 테스트)
- [ ] 모델 순위 null일 때 결과 화면이 깨지지 않음
- [ ] 레버리지 차트 마지막 점 == 헤더 현재 LI (매 타석)
- [ ] 레버리지 차트: undo 후 마지막 점 제거, 공격 반이닝 직후 undo 시 반이닝 선분 통째 제거
- [ ] 레버리지 차트: 새로고침 후 시리즈 유지
- [ ] 30분 방치 후 요청 → `SESSION_EXPIRED` → 온보딩 복귀
- [ ] `/game` 새로고침 시 동작 (§7 #2 참고)

---

## 5. 실제 응답으로 확인할 것

스펙으로 알 수 없어 **Swagger `Try it out` 또는 첫 연동 시 콘솔 로그로 확인**해야 하는 항목.
확인되면 §2 타입의 [확인 필요] 표시를 지운다.

> **실측 완료(2026-11-09)**: 15개 항목의 실측값은 `docs/integration/C-live-findings.md` §1에 있다. 명세와 달랐던 점은 §7 #1, #14~#22에 반영했다. 미확인: #13의 `loss`/`tie`, #14의 n=100 `elapsed_ms`, HH 홈 경기(수비가 초) 흐름 — 4단계 V1에서 확인한다.

| # | 대상 | 확인 내용 |
| --- | --- | --- |
| 1 | `/health` | 응답 문자열 |
| 2 | `/config` | `bands` 실제 구간, `provisional` 값 |
| 3 | `/recommend` | **`model_score` 실제 스케일과 후보 간 차이** — 바가 구분될 만큼 벌어지는가 (명세 §9 #1) |
| 4 | `/recommend` | `role` 필드 값 목록 |
| 5 | `/recommend` | `source`, `leverage_band`, `bullpen_source`, `availability` 실제 값 |
| 6 | `/recommend` | used 투수의 `model_rank`, `quality_percentile`도 null인가 |
| 7 | `/simulate-pa` | `source: "actual"`일 때 `probs`·`probability` 값 |
| 8 | `/simulate-pa` | used 투수 id를 보내면 어떤 에러인가 |
| 9 | `GameState` | `my_role: "offense"`일 때 `current_pitcher`는 누구인가 (상대 투수?) |
| 10 | `GameState` | 분기 전 `diverged_at`이 null인가 |
| 11 | `/advance-half` | `summary.we_trace`의 관점과 길이 (타석 수? 타석 수+1?) |
| 12 | `/undo` | 공격 반이닝 직후 undo 시 도착 상태 |
| 13 | `/result` | `Side.result` 값 목록, `decisions[].outcome` 형식 |
| 14 | `/repeat` | n=100 실측 `elapsed_ms`, 같은 n 재호출 시 결과 동일 여부 |
| 15 | 전체 | `photo_url` 형식 (상대 경로 / 절대 URL / null 비율) |

---

## 6. 원본 스펙

`api-docs.json`(OpenAPI 3.1)을 저장소 `docs/api-docs.json`에 두고, 필드 이름이 헷갈리면 이 파일을 우선한다.
이 문서와 원본이 다르면 **원본이 맞다** (단 nullable·문자열 값은 원본에 없으므로 이 문서 기준).

---

## 7. 명세 v0.3 대비 차이점 — 백엔드 협의 안건

| # | 엔드포인트 | 명세 v0.3 | 실제 서버 | 영향 | 조치 |
| --- | --- | --- | --- | --- | --- |
| 1 | `/result` | `score: {my, opp}` | **실측: `{my, opp}`** (OpenAPI `Score` 스키마는 `{home, away}`로 표기 — 스키마와 실제 응답 불일치) | 결과 화면 점수 | 변환 없이 `my→mine`, `opp→opp`. `{home,away}`도 방어 처리. 백엔드에 스키마 정정 요청 |
| 2 | (없음) | — | 세션 상태 조회 `GET /sessions/{id}` 없음 | `/game` 새로고침 시 상태 복원 불가 | **백엔드에 추가 요청**. 임시로 마지막 state를 sessionStorage에 백업 |
| 3 | `/recommend` `actual_decision` | `model_rank` 포함 제안 (§4) | 없음 | 첫 결정 비교의 정보량 | 요청 (우선순위 낮음) |
| 4 | `/result` | `model_rank` 등 값 존재 | "모델 순위 필드는 아직 null" | 결정 비교 테이블·요약 문구 | 프론트 null 처리. 백엔드 완료 일정 확인 |
| 5 | `/recommend` 정렬 | `model_rank` 오름차순 (밴딧) | "B1 점수" 내림차순 | 없음 | ✅ 해소. 모델 추천 점수의 명칭일 뿐. 응답 순서·값 그대로 표시 |
| 6 | `CandidatePitcher` | — | `role` 필드 추가 | 미정 | 의미·값 목록 확인. 마무리/셋업 표시라면 보조 정보 줄에 활용 가능 |
| 7 | `POST /sessions` | 관전 모드 미구현 | `mode: "watch"` 허용 | 없음 | 프론트는 보내지 않음 |
| 8 | 에러 `INVALID_ROLE` | recommend 전용 | simulate-pa·advance-half도 같은 message | advance-half에선 문구가 틀림 | 프론트는 code 기준 문구 사용. 백엔드에 message 분리 요청 (낮음) |
| 9 | `/advance-half` `we_trace` | 관점 미기재 | 관점 미기재 | 공격 요약 미니 차트 | 관점 확인 요청 (`my_team`이어야 함) |
| 10 | `/we-trace` `leverage_index` | 반이닝 단위 LI | 반이닝 **최고** LI | 1차 QA "마지막 점 = 헤더 현재 LI" 규칙과 충돌 | B안 적용: 차트는 `GameState.leverage_index` 클라이언트 누적 (§3-10-1). C안 대기 |
| 11 | 분기 판정 | (1차 QA에서 path/decision 분리 논의) | 투수 선택이 달라진 순간만 분기. 그 전엔 실제 기록 재생 | 목업의 `path_diverged` 불필요 | 서버 방식 채택. 목업도 맞추면 일관됨 |
| 12 | 신규 필드 | — | `agreement.same_as_actual`, `DecisionRow.is_change`, `repeat.win_rate`, `repeat.actual`, `PaResult.source`, `pa_log[].batter_id`, `summary.source`, workload 2종 | 없음 (추가만) | 활용 가능 |
| 13 | 응답 스키마 | nullable 명시 | `required`·`nullable` 표기 없음 | 타입 자동 생성 시 부정확 | 백엔드에 `@Schema(nullable = true)` 표기 요청 (선택) |
| 14 | `/health` | — | 응답 바디 평문 `OK` (JSON 아님) | `res.json()` 실패 | `res.ok`만 판정 (C §2-3) |
| 15 | `/recommend` `quality_percentile` | used도 null 가정 | used도 값 있음, available 일부는 null | null 체크 시 `undefined` 검사 오류 | `=== null` 로 판정, null이면 표시 생략 (C §2-2) |
| 16 | `/result` `decisions[].actual_choice` | 분기 후 null | 분기 후에도 실제 투수로 채워짐 | 없음 | non-null로 와도 정상 처리, null도 방어 (C §2-4) |
| 17 | `INVALID_ROLE`·`INVALID_REQUEST` message | 고정 문구 | `INVALID_ROLE`은 simulate-pa에서 "…/advance-half 로 진행하세요", `INVALID_REQUEST`는 원인(필드명·투수 id) 포함 | 화면 노출 부적합 | code 기준 문구 사용, message는 콘솔 로깅만 |
| 18 | `/we-trace` `simulated[].leverage_index` | 반이닝 최고 LI | 아직 진행하지 않은 반이닝은 `0.0` | 차트에 쓰면 0으로 보임 | LI 차트는 B안(state 누적)이라 미사용. 승률 곡선만 사용 |
| 19 | `/undo` (공격 반이닝 직후) | 불명 (§5 #12) | 공격 시작 상태(예: 8회초, `my_role: offense`)로 복귀. 직전 수비 타석까지는 안 감 | 화면이 `advance-half` 대기 상태를 그려야 함 | 대시보드 offense 상태 처리, B안 undo 스택과 1:1 (C §1 #12) |
| 20 | CORS | 확인 필요 | `Origin: http://localhost:5173`만 허용(200). 그 외(`http://172.25.20.15:5173`, `https://example.com`)는 preflight **403** | 브라우저 직접 호출 불가(WSL IP 접속 시) | dev: Vite proxy. 배포 도메인은 백엔드에 허용 요청 |
| 21 | `/result` `bullpen_used.total` vs `/recommend` `bullpen_summary.total` | 동일 모수 가정 | 10 vs 8 | 표시 문구 모호 | 백엔드 확인 요청. 프론트는 각 응답 값 그대로 |
| 22 | `/result` `pitcher_usage` 범위 | 불명 | 세션 시작 이후 등판만 (세션 이전·선발 이력 없음) | UsageTimelineCard 범위 | "세션 시작 이후"로 표기. 이전 구간은 백엔드 요청 (C §7) |
