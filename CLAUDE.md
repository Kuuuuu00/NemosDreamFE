# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Frontend for **K-Moneyball**, a KBO bullpen-decision tool. The user plays a "replay mode": load a real 2025 game, take over their team's defensive half-innings from a chosen inning onward, and choose which reliever to bring in for each plate appearance, guided by a Contextual Bandit model's "if you replace, who comes in" ranking. Product background and the original contract (written by the frontend track for the two backend tracks) live in `K-Moneyball 프론트엔드 → 백엔드 요구사항 명세( U 폐기 버젼).md` (Korean). The **integration source of truth is `docs/API_연동명세_nemosdream.md`** (real-server rules, types, call flow, differences from the original spec); when the two conflict, the integration spec wins. Priority for field shapes: live samples (`docs/integration/samples/`) > integration spec > `docs/api-docs.json` (OpenAPI). Read these before making non-trivial changes to data shapes, session flow, or calculation ownership; they are the source of truth, not this file.

The app talks to the real backend (`https://nemosdream.cloud`) through `src/api`. An in-memory mock (`src/mocks/`, built to the same contract) is kept as a presentation fallback and is selected with `VITE_USE_MOCK=true`.

## Commands

```
npm run dev       # vite dev server
npm run build     # tsc -b && vite build (type-check is part of the build, not a separate step)
npm run lint      # oxlint
npm run preview   # preview production build
npx tsx --tsconfig tsconfig.app.json scripts/smoke-api.ts [--offline]   # adapters vs. recorded samples (+ one live simulation session unless --offline)
```

Environment: `.env.development` has `VITE_API_BASE=` (empty: requests go through the Vite proxy, which strips `Origin` because the server only allows `http://localhost:5173`) and `VITE_USE_MOCK=false`; `.env.production` calls `https://nemosdream.cloud` directly (needs the deploy domain on the server's CORS allow-list).

There is no test runner configured. Type-check with `npm run build` (or `tsc -b` directly) and lint with `npm run lint` after changes.

## Architecture

### `src/api` is the one seam to a backend; the mock is behind it

Hooks import only `api` from `@/api` (`import { api } from "@/api"`); components and pages never import `@/api` or `@/mocks` (hooks/context only).

- `src/api/types.ts` — `ApiSurface`: the 12 endpoint functions (spec §1). `src/api/endpoints.ts` implements it over HTTP; `src/api/mockAdapter.ts` implements it over `src/mocks/` (and replays the mock's auto-played offense half as a separate `advanceHalf`, so both modes have the real flow). `src/api/index.ts` picks one from `VITE_USE_MOCK`.
- `src/api/client.ts` — fetch wrapper: error normalization (`ApiRequestError` with `code` / `recoverable`; branch on `code`, never on `message`), timeouts, abort (`ABORTED` is never shown).
- `src/api/adapters/*` — **explicit per-endpoint mapping** from the server's snake_case DTOs (`src/api/raw.ts`) to the camelCase types in `src/types/api.ts`. Never use a generic snake→camel converter: `R/H/E/B`, `L/R`, `probs` and `histogram` keys are data.
- `src/api/sessionStore.ts` — sessionStorage snapshot (`{state, history}` under one key, saved once per successful response). There is no state-read endpoint yet, so page refresh restores from it. Workarounds for missing server fields carry `// TODO(backend):` and prefer the server field when it appears (list: `docs/integration/REPORT.md` §3).
- `src/mocks/*` — mock engine (`session.ts`, `engine.ts`, ...). Do not call it from API mode and do not let anything but `mockAdapter.ts` import it. `src/mocks/*` is unchanged in behavior; the server-owned logic below still lives there only for mock mode.

### Client/server calculation split (spec §5 — the most load-bearing section)

The spec deliberately splits work so the same logic never lives in two places:

- **Server-owned** (the real backend; mocked in `src/mocks/engine.ts` / `session.ts` only for mock mode): Leverage Index, `quality_p`, the model ranking/scores (`modelScore`, `modelRank`), PA outcome probabilities/sampling, base-running, out/inning transitions, all WE/ΔWE values and perspective conversion.
- **Client-owned**: nothing recommendation-related. The frontend never computes or adjusts a score — it only displays what a `RecommendationSource` returns (`src/types/recommendation.ts`, `docs/api-recommendation.md`). The former utility-function ranking was retired; do not reintroduce client-side scoring.

When adding features, preserve this split: don't reimplement base-running or WE math on the client, and don't compute or re-rank recommendation scores on the client.

### Perspective conventions (spec §6-2)

Win-expectancy and score-diff values are perspective-sensitive and easy to get backwards:
- `scoreDiffAttacker` is already converted to the attacking team's perspective — don't re-flip it.
- `deltaWeDefender` is what the UI displays (the user is always on defense during their turn); `deltaWeAttacker` is its mirror.
- Every WE-bearing response carries an explicit `wePerspective`/`perspective` field naming whose perspective the number is in.

### Data flow: Context → hooks → pages → components

- `src/context/SessionContext.tsx` holds only the onboarding selection (`SessionParams`: teams, game, start inning) — not game state — plus `resumeSessionId` (set only when params were restored after a page refresh, so the session is resumed instead of recreated).
- `src/hooks/useGameSession.ts` owns the live session lifecycle and branches on `state.myRole`: `defense` → `recommend` then `simulate`; `offense` (after a 3rd out, or after undoing an offense half) → `advance` (`advance-half`); never `recommend` in offense. `GameState` is always replaced wholesale by the server response. It exposes `error`/`retry`, an action lock (`simulating`), and `history` from `useGameHistory` (action log + leverage-index series sharing one undo stack; LI is recorded from `GameState.leverageIndex`, never computed).
- `src/hooks/useTeams.ts`, `useGames.ts`, `useConfig.ts` are thin fetchers (`useConfig` caches `GET /config` once); `useExpiredRedirect.ts` sends `SESSION_EXPIRED` back to onboarding with a notice.
- `src/pages/OnboardingPage.tsx` (team/date/inning picker), `src/pages/GameDashboardPage.tsx` (main game loop) and `src/pages/ResultPage.tsx` (`/result/:sessionId`) are the routes (`src/App.tsx`). `GameDashboardPage` is the composition root for all `src/components/dashboard/*` cards — it owns `selectedId` (never pre-filled — the model's #1 is not auto-selected) and renders the ranking returned by `recommend` (server order, never re-sorted). The model has no score for the current pitcher (it ranks relievers for a decided change), so none is shown for them.

### Types are the contract

`src/types/api.ts` mirrors the spec's JSON shapes (in camelCase; `src/api/adapters/*` do the explicit snake_case→camelCase mapping from the server DTOs in `src/api/raw.ts`). Fields the real backend can send as `null` are typed `| null` (see the integration spec §2 and `docs/integration/A-types-diff.md`) — never use them without a null check. Keep this file in sync with the integration spec when the schema changes; components should never need to change when a backend is swapped, only when these types change.

### UI stack

React 19 + Vite, Tailwind (shadcn/ui "new-york" style, config in `components.json`, base components in `src/components/ui/`), `react-router-dom` for the routes, `recharts` for WE/LI charts, `framer-motion` for animation. Path alias `@/*` → `src/*` (configured in both `vite.config.ts` and `tsconfig.app.json`).
